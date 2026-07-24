#!/usr/bin/env node
// scripts/deploy-musdc.mjs
// Deploy MidnightUSDC against the local Undeployed stack (midnight-js 4.1.1).
//
// Prereqs:
//   1. bun scripts/midnight-standalone.mjs up
//   2. compact compile contracts/MidnightUSDC.compact contracts/managed/midnight-usdc
//
// Output: src/data/midnight-usdc.undeployed.json

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket as NodeWebSocket } from "ws";

if (!globalThis.WebSocket) globalThis.WebSocket = NodeWebSocket;

import {
  DEFAULT_ENDPOINTS,
  DEMO_BUYER_SEED,
  GENESIS_SEED,
  MUSDC_CONTRACT_KEY,
  MUSDC_DOMAIN,
  MUSDC_PRIVATE_STATE_ID,
  MUSDC_PRIVATE_STATE_STORE,
} from "../src/lib/midnight-shared.ts";

const NETWORK_ID = process.env.VITE_NETWORK_ID ?? "undeployed";
const NODE_HTTP = process.env.MIDNIGHT_NODE_HTTP ?? DEFAULT_ENDPOINTS.nodeHttp;
const NODE_WS = process.env.MIDNIGHT_NODE_WS ?? DEFAULT_ENDPOINTS.nodeWs;
const INDEXER_HTTP =
  process.env.MIDNIGHT_INDEXER_HTTP ?? DEFAULT_ENDPOINTS.indexerHttp;
const INDEXER_WS =
  process.env.MIDNIGHT_INDEXER_WS ?? DEFAULT_ENDPOINTS.indexerWs;
const PROOF_SERVER = process.env.MIDNIGHT_PROOF_SERVER ?? DEFAULT_ENDPOINTS.proofServer;
const SEED = process.env.MIDNIGHT_SEED ?? GENESIS_SEED;

const ZK_CONFIG_PATH = resolve(process.cwd(), `contracts/managed/${MUSDC_CONTRACT_KEY}`);
const OUT = resolve(process.cwd(), "src/data/midnight-usdc.undeployed.json");

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}
function die(msg, err) {
  console.error(`✘ ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

function pad(n, s) {
  const enc = new TextEncoder().encode(s);
  if (enc.length > n) throw new Error(`cannot pad "${s}" to length ${n}`);
  const out = new Uint8Array(n);
  out.set(enc);
  return out;
}

function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

async function resolveContractModule() {
  for (const name of ["index.js", "index.mjs", "index.cjs"]) {
    const full = resolve(ZK_CONFIG_PATH, "contract", name);
    if (existsSync(full)) {
      const mod = await import(pathToFileURL(full).href);
      return { path: full, mod };
    }
  }
  throw new Error(`No compiled contract module under ${ZK_CONFIG_PATH}/contract`);
}

async function main() {
  log("env", `network=${NETWORK_ID} seed=…${SEED.slice(-4)} node=${NODE_WS}`);

  let deployContract,
    MidnightWalletProvider,
    initializeMidnightProviders,
    createDefaultTestLogger,
    NetworkId,
    setNetworkId,
    CompiledContract,
    persistentHash,
    CompactTypeVector,
    CompactTypeBytes,
    Contract;

  try {
    ({ deployContract } = await import("@midnight-ntwrk/midnight-js-contracts"));
    ({
      MidnightWalletProvider,
      initializeMidnightProviders,
      createDefaultTestLogger,
    } = await import("@midnight-ntwrk/testkit-js"));
    ({ NetworkId } = await import("@midnight-ntwrk/wallet-sdk"));
    ({ setNetworkId } = await import("@midnight-ntwrk/midnight-js-network-id"));
    ({ CompiledContract } = await import("@midnight-ntwrk/midnight-js-protocol/compact-js"));
    ({
      persistentHash,
      CompactTypeVector,
      CompactTypeBytes,
    } = await import("@midnight-ntwrk/compact-runtime"));
    const resolved = await resolveContractModule();
    Contract = resolved.mod.Contract;
  } catch (e) {
    die("Missing midnight-js deps or compiled MidnightUSDC contract.", e);
  }

  setNetworkId("undeployed");

  const envConfig = {
    walletNetworkId: NetworkId.NetworkId.Undeployed,
    networkId: "undeployed",
    indexer: INDEXER_HTTP,
    indexerWS: INDEXER_WS,
    node: NODE_HTTP,
    nodeWS: NODE_WS,
    proofServer: PROOF_SERVER,
    faucet: undefined,
  };

  const logger = createDefaultTestLogger();
  log("wallet", "building MidnightWalletProvider from genesis seed …0002");
  const wallet = await MidnightWalletProvider.build(logger, envConfig, SEED);
  await wallet.start(true);

  const providers = initializeMidnightProviders(wallet, envConfig, {
    privateStateStoreName: MUSDC_PRIVATE_STATE_STORE,
    zkConfigPath: ZK_CONFIG_PATH,
  });

  // Merchant (payTo) = genesis with musdc domain; buyer = DEMO_BUYER_SEED.
  const merchantSecret = Uint8Array.from(Buffer.from(SEED, "hex"));
  const buyerSecret = Uint8Array.from(Buffer.from(DEMO_BUYER_SEED, "hex"));
  const hashVec = new CompactTypeVector(2, new CompactTypeBytes(32));
  const merchantPk = toHex(persistentHash(hashVec, [pad(32, MUSDC_DOMAIN), merchantSecret]));
  const buyerPk = toHex(persistentHash(hashVec, [pad(32, MUSDC_DOMAIN), buyerSecret]));

  // Deploy uses merchant/genesis witness; faucet+transfer later switch to buyer witness.
  const witnesses = {
    localSecretKey: ({ privateState }) => [privateState, merchantSecret],
  };

  const compiledContract = CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH)(
    CompiledContract.withWitnesses(witnesses)(
      CompiledContract.make("MidnightUSDC", Contract)
    )
  );

  log("deploy", "submitting MidnightUSDC deploy tx (cold proof can take minutes)…");
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: MUSDC_PRIVATE_STATE_ID,
    initialPrivateState: {},
  });

  const address =
    deployed?.deployTxData?.public?.contractAddress ??
    deployed?.deployTxData?.public?.address ??
    null;
  const deployTxHash =
    deployed?.deployTxData?.public?.txId ??
    deployed?.deployTxData?.public?.txHash ??
    null;

  if (!address) die("deploy returned no contract address", deployed);

  const record = {
    network: NETWORK_ID,
    address: String(address),
    deployTxHash: deployTxHash ? String(deployTxHash) : null,
    privateStateId: MUSDC_PRIVATE_STATE_ID,
    privateStateStore: MUSDC_PRIVATE_STATE_STORE,
    merchantPk,
    buyerPk,
    asset: "mUSDC",
    decimals: 6,
    faucetCapMicroUsdc: 10_000_000,
    deployedAt: new Date().toISOString(),
  };

  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(record, null, 2));
  log("done", `wrote ${OUT}`);
  console.log(record);

  await wallet.stop?.();
  process.exit(0);
}

main().catch((e) => die("deploy-musdc failed", e));
