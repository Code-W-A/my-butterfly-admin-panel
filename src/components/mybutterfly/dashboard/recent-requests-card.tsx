"use client";

import * as React from "react";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo } from "@/lib/firebase/error-utils.client";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listSpecialistRequestsPage } from "@/lib/firestore/requests";
import type { Questionnaire, SpecialistRequest, WithId } from "@/lib/firestore/types";

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

export function RecentRequestsCard({
  pageSize = 8,
  status = "new",
}: {
  pageSize?: number;
  status?: SpecialistRequest["status"];
}) {
  const [items, setItems] = React.useState<RequestItem[]>([]);
  const [questionnaires, setQuestionnaires] = React.useState<WithId<Questionnaire>[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const [{ items: data }, questionnairesData] = await Promise.all([
          listSpecialistRequestsPage({
            status,
            pageSize,
          }),
          listQuestionnaires(),
        ]);
        setItems(data);
        setQuestionnaires(questionnairesData);
        setIsLoading(false);
      } catch (err) {
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setItems([]);
        setQuestionnaires([]);
        setIsLoading(false);
      }
    };
    load();
  }, [pageSize, status]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Cereri recente</CardTitle>
        <CardDescription>
          {error ? (
            <span className="text-destructive">Eroare: {error}</span>
          ) : (
            `Ultimele ${pageSize} cereri (${formatStatus(status)}).`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Chestionar</TableHead>
                <TableHead>Nume</TableHead>
                <TableHead>Telefon / Email</TableHead>
                <TableHead className="text-right">Detalii</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-sm">
                    Se încarcă cererile...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-sm">
                    Nu s-au găsit cereri.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={`${item.userId}-${item.id}`}>
                    <TableCell>{item.createdAt ? item.createdAt.toDate().toLocaleString("ro-RO") : "—"}</TableCell>
                    <TableCell className="capitalize">{formatStatus(item.status)}</TableCell>
                    <TableCell className="max-w-[14rem] truncate">
                      {questionnaires.find((q) => q.id === item.questionnaireId)?.title ?? item.questionnaireId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate">
                      {item.contact?.name ? <div className="font-medium text-sm">{item.contact.name}</div> : "—"}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-muted-foreground text-sm">
                      {item.contact?.phone ?? item.contact?.email ?? "—"}
                    </TableCell>
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
        <div className="mt-3 flex items-center justify-end text-sm">
          <Link className="text-primary underline-offset-4 hover:underline" href="/dashboard/requests">
            Vezi toate cererile
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
