import { WebSocket as NodeWebSocket } from "ws";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import {
  DEFAULT_ENDPOINTS,
  DEMO_BUYER_SEED,
  GENESIS_SEED,
  MUSDC_CONTRACT_KEY,
  MUSDC_PRIVATE_STATE_ID,
  MUSDC_PRIVATE_STATE_STORE,
} from "./midnight-shared";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = NodeWebSocket as unknown as typeof WebSocket;
}

export type MusdcUndeployedCtx = {
  address: string;
  privateStateId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providers: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiledContract: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  buyerSecret: Uint8Array;
  merchantSecret: Uint8Array;
};

async function resolveContractModule(zkPath: string) {
  for (const name of ["index.js", "index.mjs", "index.cjs"] as const) {
    const full = resolve(zkPath, "contract", name);
    if (existsSync(full)) {
      return import(pathToFileURL(full).href);
    }
  }
  throw new Error(`Compiled MidnightUSDC missing under ${zkPath}/contract`);
}

let cachedAddress: string | null = null;
let ctxPromise: Promise<MusdcUndeployedCtx> | null = null;

export async function getMusdcUndeployedCtx(address: string): Promise<MusdcUndeployedCtx> {
  if (address !== cachedAddress) {
    cachedAddress = address;
    ctxPromise = buildCtx(address);
  }
  return ctxPromise!;
}

async function buildCtx(address: string): Promise<MusdcUndeployedCtx> {
  const [testkit, walletSdk, networkIdPkg, compactJs] = await Promise.all([
    import("@midnight-ntwrk/testkit-js"),
    import("@midnight-ntwrk/wallet-sdk"),
    import("@midnight-ntwrk/midnight-js-network-id"),
    import("@midnight-ntwrk/midnight-js-protocol/compact-js"),
  ]);

  const { MidnightWalletProvider, initializeMidnightProviders, createDefaultTestLogger } = testkit;
  const { NetworkId } = walletSdk;
  const { setNetworkId } = networkIdPkg;
  const { CompiledContract } = compactJs;

  setNetworkId("undeployed");

  const envConfig = {
    walletNetworkId: NetworkId.NetworkId.Undeployed,
    networkId: "undeployed",
    indexer: process.env.MIDNIGHT_INDEXER_HTTP ?? DEFAULT_ENDPOINTS.indexerHttp,
    indexerWS: process.env.MIDNIGHT_INDEXER_WS ?? DEFAULT_ENDPOINTS.indexerWs,
    node: process.env.MIDNIGHT_NODE_HTTP ?? DEFAULT_ENDPOINTS.nodeHttp,
    nodeWS: process.env.MIDNIGHT_NODE_WS ?? DEFAULT_ENDPOINTS.nodeWs,
    proofServer: process.env.MIDNIGHT_PROOF_SERVER ?? DEFAULT_ENDPOINTS.proofServer,
    faucet: undefined as string | undefined,
  };

  const zkConfigPath = resolve(process.cwd(), `contracts/managed/${MUSDC_CONTRACT_KEY}`);
  const buyerSecret = Uint8Array.from(Buffer.from(DEMO_BUYER_SEED, "hex"));
  const merchantSecret = Uint8Array.from(Buffer.from(GENESIS_SEED, "hex"));

  const logger = createDefaultTestLogger();
  const wallet = await MidnightWalletProvider.build(logger, envConfig, GENESIS_SEED);
  await wallet.start(true);

  const providers = initializeMidnightProviders(wallet, envConfig, {
    privateStateStoreName: MUSDC_PRIVATE_STATE_STORE,
    zkConfigPath,
  });

  const mod = await resolveContractModule(zkConfigPath);
  const Contract = mod.Contract;
  // Undeployed facilitator settles as the demo buyer (Compact-witness).
  const witnesses = {
    localSecretKey: ({ privateState }: { privateState: unknown }) => [privateState, buyerSecret],
  };

  const compiledContract = CompiledContract.withCompiledFileAssets(zkConfigPath)(
    CompiledContract.withWitnesses(witnesses)(
      CompiledContract.make("MidnightUSDC", Contract)
    )
  );

  return {
    address,
    privateStateId: MUSDC_PRIVATE_STATE_ID,
    providers,
    compiledContract,
    wallet,
    buyerSecret,
    merchantSecret,
  };
}

export { MUSDC_PRIVATE_STATE_ID, MUSDC_PRIVATE_STATE_STORE };
