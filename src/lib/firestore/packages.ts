import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";
import { getProductsByIds } from "@/lib/firestore/products";
import type {
  PackageItemRole,
  PackageMode,
  ProductRecommendationScenario,
  RecommendationPackage,
  RecommendationPackageItem,
  WithId,
} from "@/lib/firestore/types";

const PACKAGES_COLLECTION = "recommendation_packages";
const CURRENCY_VALUES = ["EUR", "RON"] as const;
const MAX_CUSTOM_ITEMS = 10;

const ROLE_ORDER: Record<PackageItemRole, number> = {
  single: 0,
  blade: 1,
  rubber_fh: 2,
  rubber_bh: 3,
};

const TRIPLE_ROLES: PackageItemRole[] = ["blade", "rubber_fh", "rubber_bh"];

type PackagePayloadInput = Omit<RecommendationPackage, "createdAt" | "updatedAt" | "totalPrice" | "currency">;

const sortItems = (items: RecommendationPackageItem[]) =>
  items.slice().sort((a, b) => {
    const rankA = a.role ? ROLE_ORDER[a.role] : Number.MAX_SAFE_INTEGER;
    const rankB = b.role ? ROLE_ORDER[b.role] : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });

function assertValidMode(mode: string): asserts mode is PackageMode {
  if (mode !== "single" && mode !== "triple" && mode !== "custom") {
    throw new Error("Modul pachetului este invalid.");
  }
}

const assertValidItemsForMode = (mode: PackageMode, items: RecommendationPackageItem[]) => {
  if (mode === "single") {
    if (items.length !== 1 || items[0]?.role !== "single") {
      throw new Error("Pachetul single trebuie să conțină exact un item cu rolul `single`.");
    }
    return;
  }

  if (mode === "triple") {
    if (items.length !== 3) {
      throw new Error("Pachetul triple trebuie să conțină exact 3 item-uri.");
    }
    if (items.some((item) => !item.role)) {
      throw new Error("Pachetul triple trebuie să aibă roluri complete pe toate item-urile.");
    }
    const roleSet = new Set(items.map((item) => item.role as PackageItemRole));
    const expectedSet = new Set(TRIPLE_ROLES);
    if (roleSet.size !== expectedSet.size || [...expectedSet].some((role) => !roleSet.has(role))) {
      throw new Error("Pachetul triple trebuie să conțină rolurile `blade`, `rubber_fh`, `rubber_bh`.");
    }
    return;
  }

  if (items.length < 1) {
    throw new Error("Pachetul custom trebuie să conțină cel puțin un produs.");
  }
  if (items.length > MAX_CUSTOM_ITEMS) {
    throw new Error(`Pachetul custom poate conține maxim ${MAX_CUSTOM_ITEMS} produse.`);
  }
};

const normalizeRole = (value: unknown): PackageItemRole | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Rolul item-ului este invalid.");
  const role = value.trim();
  if (!role) return undefined;
  if (role === "single" || role === "blade" || role === "rubber_fh" || role === "rubber_bh") {
    return role;
  }
  throw new Error("Rolul item-ului este invalid.");
};

const normalizeItems = (items: RecommendationPackageItem[]): RecommendationPackageItem[] =>
  items.map((item) => {
    const role = normalizeRole(item.role);
    const productId = String(item.productId ?? "").trim();
    return role ? { role, productId } : { productId };
  });

async function resolvePackageTotals(items: RecommendationPackageItem[]) {
  const uniqueIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Pachetul nu conține produse valide.");
  }

  const products = await getProductsByIds(uniqueIds);
  const productsById = new Map(products.map((product) => [product.id, product]));

  for (const item of items) {
    if (!productsById.has(item.productId)) {
      throw new Error(`Produsul ${item.productId} nu există.`);
    }
  }

  const currencies = new Set(
    items
      .map((item) => productsById.get(item.productId)?.currency)
      .filter((value): value is "EUR" | "RON" => Boolean(value)),
  );
  if (currencies.size !== 1) {
    throw new Error("Toate produsele din pachet trebuie să aibă aceeași monedă.");
  }

  const currency = [...currencies][0];
  if (!CURRENCY_VALUES.includes(currency)) {
    throw new Error("Moneda pachetului este invalidă.");
  }

  const totalPrice = Number(
    items.reduce((sum, item) => sum + (productsById.get(item.productId)?.price ?? 0), 0).toFixed(2),
  );

  return { currency, totalPrice };
}

