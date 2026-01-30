"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { deleteProductWithImages, listProductsPage } from "@/lib/firestore/products";
import type { Product, WithId } from "@/lib/firestore/types";

const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5", "s6"];

export default function ProductsPage() {
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
              <TableHead>Nume</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Preț</TableHead>
              <TableHead>Activ</TableHead>
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
              visibleItems.map((item) => (
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
    </div>
  );
}
