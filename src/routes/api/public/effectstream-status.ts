import { createFileRoute } from "@tanstack/react-router";
import paywallJson from "@/data/sepolia-paywall.json";
import { SEPOLIA_ASSET_LIST, SEPOLIA_CAIP2 } from "@/lib/sepolia-tokens";

/**
 * EffectStream-shaped status for the Sepolia multi-asset overlay.
 */
export const Route = createFileRoute("/api/public/effectstream-status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const chunkHash = url.searchParams.get("chunkHash") ?? "";
        const { lookupSepoliaPayment } = await import("@/lib/sepolia-verify.server");
        const proof = chunkHash ? lookupSepoliaPayment(chunkHash) : null;

        return Response.json(
          {
            ok: true,
            engine: "effectstream-demo-stub",
            docs: "https://effectstream.github.io/docs/",
            repo: "https://github.com/effectstream/effectstream",
            template: "templates/evm-midnight-v2",
            sync: {
              chain: SEPOLIA_CAIP2,
              primitives: ["ERC-20 Transfer", "ChunkPaid"],
              assets: SEPOLIA_ASSET_LIST.map(a => ({
                symbol: a.symbol,
                address: a.address,
                decimals: a.decimals,
              })),
              paywall: (paywallJson as { paywall?: string }).paywall || null,
              merchant: (paywallJson as { merchant?: string }).merchant || null,
            },
            paid: !!proof,
            proof,
            note: "Stub indexes payments from sepolia-fulfill. Point a real EffectStream sync at ChunkPaid for production-shaped overlays.",
          },
          { headers: cors() }
        );
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            chunkHash?: string;
            txHash?: string;
            payer?: string;
            amount?: string;
            to?: string;
            token?: string;
          };
          if (!body.chunkHash || !body.txHash || !body.payer || !body.amount || !body.to) {
            return Response.json(
              { ok: false, error: "chunkHash, txHash, payer, amount, to required" },
              { status: 400, headers: cors() }
            );
          }
          const { indexSepoliaPayment } = await import("@/lib/sepolia-verify.server");
          const proof = {
            ok: true as const,
            txHash: (body.txHash.startsWith("0x")
              ? body.txHash
              : `0x${body.txHash}`) as `0x${string}`,
            payer: body.payer as `0x${string}`,
            to: body.to as `0x${string}`,
            token: (body.token || SEPOLIA_ASSET_LIST[0].address) as `0x${string}`,
            amount: body.amount,
            chunkHash: body.chunkHash,
            via: "Transfer" as const,
            blockNumber: "0",
          };
          indexSepoliaPayment(body.chunkHash, proof);
          return Response.json({ ok: true, indexed: true, proof }, { headers: cors() });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: message }, { status: 500, headers: cors() });
        }
      },
    },
  },
});

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
