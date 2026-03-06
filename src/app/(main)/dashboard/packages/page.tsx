"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { deletePackage, listPackages } from "@/lib/firestore/packages";
import { getProductsByIds } from "@/lib/firestore/products";
import type { RecommendationPackage, WithId } from "@/lib/firestore/types";

const formatRole = (role?: string) => {
  if (role === "single") return "Produs";
  if (role === "blade") return "Lemn";
  if (role === "forehand" || role === "rubber_fh") return "Forehand";
  if (role === "backhand" || role === "rubber_bh") return "Rever";
  return "Fără rol";
};

export default function PackagesPage() {
  const [items, setItems] = useState<WithId<RecommendationPackage>[]>([]);
  const [productNameById, setProductNameById] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await listPackages({ activeOnly });
      setItems(data);
      const uniqueProductIds = Array.from(new Set(data.flatMap((item) => item.items.map((entry) => entry.productId))));
      if (uniqueProductIds.length === 0) {
        setProductNameById({});
      } else {
        const products = await getProductsByIds(uniqueProductIds);
        setProductNameById(Object.fromEntries(products.map((product) => [product.id, product.name])));
      }
    } catch (err) {
      logFirebaseError("Packages: load", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Încărcarea pachetelor a eșuat.");
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = `${item.title} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, search]);

  const handleDelete = async (item: WithId<RecommendationPackage>) => {
    if (!window.confirm(`Ștergi pachetul "${item.title}"?`)) return;
    try {
      setIsDeleting(item.id);
      await deletePackage(item.id);
      await load();
    } catch (err) {
      logFirebaseError("Packages: delete", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Ștergerea pachetului a eșuat.");
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
          <h1 className="font-semibold text-2xl">Pachete</h1>
          <p className="text-muted-foreground text-sm">Gestionează pachetele folosite în recomandări.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={load} disabled={isLoading}>
            {isLoading ? "Se încarcă..." : "Reîmprospătează"}
          </Button>
          <Button asChild>
            <Link href="/dashboard/packages/new">
              <Plus className="mr-2 size-4" />
              Pachet nou
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Caută după titlu sau descriere"
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
              <TableHead>Titlu</TableHead>
              <TableHead>Mod</TableHead>
              <TableHead>Componente</TableHead>
              <TableHead>Preț total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actualizat</TableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              ["s1", "s2", "s3", "s4"].map((rowId) => (
                <TableRow key={rowId}>
                  <TableCell colSpan={7}>
                    <div className="grid gap-3 md:grid-cols-7">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-8 w-28 justify-self-end" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground text-sm">
                  Nu există pachete.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    {item.description ? <div className="text-muted-foreground text-xs">{item.description}</div> : null}
                  </TableCell>
                  <TableCell>
                    {item.mode === "single" ? "Single" : item.mode === "triple" ? "Triple" : "Custom"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.items.map((entry, index) => (
                        <Badge key={`${item.id}-${index}-${entry.productId}`} variant="outline">
                          {formatRole(entry.role)}: {productNameById[entry.productId] ?? entry.productId}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.totalPrice} {item.currency}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Activ" : "Inactiv"}</Badge>
                  </TableCell>
                  <TableCell>{item.updatedAt?.toDate?.().toLocaleString?.() ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild type="button" variant="outline" size="sm">
                        <Link href={`/dashboard/packages/${item.id}`}>Editează</Link>
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
    </div>
  );
}
