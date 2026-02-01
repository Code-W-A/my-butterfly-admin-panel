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
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { initFirebase } from "@/lib/firebase/client";
import { deleteProductImage } from "@/lib/firebase/storage.client";
import { cache } from "@/lib/firestore/cache";
import { touchMetaConfig } from "@/lib/firestore/meta";
import type { Product, WithId } from "@/lib/firestore/types";

type ListProductsParams = {
  activeOnly?: boolean;
  search?: string;
};

export async function listProducts(params: ListProductsParams = {}): Promise<WithId<Product>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  const productsCollection = collection(db, "products");
  const { activeOnly, search } = params;
  const baseQuery = activeOnly
    ? query(productsCollection, where("active", "==", true), orderBy("updatedAt", "desc"), limit(50))
    : query(productsCollection, orderBy("updatedAt", "desc"), limit(50));

  const snapshot = await getDocs(baseQuery);
  const items = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Product),
  }));
  cache.products.setMany(items);

  if (!search) return items;
  const normalized = search.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((product) => {
    const name = product.name?.toLowerCase() ?? "";
    const brand = product.brand?.toLowerCase() ?? "";
    return name.includes(normalized) || brand.includes(normalized);
  });
}

export async function listProductsPage(params: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot;
  activeOnly?: boolean;
}) {
  const { db } = initFirebase();
  if (!db) return { items: [] as WithId<Product>[], cursor: undefined };
  const productsCollection = collection(db, "products");
  const pageSize = params.pageSize ?? 20;
  const baseQuery = params.activeOnly
    ? query(productsCollection, where("active", "==", true), orderBy("updatedAt", "desc"))
    : query(productsCollection, orderBy("updatedAt", "desc"));
  const q = params.cursor
    ? query(baseQuery, startAfter(params.cursor), limit(pageSize))
    : query(baseQuery, limit(pageSize));
  const snapshot = await getDocs(q);
  const items = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Product),
  }));
  cache.products.setMany(items);
  const nextCursor = snapshot.docs[snapshot.docs.length - 1];
  return { items, cursor: nextCursor };
}

export async function listProductsByPrestashopIds(ids: string[]): Promise<WithId<Product>[]> {
  const { db } = initFirebase();
  if (!db || ids.length === 0) return [];
  const productsCollection = collection(db, "products");
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results: WithId<Product>[] = [];
  for (const chunk of chunks) {
    const snapshot = await getDocs(query(productsCollection, where("source.prestashopProductId", "in", chunk)));
    snapshot.docs.forEach((docSnap) => {
      const item = { id: docSnap.id, ...(docSnap.data() as Product) };
      results.push(item);
      cache.products.set(item);
    });
  }
  return results;
}

export async function getProductsByIds(ids: string[]): Promise<WithId<Product>[]> {
  const { db } = initFirebase();
  if (!db) return [];
  if (ids.length === 0) return [];
  const productsCollection = collection(db, "products");
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(ids.slice(i, i + 10));
  }
  const results: WithId<Product>[] = [];
  for (const chunk of chunks) {
    const snapshot = await getDocs(query(productsCollection, where(documentId(), "in", chunk)));
    snapshot.docs.forEach((docSnap) => {
      const item = { id: docSnap.id, ...(docSnap.data() as Product) };
      results.push(item);
      cache.products.set(item);
    });
  }
  return results;
}

export async function getProduct(productId: string): Promise<WithId<Product> | null> {
  const cached = cache.products.get(productId);
  if (cached) return cached;
  const { db } = initFirebase();
  if (!db) return null;
  const ref = doc(db, "products", productId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const item = { id: snapshot.id, ...(snapshot.data() as Product) };
  cache.products.set(item);
  return item;
}

export async function createProduct(data: Omit<Product, "createdAt" | "updatedAt">) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const productsCollection = collection(db, "products");
  const ref = await addDoc(productsCollection, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await touchMetaConfig();
  return ref;
}

export async function upsertProductById(productId: string, data: Omit<Product, "createdAt" | "updatedAt">) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "products", productId);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      ...data,
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  cache.products.clear();
  await touchMetaConfig();
}

export async function updateProduct(productId: string, data: Partial<Omit<Product, "createdAt" | "updatedAt">>) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "products", productId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  const cached = cache.products.get(productId);
  if (cached) {
    cache.products.set({
      ...cached,
      ...data,
    } as WithId<Product>);
  }
  await touchMetaConfig();
}

export async function deleteProduct(productId: string) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const ref = doc(db, "products", productId);
  await deleteDoc(ref);
  cache.products.clear();
  await touchMetaConfig();
}

export async function deleteProductWithImages(product: WithId<Product>) {
  const urls = product.imageUrls ?? [];
  if (urls.length) {
    await Promise.all(
      urls.map(async (url) => {
        try {
          await deleteProductImage(url);
        } catch {
          // Ignore individual image deletion failures to proceed with doc deletion.
        }
      }),
    );
  }
  await deleteProduct(product.id);
}

export async function batchSetProductsActive(ids: string[], active: boolean) {
  const { db } = initFirebase();
  if (!db) throw new Error("Firestore not initialized.");
  const batch = writeBatch(db);
  ids.forEach((id) => {
    const ref = doc(db, "products", id);
    batch.update(ref, { active, updatedAt: serverTimestamp() });
  });
  await batch.commit();
  ids.forEach((id) => {
    const cached = cache.products.get(id);
    if (cached) {
      cache.products.set({ ...cached, active } as WithId<Product>);
    }
  });
  await touchMetaConfig();
}
