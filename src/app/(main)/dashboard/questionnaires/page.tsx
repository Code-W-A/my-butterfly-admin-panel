"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import {
  deleteQuestionnaire,
  listQuestionnairesPage,
  setQuestionnaireRecommended,
  toggleQuestionnaireActive,
} from "@/lib/firestore/questionnaires";
import type { Questionnaire, WithId } from "@/lib/firestore/types";

type PageCacheEntry = {
  items: WithId<Questionnaire>[];
  nextCursor?: unknown;
};

const isRecommendedQuestionnaire = (item: WithId<Questionnaire>) =>
  typeof item.isRecommend === "boolean" ? item.isRecommend : Boolean(item.isRecommed);

export default function QuestionnairesPage() {
  const [items, setItems] = useState<WithId<Questionnaire>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCache, setPageCache] = useState<Record<number, PageCacheEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<"title" | "active" | "updatedAt">>({ key: "updatedAt", dir: "desc" });

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
      if (sort.key === "title") return dir * a.title.localeCompare(b.title);
      if (sort.key === "active") return dir * (Number(a.active) - Number(b.active));
      const aTime = a.updatedAt ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt ? b.updatedAt.toMillis() : 0;
      return dir * (aTime - bTime);
    });
    return next;
  }, [items, sort]);

  const loadFirstPage = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const { items: data, cursor: nextCursor } = await listQuestionnairesPage({ pageSize: 20 });
      const firstPage: PageCacheEntry = { items: data, nextCursor };
      setPageCache({ 0: firstPage });
      setPageIndex(0);
      setItems(data);
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Questionnaires: loadFirstPage", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const onToggle = async (id: string, active: boolean) => {
    const applyToggle = (value: boolean) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, active: value } : item)));
      setPageCache((prev) => {
        const next: Record<number, PageCacheEntry> = {};
        Object.entries(prev).forEach(([key, entry]) => {
          const index = Number(key);
          next[index] = {
            ...entry,
            items: entry.items.map((item) => (item.id === id ? { ...item, active: value } : item)),
          };
        });
        return next;
      });
    };
    applyToggle(active);
    try {
      await toggleQuestionnaireActive(id, active);
    } catch (err) {
      logFirebaseError("Questionnaires: toggleActive", err);
      applyToggle(!active);
    }
  };

  const onToggleRecommended = async (id: string, recommended: boolean) => {
    const previousItems = items;
    const previousPageCache = pageCache;

    const patchItems = (entryItems: WithId<Questionnaire>[]) =>
      entryItems.map((item) => {
        if (recommended) {
          return { ...item, isRecommend: item.id === id };
        }
        return item.id === id ? { ...item, isRecommend: false } : item;
      });

    setItems((prev) => patchItems(prev));
    setPageCache((prev) => {
      const next: Record<number, PageCacheEntry> = {};
      Object.entries(prev).forEach(([key, entry]) => {
        const index = Number(key);
        next[index] = {
          ...entry,
          items: patchItems(entry.items),
        };
      });
      return next;
    });

    try {
      await setQuestionnaireRecommended(id, recommended);
    } catch (err) {
      logFirebaseError("Questionnaires: toggleRecommended", err);
      setItems(previousItems);
      setPageCache(previousPageCache);
    }
  };

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
        const { items: data, cursor: nextCursor } = await listQuestionnairesPage({
          pageSize: 20,
          cursor: previousPage.nextCursor as never,
        });
        const nextPage: PageCacheEntry = { items: data, nextCursor };
        setPageCache((prev) => ({ ...prev, [targetPage]: nextPage }));
        setPageIndex(targetPage);
        setItems(data);
      } catch (err) {
        logFirebaseError("Questionnaires: goToPage", err);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [isLoadingMore, lastLoadedPageIndex, pageCache],
  );

  const goPrevPage = () => {
    if (pageIndex <= 0) return;
    void goToPage(pageIndex - 1);
  };

  const goNextPage = () => {
    if (!hasNextPage) return;
    void goToPage(pageIndex + 1);
  };

  const onDelete = async (item: WithId<Questionnaire>) => {
    if (!window.confirm(`Ștergi chestionarul "${item.title}"? Toate întrebările din chestionar vor fi șterse.`)) return;
    try {
      setIsDeleting(item.id);
      await deleteQuestionnaire(item.id);
      setItems((prev) => prev.filter((q) => q.id !== item.id));
      setPageCache((prev) => {
        const next: Record<number, PageCacheEntry> = {};
        Object.entries(prev).forEach(([key, entry]) => {
          const index = Number(key);
          next[index] = {
            ...entry,
            items: entry.items.filter((questionnaire) => questionnaire.id !== item.id),
          };
        });
        return next;
      });
    } catch (err) {
      logFirebaseError("Questionnaires: delete", err);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Chestionare</h1>
          <p className="text-muted-foreground text-sm">Gestionează chestionarele și întrebările lor.</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="questionnaires.list" />
          <Button type="button" variant="outline" onClick={loadFirstPage} disabled={isLoading}>
            Reîmprospătează
          </Button>
          <Button asChild>
            <Link prefetch={false} href="/dashboard/questionnaires/new" data-tour="questionnaires-create-button">
              Creează chestionar
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="title" sort={sort} onSortChange={setSort}>
                Titlu
              </SortableTableHead>
              <SortableTableHead sortKey="active" sort={sort} onSortChange={setSort}>
                Activ
              </SortableTableHead>
              <TableHead>Recomandat</TableHead>
              <SortableTableHead sortKey="updatedAt" sort={sort} onSortChange={setSort}>
                Actualizat
              </SortableTableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              ["s1", "s2", "s3", "s4", "s5", "s6"].map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={5}>
                    <div className="grid gap-3 md:grid-cols-5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-28 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                  Nu există chestionare create încă.
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>
                    <Switch checked={item.active} onCheckedChange={(checked) => onToggle(item.id, checked)} />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={isRecommendedQuestionnaire(item)}
                      onCheckedChange={(checked) => void onToggleRecommended(item.id, checked)}
                    />
                  </TableCell>
                  <TableCell>{item.updatedAt ? item.updatedAt.toDate().toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="outline" size="sm" disabled={isDeleting === item.id}>
                        <Link
                          prefetch={false}
                          href={`/dashboard/questionnaires/${item.id}`}
                          data-tour="questionnaires-edit-button"
                        >
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
