"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { QueryDocumentSnapshot } from "firebase/firestore";
import { toast } from "sonner";

import { OptionMultiSelect } from "@/components/mybutterfly/forms/option-multi-select";
import { PackageMultiSelect } from "@/components/mybutterfly/forms/package-multi-select";
import { ProductMultiSelect } from "@/components/mybutterfly/forms/product-multi-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { listPackagesPage, updatePackageRecommendationScenarios } from "@/lib/firestore/packages";
import { listProductsPage, updateProduct } from "@/lib/firestore/products";
import type {
  Product,
  ProductRecommendationScenario,
  Questionnaire,
  QuestionnaireQuestion,
  RecommendationPackage,
  WithId,
} from "@/lib/firestore/types";
import {
  analyzeQuestionnaireScenario,
  appendRecommendationScenarios,
  createQuestionnaireScenarioDraft,
  type ScenarioDraft,
  serializeScenarioDraft,
  updateScenarioQuestionSelection,
} from "@/lib/recommendations/scenario-utils";

const TARGET_PAGE_SIZE = 20;

type BulkImportTargetType = "products" | "packages";

type BulkImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionnaire: WithId<Questionnaire>;
  questions: Array<WithId<QuestionnaireQuestion>>;
  targetType: BulkImportTargetType;
};

type BulkImportSummary = {
  updated: number;
  failed: number;
  failedLabels: string[];
};

type BulkImportTargetItem = WithId<Product> | WithId<RecommendationPackage>;

const mergeTargetItems = (current: BulkImportTargetItem[], incoming: BulkImportTargetItem[]) => {
  const next = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    next.set(item.id, item);
  });
  return [...next.values()];
};

const getTargetLabel = (target: BulkImportTargetItem) => ("name" in target ? target.name : target.title);