async function validateAndEnrichPayload(input: PackagePayloadInput) {
  const mode = String(input.mode ?? "");
  assertValidMode(mode);

  const title = String(input.title ?? "").trim();
  if (!title) {
    throw new Error("Titlul pachetului este obligatoriu.");
  }

  const normalizedItems = normalizeItems(input.items ?? []);
  if (normalizedItems.length === 0) {
    throw new Error("Pachetul trebuie să conțină cel puțin un produs.");
  }
  if (normalizedItems.some((item) => !item.productId)) {
    throw new Error("Toate item-urile din pachet trebuie să aibă produs selectat.");
  }
  const duplicateProductIds = normalizedItems
    .map((item) => item.productId)
    .filter((productId, index, all) => all.indexOf(productId) !== index);
  if (duplicateProductIds.length > 0) {
    throw new Error("Același produs nu poate fi adăugat de mai multe ori în pachet.");
  }

  assertValidItemsForMode(mode, normalizedItems);
  const persistedItems = mode === "custom" ? normalizedItems : sortItems(normalizedItems);
  const { totalPrice, currency } = await resolvePackageTotals(persistedItems);

  return {
    active: Boolean(input.active),
    title,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    mode,
    items: persistedItems,
    recommendationScenarios: (input.recommendationScenarios ?? []).map((scenario) => ({
      active: Boolean(scenario.active),
      order: Number(scenario.order ?? 0),
      explanationTemplate: String(scenario.explanationTemplate ?? "").trim(),
      conditions: scenario.conditions ?? {},
    })) satisfies ProductRecommendationScenario[],
    totalPrice,
    currency,
  } satisfies Omit<RecommendationPackage, "createdAt" | "updatedAt">;
}

export async function listPackages(params: { activeOnly?: boolean } = {}): Promise<WithId<RecommendationPackage>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const base = collection(db, PACKAGES_COLLECTION);
  const q = params.activeOnly
    ? query(base, where("active", "==", true), orderBy("updatedAt", "desc"), limit(50))
    : query(base, orderBy("updatedAt", "desc"), limit(50));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as RecommendationPackage) }));
}

export async function listPackagesPage(params: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot;
  activeOnly?: boolean;
}): Promise<{ items: WithId<RecommendationPackage>[]; cursor?: QueryDocumentSnapshot }> {
  const { db } = initFirebase();
  if (!db) return { items: [], cursor: undefined };

  const pageSize = params.pageSize ?? 20;
  const base = collection(db, PACKAGES_COLLECTION);
  const baseQuery = params.activeOnly
    ? query(base, where("active", "==", true), orderBy("updatedAt", "desc"))
    : query(base, orderBy("updatedAt", "desc"));
  const q = params.cursor
    ? query(baseQuery, startAfter(params.cursor), limit(pageSize))
    : query(baseQuery, limit(pageSize));

  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as RecommendationPackage) }));
  return { items, cursor: snapshot.docs[snapshot.docs.length - 1] };
}

export async function getPackage(packageId: string): Promise<WithId<RecommendationPackage> | null> {
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, PACKAGES_COLLECTION, packageId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as RecommendationPackage) };
}

export async function getPackagesByIds(ids: string[]): Promise<WithId<RecommendationPackage>[]> {
  const { db } = initFirebase();
  if (!db || ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }

  const results: WithId<RecommendationPackage>[] = [];
  for (const chunk of chunks) {
    const snapshot = await getDocs(
      query(collection(db, PACKAGES_COLLECTION), where(documentId(), "in", chunk as string[])),
    );
    snapshot.docs.forEach((docSnap) => {
      results.push({ id: docSnap.id, ...(docSnap.data() as RecommendationPackage) });
    });
  }
  return results;
}

export async function createPackage(input: PackagePayloadInput) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  const payload = await validateAndEnrichPayload(input);
  const ref = await addDoc(collection(db, PACKAGES_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return ref;
}

export async function updatePackage(packageId: string, input: PackagePayloadInput) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");

  const existing = await getPackage(packageId);
  if (!existing) {
    throw new Error("Pachetul nu există.");
  }

  const payload = await validateAndEnrichPayload({ ...existing, ...input });

  await updateDoc(doc(db, PACKAGES_COLLECTION, packageId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
}

export async function deletePackage(packageId: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  await deleteDoc(doc(db, PACKAGES_COLLECTION, packageId));
  await touchMetaConfig();
}
