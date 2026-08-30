import type { BrowserWallet, Wallet } from "@meshsdk/core";
import { NETWORK_ID } from "$lib/config-eager";

let browserWallet: BrowserWallet | undefined = $state();
let wallet: Wallet | undefined = $state();
let walletName: string | undefined = $state();
let connecting: boolean = $state(false);
let reconnecting: boolean = $state(false);
let lovelaceBalance: string | undefined = $state();
let connectError: string | undefined = $state();
let networkMismatch: boolean = $state(false);

export const BrowserWalletState = {
  get wallet() {
    return wallet;
  },
  get walletName() {
    return walletName;
  },
  get connecting() {
    return connecting;
  },
  get reconnecting() {
    return reconnecting;
  },
  get lovelaceBalance() {
    return lovelaceBalance;
  },
  get browserWallet() {
    return browserWallet;
  },
  get connectError() {
    return connectError;
  },
  get networkMismatch() {
    return networkMismatch;
  },
};

const STORAGE_KEY = "fundada.wallet.id";
const WALLET_SHUTDOWN_RE = /object can no longer be used|was shutdown/i;
const MAX_ATTEMPTS = 3;

function isWalletShutdown(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return WALLET_SHUTDOWN_RE.test(msg);
}

async function enableWallet(id: string): Promise<BrowserWallet> {
  const { BrowserWallet } = await import("@meshsdk/core");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const fresh = await BrowserWallet.enable(id);
      browserWallet = fresh;
      try {
        const walletNetworkId = await fresh.getNetworkId();
        networkMismatch = walletNetworkId !== NETWORK_ID;
      } catch {
        networkMismatch = false;
      }
      try {
        lovelaceBalance = await fresh.getLovelace();
      } catch {
        // cosmetic — ignore
      }
      return fresh;
    } catch (e) {
      if (!isWalletShutdown(e)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("Wallet connection lost. Please reconnect your wallet.");
}

export async function connectWallet(w: Wallet) {
  connecting = true;
  connectError = undefined;
  try {
    await enableWallet(w.id);
    wallet = w;
    walletName = w.name
      .split(" ")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    try {
      localStorage.setItem(STORAGE_KEY, w.id);
    } catch {
      // localStorage might be unavailable — ignore
    }
  } catch (e) {
    connectError = e instanceof Error ? e.message : String(e);
  } finally {
    connecting = false;
  }
}

export function disconnectWallet() {
  wallet = undefined;
  browserWallet = undefined;
  walletName = undefined;
  lovelaceBalance = undefined;
  connectError = undefined;
  networkMismatch = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function reconnectWallet(): Promise<void> {
  let storedId: string | null = null;
  try {
    storedId = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!storedId) return;

  reconnecting = true;
  try {
    const { BrowserWallet } = await import("@meshsdk/core");
    const available = await BrowserWallet.getAvailableWallets();
    const w = available.find((wallet: Wallet) => wallet.id === storedId);
    if (!w) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    await enableWallet(w.id);
    wallet = w;
    walletName = w.name
      .split(" ")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  } finally {
    reconnecting = false;
  }
}

export async function withWallet<T>(fn: (w: BrowserWallet) => Promise<T>): Promise<T> {
  let current = browserWallet;
  if (!current) throw new Error("Connect a wallet first.");
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn(current);
    } catch (e) {
      if (!isWalletShutdown(e)) throw e;
      if (!wallet) throw new Error("Connect a wallet first.");
      current = await enableWallet(wallet.id);
    }
  }
  throw new Error("Wallet connection lost. Please reconnect your wallet.");
}