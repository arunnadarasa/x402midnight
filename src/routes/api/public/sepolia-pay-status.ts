import { createFileRoute } from "@tanstack/react-router";
import paywallJson from "@/data/sepolia-paywall.json";
import { SEPOLIA_USDC } from "@/lib/sepolia-usdc";

export const Route = createFileRoute("/api/public/sepolia-pay-status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const chunkHash = url.searchParams.get("chunkHash") ?? "";
        const txHash = url.searchParams.get("txHash") ?? "";

        const { lookupSepoliaPayment } = await import("@/lib/sepolia-verify.server");
        if (chunkHash) {
          const hit = lookupSepoliaPayment(chunkHash);
          if (hit) {
            return Response.json({ ok: true, paid: true, proof: hit }, { headers: cors() });
          }
        }

        if (!txHash) {
          return Response.json(
            {
              ok: true,
              paid: false,
              usdc: SEPOLIA_USDC,
              paywall: (paywallJson as { paywall?: string }).paywall || "",
              merchant: (paywallJson as { merchant?: string }).merchant || "",
              note: "Pass txHash to verify onchain, or chunkHash after fulfill indexed it.",
            },
            { headers: cors() }
          );
        }

        try {
          const amount = url.searchParams.get("amount");
          const payTo =
            (url.searchParams.get("payTo") as `0x${string}` | null) ||
            ((paywallJson as { merchant?: string }).merchant as `0x${string}`) ||
            (process.env.VITE_SEPOLIA_PAY_TO as `0x${string}`);
          if (!payTo || !amount) {
            return Response.json(
              { ok: false, error: "payTo and amount required with txHash" },
              { status: 400, headers: cors() }
            );
          }
          const paywall =
            ((paywallJson as { paywall?: string }).paywall as `0x${string}`) ||
            (process.env.VITE_SEPOLIA_PAYWALL as `0x${string}` | undefined) ||
            "";

          const { verifySepoliaPayment, indexSepoliaPayment } = await import(
            "@/lib/sepolia-verify.server"
          );
          const proof = await verifySepoliaPayment({
            txHash,
            expectedAmount: BigInt(amount),
            expectedPayTo: payTo,
            expectedChunkHash: chunkHash || undefined,
            paywall,
          });
          if (chunkHash) indexSepoliaPayment(chunkHash, proof);
          return Response.json({ ok: true, paid: true, proof }, { headers: cors() });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json(
            { ok: false, paid: false, error: message },
            { status: 400, headers: cors() }
          );
        }
      },
    },
  },
});

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
