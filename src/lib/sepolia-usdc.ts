/**
 * Sepolia paywall helpers (multi-asset: USDC, EURC, cirBTC).
 */
import {
  SEPOLIA_ASSETS,
  SEPOLIA_ASSET_LIST,
  SEPOLIA_CAIP2,
  SEPOLIA_USDC,
  type SepoliaAssetId,
} from "./sepolia-tokens";

export {
  SEPOLIA_ASSETS,
  SEPOLIA_ASSET_LIST,
  SEPOLIA_CAIP2,
  SEPOLIA_USDC,
  SEPOLIA_EURC,
  SEPOLIA_CIRBTC,
  priceMicroUsdToTokenAtomic,
  assetByAddress,
  assetById,
  type SepoliaAssetId,
  type SepoliaAsset,
} from "./sepolia-tokens";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";
export const USDC_DECIMALS = 6;
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
export const SEPOLIA_RPC_DEFAULT = "https://ethereum-sepolia-rpc.publicnode.com";

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

export const chunkPaywallAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "chunkHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "merchant",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "allowedToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "event",
    name: "ChunkPaid",
    inputs: [
      { name: "chunkHash", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export type SepoliaConfig = {
  chainId: number;
  payTo: `0x${string}`;
  paywall: `0x${string}` | "";
  rpcUrl: string;
  effectstreamApi: string;
  assets: typeof SEPOLIA_ASSET_LIST;
};

export function getSepoliaConfig(defaults?: {
  payTo?: string;
  paywall?: string;
}): SepoliaConfig {
  const payTo =
    (import.meta.env.VITE_SEPOLIA_PAY_TO as string | undefined)?.trim() ||
    defaults?.payTo?.trim() ||
    "";
  const paywall =
    (import.meta.env.VITE_SEPOLIA_PAYWALL as string | undefined)?.trim() ||
    defaults?.paywall?.trim() ||
    "";
  const rpcUrl =
    (import.meta.env.VITE_SEPOLIA_RPC as string | undefined)?.trim() ||
    (import.meta.env.SEPOLIA_RPC as string | undefined)?.trim() ||
    SEPOLIA_RPC_DEFAULT;
  const effectstreamApi =
    (import.meta.env.VITE_EFFECTSTREAM_API as string | undefined)?.trim() ||
    "/api/public/effectstream-status";

  return {
    chainId: SEPOLIA_CHAIN_ID,
    payTo: (payTo || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    paywall: (paywall || "") as `0x${string}` | "",
    rpcUrl,
    effectstreamApi,
    assets: SEPOLIA_ASSET_LIST,
  };
}

export function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function explorerTx(hash: string) {
  return `${SEPOLIA_EXPLORER}/tx/${hash}`;
}

export function explorerAddress(addr: string) {
  return `${SEPOLIA_EXPLORER}/address/${addr}`;
}

export function defaultAssetId(): SepoliaAssetId {
  return "USDC";
}
