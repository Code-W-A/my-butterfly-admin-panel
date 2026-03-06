"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { PackageForm } from "@/components/mybutterfly/packages/package-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getPackageFromServer, updatePackage, updatePackageRecommendationScenarios } from "@/lib/firestore/packages";
import { listProducts } from "@/lib/firestore/products";
import type { Product, ProductRecommendationScenario, RecommendationPackage, WithId } from "@/lib/firestore/types";

const normalizeScenarioForDebug = (scenario: ProductRecommendationScenario) => ({
  active: Boolean(scenario.active),
  order: Number(scenario.order ?? 0),
  explanationTemplate: String(scenario.explanationTemplate ?? "").trim(),
  questionnaireBinding: scenario.questionnaireBinding?.questionnaireId
    ? {
        questionnaireId: scenario.questionnaireBinding.questionnaireId,
        questionnaireTitleSnapshot: String(scenario.questionnaireBinding.questionnaireTitleSnapshot ?? "").trim(),
      }
    : undefined,
  conditions: Object.fromEntries(
    Object.entries(scenario.conditions ?? {})
      .map(([key, value]): [string, string[] | number | undefined] => [
        key,
        Array.isArray(value)
          ? value
              .map((item) => String(item).trim())
              .filter((item): item is string => Boolean(item))
              .sort((a, b) => a.localeCompare(b))
          : value,
      ])
      .sort((entryA, entryB) => entryA[0].localeCompare(entryB[0])),
  ),
});

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
        const [packageData, productsData] = await Promise.all([getPackageFromServer(packageId), listProducts()]);
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
          const submittedScenarios = values.recommendationScenarios ?? [];
          console.groupCollapsed(`[Package save debug] ${packageId}`);
          const normalizedSubmitted = submittedScenarios.map(normalizeScenarioForDebug);
          console.log("submitted recommendationScenarios", submittedScenarios);
          console.log("submitted recommendationScenarios JSON", JSON.stringify(normalizedSubmitted, null, 2));
          await updatePackage(packageId, values);
          await updatePackageRecommendationScenarios(packageId, submittedScenarios);
          const savedPackage = await getPackageFromServer(packageId);
          const persistedScenarios = savedPackage?.recommendationScenarios ?? [];
          const normalizedPersisted = persistedScenarios.map(normalizeScenarioForDebug);
          const scenariosMatch = JSON.stringify(normalizedSubmitted) === JSON.stringify(normalizedPersisted);
          console.log("persisted recommendationScenarios", persistedScenarios);
          console.log("persisted recommendationScenarios JSON", JSON.stringify(normalizedPersisted, null, 2));
          console.log("submitted scenarios count", submittedScenarios.length);
          console.log("persisted scenarios count", persistedScenarios.length);

          if (!scenariosMatch) {
            console.error("Package recommendationScenarios mismatch after save", {
              packageId,
              submittedScenarios,
              persistedScenarios,
            });
            setError("Scenariile salvate nu coincid cu cele trimise. Verifică consola pentru debug.");
            if (savedPackage) {
              setItem(savedPackage);
            }
            console.groupEnd();
            return;
          }

          console.groupEnd();
          router.push("/dashboard/packages");
        }}
        onCancel={() => router.push("/dashboard/packages")}
      />
    </div>
  );
}
