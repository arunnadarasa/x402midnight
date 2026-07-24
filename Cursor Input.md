# Cursor Input — x402midnight session notes

Repo target: [https://github.com/arunnadarasa/x402midnight](https://github.com/arunnadarasa/x402midnight)

This document captures what worked, what failed, and how a future Cursor/agent session should approach the same problem space: **Midnight Undeployed ZK + x402 facilitator + Sepolia Circle assets → EffectStream-shaped overlay → Midnight `anchorChunk`**.

---

## What we built (successes)

### 1. Midnight Undeployed SCIP (Streaming Choreography IP)

- Compact contract `StreamingChoreographyIP` with `anchorChunk`.
- Local stack: Midnight node `0.22.5`, indexer GraphQL v4 at `/api/v4/graphql`, proof-server `8.0.3`.
- Compact `0.23` + midnight-js `4.1.1`.
- Undeployed **writes** use the genesis seed (`…0002`) via **server-append**, not Lace. Lace is fine for read/status; settlement must not depend on browser wallet for Undeployed.
- Deploy metadata landed in `src/data/midnight-contract.undeployed.json`.

### 2. Midnight mUSDC x402 facilitator

- Compact `MidnightUSDC` (faucet ≤10 mUSDC, transfer, `spent_nonces`, domain `musdc:signer:v1`).
- Public routes: `/api/public/x402-{challenge,verify,settle,proxy}` with `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`.
- Scheme `midnight-mUSDC`, network `midnight:undeployed`.
- UI `StreamPanel` wired to real 402 → verify → settle (`transfer` + `anchorChunk`).
- Experimental agentic surface: `/agentic-experimental`.

### 3. Sepolia multi-asset paywall + dual demo mode

- Verified Circle Sepolia tokens (via `cast`):
  - USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6)
  - EURC `0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4` (6)
  - cirBTC `0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3` (8)
- Multi-asset `ChunkPaywall.sol`: `pay(token, chunkHash, amount)`, allowlist, `ChunkPaid`.
- Deployed paywall: `0x9e618C7af53df9ca386711146F23F17EdCD74929`
  - Merchant: `0x2B98D15f8DA97b9165C4209Ed3033607E23b3f05`
  - Meta: `src/data/sepolia-paywall.json`
- Home demo toggle: **Midnight mUSDC** | **Sepolia USDC / EURC / cirBTC**.
- x402 challenge `accepts[]` includes midnight-mUSDC **plus** three Sepolia `exact` options on `eip155:11155111`.
- Fulfill path: Sepolia pay → `/api/public/sepolia-fulfill` → Undeployed `anchorChunkOnUndeployed`.

### 4. End-to-end proof (Undeployed on-chain anchor)

After a successful Sepolia USDC pay, the UI reached **ANCHORED**. Local indexer confirmation:

| Field | Value |
| --- | --- |
| Entry point | `anchorChunk` |
| SCIP address | `71fcea6f…b73717` |
| Block height | `681` |
| Indexer tx hash | `cfde9f183458833434ce4a27ef6fa1e660ae0e4b0ea6ecb44b74d3e372b7d7cd` |

Note: midnight-js `txId` (UI “midnight 00625911…”) is **not** the same string as the indexer ledger `hash`. Both can be real; verify anchors via indexer `contractActions.entryPoint == "anchorChunk"`, not by string-matching the SDK id to the indexer hash.

### 5. Sourcify + Etherscan verify

- Sourcify: exact match for the paywall.
- Etherscan Sepolia: verified after switching Foundry to **Etherscan API V2**:
  - `--verifier-url https://api.etherscan.io/v2/api?chainid=11155111`
  - `--skip-is-verified-check` (V1-style ABI preflight misreports valid V2 keys as “Invalid API Key”)
- Script: `bun scripts/verify-chunk-paywall.mjs`

---

## Failures and traps (what burned time)

### Foundry broadcast flag order

On this Foundry version, `forge create` dry-runs unless `--broadcast` appears **before** other flags in the way this toolchain expects. Deploy scripts that “succeed” without writing on-chain are worse than hard failures — always check the explorer/cast receipt.

### Etherscan API V1 vs V2

- Per-chain V1 endpoints (e.g. `api-sepolia.etherscan.io`) are deprecated.
- A **valid** key can pass `api.etherscan.io/v2/api?chainid=11155111` balance checks and still fail `forge verify-contract` if Foundry hits V1 or the ABI preflight path.
- Typo’d / truncated keys fail with `#err2` — check key length (~34) and a V2 ping before debugging forge.

### Infura gas cap vs MetaMask fallback gas

Symptom:

```text
transaction gas limit too high (cap: 16777216, tx: 21000000)
```

Root pattern:

1. `eth_estimateGas` fails (often **0 token balance** / allowance / simulation revert).
2. Wallet falls back to **21_000_000** gas.
3. Infura rejects anything above **2^24 (16_777_216)**.

This looks like a contract revert in viem’s error wrapping; it is an RPC send policy failure. Fix the estimate cause (fund wallet / allowance) first; optionally set an explicit gas under the Infura cap after a successful estimate.

### Balance / wallet identity confusion

- Early failure used a wallet with **0 USDC**.
- Success used merchant-funded `0x2B98…3F05` with **20 USDC**.
- Always surface balance vs required amount **before** `writeContract`, with a clear “faucet.circle.com” CTA.

### EffectStream is not a bridge

EffectStream in this demo is a **sync/overlay** after Sepolia payment. Tokens stay on Sepolia; Midnight only stores the chunk anchor. Do not describe this as bridging USDC onto Midnight.

