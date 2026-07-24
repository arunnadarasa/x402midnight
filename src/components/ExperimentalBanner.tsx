import { useEffect, useState } from "react";

const VARIANTS = {
  mainnet: { cls: "bg-[oklch(0.55_0.22_25)] text-white", msg: "MAINNET · vibe-coded experiment — funds at risk, no audit. Bragging-right proof-of-deploy only.", dismissible: false },
  preview: { cls: "bg-[oklch(0.78_0.16_85)] text-black", msg: "Testnet (Preview) · experimental hackathon build. Not audited.", dismissible: true },
  preprod: { cls: "bg-[oklch(0.78_0.16_85)] text-black", msg: "Testnet (Preprod) · experimental hackathon build. Not audited.", dismissible: true },
  undeployed: { cls: "bg-[oklch(0.32_0.04_275)] text-[oklch(0.95_0.01_275)]", msg: "Local dev chain (Undeployed) · not real value. Experimental build.", dismissible: true },
} as const;

type Net = keyof typeof VARIANTS;

export function ExperimentalBanner() {
  const net = ((import.meta.env.VITE_NETWORK_ID as Net) ?? "undeployed") as Net;
  const v = VARIANTS[net] ?? VARIANTS.undeployed;
  const key = `experimental-banner-dismissed-${net}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (v.dismissible && sessionStorage.getItem(key) === "1") setHidden(true);
  }, [key, v.dismissible]);
  if (hidden) return null;
  return (
    <div role="alert" className={`${v.cls} px-4 py-2 text-center text-xs font-semibold sticky top-0 z-50 flex items-center justify-center gap-3`}>
      <span>⚠️ {v.msg}</span>
      {v.dismissible && (
        <button
          type="button"
          className="underline opacity-80 hover:opacity-100"
          onClick={() => { sessionStorage.setItem(key, "1"); setHidden(true); }}
        >
          dismiss
        </button>
      )}
    </div>
  );
}
