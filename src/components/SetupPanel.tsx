import { useState } from "react";
import { MATRIX } from "@/lib/midnight-env";

const TABS = ["Docker", "Compile", "Deploy", "Fund Lace", "Sepolia"] as const;
type Tab = typeof TABS[number];

const SNIPPETS: Record<Tab, string> = {
  Docker: `# docker-compose.yml — pinned tags, undeployed stack
services:
  proof-server:
    image: midnightntwrk/proof-server:8.0.3
    command: ["midnight-proof-server", "-v"]
    ports: ["6300:6300"]
  node:
    image: midnightntwrk/midnight-node:0.22.5
    environment: { CFG_PRESET: dev }
    ports: ["9944:9944"]
  indexer:
    image: midnightntwrk/indexer-standalone:4.0.2
    depends_on: [node]
    environment:
      APP__INFRA__NODE__URL: ws://node:9944
      APP__INFRA__SECRET: "303132333435363738393031323334353637383930313233343536373839303132"
    ports: ["8088:8088"]

# bring up
bun scripts/midnight-standalone.mjs up`,

  Compile: `# One-time Compact toolchain install
curl --proto '=https' --tlsv1.2 -LsSf \\
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source ~/.bashrc && compact update

# Compile contract + copy artefacts to public/contract
compact compile contracts/StreamingChoreographyIP.compact \\
  contracts/managed/streaming-choreography-ip
mkdir -p public/contract && cp -r \\
  contracts/managed/streaming-choreography-ip/{keys,zkir,contract} public/contract/`,

  Deploy: `# Deploy against local Undeployed stack (uses genesis seed …0002)
VITE_NETWORK_ID=undeployed bun scripts/deploy-midnight.mjs
# → writes src/data/midnight-contract.undeployed.json (address, txHash, buyerPk)
# Paste the address into VITE_DEFAULT_CONTRACT for hot reload.`,

  "Fund Lace": `# Connect Lace → copy unshielded address (mn_addr_undeployed1…)
# In the same terminal where the local stack runs:
bun run midnight:fund mn_addr_undeployed1qxxxxxxx…

# Wait ~1 block. The tDUST chip in the app flips from 0 to a live number.
# Then every "anchorChunk" call pays fees in tDUST + settles mUSDC.`,

  Sepolia: `# Demo B — x402 exact on Sepolia: USDC · EURC · cirBTC
# USDC  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 · 6 decimals
# EURC  0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4 · 6 decimals
# cirBTC 0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3 · 8 decimals
# Faucet: https://faucet.circle.com/

# Credentials live in .env (gitignored):
#   SEPOLIA_RPC / PK / VITE_SEPOLIA_PAY_TO

# Deploy multi-asset paywall:
bun scripts/deploy-chunk-paywall.mjs
# → writes src/data/sepolia-paywall.json + VITE_SEPOLIA_PAYWALL

# UI: Demo mode → "Sepolia USDC + EffectStream"
#     Pick USDC / EURC / cirBTC → MetaMask → Start stream

# x402 challenge accepts[] includes midnight-mUSDC + three Sepolia exact options.
# EffectStream sidecar (optional): templates/evm-midnight-v2
`,
};

export function SetupPanel() {
  const [tab, setTab] = useState<Tab>("Docker");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(SNIPPETS[tab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="card p-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg">Setup</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Support Matrix snapshot {MATRIX.snapshot}. If <a className="underline" href="https://docs.midnight.network/relnotes/support-matrix" target="_blank" rel="noreferrer">the matrix</a> disagrees, the matrix wins.
          </p>
        </div>
      </header>

      <div className="mb-4 grid gap-2 grid-cols-2 sm:grid-cols-4 mono text-[10px]">
        {[
          ["Node", MATRIX.node],
          ["Indexer", MATRIX.indexer],
          ["Proof", MATRIX.proof],
          ["midnight-js", MATRIX.midnightJs],
          ["Wallet SDK", MATRIX.walletSdk],
          ["Connector", MATRIX.connector],
          ["Compact", MATRIX.compact],
          ["Runtime", MATRIX.runtime],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-[oklch(0.19_0.03_275)] px-2.5 py-1.5">
            <div className="uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="truncate mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${tab === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
        <button onClick={copy} className="ml-auto btn-ghost text-xs">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <pre className="mono text-[11px] leading-relaxed bg-[oklch(0.13_0.02_275)] border border-border rounded-md p-4 overflow-x-auto whitespace-pre">
{SNIPPETS[tab]}
      </pre>
    </section>
  );
}
