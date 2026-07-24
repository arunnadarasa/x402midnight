import { useCallback, useEffect, useState } from "react";
import { ENDPOINTS, pingIndexer, pingNode, pingProofServer } from "@/lib/midnight-env";
import { StatusPill } from "./StatusPill";

type Check = { key: string; label: string; endpoint: string; status: "idle" | "ok" | "err"; detail?: string };

const INITIAL: Check[] = [
  { key: "node", label: "Midnight Node", endpoint: ENDPOINTS.node, status: "idle" },
  { key: "indexer", label: "Indexer v4", endpoint: ENDPOINTS.indexer, status: "idle" },
  { key: "proof", label: "Proof Server", endpoint: ENDPOINTS.proof, status: "idle" },
  { key: "lace", label: "Lace Wallet", endpoint: "window.midnight.* (enumerate)", status: "idle" },
];

export function PreflightPanel() {
  const [checks, setChecks] = useState<Check[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setChecks(INITIAL.map(c => ({ ...c, status: "idle" })));
    const [node, idx, proof] = await Promise.all([
      pingNode(), pingIndexer(), pingProofServer(),
    ]);
    // Poll briefly so late-injected extensions are not false-negatives.
    const { waitForMidnightWallet } = await import("@/lib/midnight-env");
    const found = await waitForMidnightWallet(2500);
    const lace = found
      ? { present: true as const, name: found.wallet.name ?? found.id }
      : { present: false as const };
    setChecks([
      { ...INITIAL[0], status: node.ok ? "ok" : "err", detail: node.ok ? "ws open" : "no ws" },
      { ...INITIAL[1], status: idx.ok ? "ok" : "err", detail: idx.ok ? "graphql ok" : "unreachable" },
      { ...INITIAL[2], status: proof.ok ? "ok" : "err", detail: proof.ok ? proof.version ?? "ok" : "not running" },
      { ...INITIAL[3], status: lace.present ? "ok" : "err", detail: lace.present ? lace.name : "not installed" },
    ]);
    setRunning(false);
  }, []);

  useEffect(() => { void run(); }, [run]);

  const stackOk = checks
    .filter(c => c.key !== "lace")
    .every(c => c.status === "ok");
  const allOk = checks.every(c => c.status === "ok");

  return (
    <section className="card p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">Undeployed Preflight</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Node + Indexer + Proof = ready to write via genesis …0002. Lace is optional on Undeployed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            tone={stackOk ? "ok" : running ? "idle" : "warn"}
            label={stackOk ? (allOk ? "Ready" : "Stack ready") : running ? "Checking" : "Not ready"}
          />
          <button onClick={run} disabled={running} className="btn-ghost text-xs disabled:opacity-50">
            {running ? "Checking…" : "Re-check"}
          </button>
        </div>
      </header>
      <div className="grid gap-2 sm:grid-cols-2">
        {checks.map(c => (
          <div key={c.key} className="flex items-center justify-between rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">{c.label}</div>
              <div className="mono text-[10px] text-muted-foreground mt-0.5">{c.endpoint}</div>
            </div>
            <StatusPill
              tone={c.status === "ok" ? "ok" : c.status === "err" ? "err" : "idle"}
              label={c.status === "ok" ? "OK" : c.status === "err" ? "Down" : "…"}
              value={c.detail}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
