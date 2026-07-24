import { createFileRoute } from "@tanstack/react-router";
import {
  decodePaymentSignature,
  getHeaderCI,
  validatePayloadAgainstRequirement,
} from "@/lib/x402-facilitator";

export const Route = createFileRoute("/api/public/x402-verify")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: corsHeaders(),
        }),
      POST: async ({ request }) => {
        try {
          const sig =
            getHeaderCI(request.headers, "PAYMENT-SIGNATURE") ??
            getHeaderCI(request.headers, "payment-signature");
          if (!sig) {
            return Response.json(
              { isValid: false, invalidReason: "missing PAYMENT-SIGNATURE" },
              { status: 400, headers: corsHeaders() }
            );
          }

          let body: { amount?: string; payTo?: string; chunkHash?: string } = {};
          try {
            body = (await request.json()) as typeof body;
          } catch {
            body = {};
          }

          const payload = decodePaymentSignature(sig);
          const check = validatePayloadAgainstRequirement(payload, {
            // Network comes from accepted; only enforce amount/payTo/chunk when provided.
            amount: body.amount,
            payTo: body.payTo,
            chunkHash: body.chunkHash,
          });

          if (!check.ok) {
            return Response.json(
              { isValid: false, invalidReason: check.error },
              { status: 400, headers: corsHeaders() }
            );
          }

          return Response.json(
            {
              isValid: true,
              x402Version: 2,
              scheme: payload.accepted.scheme,
              network: payload.accepted.network,
              asset: payload.accepted.asset,
              amount: payload.accepted.amount,
              payer: payload.payload.from ?? null,
            },
            { headers: corsHeaders() }
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json(
            { isValid: false, invalidReason: message },
            { status: 400, headers: corsHeaders() }
          );
        }
      },
    },
  },
});

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "content-type, PAYMENT-SIGNATURE, payment-signature, PAYMENT-RESPONSE, payment-response",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "PAYMENT-RESPONSE, payment-response",
  };
}
