export type DemoMode = "midnight-musdc" | "sepolia-usdc";

type Props = {
  mode: DemoMode;
  onChange: (m: DemoMode) => void;
};

export function DemoModeToggle({ mode, onChange }: Props) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Demo mode
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("midnight-musdc")}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
            mode === "midnight-musdc"
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Midnight mUSDC
        </button>
        <button
          type="button"
          onClick={() => onChange("sepolia-usdc")}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
            mode === "sepolia-usdc"
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Sepolia USDC / EURC / cirBTC
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        {mode === "midnight-musdc" ? (
          <>
            Paywall is Compact <span className="mono">midnight-mUSDC</span> on Undeployed (mimic
            token, no peg). Challenge also advertises Sepolia exact options.
          </>
        ) : (
          <>
            x402 <span className="mono">exact</span> on Sepolia: pay with Circle{" "}
            <strong>USDC</strong>, <strong>EURC</strong>, or <strong>cirBTC</strong> via MetaMask.
            EffectStream indexes the payment; Midnight anchors the chunk (no bridge).
          </>
        )}
      </p>
    </div>
  );
}
