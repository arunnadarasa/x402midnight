import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agentic-experimental")({
  head: () => ({
    meta: [
      { title: "Agentic experimental · mUSDC" },
      {
        name: "description",
        content:
          "mUSDC is a Midnight mimic token for hackathon x402 demos. It has no peg and must never deploy to Mainnet.",
      },
    ],
  }),
  component: AgenticExperimental,
});

function AgenticExperimental() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-3xl font-bold tracking-tight">Agentic experimental</h1>
      <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
        This demo uses <span className="mono">MidnightUSDC</span> (mUSDC) as a{" "}
        <strong>mimic</strong> stablecoin for x402 pay-per-chunk flows on Midnight Undeployed.
        There is no peg, no redemption, and no Mainnet path. Settlements are Compact-witness
        transfers with a spent-nonce set — not EIP-712 / ERC-3009 on EVM.
      </p>
      <ul className="mt-6 list-disc pl-5 text-sm space-y-2 text-muted-foreground">
        <li>
          Scheme: <span className="mono">midnight-mUSDC</span>
        </li>
        <li>
          Network: <span className="mono">midnight:undeployed</span>
        </li>
        <li>
          Headers: literal <span className="mono">PAYMENT-SIGNATURE</span> /{" "}
          <span className="mono">PAYMENT-RESPONSE</span>
        </li>
        <li>Faucet cap: 10 mUSDC per signer</li>
      </ul>
      <p className="mt-8">
        <a href="/" className="underline text-sm">
          ← Back to stream
        </a>
      </p>
    </main>
  );
}
