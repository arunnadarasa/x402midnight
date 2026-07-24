import { useCallback, useRef, useState } from "react";
import { StatusPill } from "./StatusPill";
import type { PaymentPayloadV2, PaymentRequirements } from "@/lib/x402-facilitator";

type ChunkState = "queued" | "challenge" | "paying" | "proving" | "anchored" | "failed";

type Chunk = {
  id: number;
  transcript: string;
  priceMicroUsdc: number;
  state: ChunkState;
  chunkHash?: string;
  txHash?: string;
  transferTxHash?: string;
  simulated?: boolean;
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
  "8-count · floor-work: hinge back, roll through spine, kick up on 7",
  "8-count · syncopated tap: shuffle-ball-change, wing on the a-4",
  "8-count · partnered lift setup: prep on 1-2, lift on 3, hold 4-8",
];

async function sha256Hex(s: string) {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomNonceHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodePaymentSignature(payload: PaymentPayloadV2): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach(b => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

const stateCopy: Record<ChunkState, string> = {
  queued: "Queued",
  challenge: "402 challenge",
  paying: "Settling mUSDC",
  proving: "Proving · up to ~4 min",
  anchored: "Anchored on-chain",
  failed: "Failed",
};

const stateTone = (s: ChunkState) =>
  s === "anchored" ? "ok" : s === "failed" ? "err" : s === "queued" ? "idle" : "warn";

type Props = {
  canWrite: boolean;
  reason?: string;
  /** Undeployed: x402 facilitator → genesis …0002. Other nets: Lace (not wired here yet). */
  mode: "undeployed-server" | "lace";
  contractAddress?: string;
  musdcAddress?: string;
  buyerPk?: string;
};

export function StreamPanel({
  canWrite,
  reason,
  mode,
  contractAddress,
  musdcAddress,
  buyerPk,
}: Props) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [streaming, setStreaming] = useState(false);
  const cursor = useRef(0);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const stop = useCallback(() => {
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
    setStreaming(false);
  }, []);

  const patch = useCallback((id: number, patch: Partial<Chunk>) => {
    setChunks(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const enqueue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const line = SAMPLE_LINES[cursor.current % SAMPLE_LINES.length];
    cursor.current += 1;
    const id = Date.now();
    const chunkHash = await sha256Hex(`${id}:${line}`);
    const price = 1000 + Math.floor(Math.random() * 4000);
    const chunk: Chunk = {
      id,
      transcript: line,
      priceMicroUsdc: price,
      state: "queued",
      chunkHash,
      startedAt: Date.now(),
    };
    setChunks(prev => [chunk, ...prev].slice(0, 12));

    try {
      if (mode !== "undeployed-server") {
        throw new Error("Lace client submit is not wired yet. Switch VITE_NETWORK_ID=undeployed.");
      }

      patch(id, { state: "challenge" });

      const challengeRes = await fetch("/api/public/x402-challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chunkHash,
          priceMicroUsdc: price,
          resource: "/api/public/x402-settle",
        }),
      });
      const challengeJson = (await challengeRes.json()) as {
        accepts?: PaymentRequirements[];
        error?: string;
        warning?: string;
      };
      if (challengeRes.status !== 402 || !challengeJson.accepts?.[0]) {
        throw new Error(challengeJson.error ?? `challenge failed (${challengeRes.status})`);
      }

      const accepted = challengeJson.accepts[0];
      const nonce = randomNonceHex();
      const payment: PaymentPayloadV2 = {
        x402Version: 2,
        resource: { url: "/api/public/x402-settle", description: line },
        accepted,
        payload: {
          nonce,
          from: buyerPk,
          chunkHash,
        },
      };
      const paymentSignature = encodePaymentSignature(payment);

      patch(id, { state: "paying" });

      const verifyRes = await fetch("/api/public/x402-verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": paymentSignature,
        },
        body: JSON.stringify({
          amount: String(price),
          payTo: accepted.payTo,
          chunkHash,
        }),
      });
      const verifyJson = (await verifyRes.json()) as {
        isValid?: boolean;
        invalidReason?: string;
      };
      if (!verifyRes.ok || !verifyJson.isValid) {
        throw new Error(verifyJson.invalidReason ?? `verify failed (${verifyRes.status})`);
      }

      patch(id, { state: "proving" });

      const settleRes = await fetch("/api/public/x402-settle", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": paymentSignature,
        },
        body: JSON.stringify({
          chunkHash,
          priceMicroUsdc: price,
          scipAddress: contractAddress,
          musdcAddress,
        }),
      });
      const settleJson = (await settleRes.json()) as {
        ok?: boolean;
        simulated?: boolean;
        midnightTxHash?: string;
        anchorTxHash?: string;
        error?: string;
      };
      if (!settleRes.ok || !settleJson.ok) {
        throw new Error(settleJson.error ?? `settle failed (${settleRes.status})`);
      }

      const txHash = settleJson.anchorTxHash ?? settleJson.midnightTxHash ?? "";
      patch(id, {
        state: "anchored",
        txHash,
        transferTxHash: settleJson.midnightTxHash,
        simulated: !!settleJson.simulated,
        ms: Date.now() - (chunk.startedAt ?? Date.now()),
      });
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
  }, [buyerPk, contractAddress, mode, musdcAddress, patch, stop]);

  const start = useCallback(() => {
    setStreaming(true);
    void enqueue();
    const tick = () => {
      const t = window.setTimeout(async () => {
        await enqueue();
        tick();
      }, 10000 + Math.random() * 5000);
      timers.current.push(t);
    };
    tick();
  }, [enqueue]);

  const total = chunks.reduce((s, c) => (c.state === "anchored" ? s + c.priceMicroUsdc : s), 0);
  const anchored = chunks.filter(c => c.state === "anchored").length;
  const realWrites = chunks.filter(
    c => c.txHash && !c.txHash.startsWith("stub") && !c.simulated && !c.txHash.includes("SIMULATED")
  ).length;

  return (
    <section className="card p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">Choreography stream</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "undeployed-server" ? (
              <>
                Undeployed:{" "}
                <span className="mono">
                  402 → PAYMENT-SIGNATURE → verify → settle (mUSDC + anchor)
                </span>
                .
              </>
            ) : (
              <>
                Each chunk settles via Lace then{" "}
                <span className="mono">anchorChunk</span>.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={streaming ? "ok" : "idle"} label={streaming ? "Live" : "Paused"} />
          {!streaming ? (
            <button
              onClick={start}
              disabled={!canWrite}
              title={!canWrite ? reason : undefined}
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

      {reason && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-xs ${
            canWrite
              ? "border-border bg-[oklch(0.19_0.03_275)] text-muted-foreground"
              : "border-[oklch(0.45_0.1_85)] bg-[oklch(0.28_0.06_85)] text-[oklch(0.94_0.13_85)]"
          }`}
        >
          {reason}
        </div>
      )}

      {mode === "undeployed-server" && canWrite && (
        <div className="mb-4 rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-2 text-xs text-muted-foreground">
          First settle may run <span className="mono">faucet</span> +{" "}
          <span className="mono">transfer</span> + <span className="mono">anchorChunk</span>{" "}
          proofs (minutes cold). Later chunks are faster.
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Chunks anchored" value={anchored.toString()} />
        <Stat label="Total paid" value={`${(total / 1_000_000).toFixed(4)} mUSDC`} />
        <Stat label="On-chain writes" value={realWrites.toString()} />
      </div>

      <ol className="flex flex-col gap-2">
        {chunks.length === 0 && (
          <li className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No chunks yet. Hit <span className="mono">Start stream</span>.
          </li>
        )}
        {chunks.map(c => (
          <li
            key={c.id}
            className="rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{c.transcript}</div>
                <div className="mono text-[10px] text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                  <span>hash 0x{c.chunkHash?.slice(0, 16)}</span>
                  <span>· {(c.priceMicroUsdc / 1_000_000).toFixed(4)} mUSDC</span>
                  {c.transferTxHash && (
                    <span>· pay {c.transferTxHash.slice(0, 14)}…</span>
                  )}
                  {c.txHash && <span>· anchor {c.txHash.slice(0, 14)}…</span>}
                  {c.simulated && <span className="text-[oklch(0.85_0.14_85)]">· simulated</span>}
                  {c.ms && c.state === "anchored" && (
                    <span>· {(c.ms / 1000).toFixed(1)}s</span>
                  )}
                  {c.error && (
                    <span className="text-[oklch(0.85_0.16_25)]">· {c.error}</span>
                  )}
                </div>
              </div>
              <StatusPill tone={stateTone(c.state)} label={stateCopy[c.state]} />
            </div>
          </li>
        ))}
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
