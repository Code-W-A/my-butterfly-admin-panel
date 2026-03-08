import { Timestamp } from "firebase/firestore";

import type { RecommendationPackage, WithId } from "@/lib/firestore/types";

const DB_NAME = "mybutterfly-admin-cache";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const CACHE_KEY = "packages:v1";

type StoredPackage = Omit<WithId<RecommendationPackage>, "createdAt" | "updatedAt"> & {
  createdAtMs?: number;
  updatedAtMs?: number;
};

type StoredPackagesCache = {
  versionUpdatedAtMs: number | null;
  cachedAtMs: number;
  items: StoredPackage[];
};

export type PackagesCachePayload = {
  versionUpdatedAtMs: number | null;
  cachedAtMs: number;
  items: WithId<RecommendationPackage>[];
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("IndexedDB open timeout."));
    }, 3000);
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onblocked = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("IndexedDB open blocked by another tab/session."));
    };
    request.onsuccess = () => {
      window.clearTimeout(timeoutId);
      resolve(request.result);
    };
    request.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
  });
  return dbPromise.catch((err) => {
    // Reset cached promise so future attempts can recover.
    dbPromise = null;
    throw err;
  });
}

function runRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
  });
}

const toMillis = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null && "toMillis" in value) {
    const maybeToMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof maybeToMillis === "function") {
      const millis = maybeToMillis.call(value);
      if (typeof millis === "number" && Number.isFinite(millis)) return millis;
    }
  }
  return undefined;
};

const serializeItem = (item: WithId<RecommendationPackage>): StoredPackage => {
  const { createdAt, updatedAt, ...rest } = item;
  return {
    ...rest,
    createdAtMs: toMillis(createdAt),
    updatedAtMs: toMillis(updatedAt),
  };
};

const deserializeItem = (item: StoredPackage): WithId<RecommendationPackage> => {
  const { createdAtMs, updatedAtMs, ...rest } = item;
  const createdAt = Timestamp.fromMillis(createdAtMs ?? 0);
  const updatedAt = Timestamp.fromMillis(updatedAtMs ?? 0);
  return {
    ...rest,
    createdAt,
    updatedAt,
  } as WithId<RecommendationPackage>;
};

export async function readPackagesCache(): Promise<PackagesCachePayload | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const raw = await runRequest<StoredPackagesCache | undefined>(store.get(CACHE_KEY));
    if (!raw || !Array.isArray(raw.items)) return null;
    return {
      versionUpdatedAtMs: raw.versionUpdatedAtMs ?? null,
      cachedAtMs: Number(raw.cachedAtMs ?? 0),
      items: raw.items.map(deserializeItem),
    };
  } catch {
    return null;
  }
}

export async function writePackagesCache(payload: {
  versionUpdatedAtMs: number | null;
  items: WithId<RecommendationPackage>[];
}) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const txDone = awaitTransaction(tx);
    const store = tx.objectStore(STORE_NAME);
    const value: StoredPackagesCache = {
      versionUpdatedAtMs: payload.versionUpdatedAtMs ?? null,
      cachedAtMs: Date.now(),
      items: payload.items.map(serializeItem),
    };
    await runRequest(store.put(value, CACHE_KEY));
    await txDone;
  } catch {
    // Best-effort cache write.
  }
}

export async function clearPackagesCache() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const txDone = awaitTransaction(tx);
    const store = tx.objectStore(STORE_NAME);
    await runRequest(store.delete(CACHE_KEY));
    await txDone;
  } catch {
    // Best-effort cache clear.
  }
}
