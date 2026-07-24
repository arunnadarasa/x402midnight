import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_HEX_CHAIN_ID,
  SEPOLIA_RPC_DEFAULT,
  SEPOLIA_USDC,
  USDC_DECIMALS,
  chunkPaywallAbi,
  erc20Abi,
} from "./sepolia-usdc";
import type { SepoliaAsset } from "./sepolia-tokens";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((window as any).ethereum as EthereumProvider | undefined) ?? null;
}

export function makePublicClient(rpcUrl = SEPOLIA_RPC_DEFAULT): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

export async function connectMetaMask(): Promise<{
  address: `0x${string}`;
  provider: EthereumProvider;
}> {
  const provider = getEthereum();
  if (!provider) throw new Error("MetaMask (or injected Ethereum wallet) not found.");
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned from wallet.");
  return { address: accounts[0] as `0x${string}`, provider };
}

export async function getChainId(provider: EthereumProvider): Promise<number> {
  const hex = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hex, 16);
}

export async function switchToSepolia(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
    });
  } catch (e) {
    const err = e as { code?: number };
    if (err.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_HEX_CHAIN_ID,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [SEPOLIA_RPC_DEFAULT],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
      return;
    }
    throw e;
  }
}

export function makeWalletClient(provider: EthereumProvider, account: `0x${string}`): WalletClient {
  return createWalletClient({
    account,
    chain: sepolia,
    transport: custom(provider),
  });
}

export async function readTokenBalance(
  publicClient: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  decimals: number
): Promise<{ raw: bigint; formatted: string }> {
  const raw = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  return { raw, formatted: formatUnits(raw, decimals) };
}

export async function readUsdcBalance(
  publicClient: PublicClient,
  owner: `0x${string}`
): Promise<{ raw: bigint; formatted: string }> {
  return readTokenBalance(publicClient, SEPOLIA_USDC, owner, USDC_DECIMALS);
}

export async function readAllowance(
  publicClient: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function approveToken(opts: {
  wallet: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  token: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
}): Promise<Hex> {
  const hash = await opts.wallet.writeContract({
    chain: sepolia,
    account: opts.owner,
    address: opts.token,
    abi: erc20Abi,
    functionName: "approve",
    args: [opts.spender, opts.amount],
  });
  await opts.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** @deprecated use approveToken */
export async function approveUsdc(opts: {
  wallet: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
}): Promise<Hex> {
  return approveToken({ ...opts, token: SEPOLIA_USDC });
}

export async function payViaPaywall(opts: {
  wallet: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  paywall: `0x${string}`;
  token: `0x${string}`;
  chunkHash: Hex;
  amount: bigint;
}): Promise<Hex> {
  const hash = await opts.wallet.writeContract({
    chain: sepolia,
    account: opts.owner,
    address: opts.paywall,
    abi: chunkPaywallAbi,
    functionName: "pay",
    args: [opts.token, opts.chunkHash, opts.amount],
  });
  await opts.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function transferToken(opts: {
  wallet: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  token: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
}): Promise<Hex> {
  const hash = await opts.wallet.writeContract({
    chain: sepolia,
    account: opts.owner,
    address: opts.token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [opts.to, opts.amount],
  });
  await opts.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** @deprecated use transferToken */
export async function transferUsdc(opts: {
  wallet: WalletClient;
  publicClient: PublicClient;
  owner: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
}): Promise<Hex> {
  return transferToken({ ...opts, token: SEPOLIA_USDC });
}

export function microUsdcToRaw(micro: number | string | bigint): bigint {
  return BigInt(micro);
}

export function formatMicroUsdc(micro: number): string {
  return formatUnits(BigInt(micro), USDC_DECIMALS);
}

export function formatAssetAmount(raw: bigint, asset: SepoliaAsset): string {
  return formatUnits(raw, asset.decimals);
}

export function parseUsdcInput(human: string): bigint {
  return parseUnits(human, USDC_DECIMALS);
}

export { SEPOLIA_CHAIN_ID, SEPOLIA_USDC, USDC_DECIMALS };
