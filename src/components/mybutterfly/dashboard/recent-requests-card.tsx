"use client";

import * as React from "react";

import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo } from "@/lib/firebase/error-utils.client";
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

export function RecentRequestsCard({
  pageSize = 8,
  status = "new",
}: {
  pageSize?: number;
  status?: SpecialistRequest["status"];
}) {
  const [items, setItems] = React.useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const { items: data } = await listSpecialistRequestsPage({
          status,
          pageSize,
        });
        setItems(data);
        setIsLoading(false);
      } catch (err) {
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setItems([]);
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
                <TableHead>Utilizator</TableHead>
                <TableHead className="text-right">Detalii</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    Se încarcă cererile...
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    Nu s-au găsit cereri.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={`${item.userId}-${item.id}`}>
                    <TableCell>{item.createdAt ? item.createdAt.toDate().toLocaleString("ro-RO") : "—"}</TableCell>
                    <TableCell className="capitalize">{formatStatus(item.status)}</TableCell>
                    <TableCell className="max-w-[14rem] truncate">{item.questionnaireId}</TableCell>
                    <TableCell className="max-w-[14rem] truncate">{item.userId}</TableCell>
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
