import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { touchMetaConfig } from "@/lib/firestore/meta";
import type { EquipmentCatalog, EquipmentCatalogItem } from "@/lib/firestore/types";
import {
  DEFAULT_EUR_RON_EXCHANGE_RATE,
  DEFAULT_VAT_PERCENT,
  sanitizeExchangeRate,
  sanitizeVatPercent,
} from "@/lib/pricing/prestashop-price";

export type RecommendationSettings = {
  minMatchPercent: number;
  exchangeRateEurRon: number;
  vatPercent: number;
};

const SETTINGS_COLLECTION = "app_settings";
const RECOMMENDATIONS_DOC = "recommendations";
const PREFERRED_SETTINGS_COLLECTION = "settings";
const EQUIPMENT_CATALOG_DOC = "equipmentCatalog";
const DEFAULT_MIN_MATCH_PERCENT = 65;

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const buildSettings = (data?: Partial<RecommendationSettings> | null): RecommendationSettings => ({
  minMatchPercent:
    typeof data?.minMatchPercent === "number" ? clampPercent(data.minMatchPercent) : DEFAULT_MIN_MATCH_PERCENT,
  exchangeRateEurRon: sanitizeExchangeRate(data?.exchangeRateEurRon ?? DEFAULT_EUR_RON_EXCHANGE_RATE),
  vatPercent: sanitizeVatPercent(data?.vatPercent ?? DEFAULT_VAT_PERCENT),
});

export async function getRecommendationSettings(): Promise<RecommendationSettings> {
  const { db } = initFirebase();
  if (!db) return buildSettings();
  const ref = doc(db, SETTINGS_COLLECTION, RECOMMENDATIONS_DOC);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return buildSettings();
  const data = snapshot.data() as Partial<RecommendationSettings>;
  return buildSettings(data);
}

export async function updateRecommendationSettings(patch: Partial<RecommendationSettings>) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, SETTINGS_COLLECTION, RECOMMENDATIONS_DOC);
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (patch.minMatchPercent !== undefined) {
    payload.minMatchPercent = clampPercent(patch.minMatchPercent);
  }
  if (patch.exchangeRateEurRon !== undefined) {
    payload.exchangeRateEurRon = sanitizeExchangeRate(patch.exchangeRateEurRon);
  }
  if (patch.vatPercent !== undefined) {
    payload.vatPercent = sanitizeVatPercent(patch.vatPercent);
  }
  await setDoc(ref, payload, { merge: true });
  await touchMetaConfig();
}

const EMPTY_EQUIPMENT_CATALOG: EquipmentCatalog = {
  blades: [],
  rubbers: [],
};

const normalizeEquipmentCatalogItem = (value: unknown): EquipmentCatalogItem | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<EquipmentCatalogItem>;
  const id = String(raw.id ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    ...(typeof raw.brand === "string" && raw.brand.trim() ? { brand: raw.brand.trim() } : {}),
    active: raw.active !== false,
    ...(raw.updatedAt ? { updatedAt: raw.updatedAt as Timestamp } : {}),
  };
};

const normalizeEquipmentCatalogItems = (value: unknown): EquipmentCatalogItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeEquipmentCatalogItem(item))
    .filter((item): item is EquipmentCatalogItem => Boolean(item));
};

const normalizeEquipmentCatalog = (data?: Record<string, unknown> | null): EquipmentCatalog => ({
  blades: normalizeEquipmentCatalogItems(data?.blades),
  rubbers: normalizeEquipmentCatalogItems(data?.rubbers),
});

const categoryToKind = (rawCategory: unknown): "blade" | "rubber" | null => {
  if (typeof rawCategory !== "string") return null;
  const category = rawCategory.trim().toLowerCase();
  if (category === "blade" || category === "blades" || category === "wood" || category === "woods") return "blade";
  if (category === "rubber" || category === "rubbers" || category === "forehand" || category === "backhand") {
    return "rubber";
  }
  return null;
};

const normalizeLegacyEquipmentCollection = (
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): EquipmentCatalog => {
  const directDocWithArrays = docs
    .map((docSnap) => normalizeEquipmentCatalog(docSnap.data()))
    .find((catalog) => catalog.blades.length > 0 || catalog.rubbers.length > 0);
  if (directDocWithArrays) return directDocWithArrays;

  const blades: EquipmentCatalogItem[] = [];
  const rubbers: EquipmentCatalogItem[] = [];
  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const kind = categoryToKind(data.type ?? data.category ?? data.kind);
    if (!kind) return;
    const item = normalizeEquipmentCatalogItem({
      id: docSnap.id,
      name: data.name,
      brand: data.brand,
      active: data.active,
      updatedAt: data.updatedAt,
    });
    if (!item) return;
    if (kind === "blade") blades.push(item);
    else rubbers.push(item);
  });

  return { blades, rubbers };
};

export async function getEquipmentCatalog(): Promise<EquipmentCatalog> {
  const { db } = initFirebase();
  if (!db) return EMPTY_EQUIPMENT_CATALOG;

  const preferredRef = doc(db, PREFERRED_SETTINGS_COLLECTION, EQUIPMENT_CATALOG_DOC);
  const preferredSnapshot = await getDoc(preferredRef);
  if (preferredSnapshot.exists()) {
    return normalizeEquipmentCatalog(preferredSnapshot.data() as Record<string, unknown>);
  }

  // Legacy fallback: some deployments stored this under app_settings/equipmentCatalog.
  const legacyDocRef = doc(db, SETTINGS_COLLECTION, EQUIPMENT_CATALOG_DOC);
  const legacyDocSnapshot = await getDoc(legacyDocRef);
  if (legacyDocSnapshot.exists()) {
    const normalized = normalizeEquipmentCatalog(legacyDocSnapshot.data() as Record<string, unknown>);
    if (normalized.blades.length > 0 || normalized.rubbers.length > 0) return normalized;
  }

  // Legacy fallback: older structure used equipmentCatalog collection.
  const legacyCollectionSnapshot = await getDocs(collection(db, EQUIPMENT_CATALOG_DOC));
  if (!legacyCollectionSnapshot.empty) {
    return normalizeLegacyEquipmentCollection(
      legacyCollectionSnapshot.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
    );
  }

  return EMPTY_EQUIPMENT_CATALOG;
}

export async function updateEquipmentCatalog(patch: Partial<EquipmentCatalog>) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, PREFERRED_SETTINGS_COLLECTION, EQUIPMENT_CATALOG_DOC);
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (patch.blades !== undefined) payload.blades = normalizeEquipmentCatalogItems(patch.blades);
  if (patch.rubbers !== undefined) payload.rubbers = normalizeEquipmentCatalogItems(patch.rubbers);
  await setDoc(ref, payload, { merge: true });
  await touchMetaConfig();
}
