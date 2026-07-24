import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useState } from "react";
import { ExperimentalBanner } from "@/components/ExperimentalBanner";
import { ExperimentalAgenticBanner } from "@/components/ExperimentalAgenticBanner";
import { PreflightPanel } from "@/components/PreflightPanel";
import { LaceConnect } from "@/components/LaceConnect";
import { StreamPanel } from "@/components/StreamPanel";
import { SepoliaStreamPanel } from "@/components/SepoliaStreamPanel";
import { DemoModeToggle, type DemoMode } from "@/components/DemoModeToggle";
import { SetupPanel } from "@/components/SetupPanel";
import contractJson from "@/data/midnight-contract.undeployed.json";
import musdcJson from "@/data/midnight-usdc.undeployed.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Streaming Choreography IP · Midnight ZK demo" },
      {
        name: "description",
        content:
          "On-demand dance-choreography transcription API. Pay per chunk with Midnight mUSDC or Sepolia USDC (EffectStream overlay), then anchor on Midnight.",
      },
      { property: "og:title", content: "Streaming Choreography IP · Midnight ZK demo" },
      {
        property: "og:description",
        content: "x402 · mUSDC · Sepolia USDC + EffectStream · Compact ZK on Midnight.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen">
      <ExperimentalBanner />
      <ExperimentalAgenticBanner />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <Header />
        <ClientOnly fallback={<div className="h-96" />}>
          <HomeBody />
        </ClientOnly>
        <Footer />
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-10">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="pill">
          <span className="h-1.5 w-1.5 rounded-full bg-primary dot-live" />
          Midnight · Undeployed
        </span>
        <span className="pill">x402 · mUSDC</span>
        <span className="pill">Sepolia USDC</span>
        <span className="pill">Compact 0.23</span>
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
        Streaming Choreography IP
      </h1>
      <p className="mt-3 max-w-2xl text-sm sm:text-base text-muted-foreground">
        On-demand transcription API for dance choreography. Pay per chunk with Midnight mUSDC
        (mimic) or real Circle USDC on Sepolia via EffectStream overlay — then anchor privately on
        Midnight.
      </p>
    </header>
  );
}

function HomeBody() {
  const [demoMode, setDemoMode] = useState<DemoMode>("midnight-musdc");
  const networkId = ((import.meta.env.VITE_NETWORK_ID as string) ?? "undeployed").toLowerCase();
  const isUndeployed = networkId === "undeployed";
  const address = (contractJson as { address?: string }).address ?? "";
  const musdcAddress = (musdcJson as { address?: string }).address ?? "";
  const buyerPk = (musdcJson as { buyerPk?: string }).buyerPk ?? "";
  const scipDeployed = !!address && address !== "0".repeat(64);

  const [wallet, setWallet] = useState<{ connected: boolean; dust?: bigint }>({
    connected: false,
  });

  const canWrite = isUndeployed
    ? scipDeployed
    : wallet.connected && (wallet.dust === undefined || wallet.dust > 0n);

  const reason = isUndeployed
    ? !scipDeployed
      ? "Deploy the contract first (VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs)."
      : !musdcAddress
        ? "SCIP ready — deploy mUSDC for real settles (bun scripts/deploy-musdc.mjs)."
        : undefined
    : !wallet.connected
      ? "Connect Lace to start the stream."
      : wallet.dust === 0n
        ? "Fund your Lace wallet with tDUST first (bun run midnight:fund)."
        : undefined;

  const streamCanWrite = isUndeployed ? scipDeployed : canWrite;

  return (
    <div className="grid gap-5">
      <DemoModeToggle mode={demoMode} onChange={setDemoMode} />
      <PreflightPanel />
      {demoMode === "midnight-musdc" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <LaceConnect onChange={setWallet} optionalOnUndeployed={isUndeployed} />
          <StreamPanel
            canWrite={streamCanWrite}
            reason={reason}
            mode={isUndeployed ? "undeployed-server" : "lace"}
            contractAddress={address}
            musdcAddress={musdcAddress || undefined}
            buyerPk={buyerPk || undefined}
          />
        </div>
      ) : (
        <SepoliaStreamPanel scipAddress={address || undefined} />
      )}
      <SetupPanel />
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
      <span>
        Contracts: <span className="mono">StreamingChoreographyIP</span> ·{" "}
        <span className="mono">MidnightUSDC</span> · <span className="mono">ChunkPaywall.sol</span>
      </span>
      <a
        href="https://github.com/effectstream/effectstream"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground"
      >
        EffectStream ↗
      </a>
    </footer>
  );
}
