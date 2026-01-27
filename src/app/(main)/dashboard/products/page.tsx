"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { deleteProductWithImages, listProductsPage } from "@/lib/firestore/products";
import type { Product, WithId } from "@/lib/firestore/types";

export default function ProductsPage() {
  const [items, setItems] = useState<WithId<Product>[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [activeOnly, setActiveOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<unknown | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const { items: data, cursor: nextCursor } = await listProductsPage({ pageSize: 20, activeOnly });
      setItems(data);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Products: loadFirstPage", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
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

  const visibleItems = debouncedSearch.trim()
    ? items.filter((product) => {
        const normalized = debouncedSearch.trim().toLowerCase();
        const name = product.name?.toLowerCase() ?? "";
        const brand = product.brand?.toLowerCase() ?? "";
        return name.includes(normalized) || brand.includes(normalized);
      })
    : items;

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
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
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
              Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
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
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>Se afișează rezultatele din pagina curentă.</span>
        <Button type="button" variant="outline" onClick={loadMore} disabled={!hasMore || isLoadingMore}>
          {isLoadingMore ? "Se încarcă..." : hasMore ? "Încarcă mai multe" : "Nu mai sunt rezultate"}
        </Button>
      </div>
    </div>
  );
}
