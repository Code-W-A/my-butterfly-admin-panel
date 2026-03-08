"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getMetaConfigUpdatedAtMs, subscribeMetaConfigUpdates } from "@/lib/firestore/meta";
import { deletePackage, listAllPackagesForCache } from "@/lib/firestore/packages";
import { readPackagesCache, writePackagesCache } from "@/lib/firestore/packages-cache.client";
import { getProductsByIds } from "@/lib/firestore/products";
import type { RecommendationPackage, WithId } from "@/lib/firestore/types";

const PAGE_SIZE = 20;

const formatRole = (role?: string) => {
  if (role === "single") return "Produs";
  if (role === "blade") return "Lemn";
  if (role === "forehand" || role === "rubber_fh") return "Forehand";
  if (role === "backhand" || role === "rubber_bh") return "Rever";
  return "Fără rol";
};

const normalizeForSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const logPackagesDebug = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log("[PackagesPage]", ...args);
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = window.setTimeout(() => {
      logPackagesDebug(`${label} timed out after ${timeoutMs}ms; using fallback`);
      resolve(fallback);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export default function PackagesPage() {
  const [allItems, setAllItems] = useState<WithId<RecommendationPackage>[]>([]);
  const [productNameById, setProductNameById] = useState<Record<string, string>>({});
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [withoutScenariosOnly, setWithoutScenariosOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const syncInFlightRef = useRef(false);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const versionRef = useRef<number | null>(null);
  const productNameByIdRef = useRef<Record<string, string>>({});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    productNameByIdRef.current = productNameById;
  }, [productNameById]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const ensureProductNames = useCallback(async (data: WithId<RecommendationPackage>[]) => {
    const ids = Array.from(new Set(data.flatMap((item) => item.items.map((entry) => entry.productId)).filter(Boolean)));
    const missingIds = ids.filter((id) => !productNameByIdRef.current[id]);
    if (missingIds.length === 0) return;
    const products = await getProductsByIds(missingIds);
    if (products.length === 0 || !mountedRef.current) return;
    setProductNameById((prev) => ({
      ...prev,
      ...Object.fromEntries(products.map((product) => [product.id, product.name])),
    }));
  }, []);

  const syncAllPackages = useCallback(
    async (knownMetaVersionMs?: number | null) => {
      if (syncInFlightRef.current) {
        logPackagesDebug("sync already in flight; awaiting existing promise");
        await syncPromiseRef.current;
        return;
      }
      syncInFlightRef.current = true;
      setIsSyncing(true);
      const run = (async () => {
        try {
          logPackagesDebug("sync start", { knownMetaVersionMs });
          const remoteItems = await withTimeout(
            listAllPackagesForCache({ pageSize: 200 }),
            10000,
            [],
            "listAllPackagesForCache",
          );
          if (!mountedRef.current) return;
          const resolvedVersion =
            knownMetaVersionMs !== undefined
              ? knownMetaVersionMs
              : await withTimeout(
                  getMetaConfigUpdatedAtMs("packagesUpdatedAt"),
                  3000,
                  null,
                  "getMetaConfigUpdatedAtMs",
                );
          if (!mountedRef.current) return;
          versionRef.current = resolvedVersion ?? null;
          setAllItems(remoteItems);
          setError(null);
          await ensureProductNames(remoteItems);
          await writePackagesCache({
            versionUpdatedAtMs: versionRef.current,
            items: remoteItems,
          });
          logPackagesDebug("sync success", { count: remoteItems.length, version: versionRef.current });
        } catch (err) {
          logFirebaseError("Packages: syncAllPackages", err);
          if (!mountedRef.current) return;
          const info = getFirebaseErrorInfo(err);
          setError(info.message || "Încărcarea pachetelor a eșuat.");
          logPackagesDebug("sync failed", info);
        } finally {
          if (mountedRef.current) {
            setIsLoading(false);
            setIsSyncing(false);
          }
          syncInFlightRef.current = false;
          syncPromiseRef.current = null;
          logPackagesDebug("sync finished");
        }
      })();
      syncPromiseRef.current = run;
      await run;
    },
    [ensureProductNames],
  );

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      logPackagesDebug("bootstrap start");
      setIsLoading(true);
      setError(null);
      logPackagesDebug("bootstrap read cache start");
      const cached = await withTimeout(readPackagesCache(), 3000, null, "readPackagesCache");
      logPackagesDebug("bootstrap read cache end", { hasCache: Boolean(cached?.items?.length) });
      if (cancelled || !mountedRef.current) return;

      if (cached?.items?.length) {
        logPackagesDebug("bootstrap cache hit", { count: cached.items.length, version: cached.versionUpdatedAtMs });
        versionRef.current = cached.versionUpdatedAtMs;
        setAllItems(cached.items);
        setIsLoading(false);
        void ensureProductNames(cached.items);
      } else {
        logPackagesDebug("bootstrap cache miss");
      }

      try {
        const remoteVersion = await withTimeout(
          getMetaConfigUpdatedAtMs("packagesUpdatedAt"),
          3000,
          null,
          "getMetaConfigUpdatedAtMs",
        );
        if (cancelled || !mountedRef.current) return;
        const shouldSync = !cached || cached.versionUpdatedAtMs !== remoteVersion;
        logPackagesDebug("bootstrap remote version", {
          remoteVersion,
          cachedVersion: cached?.versionUpdatedAtMs,
          shouldSync,
        });
        if (shouldSync) {
          await syncAllPackages(remoteVersion);
        } else {
          versionRef.current = remoteVersion ?? null;
          setIsLoading(false);
        }
      } catch (err) {
        logFirebaseError("Packages: bootstrap", err);
        if (!cached && mountedRef.current) {
          const info = getFirebaseErrorInfo(err);
          setError(info.message || "Încărcarea pachetelor a eșuat.");
          logPackagesDebug("bootstrap failed without cache", info);
        }
        setIsLoading(false);
      }
      logPackagesDebug("bootstrap finish");
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [ensureProductNames, syncAllPackages]);

  useEffect(() => {
    const unsubscribe = subscribeMetaConfigUpdates((nextVersion) => {
      logPackagesDebug("meta update", { nextVersion, localVersion: versionRef.current });
      if (!mountedRef.current || nextVersion === null) return;
      if (versionRef.current === nextVersion) return;
      void syncAllPackages(nextVersion);
    }, "packagesUpdatedAt");
    return () => {
      unsubscribe();
    };
  }, [syncAllPackages]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeForSearch(searchQuery);
    return allItems.filter((item) => {
      if (activeOnly && !item.active) return false;
      const hasScenarios = (item.recommendationScenarios?.length ?? 0) > 0;
      if (withoutScenariosOnly && hasScenarios) return false;
      if (!normalizedSearch) return true;
      const haystack = normalizeForSearch(`${item.title} ${item.description ?? ""}`);
      return haystack.includes(normalizedSearch);
    });
  }, [activeOnly, allItems, searchQuery, withoutScenariosOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  useEffect(() => {
    if (pageIndex <= totalPages - 1) return;
    setPageIndex(totalPages - 1);
  }, [pageIndex, totalPages]);

  const visibleItems = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, pageIndex]);

  useEffect(() => {
    void ensureProductNames(visibleItems);
  }, [ensureProductNames, visibleItems]);

  const pageButtons = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index);
    }
    const indexes = new Set<number>([0, totalPages - 1, pageIndex - 1, pageIndex, pageIndex + 1]);
    return [...indexes].filter((index) => index >= 0 && index < totalPages).sort((a, b) => a - b);
  }, [pageIndex, totalPages]);

  const handleRefresh = () => {
    void syncAllPackages();
  };

  const handleDelete = async (item: WithId<RecommendationPackage>) => {
    if (!window.confirm(`Ștergi pachetul "${item.title}"?`)) return;
    try {
      setIsDeleting(item.id);
      await deletePackage(item.id);
      let nextItems: WithId<RecommendationPackage>[] = [];
      setAllItems((prev) => {
        nextItems = prev.filter((existing) => existing.id !== item.id);
        return nextItems;
      });
      await writePackagesCache({
        versionUpdatedAtMs: versionRef.current,
        items: nextItems,
      });
    } catch (err) {
      logFirebaseError("Packages: delete", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Ștergerea pachetului a eșuat.");
    } finally {
      setIsDeleting(null);
    }
  };

  const goPrevPage = () => {
    if (pageIndex <= 0) return;
    setPageIndex((prev) => prev - 1);
  };

  const goNextPage = () => {
    if (pageIndex >= totalPages - 1) return;
    setPageIndex((prev) => prev + 1);
  };

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
          <h1 className="font-semibold text-2xl">Pachete</h1>
          <p className="text-muted-foreground text-sm">Gestionează pachetele folosite în recomandări.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={isLoading || isSyncing}>
            {isSyncing ? "Se sincronizează..." : "Reîmprospătează"}
          </Button>
          <Button asChild>
            <Link href="/dashboard/packages/new">
              <Plus className="mr-2 size-4" />
              Pachet nou
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            setPageIndex(0);
          }}
          placeholder="Caută după titlu sau descriere"
          className="md:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={activeOnly}
              onCheckedChange={(checked) => {
                setActiveOnly(checked === true);
                setPageIndex(0);
              }}
            />
            <span className="text-sm">Doar active</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={withoutScenariosOnly}
              onCheckedChange={(checked) => {
                setWithoutScenariosOnly(checked === true);
                setPageIndex(0);
              }}
            />
            <span className="text-sm">Fără scenarii</span>
          </div>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titlu</TableHead>
              <TableHead>Mod</TableHead>
              <TableHead>Componente</TableHead>
              <TableHead>Preț total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actualizat</TableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              ["s1", "s2", "s3", "s4"].map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={7}>
                    <div className="grid gap-3 md:grid-cols-7">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-8 w-28 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : visibleItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-sm">
                  Nu există pachete.
                </TableCell>
              </TableRow>
            ) : (
              visibleItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    {item.description ? <div className="text-muted-foreground text-xs">{item.description}</div> : null}
                  </TableCell>
                  <TableCell>
                    {item.mode === "single" ? "Single" : item.mode === "triple" ? "Triple" : "Custom"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.items.map((entry, index) => (
                        <Badge key={`${item.id}-${index}-${entry.productId}`} variant="outline">
                          {formatRole(entry.role)}: {productNameById[entry.productId] ?? entry.productId}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.totalPrice} {item.currency}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Activ" : "Inactiv"}</Badge>
                  </TableCell>
                  <TableCell>{item.updatedAt?.toDate?.().toLocaleString?.() ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={`/dashboard/packages/${item.id}`}>Editează</Link>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(item)}
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

      <div className="flex flex-col gap-3 text-muted-foreground text-sm md:flex-row md:items-center md:justify-between">
        <span>
          Pagina {pageIndex + 1} / {totalPages}
          {isSyncing ? " • se sincronizează..." : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goPrevPage}
            disabled={pageIndex === 0 || isLoading}
            aria-label="Pagina anterioară"
          >
            <ChevronLeft className="size-4" />
          </Button>
          {pageButtons.map((index) => (
            <Button
              key={index}
              type="button"
              variant={index === pageIndex ? "default" : "outline"}
              size="icon"
              onClick={() => setPageIndex(index)}
              disabled={isLoading}
              aria-label={`Pagina ${index + 1}`}
            >
              {index + 1}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goNextPage}
            disabled={pageIndex >= totalPages - 1 || isLoading}
            aria-label="Pagina următoare"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
