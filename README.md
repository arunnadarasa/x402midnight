# x402midnight

Dual-rail demo: **x402 payments** settle either in **Midnight Undeployed mUSDC** or **Sepolia Circle assets** (USDC / EURC / cirBTC), then a choreography chunk is anchored on-chain via Compact `anchorChunk` on local Midnight Undeployed.

> Tokens paid on Sepolia stay on Sepolia. Midnight stores the chunk anchor (EffectStream-shaped overlay), not a bridged balance.

**Repo:** [github.com/arunnadarasa/x402midnight](https://github.com/arunnadarasa/x402midnight)

Session notes (learnings / failures / next-time checklist): [`Cursor Input.md`](./Cursor%20Input.md)

---

## What it does

| Mode | Payment | Midnight |
| --- | --- | --- |
| **Midnight mUSDC** | x402 `midnight-mUSDC` on `midnight:undeployed` (faucet → transfer + nonce) | `transfer` + `anchorChunk` via server genesis wallet |
| **Sepolia** | MetaMask `pay()` on `ChunkPaywall` with USDC / EURC / cirBTC (`eip155:11155111`) | After confirm → `/api/public/sepolia-fulfill` → Undeployed `anchorChunk` |

UI toggle on `/`: Midnight mUSDC | Sepolia USDC / EURC / cirBTC.

---

## Stack

- **App:** TanStack Start, React, TypeScript, Vite, Tailwind, Bun
- **Midnight:** Compact `0.23`, midnight-js `4.1.1`, local Undeployed Docker (node `0.22.5`, indexer GraphQL v4, proof-server `8.0.3`)
- **EVM:** Foundry / Solidity `0.8.24`, Circle Sepolia tokens, MetaMask via viem

---

## Prerequisites

1. [Bun](https://bun.sh)
2. Docker — Midnight Undeployed (node, indexer `:8088`, proof-server `:6300`)
3. MetaMask on **Sepolia** + Sepolia ETH
4. Circle faucet tokens: [faucet.circle.com](https://faucet.circle.com)
5. Optional: Foundry (`forge` / `cast`) for deploy/verify; Etherscan API key for source verify

---

## Quick start

```bash
git clone https://github.com/arunnadarasa/x402midnight.git
cd x402midnight
bun install
cp .env.example .env   # fill Sepolia keys if using that rail
bun dev                # http://localhost:8080
```

Ensure Undeployed services are up:

| Service | Default |
| --- | --- |
| Proof server | `http://127.0.0.1:6300` |
| Indexer GraphQL | `http://127.0.0.1:8088/api/v4/graphql` |

Restart `bun dev` after changing any `VITE_*` env var.

---

## Deployed demo addresses

### Midnight Undeployed

| Contract | Address |
| --- | --- |
| SCIP (`StreamingChoreographyIP`) | `71fcea6fdb275d4cee3cc3f492756efed6c0d05d26444fe2cb4e407613b73717` |
| mUSDC (`MidnightUSDC`) | `ec34a1a550c7730f200a41846b88ffc6958abc827f3f30a34ce5cb60c1033888` |

Metadata: `src/data/midnight-contract.undeployed.json`, `src/data/midnight-usdc.undeployed.json`

Undeployed **writes** use the genesis seed via server-append (not Lace). Lace is for connector status / experimental paths only.

### Sepolia

| Item | Value |
| --- | --- |
| ChunkPaywall | [`0x9e618C7af53df9ca386711146F23F17EdCD74929`](https://sepolia.etherscan.io/address/0x9e618C7af53df9ca386711146F23F17EdCD74929#code) |
| Merchant | `0x2B98D15f8DA97b9165C4209Ed3033607E23b3f05` |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6) |
| EURC | `0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4` (6) |
| cirBTC | `0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3` (8) |

Metadata: `src/data/sepolia-paywall.json`

---

## Environment

Copy `.env.example` → `.env` (gitignored). Never commit private keys.

```bash
SEPOLIA_RPC=...
PK=0x...                          # deployer / ops — server scripts only
VITE_SEPOLIA_PAY_TO=0x...         # merchant
VITE_SEPOLIA_PAYWALL=0x...        # ChunkPaywall
VITE_SEPOLIA_RPC=...              # browser RPC (optional)
ETHERSCAN_API_KEY=...             # forge verify (API V2)
```

---

## Scripts

```bash
# Midnight
bun scripts/deploy-midnight.mjs
bun scripts/deploy-musdc.mjs
bun scripts/e2e-x402-settle.mjs

# Sepolia paywall
bun scripts/deploy-chunk-paywall.mjs --broadcast
bun scripts/verify-chunk-paywall.mjs   # Etherscan V2 + --skip-is-verified-check
```

Foundry: put `--broadcast` where this toolchain expects it, or deploys may dry-run. Etherscan verification uses the unified V2 API (`chainid=11155111`).

---

## API surface (public)

| Route | Role |
| --- | --- |
| `POST /api/public/x402-challenge` | 402 challenge; `accepts[]` for mUSDC + Sepolia assets |
| `POST /api/public/x402-verify` | Verify payment signature / proof |
| `POST /api/public/x402-settle` | Settle mUSDC + Midnight `anchorChunk` |
| `POST /api/public/x402-proxy` | Paid proxy helper |
| `GET/POST /api/public/sepolia-pay-status` | Index / check Sepolia payment |
| `POST /api/public/sepolia-fulfill` | After Sepolia pay → Undeployed anchor |
| `GET /api/public/effectstream-status` | Overlay / sync stub status |

If fulfill returns `midnightTxHash: "0xSIMULATED"`, SCIP address is missing or network is not `undeployed` — that is **not** on-chain.

Confirm real anchors on the local indexer (`contractActions.entryPoint == "anchorChunk"`). midnight-js `txId` may differ from the indexer ledger `hash`.

---

## Architecture (short)

```text
[ UI StreamPanel / SepoliaStreamPanel ]
        │
        ├─ Midnight rail ─► x402 challenge/verify/settle ─► mUSDC transfer + SCIP.anchorChunk
        │
        └─ Sepolia rail ─► MetaMask approve + ChunkPaywall.pay
                              │
                              └─► sepolia-fulfill ─► SCIP.anchorChunk (Undeployed)
```

Compact sources: `contracts/StreamingChoreographyIP.compact`, `contracts/MidnightUSDC.compact`  
EVM: `contracts/evm/ChunkPaywall.sol`

---

## Gotchas

- **0 token balance** → MetaMask may send **21M gas** → Infura rejects above **16.7M**. Fund via Circle faucet first.
- **`.env` `VITE_*`** require a Vite restart.
- **Do not force-push / rewrite** published history if this branch is connected to Lovable (`AGENTS.md`).

---

## License

See [LICENSE](./LICENSE).