export function BulkQuestionnaireScenarioImportDialog({
  open,
  onOpenChange,
  questionnaire,
  questions,
  targetType,
}: BulkImportDialogProps) {
  const createInitialScenario = useCallback(
    (): ScenarioDraft =>
      createQuestionnaireScenarioDraft({
        id: `${targetType}-${questionnaire.id}-bulk-import`,
        order: 0,
        questionnaireId: questionnaire.id,
        questionnaireTitleSnapshot: questionnaire.title,
      }),
    [questionnaire.id, questionnaire.title, targetType],
  );

  const [scenario, setScenario] = useState<ScenarioDraft>(createInitialScenario);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [targetItems, setTargetItems] = useState<BulkImportTargetItem[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | undefined>();
  const [hasMoreTargets, setHasMoreTargets] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isLoadingMoreTargets, setIsLoadingMoreTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);

  const analysis = useMemo(() => analyzeQuestionnaireScenario(scenario, questions), [scenario, questions]);
  const selectedQuestionCount = useMemo(
    () => Object.values(scenario.conditions).filter((value) => Array.isArray(value) && value.length > 0).length,
    [scenario.conditions],
  );
  const targetsById = useMemo(() => new Map(targetItems.map((item) => [item.id, item])), [targetItems]);

  const productOptions = useMemo(
    () =>
      targetItems
        .filter((item): item is WithId<Product> => "name" in item)
        .map((product) => ({
          id: product.id,
          name: product.active ? product.name : `${product.name} (inactiv)`,
          price: product.price,
          currency: product.currency,
        })),
    [targetItems],
  );

  const packageOptions = useMemo(
    () =>
      targetItems
        .filter((item): item is WithId<RecommendationPackage> => "title" in item)
        .map((pkg) => ({
          id: pkg.id,
          title: pkg.active ? pkg.title : `${pkg.title} (inactiv)`,
          totalPrice: pkg.totalPrice,
          currency: pkg.currency,
          mode: pkg.mode,
        })),
    [targetItems],
  );

  const fetchTargetsPage = useCallback(
    (pageCursor?: QueryDocumentSnapshot) =>
      targetType === "products"
        ? listProductsPage({
            pageSize: TARGET_PAGE_SIZE,
            ...(pageCursor ? { cursor: pageCursor } : {}),
          })
        : listPackagesPage({
            pageSize: TARGET_PAGE_SIZE,
            ...(pageCursor ? { cursor: pageCursor } : {}),
          }),
    [targetType],
  );

  const loadInitialTargets = useCallback(async () => {
    setIsLoadingTargets(true);
    setTargetsError(null);
    try {
      const response = await fetchTargetsPage();
      setTargetItems(response.items);
      setCursor(response.cursor);
      setHasMoreTargets(response.items.length === TARGET_PAGE_SIZE);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nu am putut incarca tintele pentru import.";
      setTargetsError(message);
    } finally {
      setIsLoadingTargets(false);
    }
  }, [fetchTargetsPage]);

  const loadMoreTargets = useCallback(async () => {
    if (!cursor) return;
    setIsLoadingMoreTargets(true);
    try {
      const response = await fetchTargetsPage(cursor);
      setTargetItems((prev) => mergeTargetItems(prev, response.items));
      setCursor(response.cursor);
      setHasMoreTargets(response.items.length === TARGET_PAGE_SIZE);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nu am putut incarca tintele pentru import.";
      setTargetsError(message);
    } finally {
      setIsLoadingMoreTargets(false);
    }
  }, [cursor, fetchTargetsPage]);

  useEffect(() => {
    if (!open) return;
    setScenario(createInitialScenario());
    setSelectedTargetIds([]);
    setSummary(null);
    setTargetItems([]);
    setCursor(undefined);
    setHasMoreTargets(false);
    setTargetsError(null);
    void loadInitialTargets();
  }, [createInitialScenario, loadInitialTargets, open]);

  const handleImport = async () => {
    const selectedTargets = selectedTargetIds
      .map((targetId) => targetsById.get(targetId))
      .filter((target): target is BulkImportTargetItem => Boolean(target));
    if (!selectedTargets.length) return;

    setIsImporting(true);
    setSummary(null);

    try {
      const baseScenario = serializeScenarioDraft(scenario);
      const mergedByTargetId = new Map<string, ProductRecommendationScenario[]>();
      const results = await Promise.allSettled(
        selectedTargets.map(async (target) => {
          const nextScenarios = appendRecommendationScenarios(target.recommendationScenarios, [baseScenario]);
          mergedByTargetId.set(target.id, nextScenarios);

          if (targetType === "products") {
            await updateProduct(target.id, { recommendationScenarios: nextScenarios });
          } else {
            await updatePackageRecommendationScenarios(target.id, nextScenarios);
          }

          return target;
        }),
      );

      const failedLabels: string[] = [];
      const successfulIds = new Set<string>();
      results.forEach((result, index) => {
        const target = selectedTargets[index];
        if (result.status === "fulfilled") {
          successfulIds.add(target.id);
          return;
        }
        failedLabels.push(getTargetLabel(target));
      });

      const nextSummary = {
        updated: successfulIds.size,
        failed: failedLabels.length,
        failedLabels,
      } satisfies BulkImportSummary;

      setSummary(nextSummary);
      setTargetItems((prev) =>
        prev.map((item) =>
          successfulIds.has(item.id)
            ? { ...item, recommendationScenarios: mergedByTargetId.get(item.id) ?? item.recommendationScenarios }
            : item,
        ),
      );

      if (failedLabels.length === 0) {
        toast.success(
          targetType === "products"
            ? `Scenariul a fost importat in ${successfulIds.size} produse.`
            : `Scenariul a fost importat in ${successfulIds.size} pachete.`,
        );
        onOpenChange(false);
        return;
      }

      setSelectedTargetIds(
        selectedTargets.filter((target) => !successfulIds.has(target.id)).map((target) => target.id),
      );
      toast.error(`Actualizate: ${successfulIds.size}. Esuate: ${failedLabels.length}.`);
    } finally {
      setIsImporting(false);
    }
  };

  const canImport =
    !isImporting && analysis.eligibleQuestions.length > 0 && selectedQuestionCount > 0 && selectedTargetIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none sm:!max-w-none flex h-[92vh] w-[96vw] flex-col gap-4 p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>{targetType === "products" ? "Importa in produse" : "Importa in pachete"}</DialogTitle>
          <DialogDescription>
            Configurezi scenariul o singura data pentru chestionarul curent, apoi il copiezi in toate tintele selectate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Chestionar: {questionnaire.title}</Badge>
          <Badge variant="outline">
            {analysis.eligibleQuestions.length === 1
              ? "1 intrebare eligibila"
              : `${analysis.eligibleQuestions.length} intrebari eligibile`}
          </Badge>
          <Badge variant="outline">
            {selectedTargetIds.length === 1 ? "1 tinta selectata" : `${selectedTargetIds.length} tinte selectate`}
          </Badge>
        </div>

        {summary ? (
          <Alert>
            <AlertTitle>
              Import finalizat: {summary.updated} actualizate, {summary.failed} esuate
            </AlertTitle>
            {summary.failedLabels.length ? (
              <AlertDescription>
                <p>Au ramas selectate doar tintele care au esuat.</p>
                <p>{summary.failedLabels.join(", ")}</p>
              </AlertDescription>
            ) : null}
          </Alert>
        ) : null}

        {analysis.warnings.length ? (
          <Alert>
            <AlertTitle>Atentie la intrebarile din chestionar</AlertTitle>
            <AlertDescription>
              {analysis.warnings.map((warning) => (
                <p key={`${warning.type}-${warning.key}`}>{warning.message}</p>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-4 overflow-y-auto pr-1">
            {!analysis.eligibleQuestions.length ? (
              <Alert>
                <AlertTitle>Nu exista intrebari eligibile</AlertTitle>
                <AlertDescription>
                  Sunt acceptate doar intrebarile active de tip `single_select` sau `multi_select` care au cheie unica.
                </AlertDescription>
              </Alert>
            ) : (
              analysis.eligibleQuestions.map((question) => (
                <div key={question.id} className="space-y-2 rounded-md border p-3">
                  <Label>{question.label}</Label>
                  <div className="text-muted-foreground text-xs">Key: {question.key}</div>
                  <OptionMultiSelect
                    items={(question.options ?? [])
                      .filter((option) => option.active)
                      .map((option) => ({ value: option.value, label: option.label }))}
                    value={analysis.selectionsByQuestionId[question.id] ?? []}
                    onChange={(value) => setScenario((prev) => updateScenarioQuestionSelection(prev, question, value))}
                    emptyMessage="Intrebarea nu are optiuni active."
                  />
                </div>
              ))
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">
                {targetType === "products" ? "Selecteaza produsele tinta" : "Selecteaza pachetele tinta"}
              </h3>
              <p className="text-muted-foreground text-xs">
                Tintele inactive raman selectabile, dar sunt marcate in lista.
              </p>
            </div>

            {targetsError ? (
              <Alert variant="destructive">
                <AlertTitle>Nu am putut incarca tintele</AlertTitle>
                <AlertDescription>{targetsError}</AlertDescription>
              </Alert>
            ) : null}

            {isLoadingTargets ? (
              <div className="text-muted-foreground text-sm">Se incarca tintele disponibile...</div>
            ) : targetType === "products" ? (
              <ProductMultiSelect
                products={productOptions}
                value={selectedTargetIds}
                onChange={setSelectedTargetIds}
                onLoadMore={() => void loadMoreTargets()}
                hasMore={hasMoreTargets}
                isLoadingMore={isLoadingMoreTargets}
              />
            ) : (
              <PackageMultiSelect
                packages={packageOptions}
                value={selectedTargetIds}
                onChange={setSelectedTargetIds}
                onLoadMore={() => void loadMoreTargets()}
                hasMore={hasMoreTargets}
                isLoadingMore={isLoadingMoreTargets}
              />
            )}

            <div className="rounded-md bg-muted px-3 py-2 text-xs">
              {selectedQuestionCount === 0 ? (
                <span>Selecteaza cel putin un raspuns bun pentru scenariu.</span>
              ) : (
                <span>
                  Scenariul va folosi {selectedQuestionCount}{" "}
                  {selectedQuestionCount === 1 ? "intrebare configurata" : "intrebari configurate"}.
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Anuleaza
          </Button>
          <Button type="button" onClick={handleImport} disabled={!canImport}>
            {isImporting
              ? "Se importa..."
              : targetType === "products"
                ? `Importa in ${selectedTargetIds.length} produse`
                : `Importa in ${selectedTargetIds.length} pachete`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
