"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Plus } from "lucide-react";

import { VocabularyMultiSelect } from "@/components/mybutterfly/forms/vocabulary-multi-select";
import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { createRuleSet, deleteRuleSet, listRuleSets, updateRuleSet } from "@/lib/firestore/recommendation-rule-sets";
import type { ProductRecommendationScenario, RecommendationRuleSet, WithId } from "@/lib/firestore/types";
import { listVocabularyKeys, type VocabularyCategory } from "@/lib/firestore/vocabulary";

type ScenarioDraft = {
  id: string;
  active: boolean;
  order: number;
  explanationTemplate: string;
  conditions: Record<string, string[]>;
};

const generateClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeConditionValues = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim());
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const buildConditionMap = (keys: string[], source: ProductRecommendationScenario["conditions"] | undefined) => {
  const result: Record<string, string[]> = {};
  keys.forEach((key) => {
    const value = source?.[key];
    result[key] = normalizeConditionValues(value);
  });
  if (source) {
    Object.entries(source).forEach(([key, value]) => {
      if (key in result) return;
      const normalized = normalizeConditionValues(value);
      if (normalized.length) result[key] = normalized;
    });
  }
  return result;
};

const buildConditions = (scenario: ScenarioDraft): ProductRecommendationScenario["conditions"] =>
  Object.fromEntries(
    Object.entries(scenario.conditions).filter(([, values]) => Array.isArray(values) && values.length > 0),
  );

const formatScenarioSummary = (
  scenario: ScenarioDraft,
  categories: Array<Pick<VocabularyCategory, "key" | "title">>,
) => {
  const parts: string[] = [];
  const knownKeys = new Set(categories.map((category) => category.key));
  categories.forEach((category) => {
    const values = scenario.conditions[category.key] ?? [];
    if (values.length) parts.push(`${category.title}: ${values.length}`);
  });
  Object.entries(scenario.conditions).forEach(([key, values]) => {
    if (knownKeys.has(key)) return;
    if (values.length) parts.push(`${key}: ${values.length}`);
  });
  if (scenario.explanationTemplate.trim()) {
    parts.push("Are explicație");
  }
  return parts.length ? parts.join(" • ") : "Fără condiții setate";
};

