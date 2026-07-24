import { useEffect, useState } from "react";

/**
 * Non-negotiable for mUSDC / agentic overlay surfaces.
 * Collapsible on Undeployed/Preview/Preprod; sticky on Mainnet.
 */
export function ExperimentalAgenticBanner() {
  const net = ((import.meta.env.VITE_NETWORK_ID as string) ?? "undeployed").toLowerCase();
  const mainnet = net === "mainnet";
  const key = "agentic-banner-ack";
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!mainnet && localStorage.getItem(key) === "1") setHidden(true);
  }, [mainnet]);

  if (hidden && !mainnet) return null;

  return (
    <div
      role="alert"
      className="bg-[oklch(0.28_0.05_55)] text-[oklch(0.96_0.02_85)] px-4 py-2 text-center text-xs font-medium sticky top-0 z-40 flex flex-wrap items-center justify-center gap-2 border-b border-[oklch(0.45_0.08_55)]"
    >
      <span>
        mUSDC is a <strong>mimic token</strong> — no peg, no value. Experimental agentic / x402
        overlay.{" "}
        <a href="/agentic-experimental" className="underline hover:opacity-90">
          /agentic-experimental
        </a>
      </span>
      {!mainnet && (
        <button
          type="button"
          className="underline opacity-80 hover:opacity-100"
          onClick={() => {
            localStorage.setItem(key, "1");
            setHidden(true);
          }}
        >
          collapse
        </button>
      )}
    </div>
  );
}
