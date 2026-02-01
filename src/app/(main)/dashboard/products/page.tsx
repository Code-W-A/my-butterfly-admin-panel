"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Loader2, Package, Search, X } from "lucide-react";

import { VocabularyMultiSelect } from "@/components/mybutterfly/forms/vocabulary-multi-select";
import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import {
  createProduct,
  deleteProductWithImages,
  listProductsByPrestashopIds,
  listProductsPage,
  updateProduct,
} from "@/lib/firestore/products";
import { listRuleSets, updateRuleSet } from "@/lib/firestore/recommendation-rule-sets";
import type { Product, ProductRecommendationScenario, RecommendationRuleSet, WithId } from "@/lib/firestore/types";
import { listVocabularyKeys, type VocabularyCategory } from "@/lib/firestore/vocabulary";

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"];
const IMPORT_CONCURRENCY = 4;

type PrestashopListItem = {
  id: string;
  name: string;
  reference?: string;
  price: number;
  imageUrl?: string;
  imageId?: number;
};

type PrestashopDetails = {
  id: string;
  name: string;
  price: number;
  currency: "EUR" | "RON";
  active: boolean;
  prestashopFull?: Record<string, unknown>;
  imageUrls?: string[];
  imageUrl?: string;
  imageId?: number;
  productUrl?: string;
};

type ScenarioDraft = {
  id: string;
  active: boolean;
  order: number;
  explanationTemplate: string;
  conditions: Record<string, string[]>;
};

const generateClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeConditionValues = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim());
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const buildConditionMap = (keys: string[], source: ProductRecommendationScenario["conditions"] | undefined) => {
  const result: Record<string, string[]> = {};
  keys.forEach((key) => {
    const value = source?.[key];
    result[key] = normalizeConditionValues(value);
  });
  if (source) {
    Object.entries(source).forEach(([key, value]) => {
      if (key in result) return;
      const normalized = normalizeConditionValues(value);
      if (normalized.length) result[key] = normalized;
    });
  }
  return result;
};

const buildConditions = (scenario: ScenarioDraft): ProductRecommendationScenario["conditions"] =>
  Object.fromEntries(
    Object.entries(scenario.conditions).filter(([, values]) => Array.isArray(values) && values.length > 0),
  );

const formatScenarioSummary = (
  scenario: ScenarioDraft,
  categories: Array<Pick<VocabularyCategory, "key" | "title">>,
) => {
  const parts: string[] = [];
  const knownKeys = new Set(categories.map((category) => category.key));
  categories.forEach((category) => {
    const values = scenario.conditions[category.key] ?? [];
    if (values.length) parts.push(`${category.title}: ${values.length}`);
  });
  Object.entries(scenario.conditions).forEach(([key, values]) => {
    if (knownKeys.has(key)) return;
    if (values.length) parts.push(`${key}: ${values.length}`);
  });
  if (scenario.explanationTemplate.trim()) {
    parts.push("Are explicație");
  }
  return parts.length ? parts.join(" • ") : "Fără condiții setate";
};

const mergeScenarioSets = (
  existing: ProductRecommendationScenario[] | undefined,
  incoming: ProductRecommendationScenario[],
) => {
  const base = existing ? [...existing] : [];
  const maxOrder = base.length ? Math.max(...base.map((scenario) => scenario.order)) : -1;
  const appended = incoming.map((scenario, index) => ({
    ...scenario,
    order: maxOrder + index + 1,
  }));
  return [...base, ...appended];
};

const getRuleScenario = (rule: RecommendationRuleSet) => rule.scenario ?? rule.scenarios?.[0] ?? null;

const runWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) => {
  const results: Promise<R>[] = [];
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      results.push(worker(next));
      if (results.length >= items.length) return;
    }
  });
  await Promise.all(runners);
  return Promise.allSettled(results);
};

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<WithId<Product>[]>([]);
  const [allItems, setAllItems] = useState<WithId<Product>[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [cursor, setCursor] = useState<unknown | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [importItems, setImportItems] = useState<PrestashopListItem[]>([]);
  const [importSelected, setImportSelected] = useState<PrestashopListItem[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importDuplicates, setImportDuplicates] = useState<WithId<Product>[]>([]);
  const [importExistingIds, setImportExistingIds] = useState<Set<string>>(new Set());
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importAbortRef = useRef<AbortController | null>(null);
  const debouncedImportQuery = useDebounce(importQuery, 250);

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
  const [assignRuleIds, setAssignRuleIds] = useState<string[]>([]);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSummary, setAssignSummary] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAssignLoading, setIsAssignLoading] = useState(false);
  const [ruleSets, setRuleSets] = useState<WithId<RecommendationRuleSet>[]>([]);

  const [isRuleSetPreviewOpen, setIsRuleSetPreviewOpen] = useState(false);
  const [previewRuleSet, setPreviewRuleSet] = useState<WithId<RecommendationRuleSet> | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewScenario, setPreviewScenario] = useState<ScenarioDraft | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewSaving, setIsPreviewSaving] = useState(false);
  const [vocabularyCategories, setVocabularyCategories] = useState<WithId<VocabularyCategory>[]>([]);
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);
  const sortedVocabularyCategories = useMemo(
    () => vocabularyCategories.slice().sort((a, b) => a.order - b.order),
    [vocabularyCategories],
  );
  const vocabularyKeys = useMemo(
    () => sortedVocabularyCategories.map((category) => category.key),
    [sortedVocabularyCategories],
  );

  const [sort, setSort] = useState<SortState<"name" | "brand" | "price" | "active">>({ key: "name", dir: "asc" });

  const selectedIdSet = useMemo(() => new Set(importSelected.map((item) => item.id)), [importSelected]);
  const existingIdSet = useMemo(() => importExistingIds, [importExistingIds]);
  const assignSelectedIdSet = useMemo(() => new Set(assignSelectedIds), [assignSelectedIds]);
  const assignRuleIdSet = useMemo(() => new Set(assignRuleIds), [assignRuleIds]);

  const loadFirstPage = useCallback(async () => {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "products/page.tsx:loadFirstPage:start",
        message: "loadFirstPage start",
        data: { activeOnly },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "debug1",
        hypothesisId: "H2",
      }),
    }).catch(() => {
      /* no-op */
    });
    // #endregion agent log
    try {
      setError(null);
      setIsLoading(true);
      const { items: data, cursor: nextCursor } = await listProductsPage({ pageSize: 20, activeOnly });
      setItems(data);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setIsLoading(false);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "products/page.tsx:loadFirstPage:success",
          message: "loadFirstPage success",
          data: { count: data.length, hasMore: Boolean(nextCursor) },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "debug1",
          hypothesisId: "H2",
        }),
      }).catch(() => {
        /* no-op */
      });
      // #endregion agent log
    } catch (err) {
      logFirebaseError("Products: loadFirstPage", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "products/page.tsx:loadFirstPage:error",
          message: "loadFirstPage error",
          data: { code: info.code ?? null },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "debug1",
          hypothesisId: "H2",
        }),
      }).catch(() => {
        /* no-op */
      });
      // #endregion agent log
    }
  }, [activeOnly]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const { items: data, cursor: nextCursor } = await listProductsPage({
        pageSize: 20,
        activeOnly,
        cursor: cursor as never,
      });
      setItems((prev) => [...prev, ...data]);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setIsLoadingMore(false);
    } catch (err) {
      logFirebaseError("Products: loadMore", err);
      setIsLoadingMore(false);
    }
  };

  const loadAllProducts = useCallback(async () => {
    if (allItems) return allItems;
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "products/page.tsx:loadAllProducts:start",
        message: "loadAllProducts start",
        data: { activeOnly },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "debug1",
        hypothesisId: "H1",
      }),
    }).catch(() => {
      /* no-op */
    });
    // #endregion agent log
    setIsSearchLoading(true);
    let nextCursor: unknown | undefined;
    let hasNext = true;
    const collected: WithId<Product>[] = [];

    while (hasNext) {
      const { items: data, cursor: cursorNext } = await listProductsPage({
        pageSize: 200,
        activeOnly,
        cursor: nextCursor as never,
      });
      collected.push(...data);
      nextCursor = cursorNext;
      hasNext = Boolean(cursorNext) && data.length > 0;
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "products/page.tsx:loadAllProducts:page",
          message: "loadAllProducts page",
          data: { pageCount: data.length, total: collected.length, hasNext },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "debug1",
          hypothesisId: "H1",
        }),
      }).catch(() => {
        /* no-op */
      });
      // #endregion agent log
    }

    setAllItems(collected);
    setIsSearchLoading(false);
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "products/page.tsx:loadAllProducts:done",
        message: "loadAllProducts done",
        data: { total: collected.length },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "debug1",
        hypothesisId: "H1",
      }),
    }).catch(() => {
      /* no-op */
    });
    // #endregion agent log
    return collected;
  }, [activeOnly, allItems]);

  const onDelete = async (item: WithId<Product>) => {
    if (!window.confirm(`Ștergi produsul "${item.name}"? Imaginile vor fi șterse din Storage.`)) return;
    try {
      setIsDeleting(item.id);
      await deleteProductWithImages(item);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
    } catch (err) {
      logFirebaseError("Products: delete", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
    } finally {
      setIsDeleting(null);
    }
  };

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    const preset = searchParams.get("assignRuleId");
    if (preset) {
      setAssignRuleIds([preset]);
      setIsAssignOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isImportOpen) return;
    const term = debouncedImportQuery.trim();
    if (term.length < 2) {
      importAbortRef.current?.abort();
      setImportItems([]);
      setImportError(null);
      setIsImportLoading(false);
      return;
    }

    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    setIsImportLoading(true);
    setImportError(null);
    setImportItems([]);

    const load = async () => {
      try {
        const response = await fetch(`/api/prestashop/products/search?q=${encodeURIComponent(term)}&limit=40`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("PrestaShop request failed");
        const data = (await response.json()) as { items?: PrestashopListItem[] };
        if (!controller.signal.aborted) {
          setImportItems(data.items ?? []);
        }
      } catch (_err) {
        if (controller.signal.aborted) return;
        setImportError("Nu am putut încărca produsele.");
        setImportItems([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsImportLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [debouncedImportQuery, isImportOpen]);

  useEffect(() => {
    if (!isImportOpen) return;
    if (importItems.length === 0) {
      setImportExistingIds(new Set());
      return;
    }
    let isCancelled = false;
    const loadExisting = async () => {
      try {
        const ids = importItems.map((item) => item.id);
        const existing = await listProductsByPrestashopIds(ids);
        if (isCancelled) return;
        const nextSet = new Set(existing.map((item) => item.source?.prestashopProductId).filter(Boolean) as string[]);
        setImportExistingIds(nextSet);
      } catch {
        if (!isCancelled) setImportExistingIds(new Set());
      }
    };
    void loadExisting();
    return () => {
      isCancelled = true;
    };
  }, [importItems, isImportOpen]);

  useEffect(() => {
    if (!isAssignOpen) return;
    setIsAssignLoading(true);
    setAssignError(null);
    listRuleSets()
      .then((items) => setRuleSets(items))
      .catch((err) => {
        logFirebaseError("Products: loadRuleSets", err);
        const info = getFirebaseErrorInfo(err);
        setAssignError(info.message || "Nu pot încărca seturile de reguli.");
        setRuleSets([]);
      })
      .finally(() => setIsAssignLoading(false));
    if (!allItems) {
      loadAllProducts().catch((err) => {
        logFirebaseError("Products: loadAllForAssign", err);
      });
    }
  }, [allItems, isAssignOpen, loadAllProducts]);

  useEffect(() => {
    if (!isRuleSetPreviewOpen) return;
    listVocabularyKeys({ includeInactive: true })
      .then((items) => {
        setVocabularyCategories(items);
        setVocabularyError(null);
      })
      .catch((err) => {
        logFirebaseError("Products: loadVocabularyKeys", err);
        const info = getFirebaseErrorInfo(err);
        setVocabularyError(info.message || "Nu pot încărca Vocabulary.");
        setVocabularyCategories([]);
      });
  }, [isRuleSetPreviewOpen]);

  const assignBase = useMemo(() => allItems ?? items, [allItems, items]);
  const assignVisibleProducts = useMemo(() => {
    const normalized = assignSearch.trim().toLowerCase();
    if (!normalized) return assignBase;
    return assignBase.filter((product) => {
      const name = product.name?.toLowerCase() ?? "";
      const brand = product.brand?.toLowerCase() ?? "";
      return name.includes(normalized) || brand.includes(normalized);
    });
  }, [assignBase, assignSearch]);
  const assignSelectedItems = useMemo(
    () => assignBase.filter((product) => assignSelectedIdSet.has(product.id)),
    [assignBase, assignSelectedIdSet],
  );

  const toggleImportSelection = (item: PrestashopListItem) => {
    setImportSelected((prev) => {
      if (existingIdSet.has(item.id)) return prev;
      if (prev.some((current) => current.id === item.id)) {
        return prev.filter((current) => current.id !== item.id);
      }
      return [...prev, item];
    });
  };

  const handleBulkImport = async () => {
    if (importSelected.length === 0 || isImporting) return;
    setIsImporting(true);
    setImportError(null);
    setImportSummary(null);
    setImportDuplicates([]);
    try {
      const selectedIds = importSelected.map((item) => item.id);
      const existing = await listProductsByPrestashopIds(selectedIds);
      setImportDuplicates(existing);
      const existingIds = new Set(existing.map((item) => item.source?.prestashopProductId).filter(Boolean) as string[]);
      const toCreate = importSelected.filter((item) => !existingIds.has(item.id));
      const skipped = importSelected.length - toCreate.length;
      let created = 0;
      let failed = 0;

      await runWithConcurrency(toCreate, IMPORT_CONCURRENCY, async (item) => {
        try {
          const response = await fetch(`/api/prestashop/products/${item.id}`);
          const data = (await response.json()) as PrestashopDetails;
          const resolvedName = data.name?.trim() || item.name;
          const resolvedPrice = data.price && data.price > 0 ? data.price : item.price;
          const resolvedImageUrls =
            data.imageUrls && data.imageUrls.length > 0
              ? data.imageUrls
              : data.imageUrl
                ? [data.imageUrl]
                : item.imageUrl
                  ? [item.imageUrl]
                  : [];
          await createProduct({
            active: true,
            name: resolvedName,
            brand: "",
            imageUrls: resolvedImageUrls,
            imageUrl: resolvedImageUrls[0],
            productUrl: data.productUrl,
            price: resolvedPrice ?? 0,
            currency: data.currency ?? "RON",
            tags: { level: [], style: [], distance: [] },
            attributes: {},
            source: {
              provider: "prestashop",
              prestashopProductId: String(data.id ?? item.id),
            },
            prestashop: {
              productId: Number(data.id ?? item.id),
              ...(data.imageId ? { imageId: data.imageId } : {}),
            },
            ...(data.prestashopFull ? { prestashopFull: data.prestashopFull } : {}),
          });
          created += 1;
        } catch (_err) {
          failed += 1;
        }
      });

      setImportSummary(`Importate: ${created}. Ignorate: ${skipped}. Eșuate: ${failed}.`);
      if (created > 0) {
        setAllItems(null);
        await loadFirstPage();
      }
    } catch (err) {
      logFirebaseError("Products: bulkImport", err);
      const info = getFirebaseErrorInfo(err);
      setImportError(info.message || "Importul a eșuat.");
    } finally {
      setIsImporting(false);
    }
  };

  const toggleAssignSelection = (id: string) => {
    setAssignSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAssignRule = (id: string) => {
    setAssignRuleIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleAssignRules = async () => {
    if (isAssigning || assignRuleIds.length === 0 || assignSelectedIds.length === 0) return;
    const selectedRules = ruleSets.filter((item) => assignRuleIdSet.has(item.id));
    const incomingScenarios = selectedRules
      .map((rule) => getRuleScenario(rule))
      .filter(Boolean) as ProductRecommendationScenario[];
    if (incomingScenarios.length === 0) return;
    setIsAssigning(true);
    setAssignError(null);
    setAssignSummary(null);
    try {
      let updated = 0;
      let failed = 0;
      await Promise.all(
        assignSelectedItems.map(async (product) => {
          try {
            const merged = mergeScenarioSets(product.recommendationScenarios, incomingScenarios);
            await updateProduct(product.id, { recommendationScenarios: merged });
            updated += 1;
          } catch {
            failed += 1;
          }
        }),
      );
      setAssignSummary(`Actualizate: ${updated}. Eșuate: ${failed}.`);
      if (updated > 0) {
        setAllItems(null);
        await loadFirstPage();
      }
    } catch (err) {
      logFirebaseError("Products: assignRules", err);
      const info = getFirebaseErrorInfo(err);
      setAssignError(info.message || "Atribuirea a eșuat.");
    } finally {
      setIsAssigning(false);
    }
  };

  const openRuleSetPreview = (rule: WithId<RecommendationRuleSet>) => {
    const source = getRuleScenario(rule);
    const nextScenario: ScenarioDraft = {
      id: generateClientId(),
      active: source?.active ?? true,
      order: source?.order ?? 0,
      explanationTemplate: source?.explanationTemplate ?? "",
      conditions: buildConditionMap(vocabularyKeys, source?.conditions),
    };
    setPreviewRuleSet(rule);
    setPreviewTitle(rule.title ?? "");
    setPreviewScenario(nextScenario);
    setPreviewError(null);
    setIsRuleSetPreviewOpen(true);
  };

  const updatePreviewScenario = (patch: Partial<ScenarioDraft>) => {
    setPreviewScenario((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSaveRuleSetPreview = async () => {
    if (!previewRuleSet) return;
    const trimmedTitle = previewTitle.trim();
    if (!trimmedTitle) {
      setPreviewError("Completează numele regulilor.");
      return;
    }
    if (!previewScenario) {
      setPreviewError("Completează regula.");
      return;
    }
    try {
      setIsPreviewSaving(true);
      setPreviewError(null);
      await updateRuleSet(previewRuleSet.id, {
        title: trimmedTitle,
        scenario: {
          active: previewScenario.active,
          order: previewScenario.order,
          explanationTemplate: previewScenario.explanationTemplate.trim(),
          conditions: buildConditions(previewScenario),
        },
      });
      const refreshed = await listRuleSets();
      setRuleSets(refreshed);
      const updated = refreshed.find((item) => item.id === previewRuleSet.id) ?? null;
      setPreviewRuleSet(updated);
      setIsRuleSetPreviewOpen(false);
    } catch (err) {
      logFirebaseError("Products: saveRuleSetPreview", err);
      const info = getFirebaseErrorInfo(err);
      setPreviewError(info.message || "Salvarea setului a eșuat.");
    } finally {
      setIsPreviewSaving(false);
    }
  };

  const handleActiveOnlyChange = (value: boolean) => {
    setActiveOnly(value);
    setAllItems(null);
  };

  useEffect(() => {
    if (!search.trim()) return;
    let cancelled = false;
    const run = async () => {
      try {
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "products/page.tsx:searchEffect",
            message: "search effect triggered",
            data: { searchLen: search.trim().length },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "debug1",
            hypothesisId: "H3",
          }),
        }).catch(() => {
          /* no-op */
        });
        // #endregion agent log
        await loadAllProducts();
      } catch (err) {
        if (!cancelled) {
          logFirebaseError("Products: searchAll", err);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loadAllProducts, search]);

  const isSearching = Boolean(search.trim());
  const searchBase = isSearching ? (allItems ?? []) : items;
  const visibleItems = isSearching
    ? searchBase.filter((product) => {
        const normalized = search.trim().toLowerCase();
        const name = product.name?.toLowerCase() ?? "";
        const brand = product.brand?.toLowerCase() ?? "";
        return name.includes(normalized) || brand.includes(normalized);
      })
    : items;

  const sortedVisibleItems = useMemo(() => {
    const next = [...visibleItems];
    const dir = sort?.dir === "desc" ? -1 : 1;
    next.sort((a, b) => {
      if (!sort) return 0;
      if (sort.key === "name") return dir * (a.name ?? "").localeCompare(b.name ?? "");
      if (sort.key === "brand") return dir * (a.brand ?? "").localeCompare(b.brand ?? "");
      if (sort.key === "active") return dir * (Number(a.active) - Number(b.active));
      return dir * ((a.price ?? 0) - (b.price ?? 0));
    });
    return next;
  }, [sort, visibleItems]);

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/a116ccf1-b12b-4cc0-98e6-74af85002cbb", {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "products/page.tsx:visibleItems",
        message: "visibleItems changed",
        data: {
          isSearching,
          searchLen: search.trim().length,
          itemsCount: items.length,
          allItemsCount: allItems?.length ?? null,
          visibleCount: visibleItems.length,
          isSearchLoading,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "debug1",
        hypothesisId: "H4",
      }),
    }).catch(() => {
      /* no-op */
    });
    // #endregion agent log
  }, [allItems, isSearchLoading, isSearching, items.length, search, visibleItems.length]);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <div className="font-semibold">Eroare</div>
          <div className="text-muted-foreground">{error}</div>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Produse</h1>
          <p className="text-muted-foreground text-sm">Gestionează produsele folosite în recomandări.</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="products.list" />
          <Button type="button" variant="outline" onClick={loadFirstPage} disabled={isLoading}>
            Reîmprospătează
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsImportOpen(true)}>
            Importă din PrestaShop
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsAssignOpen(true)}>
            Atribuire reguli
          </Button>
          <Button asChild variant="outline">
            <Link prefetch={false} href="/dashboard/recommendation-rules">
              Creează reguli
            </Link>
          </Button>
          <Button asChild>
            <Link prefetch={false} href="/dashboard/products/new">
              Creează produs
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          placeholder="Caută după nume sau brand"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="md:max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Switch checked={activeOnly} onCheckedChange={handleActiveOnlyChange} />
          <span className="text-sm">Doar active</span>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" sort={sort} onSortChange={setSort}>
                Nume
              </SortableTableHead>
              <SortableTableHead sortKey="brand" sort={sort} onSortChange={setSort}>
                Brand
              </SortableTableHead>
              <SortableTableHead sortKey="price" sort={sort} onSortChange={setSort}>
                Preț
              </SortableTableHead>
              <SortableTableHead sortKey="active" sort={sort} onSortChange={setSort}>
                Activ
              </SortableTableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              SKELETON_ROWS.map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={5}>
                    <div className="grid gap-3 md:grid-cols-5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-8 w-28 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : isSearching && (isSearchLoading || !allItems) ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  Se caută produse...
                </TableCell>
              </TableRow>
            ) : visibleItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  Nu s-au găsit produse.
                </TableCell>
              </TableRow>
            ) : (
              sortedVisibleItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.brand ?? "—"}</TableCell>
                  <TableCell>
                    {item.price} {item.currency}
                  </TableCell>
                  <TableCell>{item.active ? "Da" : "Nu"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="outline" size="sm" disabled={isDeleting === item.id}>
                        <Link prefetch={false} href={`/dashboard/products/${item.id}`}>
                          Editează
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(item)}
                        disabled={isDeleting === item.id}
                      >
                        {isDeleting === item.id ? "Se șterge..." : "Șterge"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {isSearching ? (
        <div className="text-muted-foreground text-sm">Se afișează rezultatele căutării.</div>
      ) : (
        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <span>Se afișează rezultatele din pagina curentă.</span>
          <Button type="button" variant="outline" onClick={loadMore} disabled={!hasMore || isLoadingMore}>
            {isLoadingMore ? "Se încarcă..." : hasMore ? "Încarcă mai multe" : "Nu mai sunt rezultate"}
          </Button>
        </div>
      )}

      <Dialog
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open);
          if (!open) {
            setImportQuery("");
            setImportItems([]);
            setImportSelected([]);
            setImportError(null);
            setImportSummary(null);
            setImportDuplicates([]);
          }
        }}
      >
        <DialogContent className="!max-w-none sm:!max-w-none flex h-[95vh] w-[98vw] flex-col gap-4 p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>Importă produse din PrestaShop</DialogTitle>
            <DialogDescription>
              Selectează mai multe produse. Vor fi create fără reguli, brand și atribute
              (control/rotire/viteză/greutate).
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="relative">
                <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                <Input
                  value={importQuery}
                  onChange={(event) => setImportQuery(event.target.value)}
                  placeholder="Caută produs în PrestaShop"
                  className="h-11 pl-9"
                />
              </div>
              <ScrollArea className="min-h-0 flex-1 rounded-md border">
                <div className="space-y-3 p-4">
                  {isImportLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">Se caută produse...</p>
                    </div>
                  ) : importError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Package className="size-12 text-muted-foreground/50" />
                      <p className="text-destructive text-sm">{importError}</p>
                    </div>
                  ) : importItems.length === 0 && debouncedImportQuery.trim().length >= 2 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Package className="size-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-sm">Niciun rezultat găsit</p>
                      <p className="text-muted-foreground text-xs">Încearcă un alt termen de căutare</p>
                    </div>
                  ) : debouncedImportQuery.trim().length < 2 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Search className="size-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-sm">Introdu minim 2 caractere pentru căutare</p>
                    </div>
                  ) : (
                    importItems.map((item) => {
                      const isSelected = selectedIdSet.has(item.id);
                      return (
                        <Card
                          key={item.id}
                          className={`border-2 p-3 transition-all ${
                            existingIdSet.has(item.id)
                              ? "border-amber-200 bg-amber-50/60"
                              : "cursor-pointer hover:border-primary hover:shadow-md"
                          } ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}
                          onClick={() => toggleImportSelection(item)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                              {item.imageUrl ? (
                                <Image
                                  src={item.imageUrl}
                                  alt={item.name}
                                  fill
                                  sizes="56px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package className="size-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{item.name}</div>
                              <div className="text-muted-foreground text-xs">
                                {item.reference ? `Ref: ${item.reference}` : "Fără referință"}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {existingIdSet.has(item.id) ? (
                                <Badge variant="outline" className="border-amber-300 text-amber-700">
                                  Deja importat
                                </Badge>
                              ) : null}
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                {item.price.toFixed(2)} RON
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">Selectate ({importSelected.length})</div>
                {importSelected.length > 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setImportSelected([])}>
                    Golește lista
                  </Button>
                ) : null}
              </div>
              <ScrollArea className="min-h-0 flex-1 rounded-md border">
                <div className="space-y-3 p-4">
                  {importSelected.length === 0 ? (
                    <div className="text-muted-foreground text-sm">Alege produse din stânga.</div>
                  ) : (
                    importSelected.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-md border p-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              fill
                              sizes="48px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <Package className="size-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-sm">{item.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {item.reference ? `Ref: ${item.reference}` : "Fără referință"}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleImportSelection(item)}
                          aria-label="Elimină"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              {importDuplicates.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
                  <div className="font-medium">Produse deja importate ({importDuplicates.length})</div>
                  <div className="text-amber-800 text-xs">
                    Aceste produse există deja. Le poți deschide direct pentru editare.
                  </div>
                  <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                    {importDuplicates.map((product) => (
                      <div key={product.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-sm">{product.name}</div>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/products/${product.id}`}>Deschide</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {importSummary ? <div className="text-muted-foreground text-xs">{importSummary}</div> : null}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">
              Produsele selectate vor fi create ca active, fără reguli și fără atribute.
            </div>
            <Button type="button" onClick={handleBulkImport} disabled={isImporting || importSelected.length === 0}>
              {isImporting ? "Se importă..." : `Importă (${importSelected.length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAssignOpen}
        onOpenChange={(open) => {
          setIsAssignOpen(open);
          if (!open) {
            setAssignSearch("");
            setAssignSelectedIds([]);
            setAssignRuleIds([]);
            setAssignError(null);
            setAssignSummary(null);
            if (searchParams.get("assignRuleId")) {
              router.replace("/dashboard/products");
            }
          }
        }}
      >
        <DialogContent className="!max-w-none sm:!max-w-none flex h-[95vh] w-[98vw] flex-col gap-4 p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>Atribuire reguli</DialogTitle>
            <DialogDescription>
              Atribuie reguli către mai multe produse. Regulile se vor adăuga peste cele existente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                  <Input
                    value={assignSearch}
                    onChange={(event) => setAssignSearch(event.target.value)}
                    placeholder="Caută produs după nume sau brand"
                    className="h-11 pl-9"
                  />
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1 rounded-md border">
                <div className="space-y-3 p-4">
                  {isAssignLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">Se încarcă seturile...</p>
                    </div>
                  ) : assignVisibleProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <Package className="size-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-sm">Nu s-au găsit produse.</p>
                    </div>
                  ) : (
                    assignVisibleProducts.map((product) => {
                      const isSelected = assignSelectedIdSet.has(product.id);
                      const imageUrl = product.imageUrl || product.imageUrls?.[0];
                      return (
                        <Card
                          key={product.id}
                          className={`cursor-pointer border-2 p-3 transition-all hover:border-primary hover:shadow-md ${
                            isSelected ? "border-primary bg-primary/5" : "border-border"
                          }`}
                          onClick={() => toggleAssignSelection(product.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                              {imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={product.name}
                                  fill
                                  sizes="56px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package className="size-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{product.name}</div>
                              <div className="text-muted-foreground text-xs">{product.brand ?? "Fără brand"}</div>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              {product.price} {product.currency}
                            </Badge>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="space-y-2">
                <div className="font-medium text-sm">Reguli disponibile</div>
                <ScrollArea className="max-h-[260px] rounded-md border">
                  <div className="space-y-2 p-3">
                    {isAssignLoading ? (
                      <div className="text-muted-foreground text-sm">Se încarcă regulile...</div>
                    ) : ruleSets.length === 0 ? (
                      <div className="text-muted-foreground text-sm">Nu există reguli.</div>
                    ) : (
                      ruleSets.map((rule) => {
                        const isChecked = assignRuleIdSet.has(rule.id);
                        const source = getRuleScenario(rule);
                        const summaryScenario: ScenarioDraft = {
                          id: rule.id,
                          active: source?.active ?? true,
                          order: source?.order ?? 0,
                          explanationTemplate: source?.explanationTemplate ?? "",
                          conditions: buildConditionMap(vocabularyKeys, source?.conditions),
                        };
                        return (
                          <div key={rule.id} className="flex items-start gap-3 rounded-md border p-3">
                            <Checkbox checked={isChecked} onCheckedChange={() => toggleAssignRule(rule.id)} />
                            <div className="flex-1">
                              <div className="font-medium text-sm">{rule.title}</div>
                              <div className="text-muted-foreground text-xs">
                                {formatScenarioSummary(summaryScenario, sortedVocabularyCategories)}
                              </div>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => openRuleSetPreview(rule)}>
                              Previzualizează
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link prefetch={false} href="/dashboard/recommendation-rules">
                      Creează reguli noi
                    </Link>
                  </Button>
                </div>
                {assignError ? <div className="text-destructive text-xs">{assignError}</div> : null}
              </div>

              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">Selectate ({assignSelectedItems.length})</div>
                {assignSelectedItems.length > 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAssignSelectedIds([])}>
                    Golește lista
                  </Button>
                ) : null}
              </div>
              <ScrollArea className="min-h-0 flex-1 rounded-md border">
                <div className="space-y-3 p-4">
                  {assignSelectedItems.length === 0 ? (
                    <div className="text-muted-foreground text-sm">Alege produse din stânga.</div>
                  ) : (
                    assignSelectedItems.map((product) => {
                      const imageUrl = product.imageUrl || product.imageUrls?.[0];
                      return (
                        <Card
                          key={product.id}
                          className="cursor-pointer border-2 border-border p-3 transition-all hover:border-primary hover:shadow-md"
                          onClick={() => toggleAssignSelection(product.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                              {imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={product.name}
                                  fill
                                  sizes="56px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package className="size-5" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{product.name}</div>
                              <div className="text-muted-foreground text-xs">{product.brand ?? "Fără brand"}</div>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              {product.price} {product.currency}
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleAssignSelection(product.id);
                              }}
                              aria-label="Elimină"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              {assignSummary ? <div className="text-muted-foreground text-xs">{assignSummary}</div> : null}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">
              Regulile se vor adăuga peste cele deja existente pentru fiecare produs.
            </div>
            <Button
              type="button"
              onClick={handleAssignRules}
              disabled={isAssigning || assignSelectedItems.length === 0 || assignRuleIds.length === 0}
            >
              {isAssigning ? "Se atribuie..." : `Atribuie (${assignSelectedItems.length})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRuleSetPreviewOpen}
        onOpenChange={(open) => {
          setIsRuleSetPreviewOpen(open);
          if (!open) {
            setPreviewRuleSet(null);
            setPreviewTitle("");
            setPreviewScenario(null);
            setPreviewError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Previzualizează regulile</DialogTitle>
            <DialogDescription>Poți edita regulile înainte de atribuire.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {previewError ? <div className="text-destructive text-sm">{previewError}</div> : null}
            <div className="space-y-2">
              <Label>Nume reguli</Label>
              <Input value={previewTitle} onChange={(event) => setPreviewTitle(event.target.value)} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Regulă recomandare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-muted-foreground text-sm">Editează regula.</div>
                  <Switch
                    checked={previewScenario?.active ?? true}
                    onCheckedChange={(checked) => updatePreviewScenario({ active: checked })}
                  />
                </div>

                {vocabularyError ? <div className="text-destructive text-sm">{vocabularyError}</div> : null}
                {sortedVocabularyCategories.length === 0 ? (
                  <div className="text-muted-foreground text-sm">Nu există categorii în Vocabulary.</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedVocabularyCategories.map((category) => {
                      const label = category.active ? category.title : `${category.title} (inactiv)`;
                      const tip =
                        category.description?.trim() ||
                        `Alege valorile care fac produsul potrivit pentru ${category.title.toLowerCase()}.`;
                      return (
                        <div key={category.key} className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <InfoTip text={tip} />
                            {label}
                          </Label>
                          <VocabularyMultiSelect
                            vocabKey={category.key}
                            value={previewScenario?.conditions[category.key] ?? []}
                            onChange={(value) =>
                              updatePreviewScenario({
                                conditions: { ...(previewScenario?.conditions ?? {}), [category.key]: value },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label className="flex items-center gap-2">
                      <InfoTip text="Mai mic = regula este verificată mai devreme." />
                      Ordine
                    </Label>
                    <Input
                      type="number"
                      value={previewScenario?.order ?? 0}
                      onChange={(e) => updatePreviewScenario({ order: Number(e.target.value || 0) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <InfoTip text="Textul pe care îl vede utilizatorul ca motiv al recomandării (opțional)." />
                    Explicație
                  </Label>
                  <Textarea
                    rows={3}
                    value={previewScenario?.explanationTemplate ?? ""}
                    onChange={(e) => updatePreviewScenario({ explanationTemplate: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRuleSetPreviewOpen(false)}>
                Anulează
              </Button>
              <Button type="button" onClick={handleSaveRuleSetPreview} disabled={isPreviewSaving}>
                {isPreviewSaving ? "Se salvează..." : "Salvează regulile"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
