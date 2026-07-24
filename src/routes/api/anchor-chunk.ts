import { createFileRoute } from "@tanstack/react-router";
import contractJson from "@/data/midnight-contract.undeployed.json";

export const Route = createFileRoute("/api/anchor-chunk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            chunkHash?: string;
            priceMicroUsdc?: number | string;
            contractAddress?: string;
          };

          const networkId = (process.env.VITE_NETWORK_ID ?? "undeployed").toLowerCase();
          if (networkId !== "undeployed") {
            return Response.json(
              {
                ok: false,
                simulated: true,
                error:
                  "Server-append is Undeployed-only. On preview/preprod use LaceWalletProvider in the browser.",
              },
              { status: 400 }
            );
          }

          const address =
            body.contractAddress ??
            (contractJson as { address?: string }).address ??
            "";

          if (!body.chunkHash) {
            return Response.json({ ok: false, error: "chunkHash required" }, { status: 400 });
          }
          if (body.priceMicroUsdc === undefined) {
            return Response.json({ ok: false, error: "priceMicroUsdc required" }, { status: 400 });
          }

          // Dynamic import keeps Midnight Node deps out of the client graph.
          const { anchorChunkOnUndeployed } = await import("@/lib/anchor-chunk.server");
          const result = await anchorChunkOnUndeployed({
            contractAddress: address,
            chunkHash: body.chunkHash,
            priceMicroUsdc: body.priceMicroUsdc,
          });

          return Response.json(result, {
            headers: { "midnight-tx": result.txId },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[api/anchor-chunk]", message);
          return Response.json({ ok: false, simulated: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
