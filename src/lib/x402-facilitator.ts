/**
 * x402 helpers — Midnight mUSDC + Sepolia exact (USDC / EURC / cirBTC).
 */
import { X402_NETWORK, X402_SCHEME } from "./midnight-shared";
import {
  SEPOLIA_ASSET_LIST,
  SEPOLIA_CAIP2,
  X402_EXACT_SCHEME,
  priceMicroUsdToTokenAtomic,
  type SepoliaAsset,
} from "./sepolia-tokens";

export type PaymentRequirements = {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

export type PaymentPayloadV2 = {
  x402Version: 2;
  resource?: { url?: string; description?: string };
  accepted: PaymentRequirements;
  payload: {
    nonce: string;
    from?: string;
    chunkHash?: string;
    /** Sepolia: tx hash proving onchain payment (exact scheme) */
    txHash?: string;
  };
};

export function getHeaderCI(headers: Headers, name: string): string | null {
  const want = name.toLowerCase();
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === want) return v;
  }
  return null;
}

export function encodePaymentSignature(payload: PaymentPayloadV2): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodePaymentSignature(raw: string): PaymentPayloadV2 {
  let json: string;
  try {
    json = Buffer.from(raw, "base64").toString("utf8");
  } catch {
    throw new Error("invalid_payload: PAYMENT-SIGNATURE is not base64");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("invalid_payload: PAYMENT-SIGNATURE is not JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalid_payload: expected object");
  }
  const p = parsed as Record<string, unknown>;
  if (p.x402Version !== 2) {
    throw new Error("invalid_payload: x402Version must be 2");
  }
  if (!p.accepted || typeof p.accepted !== "object") {
    throw new Error("invalid_payload: wrap requirement under accepted");
  }
  if (!p.payload || typeof p.payload !== "object") {
    throw new Error("invalid_payload: missing payload");
  }
  return p as unknown as PaymentPayloadV2;
}

export function validatePayloadAgainstRequirement(
  payload: PaymentPayloadV2,
  expected?: Partial<PaymentRequirements> & { chunkHash?: string }
): { ok: true } | { ok: false; error: string } {
  const a = payload.accepted;
  const scheme = a.scheme;
  if (scheme !== X402_SCHEME && scheme !== X402_EXACT_SCHEME) {
    return {
      ok: false,
      error: `invalid_payload: scheme must be ${X402_SCHEME} or ${X402_EXACT_SCHEME}`,
    };
  }
  if (scheme === X402_SCHEME && !String(a.network).startsWith("midnight:")) {
    return { ok: false, error: "invalid_payload: midnight scheme requires midnight:<net>" };
  }
  if (scheme === X402_EXACT_SCHEME && a.network !== SEPOLIA_CAIP2) {
    return { ok: false, error: `invalid_payload: exact scheme expects ${SEPOLIA_CAIP2}` };
  }
  if (expected?.network && a.network !== expected.network) {
    return { ok: false, error: "invalid_payload: network mismatch" };
  }
  if (expected?.scheme && a.scheme !== expected.scheme) {
    return { ok: false, error: "invalid_payload: scheme mismatch" };
  }
  if (expected?.amount && String(a.amount) !== String(expected.amount)) {
    return { ok: false, error: "invalid_payload: amount mismatch" };
  }
  if (expected?.payTo && a.payTo.toLowerCase().replace(/^0x/, "") !== expected.payTo.toLowerCase().replace(/^0x/, "")) {
    return { ok: false, error: "invalid_payload: payTo mismatch" };
  }
  if (expected?.asset && a.asset.toLowerCase() !== expected.asset.toLowerCase()) {
    return { ok: false, error: "invalid_payload: asset mismatch" };
  }

  if (scheme === X402_SCHEME) {
    const nonce = payload.payload?.nonce;
    if (!nonce || typeof nonce !== "string") {
      return { ok: false, error: "invalid_payload: nonce required" };
    }
    const hex = nonce.replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      return { ok: false, error: "invalid_payload: nonce must be 32-byte hex" };
    }
  } else {
    // Sepolia exact: require txHash in payload (onchain payment proof)
    const tx = payload.payload?.txHash || payload.payload?.nonce;
    if (!tx || typeof tx !== "string") {
      return { ok: false, error: "invalid_payload: txHash required for Sepolia exact" };
    }
  }

  if (expected?.chunkHash) {
    const ch =
      payload.payload.chunkHash ??
      (typeof a.extra?.chunkHash === "string" ? a.extra.chunkHash : undefined);
    if (
      ch &&
      ch.replace(/^0x/i, "").toLowerCase() !== expected.chunkHash.replace(/^0x/i, "").toLowerCase()
    ) {
      return { ok: false, error: "invalid_payload: chunkHash mismatch" };
    }
  }
  return { ok: true };
}

