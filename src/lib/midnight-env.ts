// Client-only helpers. Never import these from server code.
export const MATRIX = {
  snapshot: "2026-07-23",
  node: "midnight-node:0.22.5",
  indexer: "indexer-standalone:4.0.2",
  proof: "proof-server:8.0.3",
  midnightJs: "4.1.1",
  walletSdk: "1.2.0",
  connector: "4.0.1",
  compact: "0.31.1 (pragma 0.23)",
  runtime: "0.16.0",
  onchainRuntime: "3.0.0",
} as const;

export const ENDPOINTS = {
  node: "ws://localhost:9944",
  indexer: "http://localhost:8088/api/v4/graphql",
  proof: "http://localhost:6300",
} as const;

export const LACE_INSTALL_URL =
  "https://docs.midnight.network/blog/connect-dapp-lace-wallet";

/** Wallet InitialAPI (v4 connect) plus legacy Lace enable() surface. */
export type MidnightWalletInitial = {
  rdns?: string;
  name?: string;
  icon?: string;
  apiVersion?: string;
  connect?: (networkId: string) => Promise<MidnightConnectedApi>;
  // Legacy Lace injection (pre-UUID / enable-based)
  enable?: () => Promise<MidnightConnectedApi>;
  isEnabled?: () => Promise<boolean>;
  serviceUriConfig?: () => Promise<{
    nodeUrl?: string;
    indexerUri?: string;
    proverServerUri?: string;
  }>;
};

export type MidnightConnectedApi = {
  getDustBalance?: () => Promise<{ balance: bigint; cap?: bigint }>;
  getShieldedAddresses?: () => Promise<{
    shieldedAddress?: string;
    shieldedCoinPublicKey?: string;
    shieldedEncryptionPublicKey?: string;
  }>;
  getUnshieldedAddress?: () => Promise<string | { unshieldedAddress?: string }>;
  getConfiguration?: () => Promise<{ networkId?: string; substrateNodeUri?: string }>;
  // Legacy helpers some Lace builds still expose
  state?: () => Promise<{ address?: string; coinPublicKey?: string }>;
  balanceAndProveTransaction?: (...args: unknown[]) => Promise<unknown>;
  submitTransaction?: (...args: unknown[]) => Promise<unknown>;
};

export type DiscoveredWallet = {
  id: string;
  wallet: MidnightWalletInitial;
};

export type MidnightWindow = {
  midnight?: Record<string, MidnightWalletInitial | undefined>;
};

function looksLikeWallet(v: unknown): v is MidnightWalletInitial {
  if (!v || typeof v !== "object") return false;
  const w = v as MidnightWalletInitial;
  return typeof w.connect === "function" || typeof w.enable === "function";
}

/** Enumerate injected Midnight wallets (UUID keys and legacy mnLace). */
export function listMidnightWallets(): DiscoveredWallet[] {
  if (typeof window === "undefined") return [];
  const injected = (window as unknown as MidnightWindow).midnight;
  if (!injected) return [];
  return Object.entries(injected)
    .filter(([, v]) => looksLikeWallet(v))
    .map(([id, wallet]) => ({ id, wallet: wallet as MidnightWalletInitial }));
}

export function selectMidnightWallet(): DiscoveredWallet | null {
  const wallets = listMidnightWallets();
  if (wallets.length === 0) return null;
  // Prefer Lace by name/rdns/legacy key, else first injected wallet.
  return (
    wallets.find(w => w.id === "mnLace") ??
    wallets.find(w => /lace/i.test(w.wallet.name ?? "") || /lace/i.test(w.wallet.rdns ?? "")) ??
    wallets[0]
  );
}

/** Poll up to `timeoutMs` for a late-injected wallet (extensions often inject after first paint). */
export async function waitForMidnightWallet(
  timeoutMs = 5000,
  intervalMs = 250
): Promise<DiscoveredWallet | null> {
  const started = Date.now();
  let found = selectMidnightWallet();
  while (!found && Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    found = selectMidnightWallet();
  }
  return found;
}

export async function detectLace(): Promise<{
  present: boolean;
  id?: string;
  apiVersion?: string;
  name?: string;
}> {
  if (typeof window === "undefined") return { present: false };
  const found = selectMidnightWallet();
  if (!found) return { present: false };
  return {
    present: true,
    id: found.id,
    apiVersion: found.wallet.apiVersion,
    name: found.wallet.name,
  };
}

export async function connectMidnightWallet(
  networkId = "undeployed"
): Promise<{
  api: MidnightConnectedApi;
  walletId: string;
  walletName?: string;
  address?: string;
  dust?: bigint;
  networkId?: string;
}> {
  const found = (await waitForMidnightWallet()) ?? selectMidnightWallet();
  if (!found) {
    throw new Error(
      "No Midnight wallet found. Install Lace for Midnight, then refresh this page."
    );
  }

  const { id, wallet } = found;
  let api: MidnightConnectedApi;

  if (typeof wallet.connect === "function") {
    api = await wallet.connect(networkId);
  } else if (typeof wallet.enable === "function") {
    api = await wallet.enable();
  } else {
    throw new Error(`Wallet "${wallet.name ?? id}" exposes neither connect() nor enable().`);
  }

  const address = await readWalletAddress(api);
  const dust = await api.getDustBalance?.().then(d => d.balance).catch(() => undefined);
  const cfg = await api.getConfiguration?.().catch(() => undefined);

  return {
    api,
    walletId: id,
    walletName: wallet.name,
    address,
    dust,
    networkId: cfg?.networkId,
  };
}

async function readWalletAddress(api: MidnightConnectedApi): Promise<string | undefined> {
  try {
    if (api.getShieldedAddresses) {
      const s = await api.getShieldedAddresses();
      if (s.shieldedAddress) return s.shieldedAddress;
    }
  } catch { /* fall through */ }

  try {
    if (api.getUnshieldedAddress) {
      const raw = await api.getUnshieldedAddress();
      if (typeof raw === "string") return raw;
      if (raw?.unshieldedAddress) return raw.unshieldedAddress;
    }
  } catch { /* fall through */ }

  try {
    const s = await api.state?.();
    return s?.address;
  } catch {
    return undefined;
  }
}

export async function pingProofServer(url = ENDPOINTS.proof, timeoutMs = 1200) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${url}/version`, { signal: ctl.signal }).catch(() => null);
    clearTimeout(t);
    if (!res || !res.ok) return { ok: false as const };
    const text = await res.text();
    return { ok: true as const, version: text.trim().slice(0, 32) };
  } catch { return { ok: false as const }; }
}

export async function pingIndexer(url = ENDPOINTS.indexer, timeoutMs = 1500) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
      signal: ctl.signal,
    }).catch(() => null);
    clearTimeout(t);
    return { ok: !!res && res.ok };
  } catch { return { ok: false }; }
}

export async function pingNode(url = ENDPOINTS.node, timeoutMs = 1500) {
  return new Promise<{ ok: boolean }>((resolve) => {
    if (typeof window === "undefined") return resolve({ ok: false });
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; try { ws.close(); } catch { /* noop */ } resolve({ ok }); } };
    let ws: WebSocket;
    try { ws = new WebSocket(url); } catch { return resolve({ ok: false }); }
    ws.onopen = () => finish(true);
    ws.onerror = () => finish(false);
    setTimeout(() => finish(false), timeoutMs);
  });
}
