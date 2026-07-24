/** Cloudflare / production build stub — Undeployed Docker is unreachable from Workers. */
export async function anchorChunkOnUndeployed(): Promise<never> {
  throw new Error(
    "anchorChunk server path is local-dev only (genesis wallet → Undeployed Docker). Not available in this build."
  );
}

export async function transferMusdcOnUndeployed(): Promise<never> {
  throw new Error(
    "mUSDC settle path is local-dev only (genesis wallet → Undeployed Docker). Not available in this build."
  );
}

export async function ensureBuyerFaucet(): Promise<never> {
  throw new Error(
    "mUSDC faucet path is local-dev only (genesis wallet → Undeployed Docker). Not available in this build."
  );
}

export async function getMusdcUndeployedCtx(): Promise<never> {
  throw new Error(
    "mUSDC providers are local-dev only (genesis wallet → Undeployed Docker). Not available in this build."
  );
}

export async function getUndeployedCtx(): Promise<never> {
  throw new Error(
    "Midnight providers are local-dev only (genesis wallet → Undeployed Docker). Not available in this build."
  );
}

export async function verifySepoliaPayment(): Promise<never> {
  throw new Error("Sepolia verify is local-dev only in this build.");
}

export function indexSepoliaPayment(): void {
  /* stub */
}

export function lookupSepoliaPayment(): null {
  return null;
}

export function getSepoliaPublicClient(): never {
  throw new Error("Sepolia RPC client is local-dev only in this build.");
}
