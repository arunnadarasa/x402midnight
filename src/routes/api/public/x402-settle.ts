import { createFileRoute } from "@tanstack/react-router";
import scipJson from "@/data/midnight-contract.undeployed.json";
import musdcJson from "@/data/midnight-usdc.undeployed.json";
import {
  decodePaymentSignature,
  getHeaderCI,
  getSettledNonce,
  setSettledNonce,
  validatePayloadAgainstRequirement,
  X402_NETWORK,
} from "@/lib/x402-facilitator";

export const Route = createFileRoute("/api/public/x402-settle")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: corsHeaders(),
        }),
      POST: async ({ request }) => {
        try {
          const networkId = (process.env.VITE_NETWORK_ID ?? "undeployed").toLowerCase();
          const sig =
            getHeaderCI(request.headers, "PAYMENT-SIGNATURE") ??
            getHeaderCI(request.headers, "payment-signature");
          if (!sig) {
            return Response.json(
              { ok: false, error: "missing PAYMENT-SIGNATURE" },
              { status: 400, headers: corsHeaders() }
            );
          }

          const body = (await request.json().catch(() => ({}))) as {
            chunkHash?: string;
            priceMicroUsdc?: number | string;
            scipAddress?: string;
            musdcAddress?: string;
          };

          const payload = decodePaymentSignature(sig);
          const check = validatePayloadAgainstRequirement(payload, {
            network: X402_NETWORK,
            amount: body.priceMicroUsdc !== undefined ? String(body.priceMicroUsdc) : undefined,
            chunkHash: body.chunkHash,
          });
          if (!check.ok) {
            return Response.json(
              { ok: false, error: check.error },
              { status: 400, headers: corsHeaders() }
            );
          }

          const nonce = payload.payload.nonce.replace(/^0x/i, "");
          const cached = getSettledNonce(nonce);
          if (cached) {
            return Response.json(cached, {
              headers: {
                ...corsHeaders(),
                "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(cached), "utf8").toString("base64"),
              },
            });
          }

          const musdcAddress =
            body.musdcAddress ||
            (musdcJson as { address?: string }).address ||
            "";
          const scipAddress =
            body.scipAddress ||
            (scipJson as { address?: string }).address ||
            "";
          const chunkHash =
            body.chunkHash ||
            payload.payload.chunkHash ||
            (typeof payload.accepted.extra?.chunkHash === "string"
              ? payload.accepted.extra.chunkHash
              : "");
          const amount = payload.accepted.amount;
          const payTo = payload.accepted.payTo;

          // Facilitator fallback when contract missing
          if (!musdcAddress || networkId !== "undeployed") {
            const simulated = {
              ok: true,
              simulated: true as const,
              midnightTxHash: "0xSIMULATED",
              anchorTxHash: "0xSIMULATED",
              success: true,
              network: X402_NETWORK,
              amount,
              nonce,
            };
            setSettledNonce(nonce, simulated);
            return Response.json(simulated, {
              headers: {
                ...corsHeaders(),
                "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(simulated), "utf8").toString(
                  "base64"
                ),
              },
            });
          }

          const { transferMusdcOnUndeployed } = await import("@/lib/musdc-settle.server");
          const transfer = await transferMusdcOnUndeployed({
            musdcAddress,
            payTo,
            amountMicroUsdc: amount,
            nonce,
          });

          let anchorTxHash: string | undefined;
          if (scipAddress && chunkHash) {
            const { anchorChunkOnUndeployed } = await import("@/lib/anchor-chunk.server");
            const anchor = await anchorChunkOnUndeployed({
              contractAddress: scipAddress,
              chunkHash,
              priceMicroUsdc: amount,
            });
            anchorTxHash = anchor.txId;
          }

          const result = {
            ok: true,
            simulated: false as const,
            success: true,
            midnightTxHash: transfer.txId,
            faucetTxId: transfer.faucetTxId,
            anchorTxHash,
            network: X402_NETWORK,
            amount,
            nonce,
            musdcAddress,
            scipAddress,
          };

          setSettledNonce(nonce, result);
          return Response.json(result, {
            headers: {
              ...corsHeaders(),
              "PAYMENT-RESPONSE": Buffer.from(JSON.stringify(result), "utf8").toString("base64"),
              "midnight-tx": transfer.txId,
            },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[api/public/x402-settle]", message);
          return Response.json(
            { ok: false, simulated: false, error: message },
            { status: 500, headers: corsHeaders() }
          );
        }
      },
    },
  },
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "content-type, PAYMENT-SIGNATURE, payment-signature, PAYMENT-RESPONSE, payment-response",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "PAYMENT-RESPONSE, payment-response, midnight-tx",
  };
}
