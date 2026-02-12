"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getQuestionnaire, listQuestionnaires } from "@/lib/firestore/questionnaires";
import { deleteSpecialistRequest, listSpecialistRequestsPage } from "@/lib/firestore/requests";
import type { Questionnaire, SpecialistRequest, WithId } from "@/lib/firestore/types";

type RequestItem = WithId<SpecialistRequest> & { userId: string };
type PageCacheEntry = {
  items: RequestItem[];
  nextCursor?: unknown;
};

const formatStatus = (status: SpecialistRequest["status"]) => {
  switch (status) {
    case "new":
      return "nou";
    case "in_progress":
      return "în lucru";
    case "sent":
      return "trimis";
  }
};

export default function RequestsPage() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [questionnaireTitles, setQuestionnaireTitles] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | SpecialistRequest["status"]>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCache, setPageCache] = useState<Record<number, PageCacheEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<"createdAt" | "status" | "questionnaire" | "name" | "phone" | "email">>({
    key: "createdAt",
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
    if (pageCache[maxIndex]?.nextCursor && !base.includes(maxIndex + 1)) {
      base.push(maxIndex + 1);
    }
    return base;
  }, [loadedPageIndexes, pageCache]);

  const sortedItems = useMemo(() => {
    const next = [...items];
    const dir = sort?.dir === "desc" ? -1 : 1;
    next.sort((a, b) => {
      if (!sort) return 0;
      if (sort.key === "createdAt") {
        const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
        return dir * (aTime - bTime);
      }
      if (sort.key === "status") return dir * formatStatus(a.status).localeCompare(formatStatus(b.status));
      if (sort.key === "questionnaire")
        return (
          dir *
          (questionnaireTitles[a.questionnaireId] ?? "").localeCompare(questionnaireTitles[b.questionnaireId] ?? "")
        );
      if (sort.key === "name") return dir * (a.contact?.name ?? "").localeCompare(b.contact?.name ?? "");
      if (sort.key === "phone") return dir * (a.contact?.phone ?? "").localeCompare(b.contact?.phone ?? "");
      return dir * (a.contact?.email ?? "").localeCompare(b.contact?.email ?? "");
    });
    return next;
  }, [items, questionnaireTitles, sort]);

  const loadFirstPage = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const [{ items: data, cursor: nextCursor }, questionnairesData] = await Promise.all([
        listSpecialistRequestsPage({
          status: statusFilter === "all" ? undefined : statusFilter,
          pageSize: 20,
        }),
        listQuestionnaires(),
      ]);
      const firstPage: PageCacheEntry = { items: data, nextCursor };
      setPageCache({ 0: firstPage });
      setPageIndex(0);
      setItems(data);
      setQuestionnaireTitles(Object.fromEntries(questionnairesData.map((q) => [q.id, q.title])));
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Requests: loadFirstPage", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadFirstPage();
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
        const { items: data, cursor: nextCursor } = await listSpecialistRequestsPage({
          status: statusFilter === "all" ? undefined : statusFilter,
          pageSize: 20,
          cursor: previousPage.nextCursor as never,
        });
        const nextPage: PageCacheEntry = { items: data, nextCursor };
        setPageCache((prev) => ({ ...prev, [targetPage]: nextPage }));
        setPageIndex(targetPage);
        setItems(data);
      } catch (err) {
        logFirebaseError("Requests: goToPage", err);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [isLoadingMore, lastLoadedPageIndex, pageCache, statusFilter],
  );

  const goPrevPage = () => {
    if (pageIndex <= 0) return;
    void goToPage(pageIndex - 1);
  };

  const goNextPage = () => {
    if (!hasNextPage) return;
    void goToPage(pageIndex + 1);
  };

  const handleRefresh = async () => {
    await loadFirstPage();
  };

  useEffect(() => {
    const missingIds = Array.from(
      new Set(items.map((item) => item.questionnaireId).filter((id) => id && !questionnaireTitles[id])),
    );
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map((id) => getQuestionnaire(id)))
      .then((results) => {
        const resolved = results.filter(Boolean) as WithId<Questionnaire>[];
        if (resolved.length === 0) return;
        setQuestionnaireTitles((prev) => ({
          ...prev,
          ...Object.fromEntries(resolved.map((q) => [q.id, q.title])),
        }));
      })
      .catch(() => {
        // ignore missing/unauthorized questionnaires
      });
  }, [items, questionnaireTitles]);

  const handleDelete = async (item: RequestItem) => {
    if (!window.confirm("Ștergi cererea?")) return;
    try {
      setIsDeleting(item.id);
      await deleteSpecialistRequest(item.userId, item.id);
      setItems((prev) => prev.filter((entry) => !(entry.id === item.id && entry.userId === item.userId)));
      setPageCache((prev) => {
        const next: Record<number, PageCacheEntry> = {};
        Object.entries(prev).forEach(([key, entry]) => {
          const index = Number(key);
          next[index] = {
            ...entry,
            items: entry.items.filter((request) => !(request.id === item.id && request.userId === item.userId)),
          };
        });
        return next;
      });
    } catch (err) {
      logFirebaseError("Requests: delete", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
    } finally {
      setIsDeleting(null);
    }
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
          <h1 className="font-semibold text-2xl">Cereri către specialist</h1>
          <p className="text-muted-foreground text-sm">Revizuiește și răspunde cererilor venite de la utilizatori.</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="requests.list" />
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? "Se încarcă..." : "Reîmprospătează"}
          </Button>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            disabled={isLoading}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filtru status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="new">Noi</SelectItem>
              <SelectItem value="in_progress">În lucru</SelectItem>
              <SelectItem value="sent">Trimise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="createdAt" sort={sort} onSortChange={setSort}>
                Creat
              </SortableTableHead>
              <SortableTableHead sortKey="status" sort={sort} onSortChange={setSort}>
                Status
              </SortableTableHead>
              <SortableTableHead sortKey="questionnaire" sort={sort} onSortChange={setSort}>
                Chestionar
              </SortableTableHead>
              <SortableTableHead sortKey="name" sort={sort} onSortChange={setSort}>
                Nume
              </SortableTableHead>
              <SortableTableHead sortKey="phone" sort={sort} onSortChange={setSort}>
                Telefon
              </SortableTableHead>
              <SortableTableHead sortKey="email" sort={sort} onSortChange={setSort}>
                Email
              </SortableTableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              ["s1", "s2", "s3", "s4", "s5", "s6"].map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={7}>
                    <div className="grid gap-3 md:grid-cols-7">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-8 w-24 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-sm">
                  Nu s-au găsit cereri.
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => (
                <TableRow key={`${item.userId}-${item.id}`}>
                  <TableCell>{item.createdAt ? item.createdAt.toDate().toLocaleString() : "—"}</TableCell>
                  <TableCell className="capitalize">{formatStatus(item.status)}</TableCell>
                  <TableCell>{questionnaireTitles[item.questionnaireId] ?? "—"}</TableCell>
                  <TableCell>
                    {item.contact?.name ? <div className="font-medium text-sm">{item.contact.name}</div> : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.contact?.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.contact?.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={`/dashboard/requests/${item.id}`}>Vezi</Link>
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
          Pagina {pageIndex + 1}
          {isLoadingMore ? " • se încarcă..." : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goPrevPage}
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
            onClick={goNextPage}
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