export default function RecommendationRulesPage() {
  const [ruleSets, setRuleSets] = useState<WithId<RecommendationRuleSet>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<"title" | "conditionsCount">>({ key: "title", dir: "asc" });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRuleSet, setEditingRuleSet] = useState<WithId<RecommendationRuleSet> | null>(null);
  const [title, setTitle] = useState("");
  const [scenario, setScenario] = useState<ScenarioDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [vocabularyCategories, setVocabularyCategories] = useState<WithId<VocabularyCategory>[]>([]);
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);
  const sortedVocabularyCategories = useMemo(
    () => vocabularyCategories.slice().sort((a, b) => a.order - b.order),
    [vocabularyCategories],
  );
  const vocabularyKeys = useMemo(
    () => sortedVocabularyCategories.map((category) => category.key),
    [sortedVocabularyCategories],
  );

  const sortedRuleSets = useMemo(() => {
    const next = [...ruleSets];
    const dir = sort?.dir === "desc" ? -1 : 1;
    next.sort((a, b) => {
      if (!sort) return 0;
      if (sort.key === "title") return dir * (a.title ?? "").localeCompare(b.title ?? "");
      const getCount = (item: WithId<RecommendationRuleSet>) => {
        const source = item.scenario ?? item.scenarios?.[0];
        const entries = Object.entries(source?.conditions ?? {}).filter(
          ([key]) => key !== "budgetMin" && key !== "budgetMax",
        );
        return entries.length;
      };
      return dir * (getCount(a) - getCount(b));
    });
    return next;
  }, [ruleSets, sort]);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const items = await listRuleSets();
      setRuleSets(items);
    } catch (err) {
      logFirebaseError("RecommendationRules: load", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Încărcarea a eșuat.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listVocabularyKeys({ includeInactive: true })
      .then((items) => {
        setVocabularyCategories(items);
        setVocabularyError(null);
      })
      .catch((err) => {
        logFirebaseError("RecommendationRules: loadVocabularyKeys", err);
        const info = getFirebaseErrorInfo(err);
        setVocabularyError(info.message || "Nu pot încărca Vocabulary.");
        setVocabularyCategories([]);
      });
  }, []);

  const resetDialog = () => {
    setEditingRuleSet(null);
    setTitle("");
    setScenario(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetDialog();
    const nextScenario: ScenarioDraft = {
      id: generateClientId(),
      active: true,
      order: 0,
      explanationTemplate: "",
      conditions: buildConditionMap(vocabularyKeys, {}),
    };
    setScenario(nextScenario);
    setIsDialogOpen(true);
  };

  const openEdit = (item: WithId<RecommendationRuleSet>) => {
    setEditingRuleSet(item);
    setTitle(item.title ?? "");
    const source = item.scenario ?? item.scenarios?.[0];
    const nextScenario: ScenarioDraft = {
      id: generateClientId(),
      active: source?.active ?? true,
      order: source?.order ?? 0,
      explanationTemplate: source?.explanationTemplate ?? "",
      conditions: buildConditionMap(vocabularyKeys, source?.conditions),
    };
    setScenario(nextScenario);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const updateScenario = (patch: Partial<ScenarioDraft>) => {
    setScenario((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Completează numele regulilor.");
      return;
    }
    if (!scenario) {
      setFormError("Completează regula.");
      return;
    }
    const payload: Omit<RecommendationRuleSet, "createdAt" | "updatedAt"> = {
      title: trimmedTitle,
      scenario: {
        active: scenario.active,
        order: scenario.order,
        explanationTemplate: scenario.explanationTemplate.trim(),
        conditions: buildConditions(scenario),
      },
    };
    try {
      setIsSaving(true);
      setFormError(null);
      if (editingRuleSet) {
        await updateRuleSet(editingRuleSet.id, payload);
      } else {
        await createRuleSet(payload);
      }
      await load();
      setIsDialogOpen(false);
      resetDialog();
    } catch (err) {
      logFirebaseError("RecommendationRules: save", err);
      const info = getFirebaseErrorInfo(err);
      setFormError(info.message || "Salvarea a eșuat.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: WithId<RecommendationRuleSet>) => {
    if (!window.confirm(`Ștergi regulile "${item.title}"?`)) return;
    try {
      await deleteRuleSet(item.id);
      await load();
    } catch (err) {
      logFirebaseError("RecommendationRules: delete", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Ștergerea a eșuat.");
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
          <h1 className="font-semibold text-2xl">Reguli recomandări</h1>
          <p className="text-muted-foreground text-sm">
            Creează reguli reutilizabile pe care le poți atribui produselor și pachetelor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="recommendation-rules" />
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Creează reguli
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="title" sort={sort} onSortChange={setSort}>
                Nume
              </SortableTableHead>
              <SortableTableHead sortKey="conditionsCount" sort={sort} onSortChange={setSort}>
                Regulă
              </SortableTableHead>
              <TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-28 justify-self-end" />
                  </div>
                </TableCell>
              </TableRow>
            ) : ruleSets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground text-sm">
                  Nu există reguli încă.
                </TableCell>
              </TableRow>
            ) : (
              sortedRuleSets.map((item) => {
                const source = item.scenario ?? item.scenarios?.[0];
                const summaryScenario: ScenarioDraft = {
                  id: item.id,
                  active: source?.active ?? true,
                  order: source?.order ?? 0,
                  explanationTemplate: source?.explanationTemplate ?? "",
                  conditions: buildConditionMap(vocabularyKeys, source?.conditions),
                };
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatScenarioSummary(summaryScenario, sortedVocabularyCategories)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link prefetch={false} href={`/dashboard/products?assignRuleId=${item.id}`}>
                            Leagă produse
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link prefetch={false} href={`/dashboard/packages/new?importRuleId=${item.id}`}>
                            Leagă pachete
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link prefetch={false} href={`/dashboard/questionnaires/new?importRuleId=${item.id}`}>
                            Leagă chestionar
                          </Link>
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(item)}>
                          Editează
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(item)}>
                          Șterge
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editingRuleSet ? "Editează reguli" : "Creează reguli"}</DialogTitle>
            <DialogDescription>
              Regulile pot fi importate și atribuite rapid produselor și pachetelor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {formError ? <div className="text-destructive text-sm">{formError}</div> : null}
            <div className="space-y-2">
              <Label>Nume reguli</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Regulă recomandare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-muted-foreground text-sm">Configurează regula.</div>
                  <Switch
                    checked={scenario?.active ?? true}
                    onCheckedChange={(checked) => updateScenario({ active: checked })}
                  />
                </div>

                {vocabularyError ? <div className="text-destructive text-sm">{vocabularyError}</div> : null}
                {sortedVocabularyCategories.length === 0 ? (
                  <div className="text-muted-foreground text-sm">Nu există categorii în Vocabulary.</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedVocabularyCategories.map((category) => {
                      const label = category.active ? category.title : `${category.title} (inactiv)`;
                      const tip =
                        category.description?.trim() ||
                        `Alege valorile care fac produsul potrivit pentru ${category.title.toLowerCase()}.`;
                      return (
                        <div key={category.key} className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <InfoTip text={tip} />
                            {label}
                          </Label>
                          <VocabularyMultiSelect
                            vocabKey={category.key}
                            value={scenario?.conditions[category.key] ?? []}
                            onChange={(value) =>
                              updateScenario({
                                conditions: { ...(scenario?.conditions ?? {}), [category.key]: value },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label className="flex items-center gap-2">
                      <InfoTip text="Mai mic = regula este verificată mai devreme." />
                      Ordine
                    </Label>
                    <Input
                      type="number"
                      value={scenario?.order ?? 0}
                      onChange={(e) => updateScenario({ order: Number(e.target.value || 0) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <InfoTip text="Textul pe care îl vede utilizatorul ca motiv al recomandării (opțional)." />
                    Explicație
                  </Label>
                  <Textarea
                    rows={3}
                    value={scenario?.explanationTemplate ?? ""}
                    onChange={(e) => updateScenario({ explanationTemplate: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Anulează
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Se salvează..." : "Salvează regulile"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