### Secrets hygiene

- `.env` holds `PK`, RPC URLs, `ETHERSCAN_API_KEY`, Vite `VITE_*` keys — must stay gitignored.
- Never commit deploy keys. Restart `bun dev` after changing `VITE_*`.
- Chat/logs can leak API keys via `forge --help` env echo; do not paste those into docs/commits.

### Lovable / history

`AGENTS.md`: do not force-push, rebase, or rewrite published history on the Lovable-connected branch.

### Simulated vs real fulfill

`/api/public/sepolia-fulfill` returns `midnightTxHash: "0xSIMULATED"` if SCIP address is missing or `VITE_NETWORK_ID !== "undeployed"`. UI “ANCHORED” with `0xSIMULATED` is **not** on-chain. Always confirm via indexer.

---

## Concrete learnings (portable)

1. **Two networks, two wallets.** Sepolia = MetaMask + Circle tokens. Undeployed Midnight writes = server genesis wallet + proof server. Do not force Lace for Undeployed settlement.
2. **x402 multi-accept.** Challenge responses should advertise all viable rails (`midnight-mUSDC` + Sepolia `exact` assets) so clients can pick.
3. **Decimals matter.** USDC/EURC = 6; cirBTC = 8. Price in micro-USD must convert per asset (`priceMicroUsdToTokenAtomic`).
4. **Verify on both explorers.** Sourcify ≠ Etherscan UI green check. Prefer V2 + `--watch`.
5. **Indexer is source of truth for Undeployed.** Query `contractAction` / block scan for `entryPoint: "anchorChunk"`.
6. **Instrument before guessing** on wallet/RPC errors; gas-cap and balance failures rhyme with “contract reverted.”
7. **Foundry + Vite env split.** Server scripts load `.env`; browser only sees `VITE_*`. Paywall/merchant addresses need both deploy JSON and Vite env for the UI.

---

## How we would do it differently next time

### Upfront checklist (before any UI)

1. Bring up Docker Undeployed (node, indexer :8088, proof :6300) and ping GraphQL `__typename`.
2. Deploy SCIP + mUSDC; write `src/data/*.undeployed.json`.
3. Fund genesis for fees; faucet mUSDC for the demo buyer path.
4. Deploy Sepolia paywall with `--broadcast`; confirm receipt; write `sepolia-paywall.json`.
5. Fund MetaMask with Sepolia ETH **and** Circle faucet USDC/EURC/cirBTC **before** first stream click.
6. Verify paywall on Sourcify + Etherscan V2 in the same session as deploy.

### Product / UX

- Preflight panel: proof server, indexer, Lace (optional), MetaMask chain id, token balance ≥ next chunk, paywall code verified.
- Fail fast with human copy for: wrong chain, 0 balance, missing allowance, Infura gas-cap (map RPC text → “estimation failed; check balance”).
- Show both Midnight `txId` and indexer `hash` when they differ, or link a tiny “verify on indexer” helper.

### Engineering

- Bake Etherscan V2 into `foundry.toml` / verify script from day one; never rely on V1 Sepolia URLs.
- Cap or set gas explicitly after `estimateContractGas` when the wallet RPC is Infura.
- Keep deploy/verify/fulfill scripts idempotent: `scripts/deploy-*.mjs`, `verify-chunk-paywall.mjs`, health curls in README.
- Add a one-command smoke: Sepolia `pay` (anvil or live) → fulfill → indexer assert `anchorChunk`.
- Document clearly: **overlay, not bridge.**

### Process

- Do not leave temporary debug `fetch` ingest logs in the tree; strip after confirmation.
- Never commit `.env`. Prefer `.env.example` with names only.
- Prefer small vertical slices: Undeployed anchor alone → mUSDC x402 → Sepolia rail → dual toggle — each slice proven on-chain before the next.

---

## Key paths (cheat sheet)

| Area | Path |
| --- | --- |
| Midnight shared endpoints | `src/lib/midnight-shared.ts` |
| Server providers / append | `src/lib/midnight-providers.server.ts`, `anchor-chunk.server.ts` |
| mUSDC settle | `src/lib/musdc-*.server.ts`, `x402-facilitator.ts` |
| Sepolia tokens / paywall ABI | `src/lib/sepolia-tokens.ts`, `sepolia-usdc.ts`, `metamask.ts` |
| UI | `StreamPanel.tsx`, `SepoliaStreamPanel.tsx`, `DemoModeToggle.tsx` |
| APIs | `src/routes/api/public/x402-*`, `sepolia-fulfill.ts`, `sepolia-pay-status.ts` |
| EVM contract | `contracts/evm/ChunkPaywall.sol` |
| Deploy / verify | `scripts/deploy-chunk-paywall.mjs`, `scripts/verify-chunk-paywall.mjs` |
| Deployed addresses | `src/data/midnight-contract.undeployed.json`, `midnight-usdc.undeployed.json`, `sepolia-paywall.json` |

---

## Session verdict

The dual-rail demo works: **Sepolia Circle asset payment can trigger a real Undeployed Midnight `anchorChunk`**, confirmed in the local indexer at block 681. The painful parts were tooling (Foundry broadcast, Etherscan V2) and wallet/RPC footguns (zero balance → 21M gas → Infura cap), not the Compact circuit logic itself.

Next session should start from the checklist above, treat the indexer as the Undeployed acceptance test, and keep Sepolia and Midnight responsibilities explicitly separated in UI copy and architecture.
