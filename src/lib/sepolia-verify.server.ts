import {
  createPublicClient,
  decodeEventLog,
  http,
  type Hex,
  type Log,
} from "viem";
import { sepolia } from "viem/chains";
import {
  SEPOLIA_RPC_DEFAULT,
  chunkPaywallAbi,
  erc20Abi,
} from "./sepolia-usdc";
import { SEPOLIA_ASSET_LIST, assetByAddress } from "./sepolia-tokens";

function rpcUrl() {
  return process.env.SEPOLIA_RPC || process.env.VITE_SEPOLIA_RPC || SEPOLIA_RPC_DEFAULT;
}

export function getSepoliaPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl()),
  });
}

export type SepoliaPayProof = {
  ok: true;
  txHash: Hex;
  payer: `0x${string}`;
  to: `0x${string}`;
  token: `0x${string}`;
  symbol?: string;
  amount: string;
  chunkHash?: string;
  via: "ChunkPaid" | "Transfer";
  blockNumber: string;
};

const ALLOWED = new Set(SEPOLIA_ASSET_LIST.map(a => a.address.toLowerCase()));

export async function verifySepoliaPayment(opts: {
  txHash: string;
  expectedAmount: bigint;
  expectedPayTo: `0x${string}`;
  expectedToken?: `0x${string}`;
  expectedChunkHash?: string;
  paywall?: `0x${string}` | "";
}): Promise<SepoliaPayProof> {
  const hash = (opts.txHash.startsWith("0x") ? opts.txHash : `0x${opts.txHash}`) as Hex;
  const client = getSepoliaPublicClient();
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Transaction failed or not found on Sepolia");
  }

  const logs = receipt.logs as Log[];
  const wantToken = opts.expectedToken?.toLowerCase();

  if (opts.paywall) {
    for (const log of logs) {
      if (log.address.toLowerCase() !== opts.paywall.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: chunkPaywallAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "ChunkPaid") continue;
        const args = decoded.args as {
          chunkHash: Hex;
          payer: `0x${string}`;
          token: `0x${string}`;
          amount: bigint;
        };
        if (wantToken && args.token.toLowerCase() !== wantToken) continue;
        if (!ALLOWED.has(args.token.toLowerCase())) {
          throw new Error("ChunkPaid token not in allowlist");
        }
        if (args.amount < opts.expectedAmount) {
          throw new Error("ChunkPaid amount below expected");
        }
        if (opts.expectedChunkHash) {
          const want = opts.expectedChunkHash.replace(/^0x/i, "").toLowerCase();
          const got = args.chunkHash.replace(/^0x/i, "").toLowerCase();
          if (got !== want) throw new Error("chunkHash mismatch in ChunkPaid");
        }
        const meta = assetByAddress(args.token);
        return {
          ok: true,
          txHash: hash,
          payer: args.payer,
          to: opts.expectedPayTo,
          token: args.token,
          symbol: meta?.symbol,
          amount: args.amount.toString(),
          chunkHash: args.chunkHash,
          via: "ChunkPaid",
          blockNumber: receipt.blockNumber.toString(),
        };
      } catch (e) {
        if (e instanceof Error && /mismatch|below expected|allowlist/i.test(e.message)) throw e;
      }
    }
  }

  for (const log of logs) {
    const tokenAddr = log.address as `0x${string}`;
    if (!ALLOWED.has(tokenAddr.toLowerCase())) continue;
    if (wantToken && tokenAddr.toLowerCase() !== wantToken) continue;
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const args = decoded.args as {
        from: `0x${string}`;
        to: `0x${string}`;
        value: bigint;
      };
      if (args.to.toLowerCase() !== opts.expectedPayTo.toLowerCase()) continue;
      if (args.value < opts.expectedAmount) {
        throw new Error("Token Transfer amount below expected");
      }
      const meta = assetByAddress(tokenAddr);
      return {
        ok: true,
        txHash: hash,
        payer: args.from,
        to: args.to,
        token: tokenAddr,
        symbol: meta?.symbol,
        amount: args.value.toString(),
        chunkHash: opts.expectedChunkHash,
        via: "Transfer",
        blockNumber: receipt.blockNumber.toString(),
      };
    } catch (e) {
      if (e instanceof Error && /below expected/i.test(e.message)) throw e;
    }
  }

  throw new Error("No matching USDC/EURC/cirBTC payment found in transaction logs");
}

const paidIndex = new Map<string, SepoliaPayProof>();

export function indexSepoliaPayment(chunkHash: string, proof: SepoliaPayProof) {
  paidIndex.set(chunkHash.replace(/^0x/i, "").toLowerCase(), proof);
}

export function lookupSepoliaPayment(chunkHash: string) {
  return paidIndex.get(chunkHash.replace(/^0x/i, "").toLowerCase()) ?? null;
}
