"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { PackageForm } from "@/components/mybutterfly/packages/package-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getPackage, updatePackage } from "@/lib/firestore/packages";
import { listProducts } from "@/lib/firestore/products";
import type { Product, RecommendationPackage, WithId } from "@/lib/firestore/types";

export default function PackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const packageId = params.id as string;

  const [item, setItem] = useState<WithId<RecommendationPackage> | null>(null);
  const [products, setProducts] = useState<WithId<Product>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [packageData, productsData] = await Promise.all([getPackage(packageId), listProducts()]);
        setItem(packageData);
        setProducts(productsData);
      } catch (err) {
        logFirebaseError("Packages/Detail: load", err);
        const info = getFirebaseErrorInfo(err);
        setError(info.message || "Nu pot încărca pachetul.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [packageId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-2">
        <div className="text-muted-foreground">Pachetul nu a fost găsit.</div>
        <Link className="text-primary underline-offset-4 hover:underline" href="/dashboard/packages">
          Înapoi la listă
        </Link>
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
        <h1 className="font-semibold text-2xl">Editează pachetul</h1>
        <p className="text-muted-foreground text-sm">Actualizează componentele și scenariile de recomandare.</p>
      </div>
      <PackageForm
        products={products}
        initialValues={item}
        onSubmit={async (values) => {
          await updatePackage(packageId, values);
          router.push("/dashboard/packages");
        }}
        onCancel={() => router.push("/dashboard/packages")}
      />
    </div>
  );
}
