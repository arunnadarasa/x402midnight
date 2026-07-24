import { useCallback, useEffect, useRef, useState } from "react";
import { StatusPill } from "./StatusPill";
import {
  approveToken,
  connectMetaMask,
  formatAssetAmount,
  formatMicroUsdc,
  getChainId,
  makePublicClient,
  makeWalletClient,
  payViaPaywall,
  readTokenBalance,
  switchToSepolia,
  transferToken,
  type EthereumProvider,
  SEPOLIA_CHAIN_ID,
} from "@/lib/metamask";
import {
  explorerTx,
  getSepoliaConfig,
  shortAddr,
  type SepoliaConfig,
} from "@/lib/sepolia-usdc";
import {
  SEPOLIA_ASSETS,
  SEPOLIA_ASSET_LIST,
  priceMicroUsdToTokenAtomic,
  type SepoliaAssetId,
} from "@/lib/sepolia-tokens";
import paywallJson from "@/data/sepolia-paywall.json";
import type { Hex } from "viem";

type ChunkState =
  | "queued"
  | "wallet"
  | "approve"
  | "paying"
  | "syncing"
  | "anchoring"
  | "anchored"
  | "failed";

type Chunk = {
  id: number;
  transcript: string;
  priceMicroUsdc: number;
  assetId: SepoliaAssetId;
  state: ChunkState;
  chunkHash?: string;
  sepoliaTx?: string;
  midnightTx?: string;
  startedAt?: number;
  ms?: number;
  error?: string;
};

const SAMPLE_LINES = [
  "8-count · plié → chassé right → step-ball-change on 5",
  "8-count · body roll into low grand plié, hands frame face on 3",
  "8-count · pirouette en dehors, land in fourth, arms port de bras",
  "8-count · isolation: rib cage figure-eight, hip drop on the &",
  "8-count · leap into arabesque, sustain 6-7, walk-off on 8",
];

async function sha256Hex(s: string) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBytes32Hex(hex: string): Hex {
  const clean = hex.replace(/^0x/i, "").padStart(64, "0").slice(0, 64);
  return `0x${clean}` as Hex;
}

const stateCopy: Record<ChunkState, string> = {
  queued: "Queued",
  wallet: "Wallet",
  approve: "Approve token",
  paying: "Paying on Sepolia",
  syncing: "EffectStream sync",
  anchoring: "Anchoring Midnight",
  anchored: "Anchored",
  failed: "Failed",
};

const stateTone = (s: ChunkState) =>
  s === "anchored" ? "ok" : s === "failed" ? "err" : s === "queued" ? "idle" : "warn";

type Props = { scipAddress?: string };

