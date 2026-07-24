import { useCallback, useEffect, useState } from "react";
import {
  LACE_INSTALL_URL,
  connectMidnightWallet,
  waitForMidnightWallet,
} from "@/lib/midnight-env";
import { StatusPill } from "./StatusPill";

type WalletState = {
  connected: boolean;
  address?: string;
  dust?: bigint;
  walletName?: string;
  error?: string;
};

export function LaceConnect({
  onChange,
  optionalOnUndeployed = false,
}: {
  onChange?: (s: WalletState) => void;
  optionalOnUndeployed?: boolean;
}) {
  const [state, setState] = useState<WalletState>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [present, setPresent] = useState<boolean | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);

  // Poll for late injection — extensions often appear after first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await waitForMidnightWallet(5000);
      if (cancelled) return;
      setPresent(!!found);
      setWalletLabel(found?.wallet.name ?? found?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    onChange?.(state);
  }, [state, onChange]);

  const connect = useCallback(async () => {
    setBusy(true);
    setState(s => ({ ...s, error: undefined }));
    try {
      const result = await connectMidnightWallet("undeployed");
      setPresent(true);
      setWalletLabel(result.walletName ?? result.walletId);
      setState({
        connected: true,
        address: result.address,
        dust: result.dust,
        walletName: result.walletName ?? result.walletId,
      });
    } catch (e) {
      setState({
        connected: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const short = (a?: string) => (a ? `${a.slice(0, 12)}…${a.slice(-6)}` : "");

  return (
    <section className="card p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">Lace Wallet</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {optionalOnUndeployed ? (
              <>
                Optional on Undeployed — writes use genesis seed{" "}
                <span className="mono">…0002</span> via{" "}
                <span className="mono">/api/anchor-chunk</span>.
              </>
            ) : (
              <>
                Required for writes. Connect via DApp Connector · network{" "}
                <span className="mono">undeployed</span>.
              </>
            )}
          </p>
        </div>
        <StatusPill
          tone={state.connected ? "ok" : present === false ? "err" : present ? "warn" : "idle"}
          label={
            state.connected
              ? "Connected"
              : present === false
              ? "Not installed"
              : present
              ? "Detected"
              : "Looking…"
          }
        />
      </header>

      {!state.connected ? (
        <div className="flex flex-col gap-3">
          <button
            onClick={connect}
            disabled={busy}
            className="btn-primary btn-primary-hover disabled:opacity-40"
          >
            {busy
              ? "Requesting…"
              : present === false
              ? "Retry connect"
              : present
              ? `Connect ${walletLabel ?? "Lace"}`
              : "Connect Lace"}
          </button>
          {present === false && (
            <p className="text-xs text-muted-foreground">
              No Midnight wallet injected yet.{" "}
              <a
                className="underline hover:text-foreground"
                href={LACE_INSTALL_URL}
                target="_blank"
                rel="noreferrer"
              >
                Install Lace for Midnight
              </a>
              , enable it for this site, then refresh or hit Retry.
            </p>
          )}
          {state.error && (
            <p className="text-xs text-[oklch(0.85_0.16_25)]">{state.error}</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Wallet" value={state.walletName ?? "connected"} />
          <Field label="Address" value={short(state.address) || "unknown"} />
          <Field
            label="tDUST balance"
            value={
              state.dust !== undefined ? `${state.dust.toString()} / 250,000` : "n/a"
            }
          />
        </div>
      )}

      {state.connected && state.dust === 0n && (
        <p className="mt-3 text-xs text-[oklch(0.85_0.16_85)]">
          Fund your Lace on Undeployed:{" "}
          <span className="mono">bun run midnight:fund &lt;unshielded-addr&gt;</span>
        </p>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-sm mt-0.5 truncate">{value}</div>
    </div>
  );
}
