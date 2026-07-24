import { createFileRoute } from "@tanstack/react-router";
import scipJson from "@/data/midnight-contract.undeployed.json";
import musdcJson from "@/data/midnight-usdc.undeployed.json";
import paywallJson from "@/data/sepolia-paywall.json";
import { buildChallengeBody } from "@/lib/x402-facilitator";

export const Route = createFileRoute("/api/public/x402-challenge")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: corsHeaders(),
        }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            chunkHash?: string;
            priceMicroUsdc?: number | string;
            resource?: string;
          };

          if (!body.chunkHash) {
            return Response.json(
              { ok: false, error: "chunkHash required" },
              { status: 400, headers: corsHeaders() }
            );
          }
          if (body.priceMicroUsdc === undefined) {
            return Response.json(
              { ok: false, error: "priceMicroUsdc required" },
              { status: 400, headers: corsHeaders() }
            );
          }

          const musdcAddress = (musdcJson as { address?: string }).address ?? "";
          const midnightPayTo = (musdcJson as { merchantPk?: string }).merchantPk ?? "";
          const asset = musdcAddress || (musdcJson as { asset?: string }).asset || "mUSDC";

          const sepoliaPayTo =
            process.env.VITE_SEPOLIA_PAY_TO ||
            (paywallJson as { merchant?: string }).merchant ||
            "";

          const challenge = buildChallengeBody({
            resource: body.resource ?? "/api/public/x402-settle",
            amount: String(body.priceMicroUsdc),
            payTo: midnightPayTo || "0".repeat(64),
            asset,
            chunkHash: body.chunkHash,
            description: `Choreography chunk ${(scipJson as { address?: string }).address ?? ""}`,
            sepoliaPayTo,
            includeSepoliaAssets: true,
            priceMicroUsdc: body.priceMicroUsdc,
          });

          const warnings: string[] = [];
          if (!musdcAddress) warnings.push("MidnightUSDC not deployed — midnight settle may simulate");
          if (!sepoliaPayTo) warnings.push("VITE_SEPOLIA_PAY_TO unset — Sepolia accepts omitted");

          return Response.json(
            {
              ...challenge,
              ...(warnings.length ? { warning: warnings.join("; ") } : {}),
              paymentOptions: {
                midnight: "midnight-mUSDC",
                sepolia: ["USDC", "EURC", "cirBTC"],
              },
            },
            { status: 402, headers: corsHeaders() }
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json(
            { ok: false, error: message },
            { status: 500, headers: corsHeaders() }
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
