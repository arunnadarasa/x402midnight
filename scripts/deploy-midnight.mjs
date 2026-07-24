#!/usr/bin/env node
// scripts/deploy-midnight.mjs
// Deploy StreamingChoreographyIP against the local Undeployed stack (midnight-js 4.1.1).
//
// Prereqs:
//   1. bun scripts/midnight-standalone.mjs up
//   2. compact compile … && copy artefacts to public/contract/
//
// Output: src/data/midnight-contract.undeployed.json

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocket as NodeWebSocket } from "ws";

// Polyfills required by midnight-js in Node
if (!globalThis.WebSocket) globalThis.WebSocket = NodeWebSocket;

import {
  BUYER_DOMAIN,
  CONTRACT_KEY,
  DEFAULT_ENDPOINTS,
  GENESIS_SEED,
  PRIVATE_STATE_ID,
  PRIVATE_STATE_STORE,
} from "../src/lib/midnight-shared.ts";

// Polyfills required by midnight-js in Node
if (!globalThis.WebSocket) globalThis.WebSocket = NodeWebSocket;

const NETWORK_ID = process.env.VITE_NETWORK_ID ?? "undeployed";
const NODE_HTTP = process.env.MIDNIGHT_NODE_HTTP ?? DEFAULT_ENDPOINTS.nodeHttp;
const NODE_WS = process.env.MIDNIGHT_NODE_WS ?? DEFAULT_ENDPOINTS.nodeWs;
const INDEXER_HTTP =
  process.env.MIDNIGHT_INDEXER_HTTP ?? DEFAULT_ENDPOINTS.indexerHttp;
const INDEXER_WS =
  process.env.MIDNIGHT_INDEXER_WS ?? DEFAULT_ENDPOINTS.indexerWs;
const PROOF_SERVER = process.env.MIDNIGHT_PROOF_SERVER ?? DEFAULT_ENDPOINTS.proofServer;

// Genesis-funded standalone seed (…0002). …0001 has no funds on undeployed.
const SEED = process.env.MIDNIGHT_SEED ?? GENESIS_SEED;

const ZK_CONFIG_PATH = resolve(process.cwd(), `contracts/managed/${CONTRACT_KEY}`);
const OUT = resolve(process.cwd(), "src/data/midnight-contract.undeployed.json");

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
  const candidates = ["index.js", "index.mjs", "index.cjs"];
  for (const name of candidates) {
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
    die(
      "Missing midnight-js deps or compiled contract.\n" +
        "  bun add @midnight-ntwrk/midnight-js-contracts@4.1.1 \\\n" +
        "          @midnight-ntwrk/midnight-js-node-zk-config-provider@4.1.1 \\\n" +
        "          @midnight-ntwrk/midnight-js-level-private-state-provider@4.1.1 \\\n" +
        "          @midnight-ntwrk/wallet-sdk@1.2.0 \\\n" +
        "          @midnight-ntwrk/testkit-js@4.1.1 ws\n" +
        "and re-run `compact compile` before deploying.",
      e
    );
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
  await wallet.start(true); // wait for genesis DUST balance

  const providers = initializeMidnightProviders(wallet, envConfig, {
    privateStateStoreName: PRIVATE_STATE_STORE,
    zkConfigPath: ZK_CONFIG_PATH,
  });

  // Deterministic buyer secret + PK — matches pad/persistentHash in the .compact witness.
  const buyerSecret = Uint8Array.from(Buffer.from(SEED, "hex"));
  const buyerPkBytes = persistentHash(
    new CompactTypeVector(2, new CompactTypeBytes(32)),
    [pad(32, BUYER_DOMAIN), buyerSecret]
  );
  const buyerPk = toHex(buyerPkBytes);

  const witnesses = {
    localSecretKey: ({ privateState }) => [privateState, buyerSecret],
  };

  const compiledContract = CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH)(
    CompiledContract.withWitnesses(witnesses)(
      CompiledContract.make("StreamingChoreographyIP", Contract)
    )
  );

  log("deploy", "submitting deploy tx (cold proof can take minutes)…");
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: PRIVATE_STATE_ID,
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
    privateStateId: PRIVATE_STATE_ID,
    privateStateStore: PRIVATE_STATE_STORE,
    buyerPk,
    deployedAt: new Date().toISOString(),
  };

  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(record, null, 2));
  log("done", `wrote ${OUT}`);
  console.log(record);

  await wallet.stop?.();
  process.exit(0);
}

main().catch((e) => die("deploy failed", e));
