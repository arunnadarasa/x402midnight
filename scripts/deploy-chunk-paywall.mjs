#!/usr/bin/env node
/**
 * Deploy multi-asset ChunkPaywall to Sepolia (Foundry forge).
 *
 * Loads .env if present. Env: SEPOLIA_RPC, PK, VITE_SEPOLIA_PAY_TO
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const EURC = "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4";
const CIRBTC = "0x3a3fe695F684Bf9b9e43CF43C2b895Ea5e392bB3";

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

const rpc = process.env.SEPOLIA_RPC || process.env.VITE_SEPOLIA_RPC;
const pk = process.env.PK || process.env.SEPOLIA_PRIVATE_KEY;
const merchant = process.env.VITE_SEPOLIA_PAY_TO || process.env.MERCHANT;

function die(msg) {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

if (!rpc) die("Set SEPOLIA_RPC");
if (!pk) die("Set PK (deployer private key)");
if (!merchant || !/^0x[0-9a-fA-F]{40}$/.test(merchant)) {
  die("Set VITE_SEPOLIA_PAY_TO to a valid 0x merchant address");
}

console.log("[deploy] ChunkPaywall merchant=", merchant);
console.log("[deploy] tokens USDC EURC cirBTC");

const forge = spawnSync(
  "forge",
  [
    "create",
    "contracts/evm/ChunkPaywall.sol:ChunkPaywall",
    "--broadcast",
    "--rpc-url",
    rpc,
    "--private-key",
    pk,
    "--constructor-args",
    merchant,
    `[${USDC},${EURC},${CIRBTC}]`,
  ],
  { encoding: "utf8", cwd: process.cwd() }
);

if (forge.status !== 0) {
  console.error(forge.stderr || forge.stdout);
  die("forge create failed");
}

const outText = `${forge.stdout}\n${forge.stderr}`;
const addressMatch = outText.match(/Deployed to:\s*(0x[0-9a-fA-F]{40})/);
const txMatch = outText.match(/Transaction hash:\s*(0x[0-9a-fA-F]{64})/);
const address = addressMatch?.[1];
const txHash = txMatch?.[1] || null;
if (!address) {
  console.log(outText);
  die("No deployed address in forge output");
}

const out = resolve(process.cwd(), "src/data/sepolia-paywall.json");
const record = {
  network: "sepolia",
  chainId: 11155111,
  usdc: USDC,
  eurc: EURC,
  cirbtc: CIRBTC,
  usdcDecimals: 6,
  eurcDecimals: 6,
  cirbtcDecimals: 8,
  paywall: address,
  merchant,
  deployTxHash: txHash,
  deployedAt: new Date().toISOString(),
  notes: "Multi-asset paywall. Set VITE_SEPOLIA_PAYWALL + VITE_SEPOLIA_PAY_TO, restart vite.",
};
writeFileSync(out, JSON.stringify(record, null, 2));

// Append VITE_SEPOLIA_PAYWALL to .env if missing
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  let envText = readFileSync(envPath, "utf8");
  if (!/VITE_SEPOLIA_PAYWALL=/.test(envText)) {
    envText += `\nexport VITE_SEPOLIA_PAYWALL=${address}\n`;
    writeFileSync(envPath, envText);
    console.log("[env] appended VITE_SEPOLIA_PAYWALL to .env");
  } else {
    envText = envText.replace(
      /export\s+VITE_SEPOLIA_PAYWALL=.*/g,
      `export VITE_SEPOLIA_PAYWALL=${address}`
    );
    if (!envText.includes(`VITE_SEPOLIA_PAYWALL=${address}`)) {
      envText = envText.replace(
        /VITE_SEPOLIA_PAYWALL=.*/g,
        `VITE_SEPOLIA_PAYWALL=${address}`
      );
    }
    writeFileSync(envPath, envText);
    console.log("[env] updated VITE_SEPOLIA_PAYWALL in .env");
  }
}

console.log("[done]", out);
console.log(`VITE_SEPOLIA_PAYWALL=${address}`);
console.log(`VITE_SEPOLIA_PAY_TO=${merchant}`);
