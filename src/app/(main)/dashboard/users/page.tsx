"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import type { UserProfile, WithId } from "@/lib/firestore/types";
import { listUsersPage } from "@/lib/firestore/users";

type PageCacheEntry = {
  items: WithId<UserProfile>[];
  nextCursor?: unknown;
};

const displayUserName = (user: WithId<UserProfile>) => {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (full) return full;
  if (user.displayName?.trim()) return user.displayName.trim();
  return user.id;
};

const hasAnyEquipmentSet = (user: WithId<UserProfile>) =>
  Boolean(user.equipment?.blade || user.equipment?.forehand || user.equipment?.backhand);

const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (typeof value === "object" && value !== null) {
    if ("toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
      return Number((value as { toMillis: () => number }).toMillis()) || 0;
    }
    if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isFinite(date.getTime()) ? date.getTime() : 0;
    }
    const seconds = (value as { seconds?: unknown }).seconds;
    if (typeof seconds === "number") return Math.floor(seconds * 1000);
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatDateTime = (value: unknown) => {
  const millis = toMillis(value);
  return millis > 0 ? new Date(millis).toLocaleString() : "—";
};

export default function UsersPage() {
  const [items, setItems] = useState<WithId<UserProfile>[]>([]);
  const [pageCache, setPageCache] = useState<Record<number, PageCacheEntry>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyWithEquipment, setOnlyWithEquipment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<"name" | "email" | "updatedAt">>({
    key: "updatedAt",
    dir: "desc",
  });

  const loadedPageIndexes = useMemo(
    () =>
      Object.keys(pageCache)
        .map(Number)
        .sort((a, b) => a - b),
    [pageCache],
  );
  const lastLoadedPageIndex = loadedPageIndexes.length ? loadedPageIndexes[loadedPageIndexes.length - 1] : 0;
  const currentPage = pageCache[pageIndex];
  const hasNextPage = Boolean(pageCache[pageIndex + 1]) || Boolean(currentPage?.nextCursor);

  const pageButtons = useMemo(() => {
    const base = loadedPageIndexes.length ? [...loadedPageIndexes] : [0];
    const maxIndex = base[base.length - 1] ?? 0;
    if (pageCache[maxIndex]?.nextCursor && !base.includes(maxIndex + 1)) base.push(maxIndex + 1);
    return base;
  }, [loadedPageIndexes, pageCache]);

  const loadFirstPage = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const { items: data, cursor: nextCursor } = await listUsersPage({ pageSize: 20 });
      const firstPage: PageCacheEntry = { items: data, nextCursor };
      setPageCache({ 0: firstPage });
      setPageIndex(0);
      setItems(data);
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Users: loadFirstPage", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const goToPage = useCallback(
    async (targetPage: number) => {
      if (targetPage < 0 || isLoadingMore) return;
      const cachedPage = pageCache[targetPage];
      if (cachedPage) {
        setPageIndex(targetPage);
        setItems(cachedPage.items);
        return;
      }
      if (targetPage !== lastLoadedPageIndex + 1) return;
      const previousPage = pageCache[targetPage - 1];
      if (!previousPage?.nextCursor) return;
      try {
        setIsLoadingMore(true);
        const { items: data, cursor: nextCursor } = await listUsersPage({
          pageSize: 20,
          cursor: previousPage.nextCursor as never,
        });
        const nextPage: PageCacheEntry = { items: data, nextCursor };
        setPageCache((prev) => ({ ...prev, [targetPage]: nextPage }));
        setPageIndex(targetPage);
        setItems(data);
      } catch (err) {
        logFirebaseError("Users: goToPage", err);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [isLoadingMore, lastLoadedPageIndex, pageCache],
  );

  const sortedAndFilteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const bySearch = normalizedSearch
      ? items.filter((item) => {
          const fullName = `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim();
          const haystack =
            `${item.id} ${item.displayName ?? ""} ${fullName} ${item.email ?? ""} ${item.phone ?? ""} ${item.language ?? ""}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : items;
    const filtered = onlyWithEquipment ? bySearch.filter((item) => hasAnyEquipmentSet(item)) : bySearch;

    if (!sort) return filtered;
    const next = [...filtered];
    const dir = sort.dir === "desc" ? -1 : 1;
    next.sort((a, b) => {
      if (sort.key === "name") return dir * displayUserName(a).localeCompare(displayUserName(b));
      if (sort.key === "email") return dir * String(a.email ?? "").localeCompare(String(b.email ?? ""));
      const aTime = toMillis(a.updatedAt ?? a.createdAt);
      const bTime = toMillis(b.updatedAt ?? b.createdAt);
      return dir * (aTime - bTime);
    });
    return next;
  }, [items, onlyWithEquipment, search, sort]);

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
          <h1 className="font-semibold text-2xl">Utilizatori</h1>
          <p className="text-muted-foreground text-sm">Editează profilul și echipamentul (lemn/forehand/rever).</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="users" />
          <Button type="button" variant="outline" onClick={loadFirstPage} disabled={isLoading}>
            Reîmprospătează
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="max-w-sm">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută utilizator..." />
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className="text-sm">Doar cu echipament setat</span>
          <Switch checked={onlyWithEquipment} onCheckedChange={setOnlyWithEquipment} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" sort={sort} onSortChange={setSort}>
                Utilizator
              </SortableTableHead>
              <TableHead>Display name</TableHead>
              <SortableTableHead sortKey="email" sort={sort} onSortChange={setSort}>
                Email
              </SortableTableHead>
              <TableHead>Telefon / Limbă</TableHead>
              <SortableTableHead sortKey="updatedAt" sort={sort} onSortChange={setSort}>
                Actualizat
              </SortableTableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              ["s1", "s2", "s3", "s4", "s5"].map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={6}>
                    <div className="grid gap-3 md:grid-cols-6">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-24 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : sortedAndFilteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-sm">
                  Nu există utilizatori pe această pagină.
                </TableCell>
              </TableRow>
            ) : (
              sortedAndFilteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <div>{displayUserName(item)}</div>
                    <div className="text-muted-foreground text-xs">{item.id}</div>
                  </TableCell>
                  <TableCell>{item.displayName || "—"}</TableCell>
                  <TableCell>{item.email || "—"}</TableCell>
                  <TableCell>
                    <div>{item.phone || "—"}</div>
                    <div className="text-muted-foreground text-xs">{item.language || "—"}</div>
                  </TableCell>
                  <TableCell>{formatDateTime(item.updatedAt ?? item.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link prefetch={false} href={`/dashboard/users/${item.id}`}>
                        Editează
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-muted-foreground text-sm md:flex-row md:items-center md:justify-between">
        <span>
          Pagina {pageIndex + 1}
          {isLoadingMore ? " • se încarcă..." : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void goToPage(pageIndex - 1)}
            disabled={pageIndex === 0 || isLoadingMore}
            aria-label="Pagina anterioară"
          >
            <ChevronLeft className="size-4" />
          </Button>
          {pageButtons.map((index) => {
            const isLoaded = Boolean(pageCache[index]);
            return (
              <Button
                key={index}
                type="button"
                variant={index === pageIndex ? "default" : "outline"}
                size="icon"
                onClick={() => void goToPage(index)}
                disabled={isLoadingMore || (!isLoaded && index !== lastLoadedPageIndex + 1)}
                aria-label={`Pagina ${index + 1}`}
              >
                {index + 1}
              </Button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void goToPage(pageIndex + 1)}
            disabled={!hasNextPage || isLoadingMore}
            aria-label="Pagina următoare"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
