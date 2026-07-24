type Tone = "ok" | "warn" | "err" | "idle";

const TONE: Record<Tone, string> = {
  ok: "bg-[oklch(0.28_0.08_155)] text-[oklch(0.9_0.15_155)] border-[oklch(0.4_0.1_155)]",
  warn: "bg-[oklch(0.3_0.08_85)] text-[oklch(0.92_0.14_85)] border-[oklch(0.45_0.1_85)]",
  err: "bg-[oklch(0.3_0.1_25)] text-[oklch(0.9_0.16_25)] border-[oklch(0.45_0.14_25)]",
  idle: "bg-surface text-muted-foreground border-border",
};

export function StatusPill({ tone, label, value }: { tone: Tone; label: string; value?: string }) {
  return (
    <span className={`pill ${TONE[tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "ok" ? "bg-[oklch(0.8_0.18_155)] dot-live" : tone === "warn" ? "bg-[oklch(0.82_0.16_85)]" : tone === "err" ? "bg-[oklch(0.75_0.2_25)]" : "bg-muted-foreground"}`} />
      <span className="uppercase tracking-wide">{label}</span>
      {value && <span className="opacity-70">· {value}</span>}
    </span>
  );
}
