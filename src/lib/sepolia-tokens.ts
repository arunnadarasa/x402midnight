/**
 * Circle / Sepolia payment assets for x402.
 * Addresses verified via cast (symbol + decimals) on 2026-07-24.
 * Sources: Circle docs + user-provided Sepolia explorers.
 */

export type SepoliaAssetId = "USDC" | "EURC" | "cirBTC";

export type SepoliaAsset = {
  id: SepoliaAssetId;
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  /** Human label for UI / x402 extra.name */
  name: string;
};

/** Circle USDC — https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 */
export const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
/** Circle EURC — https://sepolia.etherscan.io/address/0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4 */
export const SEPOLIA_EURC = "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4" as const;
/** Circle cirBTC — https://sepolia.etherscan.io/address/0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3 */
export const SEPOLIA_CIRBTC = "0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3" as const;

export const SEPOLIA_ASSETS: Record<SepoliaAssetId, SepoliaAsset> = {
  USDC: {
    id: "USDC",
    symbol: "USDC",
    address: SEPOLIA_USDC,
    decimals: 6,
    name: "USD Coin",
  },
  EURC: {
    id: "EURC",
    symbol: "EURC",
    address: SEPOLIA_EURC,
    decimals: 6,
    name: "Euro Coin",
  },
  cirBTC: {
    id: "cirBTC",
    symbol: "cirBTC",
    address: SEPOLIA_CIRBTC,
    decimals: 8,
    name: "Circle Bitcoin",
  },
};

export const SEPOLIA_ASSET_LIST = Object.values(SEPOLIA_ASSETS);

export const SEPOLIA_CAIP2 = "eip155:11155111";
export const X402_EXACT_SCHEME = "exact";

/** Demo USD price of 1 cirBTC for converting microUSD prices → cirBTC atomic units. */
export function cirBtcUsdRate(): number {
  let raw: string | undefined;
  try {
    raw = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_CIRBTC_USD;
  } catch {
    /* ignore */
  }
  if (!raw && typeof process !== "undefined") {
    raw = process.env?.VITE_CIRBTC_USD;
  }
  const n = Number(raw || 100_000);
  return Number.isFinite(n) && n > 0 ? n : 100_000;
}

/**
 * Convert stream price (microUSD, 6-decimal USD atomic) to token atomic units.
 * USDC/EURC: 1:1 micro units. cirBTC: microUSD → BTC using demo USD rate, 8 decimals.
 */
export function priceMicroUsdToTokenAtomic(
  priceMicroUsdc: number | string | bigint,
  asset: SepoliaAsset
): bigint {
  const micro = BigInt(priceMicroUsdc);
  if (micro <= 0n) return 0n;
  if (asset.decimals === 6 && (asset.id === "USDC" || asset.id === "EURC")) {
    return micro;
  }
  if (asset.id === "cirBTC") {
    // amount = microUSD / 1e6 / usdPerBtc * 1e8 = micro * 100 / usdPerBtc
    const usd = BigInt(Math.floor(cirBtcUsdRate()));
    const atomic = (micro * 100n) / usd;
    return atomic > 0n ? atomic : 1n;
  }
  // generic: treat micro as 6-decimal and rescale
  if (asset.decimals >= 6) {
    return micro * 10n ** BigInt(asset.decimals - 6);
  }
  return micro / 10n ** BigInt(6 - asset.decimals);
}

export function assetByAddress(addr: string): SepoliaAsset | undefined {
  const lower = addr.toLowerCase();
  return SEPOLIA_ASSET_LIST.find(a => a.address.toLowerCase() === lower);
}

export function assetById(id: string): SepoliaAsset | undefined {
  return SEPOLIA_ASSETS[id as SepoliaAssetId];
}
