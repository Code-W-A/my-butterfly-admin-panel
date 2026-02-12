"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { deleteQuestionnaireCompletion, listQuestionnaireCompletionsPage } from "@/lib/firestore/completions";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import type { Questionnaire, QuestionnaireCompletion, WithId } from "@/lib/firestore/types";

type CompletionItem = WithId<QuestionnaireCompletion>;
type PageCacheEntry = {
  items: CompletionItem[];
  nextCursor?: unknown;
};

type DateRange = {
  from?: string;
  to?: string;
};

export default function QuestionnaireCompletionsPage() {
  const [items, setItems] = useState<CompletionItem[]>([]);
  const [questionnaires, setQuestionnaires] = useState<WithId<Questionnaire>[]>([]);
  const [questionnaireId, setQuestionnaireId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [appliedRange, setAppliedRange] = useState<DateRange>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCache, setPageCache] = useState<Record<number, PageCacheEntry>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<
    SortState<"createdAt" | "questionnaire" | "name" | "email" | "user" | "hasRequest" | "productsCount">
  >({ key: "createdAt", dir: "desc" });

  const appliedSince = useMemo(() => {
    if (!appliedRange.from) return undefined;
    return new Date(`${appliedRange.from}T00:00:00.000Z`);
  }, [appliedRange.from]);
  const appliedUntilExclusive = useMemo(() => {
    if (!appliedRange.to) return undefined;
    return new Date(`${appliedRange.to}T00:00:00.000Z`);
  }, [appliedRange.to]);

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

  const loadFirstPage = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const [{ items: data, cursor: nextCursor }, questionnairesData] = await Promise.all([
        listQuestionnaireCompletionsPage({
          questionnaireId: questionnaireId === "all" ? undefined : questionnaireId,
          since: appliedSince,
          untilExclusive: appliedUntilExclusive,
          pageSize: 20,
        }),
        listQuestionnaires(),
      ]);
      const firstPage: PageCacheEntry = { items: data, nextCursor };
      setPageCache({ 0: firstPage });
      setPageIndex(0);
      setItems(data);
      setQuestionnaires(questionnairesData);
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Completions: loadFirstPage", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
    }
  }, [appliedSince, appliedUntilExclusive, questionnaireId]);

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
        const { items: data, cursor: nextCursor } = await listQuestionnaireCompletionsPage({
          questionnaireId: questionnaireId === "all" ? undefined : questionnaireId,
          since: appliedSince,
          untilExclusive: appliedUntilExclusive,
          pageSize: 20,
          cursor: previousPage.nextCursor as never,
        });
        const nextPage: PageCacheEntry = { items: data, nextCursor };
        setPageCache((prev) => ({ ...prev, [targetPage]: nextPage }));
        setPageIndex(targetPage);
        setItems(data);
      } catch (err) {
        logFirebaseError("Completions: goToPage", err);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [appliedSince, appliedUntilExclusive, isLoadingMore, lastLoadedPageIndex, pageCache, questionnaireId],
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

  const questionnaireTitle = useMemo(() => {
    const byId = new Map(questionnaires.map((q) => [q.id, q.title] as const));
    return (item: CompletionItem) =>
      item.questionnaireTitle?.trim() || byId.get(item.questionnaireId) || item.questionnaireId || "—";
  }, [questionnaires]);

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
      if (sort.key === "questionnaire") return dir * questionnaireTitle(a).localeCompare(questionnaireTitle(b));
      if (sort.key === "name") return dir * (a.contact?.name ?? "").localeCompare(b.contact?.name ?? "");
      if (sort.key === "email") return dir * (a.contact?.email ?? "").localeCompare(b.contact?.email ?? "");
      if (sort.key === "user") {
        const aUser = a.user?.isAnonymous ? "Anonim" : (a.user?.email ?? a.contact?.name ?? "Autentificat");
        const bUser = b.user?.isAnonymous ? "Anonim" : (b.user?.email ?? b.contact?.name ?? "Autentificat");
        return dir * aUser.localeCompare(bUser);
      }
      if (sort.key === "hasRequest") {
        return dir * (Number(Boolean(a.specialistRequestId)) - Number(Boolean(b.specialistRequestId)));
      }
      return dir * ((a.matchProductIds?.length ?? 0) - (b.matchProductIds?.length ?? 0));
    });
    return next;
  }, [items, sort, questionnaireTitle]);

  const handleClearFilters = () => {
    setQuestionnaireId("all");
    setDateRange({});
    setAppliedRange({});
  };

  const handleDelete = async (item: CompletionItem) => {
    if (!window.confirm(`Ștergi completarea pentru "${questionnaireTitle(item)}"?`)) return;
    try {
      setIsDeleting(item.id);
      await deleteQuestionnaireCompletion(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      setPageCache((prev) => {
        const next: Record<number, PageCacheEntry> = {};
        Object.entries(prev).forEach(([key, entry]) => {
          const index = Number(key);
          next[index] = {
            ...entry,
            items: entry.items.filter((completion) => completion.id !== item.id),
          };
        });
        return next;
      });
    } catch (err) {
      logFirebaseError("Completions: delete", err);
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Chestionare completate</h1>
          <p className="text-muted-foreground text-sm">
            Istoric completări cu date de contact, răspunsuri și legături către cereri specialist.
          </p>
        </div>
        <div className="flex gap-2">
          <PageHelpDialog helpKey="questionnaire-completions.list" />
          <Button type="button" variant="outline" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? "Se încarcă..." : "Reîmprospătează"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtre</CardTitle>
          <CardDescription>Filtrează completările după chestionar și interval de timp</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="questionnaire-filter">Chestionar</Label>
              <Select value={questionnaireId} onValueChange={(value) => setQuestionnaireId(value)}>
                <SelectTrigger id="questionnaire-filter">
                  <SelectValue placeholder="Toate chestionarele" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate chestionarele</SelectItem>
                  {questionnaires.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-from">De la data</Label>
              <Input
                id="date-from"
                type="date"
                value={dateRange.from ?? ""}
                onChange={(event) => setDateRange((prev) => ({ ...prev, from: event.target.value || undefined }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-to">Până la data</Label>
              <Input
                id="date-to"
                type="date"
                value={dateRange.to ?? ""}
                onChange={(event) => setDateRange((prev) => ({ ...prev, to: event.target.value || undefined }))}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button type="button" onClick={() => setAppliedRange(dateRange)} disabled={isLoading} className="flex-1">
                Aplică filtre
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} disabled={isLoading}>
                Șterge
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="createdAt" sort={sort} onSortChange={setSort}>
                Creat
              </SortableTableHead>
              <SortableTableHead sortKey="questionnaire" sort={sort} onSortChange={setSort}>
                Chestionar
              </SortableTableHead>
              <SortableTableHead sortKey="name" sort={sort} onSortChange={setSort}>
                Nume
              </SortableTableHead>
              <SortableTableHead sortKey="email" sort={sort} onSortChange={setSort}>
                Email
              </SortableTableHead>
              <SortableTableHead sortKey="user" sort={sort} onSortChange={setSort}>
                Utilizator
              </SortableTableHead>
              <SortableTableHead sortKey="hasRequest" sort={sort} onSortChange={setSort}>
                Cerere specialist
              </SortableTableHead>
              <SortableTableHead sortKey="productsCount" sort={sort} onSortChange={setSort}>
                Produse recomandate
              </SortableTableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              ["s1", "s2", "s3", "s4"].map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={8}>
                    <div className="grid gap-3 md:grid-cols-8">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-24 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground text-sm">
                  Nu s-au găsit completări.
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.createdAt ? item.createdAt.toDate().toLocaleString() : "—"}</TableCell>
                  <TableCell className="max-w-[16rem] truncate">{questionnaireTitle(item)}</TableCell>
                  <TableCell>{item.contact?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.contact?.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.user?.isAnonymous ? "Anonim" : (item.user?.email ?? item.contact?.name ?? "Autentificat")}
                  </TableCell>
                  <TableCell>{item.specialistRequestId ? "Da" : "—"}</TableCell>
                  <TableCell>{item.matchProductIds?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={`/dashboard/questionnaire-completions/${item.id}`}>Vezi</Link>
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
