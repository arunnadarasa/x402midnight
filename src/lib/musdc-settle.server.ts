import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { getMusdcUndeployedCtx } from "./musdc-providers.server";
import { parseBytes32 } from "./x402-facilitator";

export type MusdcTransferResult = {
  ok: true;
  simulated: false;
  txId: string;
  blockHeight?: number;
  contractAddress: string;
  amount: string;
  nonce: string;
  faucetTxId?: string;
};

let faucetClaimed = false;

export async function ensureBuyerFaucet(musdcAddress: string): Promise<string | undefined> {
  if (faucetClaimed) return undefined;
  const ctx = await getMusdcUndeployedCtx(musdcAddress);
  const deployed = await findDeployedContract(ctx.providers, {
    compiledContract: ctx.compiledContract,
    contractAddress: musdcAddress,
    privateStateId: ctx.privateStateId,
  });

  try {
    const result = await deployed.callTx.faucet();
    faucetClaimed = true;
    return String(result.public.txId ?? "");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Already claimed on-chain from a prior process — treat as success.
    if (/already claimed/i.test(msg)) {
      faucetClaimed = true;
      return undefined;
    }
    throw e;
  }
}

export async function transferMusdcOnUndeployed(opts: {
  musdcAddress: string;
  payTo: string;
  amountMicroUsdc: number | string | bigint;
  nonce: string;
}): Promise<MusdcTransferResult> {
  const address = opts.musdcAddress;
  if (!address || !/^(0x)?[0-9a-fA-F]{6,}$/.test(address)) {
    throw new Error("Invalid MidnightUSDC contract address");
  }

  const amount = BigInt(opts.amountMicroUsdc);
  if (amount <= 0n) throw new Error("amount must be positive");

  const faucetTxId = await ensureBuyerFaucet(address);

  const ctx = await getMusdcUndeployedCtx(address);
  const deployed = await findDeployedContract(ctx.providers, {
    compiledContract: ctx.compiledContract,
    contractAddress: address,
    privateStateId: ctx.privateStateId,
  });

  const toBytes = parseBytes32(opts.payTo);
  const nonceBytes = parseBytes32(opts.nonce);

  const result = await deployed.callTx.transfer(toBytes, amount, nonceBytes);
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
    amount: amount.toString(),
    nonce: opts.nonce.replace(/^0x/i, ""),
    faucetTxId,
  };
}
