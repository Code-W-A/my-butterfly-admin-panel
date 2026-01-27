"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { deleteQuestionnaire, listQuestionnairesPage, toggleQuestionnaireActive } from "@/lib/firestore/questionnaires";
import type { Questionnaire, WithId } from "@/lib/firestore/types";

export default function QuestionnairesPage() {
  const [items, setItems] = useState<WithId<Questionnaire>[]>([]);
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
      const { items: data, cursor: nextCursor } = await listQuestionnairesPage({ pageSize: 20 });
      setItems(data);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
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
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, active } : item)));
    try {
      await toggleQuestionnaireActive(id, active);
    } catch (err) {
      logFirebaseError("Questionnaires: toggleActive", err);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, active: !active } : item)));
    }
  };

  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const { items: data, cursor: nextCursor } = await listQuestionnairesPage({
        pageSize: 20,
        cursor: cursor as never,
      });
      setItems((prev) => [...prev, ...data]);
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
      setIsLoadingMore(false);
    } catch (err) {
      logFirebaseError("Questionnaires: loadMore", err);
      setIsLoadingMore(false);
    }
  };

  const onDelete = async (item: WithId<Questionnaire>) => {
    if (!window.confirm(`Ștergi chestionarul "${item.title}"? Toate întrebările din chestionar vor fi șterse.`)) return;
    try {
      setIsDeleting(item.id);
      await deleteQuestionnaire(item.id);
      setItems((prev) => prev.filter((q) => q.id !== item.id));
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
              <TableHead>Titlu</TableHead>
              <TableHead>Activ</TableHead>
              <TableHead>Actualizat</TableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={4}>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-8 w-28 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-sm">
                  Nu există chestionare create încă.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>
                    <Switch checked={item.active} onCheckedChange={(checked) => onToggle(item.id, checked)} />
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
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" onClick={loadMore} disabled={!hasMore || isLoadingMore}>
          {isLoadingMore ? "Se încarcă..." : hasMore ? "Încarcă mai multe" : "Nu mai sunt rezultate"}
        </Button>
      </div>
    </div>
  );
}
