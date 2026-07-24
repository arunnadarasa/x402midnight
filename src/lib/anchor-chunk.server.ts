import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { getUndeployedCtx } from "./midnight-providers.server";

function parseChunkHash(input: string): Uint8Array {
  const hex = input.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("chunkHash must be hex");
  }
  const bytes = new Uint8Array(32);
  const raw = Uint8Array.from(Buffer.from(hex.padStart(64, "0").slice(0, 64), "hex"));
  bytes.set(raw, 32 - raw.length);
  return bytes;
}

export type AnchorChunkResult = {
  ok: true;
  simulated: false;
  txId: string;
  blockHeight?: number;
  contractAddress: string;
  chunkHash: string;
  priceMicroUsdc: string;
};

export async function anchorChunkOnUndeployed(opts: {
  contractAddress: string;
  chunkHash: string;
  priceMicroUsdc: number | string | bigint;
}): Promise<AnchorChunkResult> {
  const address = opts.contractAddress;
  if (!address || !/^(0x)?[0-9a-fA-F]{6,}$/.test(address)) {
    throw new Error("Invalid contract address");
  }

  const price = BigInt(opts.priceMicroUsdc);
  if (price < 0n) throw new Error("priceMicroUsdc must be non-negative");

  const chunkHashBytes = parseChunkHash(opts.chunkHash);
  const ctx = await getUndeployedCtx(address);

  const deployed = await findDeployedContract(ctx.providers, {
    compiledContract: ctx.compiledContract,
    contractAddress: address,
    privateStateId: ctx.privateStateId,
  });

  const result = await deployed.callTx.anchorChunk(chunkHashBytes, price);
  const txId = String(result.public.txId ?? "");
  const blockHeight =
    typeof result.public.blockHeight === "number" || typeof result.public.blockHeight === "bigint"
      ? Number(result.public.blockHeight)
      : undefined;

  return {
    ok: true,
    simulated: false,
    txId,
    blockHeight,
    contractAddress: address,
    chunkHash: opts.chunkHash,
    priceMicroUsdc: price.toString(),
  };
}
