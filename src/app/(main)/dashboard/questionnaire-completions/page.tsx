"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { listQuestionnaireCompletionsPage } from "@/lib/firestore/completions";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import type { Questionnaire, QuestionnaireCompletion, WithId } from "@/lib/firestore/types";

type CompletionItem = WithId<QuestionnaireCompletion>;

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
  const [cursor, setCursor] = useState<unknown | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appliedSince = useMemo(() => {
    if (!appliedRange.from) return undefined;
    return new Date(`${appliedRange.from}T00:00:00.000Z`);
  }, [appliedRange.from]);
  const appliedUntilExclusive = useMemo(() => {
    if (!appliedRange.to) return undefined;
    return new Date(`${appliedRange.to}T00:00:00.000Z`);
  }, [appliedRange.to]);

  useEffect(() => {
    const loadFirstPage = async () => {
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
        setItems(data);
        setCursor(nextCursor);
        setHasMore(Boolean(nextCursor));
        setQuestionnaires(questionnairesData);
        setIsLoading(false);
      } catch (err) {
        logFirebaseError("Completions: loadFirstPage", err);
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setIsLoading(false);
      }
    };
    loadFirstPage();
  }, [questionnaireId, appliedSince, appliedUntilExclusive]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const { items: data, cursor: nextCursor } = await listQuestionnaireCompletionsPage({
        questionnaireId: questionnaireId === "all" ? undefined : questionnaireId,
        since: appliedSince,
        untilExclusive: appliedUntilExclusive,
        pageSize: 20,
        cursor: cursor as never,
      });
      setItems((prev) => [...prev, ...data]);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setIsLoadingMore(false);
    } catch (err) {
      logFirebaseError("Completions: loadMore", err);
      setIsLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
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
      setItems(data);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setQuestionnaires(questionnairesData);
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Completions: refresh", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
    }
  };

  const questionnaireTitle = (id?: string) => questionnaires.find((q) => q.id === id)?.title ?? id ?? "—";

  const handleClearFilters = () => {
    setQuestionnaireId("all");
    setDateRange({});
    setAppliedRange({});
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
          <PageHelpDialog helpKey="requests.list" />
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
              <TableHead>Creat</TableHead>
              <TableHead>Chestionar</TableHead>
              <TableHead>Nume</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Utilizator</TableHead>
              <TableHead>Cerere specialist</TableHead>
              <TableHead>Produse recomandate</TableHead>
              <TableHead className="text-right">Detalii</TableHead>
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
                      <Skeleton className="h-4 w-16 justify-self-end" />
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
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.createdAt ? item.createdAt.toDate().toLocaleString() : "—"}</TableCell>
                  <TableCell className="max-w-[16rem] truncate">{questionnaireTitle(item.questionnaireId)}</TableCell>
                  <TableCell>{item.contact?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.contact?.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.user?.isAnonymous ? "Anonymous" : (item.user?.uid ?? "—")}
                  </TableCell>
                  <TableCell>{item.specialistRequestId ? "Da" : "—"}</TableCell>
                  <TableCell>{item.matchProductIds?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      href={`/dashboard/questionnaire-completions/${item.id}`}
                    >
                      Vezi
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" onClick={loadMore} disabled={!hasMore || isLoadingMore}>
          {isLoadingMore ? "Se încarcă..." : hasMore ? "Încarcă mai multe" : "Nu mai sunt rezultate"}
        </Button>
      </div>
    </div>
  );
}
