import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const chunkHash = "aabbccdd11223344556677889900aabbccdd11223344556677889900aabbcc";
const price = 1500;
const musdcJson = JSON.parse(readFileSync("src/data/midnight-usdc.undeployed.json", "utf8"));
const scip = JSON.parse(readFileSync("src/data/midnight-contract.undeployed.json", "utf8"));

const challengeRes = await fetch("http://127.0.0.1:8080/api/public/x402-challenge", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chunkHash, priceMicroUsdc: price }),
});
const challenge = await challengeRes.json();
console.log(
  "challenge status",
  challengeRes.status,
  "scheme",
  challenge.accepts?.[0]?.scheme,
  "asset",
  String(challenge.accepts?.[0]?.asset).slice(0, 16)
);

const nonce = randomBytes(32).toString("hex");
const payment = {
  x402Version: 2,
  resource: { url: "/api/public/x402-settle", description: "e2e" },
  accepted: challenge.accepts[0],
  payload: { nonce, from: musdcJson.buyerPk, chunkHash },
};
const sig = Buffer.from(JSON.stringify(payment), "utf8").toString("base64");

const verifyRes = await fetch("http://127.0.0.1:8080/api/public/x402-verify", {
  method: "POST",
  headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sig },
  body: JSON.stringify({
    amount: String(price),
    payTo: challenge.accepts[0].payTo,
    chunkHash,
  }),
});
const verify = await verifyRes.json();
console.log("verify", verifyRes.status, verify);

console.log("settle starting (may take minutes)...", new Date().toISOString());
const settleRes = await fetch("http://127.0.0.1:8080/api/public/x402-settle", {
  method: "POST",
  headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": sig },
  body: JSON.stringify({
    chunkHash,
    priceMicroUsdc: price,
    scipAddress: scip.address,
    musdcAddress: musdcJson.address,
  }),
});
const settle = await settleRes.json();
const paymentResponse =
  settleRes.headers.get("PAYMENT-RESPONSE") || settleRes.headers.get("payment-response");
console.log("settle", settleRes.status, JSON.stringify(settle, null, 2));
console.log("PAYMENT-RESPONSE present", !!paymentResponse);
if (!settleRes.ok || !settle.ok) process.exit(1);
