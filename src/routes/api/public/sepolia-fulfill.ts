import { createFileRoute } from "@tanstack/react-router";
import scipJson from "@/data/midnight-contract.undeployed.json";
import paywallJson from "@/data/sepolia-paywall.json";
import { SEPOLIA_USDC, assetByAddress, priceMicroUsdToTokenAtomic } from "@/lib/sepolia-tokens";

/**
 * After Sepolia USDC/EURC/cirBTC payment confirms, fulfill by anchoring on Midnight.
 */
export const Route = createFileRoute("/api/public/sepolia-fulfill")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            txHash?: string;
            chunkHash?: string;
            priceMicroUsdc?: number | string;
            payTo?: string;
            token?: string;
            amountAtomic?: string | number;
            scipAddress?: string;
          };

          if (!body.txHash || !body.chunkHash || body.priceMicroUsdc === undefined) {
            return Response.json(
              { ok: false, error: "txHash, chunkHash, priceMicroUsdc required" },
              { status: 400, headers: cors() }
            );
          }

          const payTo = (body.payTo ||
            (paywallJson as { merchant?: string }).merchant ||
            process.env.VITE_SEPOLIA_PAY_TO ||
            "") as `0x${string}`;
          if (!payTo || payTo === "0x0000000000000000000000000000000000000000") {
            return Response.json(
              {
                ok: false,
                error: "Set VITE_SEPOLIA_PAY_TO (merchant) before Sepolia fulfill",
              },
              { status: 400, headers: cors() }
            );
          }

          const token = (body.token || SEPOLIA_USDC) as `0x${string}`;
          const meta = assetByAddress(token);
          if (!meta) {
            return Response.json(
              { ok: false, error: "token must be Sepolia USDC, EURC, or cirBTC" },
              { status: 400, headers: cors() }
            );
          }

          const expectedAmount =
            body.amountAtomic !== undefined
              ? BigInt(body.amountAtomic)
              : priceMicroUsdToTokenAtomic(body.priceMicroUsdc, meta);

          const paywall =
            ((paywallJson as { paywall?: string }).paywall as `0x${string}`) ||
            (process.env.VITE_SEPOLIA_PAYWALL as `0x${string}` | undefined) ||
            "";

          const { verifySepoliaPayment, indexSepoliaPayment, lookupSepoliaPayment } =
            await import("@/lib/sepolia-verify.server");

          const cached = lookupSepoliaPayment(body.chunkHash);
          const proof =
            cached ??
            (await verifySepoliaPayment({
              txHash: body.txHash,
              expectedAmount,
              expectedPayTo: payTo,
              expectedToken: token,
              expectedChunkHash: body.chunkHash,
              paywall,
            }));
          indexSepoliaPayment(body.chunkHash, proof);

          const scipAddress =
            body.scipAddress || (scipJson as { address?: string }).address || "";
          const networkId = (process.env.VITE_NETWORK_ID ?? "undeployed").toLowerCase();

          if (!scipAddress || networkId !== "undeployed") {
            return Response.json(
              {
                ok: true,
                paid: true,
                simulated: true,
                proof,
                midnightTxHash: "0xSIMULATED",
                note: "SCIP undeployed anchor skipped — missing address or non-undeployed network",
              },
              { headers: cors() }
            );
          }

          const { anchorChunkOnUndeployed } = await import("@/lib/anchor-chunk.server");
          const anchor = await anchorChunkOnUndeployed({
            contractAddress: scipAddress,
            chunkHash: body.chunkHash,
            priceMicroUsdc: body.priceMicroUsdc,
          });

          return Response.json(
            {
              ok: true,
              paid: true,
              simulated: false,
              proof,
              asset: meta.symbol,
              midnightTxHash: anchor.txId,
              scipAddress,
              overlay: `sepolia-${meta.symbol} → effectstream-index → midnight-anchor`,
            },
            { headers: { ...cors(), "midnight-tx": anchor.txId } }
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[api/public/sepolia-fulfill]", message);
          return Response.json(
            { ok: false, error: message },
            { status: 500, headers: cors() }
          );
        }
      },
    },
  },
});

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Expose-Headers": "midnight-tx",
  };
}
