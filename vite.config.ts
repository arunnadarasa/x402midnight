// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/** Swap Midnight Node server modules for stubs during production SSR/build only. */
function midnightSsrStub(): Plugin {
  const stub = path.resolve("src/lib/anchor-chunk.ssr-stub.ts");
  const serverModules = new Set([
    path.resolve("src/lib/anchor-chunk.server.ts"),
    path.resolve("src/lib/midnight-providers.server.ts"),
    path.resolve("src/lib/musdc-providers.server.ts"),
    path.resolve("src/lib/musdc-settle.server.ts"),
    path.resolve("src/lib/sepolia-verify.server.ts"),
  ]);
  return {
    name: "midnight-ssr-stub",
    apply: "build",
    enforce: "pre",
    async resolveId(id, importer, options) {
      if (!options?.ssr) return;
      if (id.startsWith("@midnight-ntwrk/")) {
        return path.resolve("src/lib/midnight-ssr-stub.ts");
      }
      const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
      if (!resolved) return;
      if (serverModules.has(resolved.id)) return stub;
      return resolved;
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [midnightSsrStub()],
    optimizeDeps: {
      exclude: [
        "@midnight-ntwrk/testkit-js",
        "@midnight-ntwrk/wallet-sdk",
        "@midnight-ntwrk/midnight-js-contracts",
        "@midnight-ntwrk/midnight-js-level-private-state-provider",
        "@midnight-ntwrk/midnight-js-node-zk-config-provider",
        "@midnight-ntwrk/onchain-runtime-v3",
        "pino",
        "ws",
        "ssh2",
        "cpu-features",
      ],
    },
  },
});
