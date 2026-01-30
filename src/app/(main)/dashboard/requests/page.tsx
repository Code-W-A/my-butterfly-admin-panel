"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getQuestionnaire, listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listSpecialistRequestsPage } from "@/lib/firestore/requests";
import type { SpecialistRequest, WithId } from "@/lib/firestore/types";

type RequestItem = WithId<SpecialistRequest> & { userId: string };

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
  const [cursor, setCursor] = useState<unknown | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFirstPage = async () => {
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
        setItems(data);
        setCursor(nextCursor);
        setHasMore(Boolean(nextCursor));
        setQuestionnaireTitles(Object.fromEntries(questionnairesData.map((q) => [q.id, q.title])));
        setIsLoading(false);
      } catch (err) {
        logFirebaseError("Requests: loadFirstPage", err);
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setIsLoading(false);
      }
    };
    loadFirstPage();
  }, [statusFilter]);

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const { items: data, cursor: nextCursor } = await listSpecialistRequestsPage({
        status: statusFilter === "all" ? undefined : statusFilter,
        pageSize: 20,
        cursor: cursor as never,
      });
      setItems((prev) => [...prev, ...data]);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setIsLoadingMore(false);
    } catch (err) {
      logFirebaseError("Requests: loadMore", err);
      setIsLoadingMore(false);
    }
  };

  const handleRefresh = async () => {
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
      setItems(data);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setQuestionnaireTitles(Object.fromEntries(questionnairesData.map((q) => [q.id, q.title])));
      setIsLoading(false);
    } catch (err) {
      logFirebaseError("Requests: refresh", err);
      const info = getFirebaseErrorInfo(err);
      setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
      setIsLoading(false);
    }
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
              <TableHead>Creat</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Chestionar</TableHead>
              <TableHead>Nume</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Detalii</TableHead>
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
                      <Skeleton className="h-4 w-16 justify-self-end" />
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
              items.map((item) => (
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
                    <Link
                      className="text-primary underline-offset-4 hover:underline"
                      href={`/dashboard/requests/${item.id}`}
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