export function parseBytes32(input: string): Uint8Array {
  const hex = input.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) throw new Error("expected hex bytes32");
  const bytes = new Uint8Array(32);
  const raw = Uint8Array.from(Buffer.from(hex.padStart(64, "0").slice(0, 64), "hex"));
  bytes.set(raw, 32 - raw.length);
  return bytes;
}

export function buildMidnightRequirement(opts: {
  amount: string;
  payTo: string;
  asset: string;
  chunkHash?: string;
}): PaymentRequirements {
  return {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    amount: String(opts.amount),
    asset: opts.asset,
    payTo: opts.payTo.replace(/^0x/i, ""),
    maxTimeoutSeconds: 300,
    extra: {
      name: "mUSDC",
      version: "1",
      ...(opts.chunkHash ? { chunkHash: opts.chunkHash } : {}),
    },
  };
}

export function buildSepoliaRequirement(opts: {
  asset: SepoliaAsset;
  priceMicroUsdc: number | string;
  payTo: string;
  chunkHash?: string;
}): PaymentRequirements {
  const amount = priceMicroUsdToTokenAtomic(opts.priceMicroUsdc, opts.asset).toString();
  return {
    scheme: X402_EXACT_SCHEME,
    network: SEPOLIA_CAIP2,
    amount,
    asset: opts.asset.address,
    payTo: opts.payTo.startsWith("0x") ? opts.payTo : `0x${opts.payTo}`,
    maxTimeoutSeconds: 300,
    extra: {
      name: opts.asset.name,
      symbol: opts.asset.symbol,
      decimals: opts.asset.decimals,
      priceMicroUsdc: String(opts.priceMicroUsdc),
      ...(opts.chunkHash ? { chunkHash: opts.chunkHash } : {}),
    },
  };
}

export function buildChallengeBody(opts: {
  resource: string;
  amount: string;
  payTo: string;
  asset: string;
  network?: string;
  chunkHash?: string;
  description?: string;
  /** Extra Sepolia exact accepts (USDC/EURC/cirBTC) */
  sepoliaPayTo?: string;
  includeSepoliaAssets?: boolean;
  priceMicroUsdc?: number | string;
}) {
  const accepts: PaymentRequirements[] = [
    buildMidnightRequirement({
      amount: opts.amount,
      payTo: opts.payTo,
      asset: opts.asset,
      chunkHash: opts.chunkHash,
    }),
  ];

  const sepoliaPayTo = opts.sepoliaPayTo?.trim();
  if (
    opts.includeSepoliaAssets !== false &&
    sepoliaPayTo &&
    sepoliaPayTo !== "0x0000000000000000000000000000000000000000" &&
    opts.priceMicroUsdc !== undefined
  ) {
    for (const asset of SEPOLIA_ASSET_LIST) {
      accepts.push(
        buildSepoliaRequirement({
          asset,
          priceMicroUsdc: opts.priceMicroUsdc,
          payTo: sepoliaPayTo,
          chunkHash: opts.chunkHash,
        })
      );
    }
  }

  return {
    x402Version: 2 as const,
    error: "Payment required",
    accepts,
    resource: {
      url: opts.resource,
      description: opts.description ?? "Streaming choreography chunk",
    },
  };
}

const settledNonces = new Map<string, unknown>();

export function getSettledNonce(nonceHex: string) {
  return settledNonces.get(nonceHex.toLowerCase().replace(/^0x/, ""));
}

export function setSettledNonce(nonceHex: string, result: unknown) {
  settledNonces.set(nonceHex.toLowerCase().replace(/^0x/, ""), result);
}

export { X402_NETWORK, X402_SCHEME, X402_EXACT_SCHEME, SEPOLIA_CAIP2 };
