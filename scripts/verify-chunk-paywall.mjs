#!/usr/bin/env node
/**
 * Verify ChunkPaywall on Sepolia Etherscan.
 *
 * Requires in .env:
 *   ETHERSCAN_API_KEY=...
 *
 * Optional:
 *   VITE_SEPOLIA_PAYWALL (defaults to src/data/sepolia-paywall.json)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const EURC = "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4";
const CIRBTC = "0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3";
const DEFAULT_MERCHANT = "0x2B98D15f8DA97b9165C4209Ed3033607E23b3f05";

function loadDotEnv() {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadDotEnv();

function die(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey) {
  die(
    "Add ETHERSCAN_API_KEY to .env (from https://etherscan.io/myapikey), then re-run:\n" +
      "  bun scripts/verify-chunk-paywall.mjs"
  );
}

let address = process.env.VITE_SEPOLIA_PAYWALL || "";
let merchant = process.env.VITE_SEPOLIA_PAY_TO || DEFAULT_MERCHANT;
const metaPath = resolve(process.cwd(), "src/data/sepolia-paywall.json");
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  if (!address) address = meta.paywall || "";
  if (meta.merchant) merchant = meta.merchant;
}
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  die("Missing paywall address (VITE_SEPOLIA_PAYWALL / sepolia-paywall.json)");
}

const enc = spawnSync(
  "cast",
  [
    "abi-encode",
    "constructor(address,address[])",
    merchant,
    `[${USDC},${EURC},${CIRBTC}]`,
  ],
  { encoding: "utf8" }
);
if (enc.status !== 0) die(enc.stderr || "cast abi-encode failed");
const constructorArgs = enc.stdout.trim();

console.log("[verify] address", address);
console.log("[verify] merchant", merchant);
console.log("[verify] submitting to Etherscan (Sepolia)…");

// Etherscan deprecated per-chain V1 APIs; Foundry still defaults to them for
  // "sepolia" unless we point at the unified V2 endpoint + chainid.
  // skip-is-verified-check: forge's ABI preflight still hits a path that
  // misreports valid V2 keys as "Invalid API Key".
  const args = [
    "verify-contract",
    "--chain",
    "11155111",
    "--skip-is-verified-check",
    "--watch",
    "--verifier",
    "etherscan",
    "--verifier-url",
    "https://api.etherscan.io/v2/api?chainid=11155111",
    "--etherscan-api-key",
    apiKey,
  "--num-of-optimizations",
  "200",
  "--compiler-version",
  "0.8.24",
  "--constructor-args",
  constructorArgs,
  address,
  "contracts/evm/ChunkPaywall.sol:ChunkPaywall",
];

const res = spawnSync("forge", args, { encoding: "utf8", cwd: process.cwd() });
process.stdout.write(res.stdout || "");
process.stderr.write(res.stderr || "");
if (res.status !== 0) process.exit(res.status ?? 1);
console.log(`[done] https://sepolia.etherscan.io/address/${address}#code`);