export function SepoliaStreamPanel({ scipAddress }: Props) {
  const cfg = getSepoliaConfig({
    payTo: (paywallJson as { merchant?: string }).merchant,
    paywall: (paywallJson as { paywall?: string }).paywall,
  });
  const [assetId, setAssetId] = useState<SepoliaAssetId>("USDC");
  const asset = SEPOLIA_ASSETS[assetId];
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string>("—");
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const providerRef = useRef<EthereumProvider | null>(null);
  const cursor = useRef(0);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);
  const assetIdRef = useRef(assetId);
  assetIdRef.current = assetId;

  const merchantReady =
    !!cfg.payTo && cfg.payTo !== "0x0000000000000000000000000000000000000000";
  const onSepolia = chainId === SEPOLIA_CHAIN_ID;
  const canWrite = !!address && onSepolia && merchantReady;

  const refreshBalance = useCallback(
    async (addr: `0x${string}`, conf: SepoliaConfig, id: SepoliaAssetId) => {
      const a = SEPOLIA_ASSETS[id];
      const pc = makePublicClient(conf.rpcUrl);
      const { formatted } = await readTokenBalance(pc, a.address, addr, a.decimals);
      setBalance(formatted);
    },
    []
  );

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { address: addr, provider } = await connectMetaMask();
      providerRef.current = provider;
      setAddress(addr);
      const id = await getChainId(provider);
      setChainId(id);
      if (id === SEPOLIA_CHAIN_ID) await refreshBalance(addr, cfg, assetIdRef.current);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, [cfg, refreshBalance]);

  const switchNet = useCallback(async () => {
    if (!providerRef.current || !address) return;
    setSwitching(true);
    try {
      await switchToSepolia(providerRef.current);
      setChainId(SEPOLIA_CHAIN_ID);
      await refreshBalance(address, cfg, assetIdRef.current);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  }, [address, cfg, refreshBalance]);

  useEffect(() => {
    if (address && onSepolia) void refreshBalance(address, cfg, assetId);
  }, [assetId, address, onSepolia, cfg, refreshBalance]);

  const stop = useCallback(() => {
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
    setStreaming(false);
  }, []);

  const patch = useCallback((id: number, p: Partial<Chunk>) => {
    setChunks(prev => prev.map(c => (c.id === id ? { ...c, ...p } : c)));
  }, []);

  const enqueue = useCallback(async () => {
    if (busy.current || !address || !providerRef.current) return;
    busy.current = true;
    const payAsset = SEPOLIA_ASSETS[assetIdRef.current];
    const line = SAMPLE_LINES[cursor.current % SAMPLE_LINES.length];
    cursor.current += 1;
    const id = Date.now();
    const chunkHash = await sha256Hex(`${id}:${line}`);
    const price = 1000 + Math.floor(Math.random() * 4000);
    const amount = priceMicroUsdToTokenAtomic(price, payAsset);
    const chunk: Chunk = {
      id,
      transcript: line,
      priceMicroUsdc: price,
      assetId: payAsset.id,
      state: "queued",
      chunkHash,
      startedAt: Date.now(),
    };
    setChunks(prev => [chunk, ...prev].slice(0, 12));

    try {
      if (!onSepolia) throw new Error("Switch MetaMask to Sepolia first.");
      if (!merchantReady) throw new Error("Set VITE_SEPOLIA_PAY_TO to your merchant address.");

      const publicClient = makePublicClient(cfg.rpcUrl);
      const wallet = makeWalletClient(providerRef.current, address);
      const chunkBytes = toBytes32Hex(chunkHash);

      // Pull x402 challenge accepts (includes USDC/EURC/cirBTC)
      const challengeRes = await fetch("/api/public/x402-challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chunkHash, priceMicroUsdc: price }),
      });
      const challengeJson = (await challengeRes.json()) as {
        accepts?: Array<{ scheme: string; asset: string; amount: string; network: string }>;
      };
      const accepted = challengeJson.accepts?.find(
        a =>
          a.scheme === "exact" &&
          a.asset.toLowerCase() === payAsset.address.toLowerCase()
      );
      if (!accepted) {
        throw new Error(`x402 challenge missing Sepolia ${payAsset.symbol} option`);
      }

      patch(id, { state: "wallet" });

      let sepoliaTx: Hex;
      if (cfg.paywall) {
        const { readAllowance } = await import("@/lib/metamask");
        const allowance = await readAllowance(
          publicClient,
          payAsset.address,
          address,
          cfg.paywall
        );
        if (allowance < amount) {
          patch(id, { state: "approve" });
          await approveToken({
            wallet,
            publicClient,
            owner: address,
            token: payAsset.address,
            spender: cfg.paywall,
            amount,
          });
        }
        patch(id, { state: "paying" });
        sepoliaTx = await payViaPaywall({
          wallet,
          publicClient,
          owner: address,
          paywall: cfg.paywall,
          token: payAsset.address,
          chunkHash: chunkBytes,
          amount,
        });
      } else {
        patch(id, { state: "paying" });
        sepoliaTx = await transferToken({
          wallet,
          publicClient,
          owner: address,
          token: payAsset.address,
          to: cfg.payTo,
          amount,
        });
      }
      patch(id, { sepoliaTx, state: "syncing" });

      await fetch(
        `/api/public/sepolia-pay-status?txHash=${sepoliaTx}&amount=${amount.toString()}&payTo=${cfg.payTo}&chunkHash=${chunkHash}`
      );

      patch(id, { state: "anchoring" });
      const fulfillRes = await fetch("/api/public/sepolia-fulfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          txHash: sepoliaTx,
          chunkHash,
          priceMicroUsdc: price,
          payTo: cfg.payTo,
          token: payAsset.address,
          amountAtomic: amount.toString(),
          scipAddress,
        }),
      });
      const fulfill = (await fulfillRes.json()) as {
        ok?: boolean;
        midnightTxHash?: string;
        error?: string;
      };
      if (!fulfillRes.ok || !fulfill.ok) {
        throw new Error(fulfill.error ?? `fulfill failed (${fulfillRes.status})`);
      }

      patch(id, {
        state: "anchored",
        midnightTx: fulfill.midnightTxHash,
        ms: Date.now() - (chunk.startedAt ?? Date.now()),
      });
      await refreshBalance(address, cfg, payAsset.id);
    } catch (e) {
      patch(id, {
        state: "failed",
        error: e instanceof Error ? e.message : String(e),
        ms: Date.now() - (chunk.startedAt ?? Date.now()),
      });
      stop();
    } finally {
      busy.current = false;
    }
  }, [address, cfg, merchantReady, onSepolia, patch, refreshBalance, scipAddress, stop]);

  const start = useCallback(() => {
    setStreaming(true);
    void enqueue();
    const tick = () => {
      const t = window.setTimeout(async () => {
        await enqueue();
        tick();
      }, 14000 + Math.random() * 6000);
      timers.current.push(t);
    };
    tick();
  }, [enqueue]);

  const reason = !merchantReady
    ? "Set VITE_SEPOLIA_PAY_TO (and optionally VITE_SEPOLIA_PAYWALL) then restart vite."
    : !address
      ? "Connect MetaMask to pay with Sepolia USDC / EURC / cirBTC."
      : !onSepolia
        ? "Wrong network — switch to Sepolia."
        : undefined;

  const anchored = chunks.filter(c => c.state === "anchored").length;
  const total = chunks.reduce((s, c) => (c.state === "anchored" ? s + c.priceMicroUsdc : s), 0);

  return (
    <section className="card p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">Sepolia x402 stream</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pay with Circle <span className="mono">USDC</span> / <span className="mono">EURC</span> /{" "}
            <span className="mono">cirBTC</span> → EffectStream → Midnight anchor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={streaming ? "ok" : "idle"} label={streaming ? "Live" : "Paused"} />
          {!streaming ? (
            <button
              onClick={start}
              disabled={!canWrite}
              title={reason}
              className="btn-primary btn-primary-hover disabled:opacity-40 text-sm"
            >
              Start stream
            </button>
          ) : (
            <button onClick={stop} className="btn-ghost text-sm">
              Stop
            </button>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Pay in</span>
        {SEPOLIA_ASSET_LIST.map(a => (
          <button
            key={a.id}
            type="button"
            disabled={streaming}
            onClick={() => setAssetId(a.id)}
            className={`text-xs px-2.5 py-1 rounded-md border mono ${
              assetId === a.id
                ? "border-primary bg-primary/15"
                : "border-border text-muted-foreground"
            } disabled:opacity-40`}
          >
            {a.symbol}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!address ? (
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="btn-primary btn-primary-hover text-sm disabled:opacity-40"
          >
            {connecting ? "Connecting…" : "Connect MetaMask"}
          </button>
        ) : !onSepolia ? (
          <button
            type="button"
            onClick={switchNet}
            disabled={switching}
            className="btn-primary btn-primary-hover text-sm disabled:opacity-40"
          >
            {switching ? "Switching…" : "Switch to Sepolia"}
          </button>
        ) : (
          <StatusPill tone="ok" label={`Connected ${shortAddr(address)}`} />
        )}
        {address && onSepolia && (
          <span className="mono text-xs text-muted-foreground">
            balance {balance} {asset.symbol} · {asset.decimals} decimals
          </span>
        )}
      </div>

      {reason && (
        <div className="mb-4 rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-2 text-xs text-muted-foreground">
          {reason}
        </div>
      )}

      <div className="mb-4 rounded-md border border-[oklch(0.45_0.08_55)] bg-[oklch(0.22_0.04_55)] px-3 py-2 text-xs">
        x402 <span className="mono">exact</span> on <span className="mono">eip155:11155111</span>.
        Tokens stay on Sepolia — Midnight only anchors the chunk. Faucet:{" "}
        <a className="underline" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
          faucet.circle.com
        </a>
        {cfg.paywall ? (
          <>
            {" "}
            · paywall <span className="mono">{shortAddr(cfg.paywall)}</span>
          </>
        ) : (
          <> · direct transfer</>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Chunks anchored" value={anchored.toString()} />
        <Stat label="Notional paid" value={`~${formatMicroUsdc(total)} USD`} />
        <Stat label="Sepolia txs" value={chunks.filter(c => !!c.sepoliaTx).length.toString()} />
      </div>

      <ol className="flex flex-col gap-2">
        {chunks.length === 0 && (
          <li className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Pick USDC / EURC / cirBTC, connect MetaMask on Sepolia, then start.
          </li>
        )}
        {chunks.map(c => {
          const a = SEPOLIA_ASSETS[c.assetId];
          const atomic = priceMicroUsdToTokenAtomic(c.priceMicroUsdc, a);
          return (
            <li
              key={c.id}
              className="rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{c.transcript}</div>
                  <div className="mono text-[10px] text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                    <span>{a.symbol}</span>
                    <span>· {formatAssetAmount(atomic, a)} {a.symbol}</span>
                    <span>· ~{formatMicroUsdc(c.priceMicroUsdc)} USD</span>
                    {c.sepoliaTx && (
                      <a
                        className="underline"
                        href={explorerTx(c.sepoliaTx)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        sepolia {c.sepoliaTx.slice(0, 12)}…
                      </a>
                    )}
                    {c.midnightTx && <span>· midnight {c.midnightTx.slice(0, 14)}…</span>}
                    {c.error && (
                      <span className="text-[oklch(0.85_0.16_25)]">· {c.error}</span>
                    )}
                  </div>
                </div>
                <StatusPill tone={stateTone(c.state)} label={stateCopy[c.state]} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-sm mt-0.5">{value}</div>
    </div>
  );
}
