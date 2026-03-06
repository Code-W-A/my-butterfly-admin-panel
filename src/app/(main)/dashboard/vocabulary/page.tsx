"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableTableHead, type SortState } from "@/components/ui/sortable-table-head";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import type { WithId } from "@/lib/firestore/types";
import {
  addVocabularyOptionFromLabel,
  createVocabularyKey,
  deleteVocabularyKey,
  deleteVocabularyOption,
  ensureVocabularyInitialized,
  getVocabularyQuestionnaire,
  listVocabularyKeys,
  listVocabularyOptions,
  normalizeVocabularyValue,
  seedDefaultVocabulary,
  seedSuggestedVocabularyForEmptyCategories,
  updateVocabularyKey,
  updateVocabularyOption,
  type VocabularyCategory,
} from "@/lib/firestore/vocabulary";

const categorySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  standardQuestion: z.string().optional(),
  order: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const addSchema = z.object({
  label: z.string().min(1),
  order: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

type VocabularyOption = { value: string; label: string; order: number; active: boolean };

function EditOptionDialog({
  vocabKey,
  option,
  disabled,
  onDone,
}: {
  vocabKey: string;
  option: VocabularyOption;
  disabled?: boolean;
  onDone: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; order: string; active: boolean }>({
    label: option.label,
    order: `${option.order ?? 0}`,
    active: option.active,
  });

  useEffect(() => {
    if (isOpen) {
      setDraft({
        label: option.label,
        order: `${option.order ?? 0}`,
        active: option.active,
      });
      setError(null);
    }
  }, [isOpen, option]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="icon" variant="outline" disabled={disabled} aria-label="Editează valoarea">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editează valoare</DialogTitle>
          <DialogDescription>Se modifică label, order și active. ID-ul tehnic rămâne neschimbat.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <InfoTip text="Textul pe care îl vei vedea în listă (cum apare pentru utilizator)." />
              Label
            </Label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="ex: Începător"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <InfoTip text="Controlează ordinea în listă. Un număr mai mic înseamnă că apare mai sus." />
              Order (opțional)
            </Label>
            <Input
              value={draft.order}
              onChange={(e) => setDraft((prev) => ({ ...prev, order: e.target.value }))}
              placeholder={`${option.order ?? 0}`}
            />
          </div>
          <div className="flex items-end justify-between rounded-md border p-3 md:col-span-2">
            <Label className="flex items-center gap-2">
              <InfoTip text="Dacă este oprit, valoarea nu mai apare utilizatorilor (dar rămâne în istoric)." />
              Activ
            </Label>
            <Switch
              checked={draft.active}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, active: checked }))}
            />
          </div>
        </div>
        {error ? <div className="text-destructive text-sm">{error}</div> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Anulează
          </Button>
          <Button
            type="button"
            disabled={isWorking || !draft.label.trim()}
            onClick={async () => {
              try {
                setError(null);
                setIsWorking(true);
                await updateVocabularyOption(vocabKey, option.value, {
                  label: draft.label,
                  order: draft.order.trim() ? Number(draft.order) : option.order,
                  active: draft.active,
                });
                setIsOpen(false);
                onDone();
              } catch (err) {
                logFirebaseError("Vocabulary: updateOption", err);
                const info = getFirebaseErrorInfo(err);
                setError(info.message || "Salvarea a eșuat.");
              } finally {
                setIsWorking(false);
              }
            }}
          >
            {isWorking ? "Se salvează..." : "Salvează"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VocabularyPage() {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<WithId<VocabularyCategory>[]>([]);
  const [optionsByKey, setOptionsByKey] = useState<Record<string, VocabularyOption[]>>({});
  const [optionSortByKey, setOptionSortByKey] = useState<Record<string, SortState<"order" | "label" | "active">>>({});
  const [addOptionKey, setAddOptionKey] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<{ label: string; order: string; active: boolean }>({
    label: "",
    order: "",
    active: true,
  });
  const [deleteCategory, setDeleteCategory] = useState<WithId<VocabularyCategory> | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<WithId<VocabularyCategory> | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<{
    title: string;
    description: string;
    standardQuestion: string;
    order: string;
    active: boolean;
  }>({
    title: "",
    description: "",
    standardQuestion: "",
    order: "",
    active: true,
  });
  const generatedCategoryKey = normalizeVocabularyValue(categoryDraft.title);
  const conflictingGeneratedCategory = useMemo(
    () => (editingCategory ? null : (categories.find((category) => category.key === generatedCategoryKey) ?? null)),
    [categories, editingCategory, generatedCategoryKey],
  );
  const hasGeneratedCategoryKey = Boolean(generatedCategoryKey);
  const hasGeneratedCategoryConflict = Boolean(generatedCategoryKey && conflictingGeneratedCategory);

  const load = useCallback(async () => {
    const q = await getVocabularyQuestionnaire();
    if (!q) {
      setIsInitialized(false);
      setCategories([]);
      return;
    }
    setIsInitialized(true);
    const categoriesData = await listVocabularyKeys({ includeInactive: true });
    setCategories(categoriesData);
    const entries = await Promise.all(
      categoriesData.map(async (category) => {
        const options = await listVocabularyOptions(category.key, { includeInactive: true });
        return [category.key, options] as const;
      }),
    );
    setOptionsByKey(Object.fromEntries(entries) as Record<string, VocabularyOption[]>);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      logFirebaseError("Vocabulary: load", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Încărcarea a eșuat.");
      setIsInitialized(false);
    });
  }, [load]);

  const isReady = isInitialized === true;

  const sortedOptionsByKey = useMemo(() => {
    const result: Record<string, VocabularyOption[]> = {};
    categories.forEach((category) => {
      result[category.key] = (optionsByKey[category.key] ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
    return result;
  }, [optionsByKey, categories]);

  const getSortedOptions = useCallback(
    (categoryKey: string) => {
      const base = sortedOptionsByKey[categoryKey] ?? [];
      const sort = optionSortByKey[categoryKey] ?? { key: "order", dir: "asc" };
      const dir = sort.dir === "desc" ? -1 : 1;
      const next = [...base];
      next.sort((a, b) => {
        if (sort.key === "order") return dir * ((a.order ?? 0) - (b.order ?? 0));
        if (sort.key === "label") return dir * (a.label ?? "").localeCompare(b.label ?? "");
        return dir * (Number(a.active) - Number(b.active));
      });
      return next;
    },
    [optionSortByKey, sortedOptionsByKey],
  );

  const sortedCategories = useMemo(() => categories.slice().sort((a, b) => a.order - b.order), [categories]);
  const categoriesWithoutValues = useMemo(
    () => sortedCategories.filter((category) => (optionsByKey[category.key] ?? []).length === 0),
    [optionsByKey, sortedCategories],
  );

  const openCategoryDialog = (category?: WithId<VocabularyCategory>) => {
    if (category) {
      setEditingCategory(category);
      setCategoryDraft({
        title: category.title,
        description: category.description ?? "",
        standardQuestion: category.standardQuestion ?? "",
        order: `${category.order ?? 0}`,
        active: category.active,
      });
    } else {
      setEditingCategory(null);
      setCategoryDraft({
        title: "",
        description: "",
        standardQuestion: "",
        order: `${sortedCategories.length}`,
        active: true,
      });
    }
    setIsCategoryDialogOpen(true);
  };

  const openAddOptionDialog = (key: string) => {
    setAddOptionKey(key);
    setAddDraft({ label: "", order: "", active: true });
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
          <h1 className="font-semibold text-2xl">Vocabulary</h1>
          <p className="text-muted-foreground text-sm">
            Dicționar extensibil pentru level/style/distance/priority. Folosit în chestionare și produse.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => load()} disabled={isBusy || isInitialized === null}>
            Reîmprospătează
          </Button>
          {isInitialized === true ? (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  setError(null);
                  setIsBusy(true);
                  await seedDefaultVocabulary();
                  await load();
                } catch (err) {
                  logFirebaseError("Vocabulary: seedDefaults", err);
                  const info = getFirebaseErrorInfo(err);
                  setError(info.message || "Inițializarea valorilor a eșuat.");
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy}
            >
              Completează valori lipsă
            </Button>
          ) : null}
          {isInitialized === true ? (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  setError(null);
                  setIsBusy(true);
                  await seedSuggestedVocabularyForEmptyCategories();
                  await load();
                } catch (err) {
                  logFirebaseError("Vocabulary: seedSuggested", err);
                  const info = getFirebaseErrorInfo(err);
                  setError(info.message || "Popularea automată a eșuat.");
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy}
            >
              Populează categoriile goale
            </Button>
          ) : null}
          <PageHelpDialog helpKey="vocabulary" />
          {isInitialized === false ? (
            <Button
              type="button"
              data-tour="vocabulary-init-button"
              onClick={async () => {
                try {
                  setError(null);
                  setIsBusy(true);
                  await ensureVocabularyInitialized();
                  await seedDefaultVocabulary();
                  await load();
                } catch (err) {
                  logFirebaseError("Vocabulary: init", err);
                  const info = getFirebaseErrorInfo(err);
                  setError(info.message || "Inițializarea a eșuat.");
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy}
            >
              Initialize vocabulary
            </Button>
          ) : null}
        </div>
      </div>

      {isInitialized === null ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {["s1", "s2", "s3", "s4"].map((cardId) => (
            <Card key={cardId}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {isInitialized === false ? (
        <Card>
          <CardHeader>
            <CardTitle>Vocabulary nu este inițializat</CardTitle>
            <CardDescription>
              Apasă “Initialize vocabulary” ca să creăm `questionnaires/vocabulary` + întrebările aferente.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {isReady ? (
        <div className="space-y-4">
          {categoriesWithoutValues.length > 0 ? (
            <div className="rounded-md border bg-muted p-3 text-sm">
              <div className="font-medium">Categorii fără valori active</div>
              <div className="text-muted-foreground">
                {categoriesWithoutValues.map((category) => category.title).join(", ")}.
              </div>
              <div className="text-muted-foreground text-xs">
                Dacă le-ai șters din Firestore, poți folosi butonul „Completează valori lipsă”. Pentru categorii custom,
                adaugă manual valorile din fiecare card.
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">Categorii</h2>
              <p className="text-muted-foreground text-sm">Configurează categoriile și valorile disponibile.</p>
            </div>
            <Button type="button" onClick={() => openCategoryDialog()} disabled={isBusy}>
              <Plus className="mr-2 size-4" />
              Adaugă categorie
            </Button>
          </div>
          <div className="text-muted-foreground text-xs">
            Ștergerea unei categorii nu modifică datele deja salvate în produse, scenarii sau chestionare.
          </div>

          {sortedCategories.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-muted-foreground text-sm">
                Nu există categorii. Adaugă prima categorie pentru Vocabulary.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {sortedCategories.map((category) => (
                <Card
                  key={category.key}
                  {...(category.key === "level" ? { "data-tour": "vocabulary-card-level" } : {})}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle>{category.title}</CardTitle>
                      <CardDescription>{category.description || "Fără descriere."}</CardDescription>
                      <div className="text-muted-foreground text-xs">
                        Cheie: <span className="font-mono">{category.key}</span> •{" "}
                        {category.active ? "Activă" : "Inactivă"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => openAddOptionDialog(category.key)}
                        disabled={isBusy}
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => openCategoryDialog(category)}
                        disabled={isBusy}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        disabled={isBusy}
                        onClick={() => setDeleteCategory(category)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableTableHead
                              sortKey="order"
                              sort={optionSortByKey[category.key] ?? { key: "order", dir: "asc" }}
                              onSortChange={(next) =>
                                setOptionSortByKey((prev) => ({
                                  ...prev,
                                  [category.key]: next,
                                }))
                              }
                            >
                              Order
                            </SortableTableHead>
                            <SortableTableHead
                              sortKey="label"
                              sort={optionSortByKey[category.key] ?? { key: "order", dir: "asc" }}
                              onSortChange={(next) =>
                                setOptionSortByKey((prev) => ({
                                  ...prev,
                                  [category.key]: next,
                                }))
                              }
                            >
                              Label
                            </SortableTableHead>
                            <SortableTableHead
                              sortKey="active"
                              sort={optionSortByKey[category.key] ?? { key: "order", dir: "asc" }}
                              onSortChange={(next) =>
                                setOptionSortByKey((prev) => ({
                                  ...prev,
                                  [category.key]: next,
                                }))
                              }
                            >
                              Activ
                            </SortableTableHead>
                            <TableHead className="text-right">Acțiuni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getSortedOptions(category.key).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-muted-foreground text-sm">
                                Nu există valori încă.
                              </TableCell>
                            </TableRow>
                          ) : (
                            getSortedOptions(category.key).map((opt) => (
                              <TableRow key={opt.value}>
                                <TableCell className="w-24">{opt.order ?? 0}</TableCell>
                                <TableCell className="min-w-48">{opt.label}</TableCell>
                                <TableCell>{opt.active ? "Da" : "Nu"}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <EditOptionDialog
                                      vocabKey={category.key}
                                      option={opt}
                                      disabled={isBusy}
                                      onDone={load}
                                    />
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      disabled={isBusy}
                                      aria-label="Șterge valoarea"
                                      onClick={async () => {
                                        if (
                                          !window.confirm(
                                            `Ștergi valoarea "${opt.label}" din Vocabulary? Aceasta nu modifică datele existente din produse/chestionare.`,
                                          )
                                        ) {
                                          return;
                                        }
                                        try {
                                          setError(null);
                                          setIsBusy(true);
                                          await deleteVocabularyOption(category.key, opt.value);
                                          await load();
                                        } catch (err) {
                                          logFirebaseError("Vocabulary: deleteOption", err);
                                          const info = getFirebaseErrorInfo(err);
                                          setError(info.message || "Ștergerea a eșuat.");
                                        } finally {
                                          setIsBusy(false);
                                        }
                                      }}
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Dialog open={Boolean(addOptionKey)} onOpenChange={(open) => (!open ? setAddOptionKey(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă valoare</DialogTitle>
            <DialogDescription>Scrii doar label-ul. ID-ul tehnic se generează automat.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="Textul pe care îl vei vedea în listă (cum apare pentru utilizator)." />
                Label
              </Label>
              <Input
                value={addDraft.label}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="ex: Începător"
              />
              <div className="text-muted-foreground text-xs">
                Sistemul generează un <span className="font-mono">value</span> unic (ex:{" "}
                <span className="font-mono">incepator-7k3p2a</span>).
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="Controlează ordinea în listă. Un număr mai mic înseamnă că apare mai sus." />
                Order (opțional)
              </Label>
              <Input
                value={addDraft.order}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, order: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="flex items-end justify-between rounded-md border p-3 md:col-span-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="Dacă este oprit, valoarea nu mai apare utilizatorilor (dar rămâne în istoric)." />
                Activ
              </Label>
              <Switch
                checked={addDraft.active}
                onCheckedChange={(checked) => setAddDraft((prev) => ({ ...prev, active: checked }))}
              />
            </div>
          </div>
          {error ? <div className="text-destructive text-sm">{error}</div> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOptionKey(null)}>
              Anulează
            </Button>
            <Button
              type="button"
              disabled={isBusy || !addDraft.label.trim() || !addOptionKey}
              onClick={async () => {
                if (!addOptionKey) return;
                try {
                  setError(null);
                  setIsBusy(true);
                  const parsed = addSchema.parse({
                    label: addDraft.label,
                    order: addDraft.order.trim() ? Number(addDraft.order) : undefined,
                    active: addDraft.active,
                  });
                  await addVocabularyOptionFromLabel(addOptionKey, parsed);
                  setAddOptionKey(null);
                  setAddDraft({ label: "", order: "", active: true });
                  await load();
                } catch (err) {
                  logFirebaseError("Vocabulary: addOption", err);
                  const info = getFirebaseErrorInfo(err);
                  setError(info.message || "Adăugarea a eșuat.");
                } finally {
                  setIsBusy(false);
                }
              }}
            >
              Adaugă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          setIsCategoryDialogOpen(open);
          if (!open) setEditingCategory(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editează categorie" : "Adaugă categorie"}</DialogTitle>
            <DialogDescription>
              Categoria definește un set de valori folosite în chestionare și scenarii.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="Numele categoriei așa cum apare în admin (ex: Nivel, Stil, Distanță)." />
                Titlu
              </Label>
              <Input
                value={categoryDraft.title}
                onChange={(e) => setCategoryDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="ex: Nivel"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2">
                <InfoTip
                  text={
                    editingCategory
                      ? "Cheia tehnică rămâne fixă după creare."
                      : "Cheia se generează automat din titlu și trebuie să fie unică în Vocabulary."
                  }
                />
                {editingCategory ? "Cheie tehnică" : "Cheie generată"}
              </Label>
              <div className="rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {editingCategory?.key || generatedCategoryKey || "Introduce un titlu valid"}
              </div>
              {editingCategory ? (
                <div className="text-muted-foreground text-xs">Cheia tehnică nu se poate schimba după creare.</div>
              ) : hasGeneratedCategoryConflict ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
                  Există deja categoria <span className="font-medium">„{conflictingGeneratedCategory?.title}”</span> cu
                  cheia <span className="font-mono"> {generatedCategoryKey}</span>. Alege alt titlu.
                </div>
              ) : !hasGeneratedCategoryKey && categoryDraft.title.trim() ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
                  Din titlul actual nu se poate genera o cheie validă. Folosește litere sau cifre.
                </div>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="O descriere scurtă, ca să fie clar ce conține categoria (opțional)." />
                Descriere
              </Label>
              <Input
                value={categoryDraft.description}
                onChange={(e) => setCategoryDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="ex: Începător / intermediar / avansat"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="Textul standard al întrebării. La selectarea categoriei în editor, se completează automat." />
                Întrebare standard (opțional)
              </Label>
              <Input
                value={categoryDraft.standardQuestion}
                onChange={(e) => setCategoryDraft((prev) => ({ ...prev, standardQuestion: e.target.value }))}
                placeholder="ex: Care este nivelul tău?"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <InfoTip text="Ordinea în care apar categoriile pe pagină și în liste. Mai mic = mai sus." />
                Order
              </Label>
              <Input
                value={categoryDraft.order}
                onChange={(e) => setCategoryDraft((prev) => ({ ...prev, order: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="flex items-end justify-between rounded-md border p-3">
              <Label className="flex items-center gap-2">
                <InfoTip text="Dacă este oprită, categoria poate fi ascunsă/evitată în selecții, dar datele existente rămân." />
                Activ
              </Label>
              <Switch
                checked={categoryDraft.active}
                onCheckedChange={(checked) => setCategoryDraft((prev) => ({ ...prev, active: checked }))}
              />
            </div>
          </div>
          {error ? <div className="text-destructive text-sm">{error}</div> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              Anulează
            </Button>
            <Button
              type="button"
              disabled={
                isBusy ||
                !categoryDraft.title.trim() ||
                (!editingCategory && (!hasGeneratedCategoryKey || hasGeneratedCategoryConflict))
              }
              onClick={async () => {
                try {
                  setError(null);
                  setIsBusy(true);
                  if (!editingCategory) {
                    if (!generatedCategoryKey) {
                      setError("Titlul trebuie să conțină litere sau cifre ca să putem genera cheia categoriei.");
                      return;
                    }
                    if (hasGeneratedCategoryConflict) {
                      setError(
                        `Există deja categoria „${conflictingGeneratedCategory?.title}” cu cheia „${generatedCategoryKey}”.`,
                      );
                      return;
                    }
                  }
                  const parsed = categorySchema.parse({
                    title: categoryDraft.title,
                    description: categoryDraft.description.trim() || undefined,
                    standardQuestion: categoryDraft.standardQuestion.trim() || undefined,
                    order: categoryDraft.order.trim() ? Number(categoryDraft.order) : undefined,
                    active: categoryDraft.active,
                  });
                  if (editingCategory) {
                    await updateVocabularyKey(editingCategory.key, {
                      title: parsed.title,
                      description: parsed.description,
                      standardQuestion: parsed.standardQuestion,
                      order: parsed.order,
                      active: parsed.active,
                    });
                  } else {
                    await createVocabularyKey({
                      key: generatedCategoryKey,
                      title: parsed.title,
                      description: parsed.description,
                      standardQuestion: parsed.standardQuestion,
                      order: parsed.order,
                      active: parsed.active,
                    });
                  }
                  setIsCategoryDialogOpen(false);
                  setEditingCategory(null);
                  await load();
                } catch (err) {
                  logFirebaseError("Vocabulary: saveCategory", err);
                  const info = getFirebaseErrorInfo(err);
                  setError(info.message || "Salvarea a eșuat.");
                } finally {
                  setIsBusy(false);
                }
              }}
            >
              {editingCategory ? "Salvează" : "Creează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteCategory)} onOpenChange={(open) => (!open ? setDeleteCategory(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmă ștergerea categoriei</DialogTitle>
            <DialogDescription>
              Categoria va fi ștearsă din Vocabulary, dar valorile deja salvate în produse, scenarii sau chestionare
              rămân neschimbate.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-3 text-sm">
            <div className="font-medium">Categoria:</div>
            <div>{deleteCategory?.title}</div>
            <div className="text-muted-foreground text-xs">Cheie: {deleteCategory?.key}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteCategory(null)}>
              Anulează
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isBusy || !deleteCategory}
              onClick={async () => {
                if (!deleteCategory) return;
                try {
                  setError(null);
                  setIsBusy(true);
                  await deleteVocabularyKey(deleteCategory.key);
                  setDeleteCategory(null);
                  await load();
                } catch (err) {
                  logFirebaseError("Vocabulary: deleteCategory", err);
                  const info = getFirebaseErrorInfo(err);
                  setError(info.message || "Ștergerea a eșuat.");
                } finally {
                  setIsBusy(false);
                }
              }}
            >
              Șterge categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
