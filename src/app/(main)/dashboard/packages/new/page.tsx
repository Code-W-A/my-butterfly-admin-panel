"use client";

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { PackageForm } from "@/components/mybutterfly/packages/package-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { createPackage } from "@/lib/firestore/packages";
import { listProducts } from "@/lib/firestore/products";
import type { Product, WithId } from "@/lib/firestore/types";

export default function NewPackagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<WithId<Product>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const presetImportRuleId = searchParams.get("importRuleId");

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const productsData = await listProducts();
        setProducts(productsData);
      } catch (err) {
        logFirebaseError("Packages/New: load", err);
        const info = getFirebaseErrorInfo(err);
        setError(info.message || "Nu pot încărca produsele.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <div className="font-semibold">Eroare</div>
          <div className="text-muted-foreground">{error}</div>
        </div>
      ) : null}
      <div>
        <h1 className="font-semibold text-2xl">Creează pachet</h1>
        <p className="text-muted-foreground text-sm">Adaugă un pachet nou pentru recomandări.</p>
      </div>
      <PackageForm
        products={products}
        defaultMode="custom"
        presetImportRuleId={presetImportRuleId}
        onSubmit={async (values) => {
          await createPackage(values);
          router.push("/dashboard/packages");
        }}
        onCancel={() => router.push("/dashboard/packages")}
      />
    </div>
  );
}
