// Shared Midnight Undeployed constants — keep deploy script + server-append in sync.
// privateStateStoreName mismatch → Custom error 117 (fresh signing key sampled).

export const GENESIS_SEED =
  "0000000000000000000000000000000000000000000000000000000000000002";

/** Demo buyer for mUSDC faucet/transfer (fees still paid by genesis wallet). */
export const DEMO_BUYER_SEED =
  "0000000000000000000000000000000000000000000000000000000000000003";

export const PRIVATE_STATE_STORE = "scip-priv";
export const PRIVATE_STATE_ID = "scip:undeployed";
export const CONTRACT_KEY = "streaming-choreography-ip";
export const BUYER_DOMAIN = "scip:buyer:v1";

export const MUSDC_PRIVATE_STATE_STORE = "musdc-priv";
export const MUSDC_PRIVATE_STATE_ID = "musdc:undeployed";
export const MUSDC_CONTRACT_KEY = "midnight-usdc";
export const MUSDC_DOMAIN = "musdc:signer:v1";

export const X402_SCHEME = "midnight-mUSDC";
export const X402_NETWORK = "midnight:undeployed";

export const DEFAULT_ENDPOINTS = {
  nodeHttp: "http://127.0.0.1:9944",
  nodeWs: "ws://127.0.0.1:9944",
  indexerHttp: "http://127.0.0.1:8088/api/v4/graphql",
  indexerWs: "ws://127.0.0.1:8088/api/v4/graphql/ws",
  proofServer: "http://127.0.0.1:6300",
} as const;
