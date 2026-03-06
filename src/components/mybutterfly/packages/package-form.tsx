"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Package as PackageIcon, Plus, Search, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { OptionMultiSelect } from "@/components/mybutterfly/forms/option-multi-select";
import { VocabularyMultiSelect } from "@/components/mybutterfly/forms/vocabulary-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import { getRuleSet, listRuleSets } from "@/lib/firestore/recommendation-rule-sets";
import type {
  PackageItemRole,
  PackageMode,
  Product,
  Questionnaire,
  QuestionnaireQuestion,
  RecommendationPackage,
  RecommendationPackageItem,
  RecommendationRuleSet,
  WithId,
} from "@/lib/firestore/types";
import { listVocabularyKeys, type VocabularyCategory } from "@/lib/firestore/vocabulary";
import {
  analyzeQuestionnaireScenario,
  createLegacyScenarioDraft,
  createQuestionnaireScenarioDraft,
  formatScenarioSummary,
  type ScenarioDraft,
  serializeScenarioDraft,
  toScenarioDraft,
  updateScenarioQuestionSelection,
} from "@/lib/recommendations/scenario-utils";
import { cn } from "@/lib/utils";

const MAX_CUSTOM_ITEMS = 10;
const ROLE_NONE = "__none__";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number().optional(),
);

type PackageFormValues = {
  active: boolean;
  title: string;
  description: string;
  mode: PackageMode;
  singleProductId: string;
  bladeProductId: string;
  forehandProductId: string;
  backhandProductId: string;
  attributes: {
    control?: number;
    spin?: number;
    speed?: number;
  };
};

const formSchema = z.object({
  active: z.boolean(),
  title: z.string().min(1, "Titlul este obligatoriu."),
  description: z.string().optional(),
  mode: z.enum(["single", "triple", "custom"]),
  singleProductId: z.string().optional(),
  bladeProductId: z.string().optional(),
  forehandProductId: z.string().optional(),
  backhandProductId: z.string().optional(),
  attributes: z.object({
    control: optionalNumber,
    spin: optionalNumber,
    speed: optionalNumber,
  }),
});

type CustomItemDraft = {
  id: string;
  productId: string;
  role?: PackageItemRole;
};

type PackageFormPayload = Omit<RecommendationPackage, "createdAt" | "updatedAt" | "totalPrice" | "currency">;

type PackageFormProps = {
  products: WithId<Product>[];
  initialValues?: RecommendationPackage;
  defaultMode?: PackageMode;
  presetImportRuleId?: string | null;
  onSubmit: (values: PackageFormPayload) => Promise<void>;
  onCancel?: () => void;
};

const generateClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createEmptyCustomItem = (): CustomItemDraft => ({
  id: generateClientId(),
  productId: "",
});

const compactNumberFields = (values: Record<string, number | undefined>) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

const getRuleScenario = (rule: RecommendationRuleSet) => rule.scenario ?? rule.scenarios?.[0] ?? null;

const normalizeItemRole = (role: unknown): PackageItemRole | undefined => {
  if (role === "single" || role === "blade" || role === "forehand" || role === "backhand") return role;
  if (role === "rubber_fh") return "forehand";
  if (role === "rubber_bh") return "backhand";
  return undefined;
};

const toRoleMap = (items: RecommendationPackageItem[] | undefined) => {
  const next: Partial<Record<PackageItemRole, string>> = {};
  (items ?? []).forEach((item) => {
    const role = normalizeItemRole(item.role);
    if (role) next[role] = item.productId;
  });
  return next;
};

const toCustomDrafts = (items: RecommendationPackageItem[] | undefined): CustomItemDraft[] =>
  (items ?? []).map((item) => ({
    id: generateClientId(),
    productId: item.productId,
    ...(normalizeItemRole(item.role) ? { role: normalizeItemRole(item.role) } : {}),
  }));

const formatRole = (role?: PackageItemRole) => {
  if (role === "single") return "Produs";
  if (role === "blade") return "Lemn";
  if (role === "forehand") return "Forehand";
  if (role === "backhand") return "Rever";
  return "Fără rol";
};

const getProductImageUrl = (product?: WithId<Product> | null) => product?.imageUrl || product?.imageUrls?.[0];

type PackageProductPickerProps = {
  products: WithId<Product>[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  dialogTitle: string;
  dialogDescription: string;
};

function PackageProductPicker({
  products,
  value,
  onChange,
  placeholder,
  dialogTitle,
  dialogDescription,
}: PackageProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sortedProducts = useMemo(() => products.slice().sort((a, b) => a.name.localeCompare(b.name)), [products]);
  const selectedProduct = useMemo(
    () => sortedProducts.find((product) => product.id === value) ?? null,
    [sortedProducts, value],
  );
  const filteredProducts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return sortedProducts;
    return sortedProducts.filter((product) => {
      const haystack = `${product.name} ${product.brand ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [search, sortedProducts]);

  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const selectedImageUrl = getProductImageUrl(selectedProduct);

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setOpen(true)}>
        <span className="truncate text-left">{selectedProduct?.name ?? placeholder}</span>
        <span className="text-muted-foreground text-xs">{selectedProduct ? "Schimbă" : "Alege"}</span>
      </Button>

      {selectedProduct ? (
        <div className="flex items-center gap-3 rounded-md border p-2">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted">
            {selectedImageUrl ? (
              <Image
                src={selectedImageUrl}
                alt={selectedProduct.name}
                fill
                sizes="44px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <PackageIcon className="size-4" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm">{selectedProduct.name}</div>
            <div className="text-muted-foreground text-xs">
              {selectedProduct.brand ?? "Fără brand"} • {selectedProduct.price} {selectedProduct.currency}
            </div>
          </div>
          {!selectedProduct.active ? <Badge variant="outline">Inactiv</Badge> : null}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
          Niciun produs selectat.
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-none sm:!max-w-none flex h-[90vh] w-[95vw] flex-col gap-4 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Caută produs după nume sau brand"
              className="h-11 pl-9"
            />
          </div>

          <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <div className="space-y-3 p-4">
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <PackageIcon className="size-10 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm">Nu s-au găsit produse.</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const imageUrl = getProductImageUrl(product);
                  const isSelected = product.id === value;
                  return (
                    <Card
                      key={product.id}
                      className={cn(
                        "cursor-pointer border-2 p-3 transition-all hover:border-primary hover:shadow-md",
                        isSelected ? "border-primary bg-primary/5" : "border-border",
                      )}
                      onClick={() => {
                        onChange(product.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={product.name}
                              fill
                              sizes="56px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <PackageIcon className="size-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-sm">{product.name}</div>
                          <div className="text-muted-foreground text-xs">{product.brand ?? "Fără brand"}</div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {!product.active ? (
                            <Badge variant="outline" className="text-xs">
                              Inactiv
                            </Badge>
                          ) : null}
                          <Badge variant="secondary" className="text-xs">
                            {product.price} {product.currency}
                          </Badge>
                          {isSelected ? <Check className="size-4 text-primary" /> : null}
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="flex shrink-0 items-center justify-between">
            <div className="text-muted-foreground text-xs">
              {selectedProduct ? `Selectat: ${selectedProduct.name}` : "Niciun produs selectat."}
            </div>
            {selectedProduct ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Elimină selecția
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PackageForm({
  products,
  initialValues,
  defaultMode,
  presetImportRuleId,
  onSubmit,
  onCancel,
}: PackageFormProps) {
  const initialMode = initialValues?.mode ?? defaultMode ?? "single";
  const roleMap = toRoleMap(initialValues?.items);
  const form = useForm<PackageFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      active: initialValues?.active ?? true,
      title: initialValues?.title ?? "",
      description: initialValues?.description ?? "",
      mode: initialMode,
      singleProductId: roleMap.single ?? "",
      bladeProductId: roleMap.blade ?? "",
      forehandProductId: roleMap.forehand ?? "",
      backhandProductId: roleMap.backhand ?? "",
      attributes: {
        control: initialValues?.attributes?.control,
        spin: initialValues?.attributes?.spin,
        speed: initialValues?.attributes?.speed,
      },
    },
  });

  const [customItems, setCustomItems] = useState<CustomItemDraft[]>(() => {
    if (initialValues?.mode === "custom") {
      return toCustomDrafts(initialValues.items);
    }
    if (initialMode === "custom") {
      return [createEmptyCustomItem()];
    }
    return [];
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [vocabularyCategories, setVocabularyCategories] = useState<WithId<VocabularyCategory>[]>([]);
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioDraft[]>([]);
  const scenariosRef = useRef<ScenarioDraft[]>([]);
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false);
  const [editingScenarioIndex, setEditingScenarioIndex] = useState<number | null>(null);
  const [scenarioDialogMode, setScenarioDialogMode] = useState<"add" | "edit">("edit");
  const [isRuleImportOpen, setIsRuleImportOpen] = useState(false);
  const [isQuestionnaireDialogOpen, setIsQuestionnaireDialogOpen] = useState(false);
  const [isRuleImportLoading, setIsRuleImportLoading] = useState(false);
  const [isRuleImportApplying, setIsRuleImportApplying] = useState(false);
  const [ruleImportError, setRuleImportError] = useState<string | null>(null);
  const [ruleSets, setRuleSets] = useState<WithId<RecommendationRuleSet>[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [questionnaires, setQuestionnaires] = useState<WithId<Questionnaire>[]>([]);
  const [isQuestionnaireLoading, setIsQuestionnaireLoading] = useState(false);
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(null);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  const [questionnaireQuestionsById, setQuestionnaireQuestionsById] = useState<
    Record<string, WithId<QuestionnaireQuestion>[]>
  >({});
  const [questionnaireQuestionsLoading, setQuestionnaireQuestionsLoading] = useState<Record<string, boolean>>({});
  const [questionnaireQuestionsError, setQuestionnaireQuestionsError] = useState<Record<string, string | null>>({});
  const importedPresetRuleIdsRef = useRef<Set<string>>(new Set());
  const initializedScenarioSourceRef = useRef<RecommendationPackage | undefined>(undefined);

  const updateScenarios = useCallback((updater: (prev: ScenarioDraft[]) => ScenarioDraft[]) => {
    const next = updater(scenariosRef.current);
    scenariosRef.current = next;
    setScenarios(next);
    return next;
  }, []);

  const sortedVocabularyCategories = useMemo(
    () => vocabularyCategories.slice().sort((a, b) => a.order - b.order),
    [vocabularyCategories],
  );
  const vocabularyKeys = useMemo(
    () => sortedVocabularyCategories.map((category) => category.key),
    [sortedVocabularyCategories],
  );
  const selectedQuestionnaire = useMemo(
    () => questionnaires.find((item) => item.id === selectedQuestionnaireId) ?? null,
    [questionnaires, selectedQuestionnaireId],
  );
  const selectedQuestionnaireQuestions = useMemo(
    () => (selectedQuestionnaireId ? (questionnaireQuestionsById[selectedQuestionnaireId] ?? []) : []),
    [questionnaireQuestionsById, selectedQuestionnaireId],
  );
  const hasSelectedQuestionnaireData = selectedQuestionnaireId
    ? selectedQuestionnaireId in questionnaireQuestionsById
    : false;
  const selectedQuestionnaireAnalysis = useMemo(
    () =>
      selectedQuestionnaireId && hasSelectedQuestionnaireData
        ? analyzeQuestionnaireScenario(
            {
              conditions: {},
            },
            selectedQuestionnaireQuestions,
          )
        : null,
    [hasSelectedQuestionnaireData, selectedQuestionnaireId, selectedQuestionnaireQuestions],
  );
  const editingScenario = editingScenarioIndex !== null ? (scenarios[editingScenarioIndex] ?? null) : null;
  const editingQuestionnaireId = editingScenario?.questionnaireBinding?.questionnaireId ?? "";
  const hasEditingQuestionnaireData = editingQuestionnaireId
    ? editingQuestionnaireId in questionnaireQuestionsById
    : false;
  const editingQuestionnaireQuestions = useMemo(
    () => (editingQuestionnaireId ? (questionnaireQuestionsById[editingQuestionnaireId] ?? []) : []),
    [editingQuestionnaireId, questionnaireQuestionsById],
  );
  const editingQuestionnaireAnalysis = useMemo(
    () =>
      editingQuestionnaireId && editingScenario && hasEditingQuestionnaireData
        ? analyzeQuestionnaireScenario(editingScenario, editingQuestionnaireQuestions)
        : null,
    [editingQuestionnaireId, editingQuestionnaireQuestions, editingScenario, hasEditingQuestionnaireData],
  );
  const editingQuestionnaireError = editingQuestionnaireId
    ? (questionnaireQuestionsError[editingQuestionnaireId] ?? null)
    : null;
  const isEditingQuestionnaireLoading = editingQuestionnaireId
    ? Boolean(questionnaireQuestionsLoading[editingQuestionnaireId])
    : false;

  useEffect(() => {
    listVocabularyKeys({ includeInactive: true })
      .then((items) => {
        setVocabularyCategories(items);
        setVocabularyError(null);
      })
      .catch((err) => {
        logFirebaseError("Packages: loadVocabularyKeys", err);
        const info = getFirebaseErrorInfo(err);
        setVocabularyError(info.message || "Nu pot încărca Vocabulary.");
        setVocabularyCategories([]);
      });
  }, []);

  useEffect(() => {
    if (!initialValues) {
      initializedScenarioSourceRef.current = undefined;
      scenariosRef.current = [];
      setScenarios([]);
      return;
    }
    if (initializedScenarioSourceRef.current === initialValues) return;
    initializedScenarioSourceRef.current = initialValues;
    const nextScenarios = (initialValues.recommendationScenarios ?? []).map((scenario) =>
      toScenarioDraft(scenario, vocabularyKeys, generateClientId()),
    );
    scenariosRef.current = nextScenarios;
    setScenarios(nextScenarios);
  }, [initialValues, vocabularyKeys]);

  useEffect(() => {
    if (!isRuleImportOpen) return;
    setIsRuleImportLoading(true);
    setRuleImportError(null);
    listRuleSets()
      .then((items) => setRuleSets(items))
      .catch((err) => {
        logFirebaseError("Packages: loadRuleSetsForImport", err);
        const info = getFirebaseErrorInfo(err);
        setRuleImportError(info.message || "Nu pot încărca regulile reutilizabile.");
        setRuleSets([]);
      })
      .finally(() => setIsRuleImportLoading(false));
  }, [isRuleImportOpen]);

  const loadQuestionnaires = useCallback(async () => {
    setIsQuestionnaireLoading(true);
    setQuestionnaireError(null);
    try {
      const items = await listQuestionnaires();
      setQuestionnaires(items);
      setSelectedQuestionnaireId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        return items[0]?.id ?? "";
      });
    } catch (err) {
      logFirebaseError("Packages: loadQuestionnaires", err);
      const info = getFirebaseErrorInfo(err);
      setQuestionnaireError(info.message || "Nu pot încărca chestionarele.");
      setQuestionnaires([]);
    } finally {
      setIsQuestionnaireLoading(false);
    }
  }, []);

  const loadQuestionnaireQuestions = useCallback(
    async (questionnaireId: string) => {
      const normalizedId = questionnaireId.trim();
      if (!normalizedId) return;
      if (questionnaireQuestionsById[normalizedId] || questionnaireQuestionsLoading[normalizedId]) return;

      setQuestionnaireQuestionsLoading((prev) => ({ ...prev, [normalizedId]: true }));
      setQuestionnaireQuestionsError((prev) => ({ ...prev, [normalizedId]: null }));
      try {
        const items = await listQuestions(normalizedId);
        setQuestionnaireQuestionsById((prev) => ({ ...prev, [normalizedId]: items }));
      } catch (err) {
        logFirebaseError("Packages: loadQuestionnaireQuestions", err);
        const info = getFirebaseErrorInfo(err);
        setQuestionnaireQuestionsError((prev) => ({
          ...prev,
          [normalizedId]: info.message || "Nu pot încărca întrebările chestionarului.",
        }));
      } finally {
        setQuestionnaireQuestionsLoading((prev) => ({ ...prev, [normalizedId]: false }));
      }
    },
    [questionnaireQuestionsById, questionnaireQuestionsLoading],
  );

  useEffect(() => {
    if (!isQuestionnaireDialogOpen) return;
    void loadQuestionnaires();
  }, [isQuestionnaireDialogOpen, loadQuestionnaires]);

  useEffect(() => {
    if (!selectedQuestionnaireId) return;
    void loadQuestionnaireQuestions(selectedQuestionnaireId);
  }, [loadQuestionnaireQuestions, selectedQuestionnaireId]);

  useEffect(() => {
    const questionnaireIds = [
      ...new Set(scenarios.map((scenario) => scenario.questionnaireBinding?.questionnaireId).filter(Boolean)),
    ];
    questionnaireIds.forEach((questionnaireId) => {
      if (!questionnaireId) return;
      void loadQuestionnaireQuestions(questionnaireId);
    });
  }, [loadQuestionnaireQuestions, scenarios]);

  useEffect(() => {
    const ruleId = presetImportRuleId?.trim();
    if (!ruleId || importedPresetRuleIdsRef.current.has(ruleId)) return;
    importedPresetRuleIdsRef.current.add(ruleId);

    let isCancelled = false;
    const importPresetRule = async () => {
      try {
        const rule = await getRuleSet(ruleId);
        if (isCancelled) return;
        const source = rule ? getRuleScenario(rule) : null;
        if (!rule || !source) {
          setFormError((prev) => prev ?? "Nu am găsit regula preset pentru import sau nu are scenariu valid.");
          return;
        }
        updateScenarios((prev) => {
          const nextOrder = prev.length ? Math.max(...prev.map((scenario) => scenario.order)) + 1 : 0;
          return [
            ...prev,
            {
              ...toScenarioDraft(source, vocabularyKeys, generateClientId()),
              order: nextOrder,
            },
          ];
        });
      } catch (err) {
        if (isCancelled) return;
        logFirebaseError("Packages: importPresetRule", err);
        const info = getFirebaseErrorInfo(err);
        setFormError((prev) => prev ?? (info.message || "Nu am putut importa regula preset."));
      }
    };

    void importPresetRule();
    return () => {
      isCancelled = true;
    };
  }, [presetImportRuleId, updateScenarios, vocabularyKeys]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const mode = form.watch("mode");
  const selectedIds = form.watch(["singleProductId", "bladeProductId", "forehandProductId", "backhandProductId"]);
  const selectedProductIds = useMemo(() => {
    if (mode === "custom") {
      return customItems.map((item) => item.productId.trim()).filter(Boolean);
    }
    const [singleProductId, bladeProductId, forehandProductId, backhandProductId] = selectedIds;
    const ids =
      mode === "single" ? [singleProductId] : [bladeProductId, forehandProductId, backhandProductId].filter(Boolean);
    return ids.map((id) => id.trim()).filter(Boolean);
  }, [customItems, mode, selectedIds]);
  const selectedProducts = useMemo(
    () => selectedProductIds.map((id) => productsById.get(id)).filter((item): item is WithId<Product> => Boolean(item)),
    [productsById, selectedProductIds],
  );
  const totalPrice = useMemo(
    () => Number(selectedProducts.reduce((sum, product) => sum + Number(product.price ?? 0), 0).toFixed(2)),
    [selectedProducts],
  );
  const currencies = useMemo(
    () => [...new Set(selectedProducts.map((product) => product.currency))],
    [selectedProducts],
  );
  const currencyLabel = currencies.length === 1 ? currencies[0] : currencies.length > 1 ? "MIX" : "—";
  const selectedRuleIdSet = useMemo(() => new Set(selectedRuleIds), [selectedRuleIds]);

  const customHasEmptyProducts = mode === "custom" && customItems.some((item) => !item.productId.trim());
  const customOutOfBounds = mode === "custom" && (customItems.length < 1 || customItems.length > MAX_CUSTOM_ITEMS);
  const hasMissingRequiredProducts =
    (mode === "single" && !selectedIds[0]?.trim()) ||
    (mode === "triple" && (!selectedIds[1]?.trim() || !selectedIds[2]?.trim() || !selectedIds[3]?.trim())) ||
    (mode === "custom" && customHasEmptyProducts);

  const isSubmitting = form.formState.isSubmitting;
  const isSubmitBlocked = isSubmitting || currencies.length > 1 || customOutOfBounds || hasMissingRequiredProducts;

  useEffect(() => {
    if (mode !== "custom") return;
    if (customItems.length > 0) return;
    setCustomItems([createEmptyCustomItem()]);
  }, [customItems.length, mode]);

  const addCustomItem = () => {
    if (customItems.length >= MAX_CUSTOM_ITEMS) return;
    setCustomItems((prev) => [...prev, createEmptyCustomItem()]);
  };

  const removeCustomItem = (itemId: string) => {
    setCustomItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateCustomItem = (itemId: string, patch: Partial<CustomItemDraft>) => {
    setCustomItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  };

  const updateScenario = (index: number, patch: Partial<ScenarioDraft>) => {
    updateScenarios((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const openScenarioDialog = (index: number) => {
    setEditingScenarioIndex(index);
    setScenarioDialogMode("edit");
    setIsScenarioDialogOpen(true);
  };

  const handleAddScenario = () => {
    const nextOrder = scenariosRef.current.length
      ? Math.max(...scenariosRef.current.map((scenario) => scenario.order)) + 1
      : 0;
    const nextScenario = createLegacyScenarioDraft(generateClientId(), nextOrder, vocabularyKeys);
    const nextScenarios = updateScenarios((prev) => [...prev, nextScenario]);
    setEditingScenarioIndex(nextScenarios.length - 1);
    setScenarioDialogMode("add");
    setIsScenarioDialogOpen(true);
  };

  const handleDeleteScenario = (index: number) => {
    updateScenarios((prev) => prev.filter((_, idx) => idx !== index));
    if (editingScenarioIndex === index) {
      setIsScenarioDialogOpen(false);
      setEditingScenarioIndex(null);
    } else if (editingScenarioIndex !== null && editingScenarioIndex > index) {
      setEditingScenarioIndex(editingScenarioIndex - 1);
    }
  };

  const toggleRuleImportSelection = (id: string) => {
    setSelectedRuleIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleImportSelectedRules = async () => {
    if (isRuleImportApplying || selectedRuleIds.length === 0) return;
    setIsRuleImportApplying(true);
    setRuleImportError(null);
    try {
      const selectedRules = ruleSets.filter((item) => selectedRuleIdSet.has(item.id));
      const incomingScenarios = selectedRules.map((rule) => getRuleScenario(rule)).filter(Boolean);
      if (incomingScenarios.length === 0) {
        setRuleImportError("Regulile selectate nu conțin scenarii valide.");
        return;
      }
      updateScenarios((prev) => {
        const maxOrder = prev.length ? Math.max(...prev.map((scenario) => scenario.order)) : -1;
        return [
          ...prev,
          ...incomingScenarios.map((scenario, index) => ({
            ...toScenarioDraft(scenario, vocabularyKeys, generateClientId()),
            order: maxOrder + index + 1,
          })),
        ];
      });
      setIsRuleImportOpen(false);
      setSelectedRuleIds([]);
    } finally {
      setIsRuleImportApplying(false);
    }
  };

  const handleImportQuestionnaireScenario = () => {
    if (!selectedQuestionnaire) return;
    if (!selectedQuestionnaireAnalysis || selectedQuestionnaireAnalysis.eligibleQuestions.length === 0) return;
    const nextOrder = scenariosRef.current.length
      ? Math.max(...scenariosRef.current.map((scenario) => scenario.order)) + 1
      : 0;
    const nextScenario = createQuestionnaireScenarioDraft({
      id: generateClientId(),
      order: nextOrder,
      questionnaireId: selectedQuestionnaire.id,
      questionnaireTitleSnapshot: selectedQuestionnaire.title,
    });
    const nextScenarios = updateScenarios((prev) => [...prev, nextScenario]);
    setEditingScenarioIndex(nextScenarios.length - 1);
    setScenarioDialogMode("add");
    setIsQuestionnaireDialogOpen(false);
    setIsScenarioDialogOpen(true);
  };

  const submit = async (values: PackageFormValues) => {
    let modeItems: RecommendationPackageItem[] = [];
    if (values.mode === "single") {
      modeItems = [{ role: "single", productId: values.singleProductId.trim() }];
    } else if (values.mode === "triple") {
      modeItems = [
        { role: "blade", productId: values.bladeProductId.trim() },
        { role: "forehand", productId: values.forehandProductId.trim() },
        { role: "backhand", productId: values.backhandProductId.trim() },
      ];
    } else {
      const trimmedItems = customItems.map((item) => ({
        productId: item.productId.trim(),
        ...(item.role ? { role: item.role } : {}),
      }));
      if (trimmedItems.length < 1) {
        setFormError("Pachetul custom trebuie să conțină cel puțin un produs.");
        return;
      }
      if (trimmedItems.length > MAX_CUSTOM_ITEMS) {
        setFormError(`Pachetul custom poate conține maxim ${MAX_CUSTOM_ITEMS} produse.`);
        return;
      }
      if (trimmedItems.some((item) => !item.productId)) {
        setFormError("Completează produsul pentru fiecare item din pachet.");
        return;
      }
      modeItems = trimmedItems;
    }

    if (modeItems.some((item) => !item.productId)) {
      setFormError("Completează toate produsele necesare pentru modul selectat.");
      return;
    }
    if (currencies.length > 1) {
      setFormError("Produsele selectate au monede diferite. Pachetul nu poate fi salvat.");
      return;
    }

    const payload: PackageFormPayload = {
      active: values.active,
      title: values.title.trim(),
      description: values.description.trim(),
      mode: values.mode,
      items: modeItems,
      attributes: compactNumberFields({
        control: values.attributes.control,
        spin: values.attributes.spin,
        speed: values.attributes.speed,
      }),
      recommendationScenarios: scenariosRef.current.map(serializeScenarioDraft),
    };
    try {
      setFormError(null);
      await onSubmit(payload);
    } catch (err) {
      logFirebaseError("Packages: save", err);
      const info = getFirebaseErrorInfo(err);
      setFormError(info.message || "Salvarea pachetului a eșuat.");
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
        {formError ? (
          <div className="rounded-md border bg-muted p-3 text-sm">
            <div className="font-semibold">Eroare</div>
            <div className="text-muted-foreground">{formError}</div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="active"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-md border p-3 md:col-span-2">
                <div>
                  <FormLabel>Pachet activ</FormLabel>
                  <div className="text-muted-foreground text-xs">Doar pachetele active intră în matching.</div>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Titlu pachet</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Set ofensiv all-round" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mod pachet</FormLabel>
                <Select value={field.value} onValueChange={(value) => field.onChange(value as PackageMode)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="custom">Custom (1..N produse)</SelectItem>
                    <SelectItem value="single">Single (1 produs)</SelectItem>
                    <SelectItem value="triple">Triple (lemn + 2 fețe)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Descriere (opțional)</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Detalii interne pentru admin..." {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Atribute pachet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-muted-foreground text-sm">
              Valorile sunt opționale și se folosesc la sortarea recomandărilor (viteză/spin/control).
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="attributes.speed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Viteză</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="attributes.spin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spin</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="attributes.control"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Control</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Componente pachet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "single" ? (
              <FormField
                control={form.control}
                name="singleProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produs</FormLabel>
                    <PackageProductPicker
                      products={products}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      placeholder="Selectează produsul"
                      dialogTitle="Selectează produsul pachetului"
                      dialogDescription="Alege produsul care va fi folosit în pachet."
                    />
                  </FormItem>
                )}
              />
            ) : null}

            {mode === "triple" ? (
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="bladeProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lemn</FormLabel>
                      <PackageProductPicker
                        products={products}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Selectează lemnul"
                        dialogTitle="Selectează produsul pentru lemn"
                        dialogDescription="Alege produsul pentru rolul lemn."
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="forehandProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forehand</FormLabel>
                      <PackageProductPicker
                        products={products}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Selectează forehand"
                        dialogTitle="Selectează produsul pentru forehand"
                        dialogDescription="Alege produsul pentru rolul forehand."
                      />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="backhandProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rever</FormLabel>
                      <PackageProductPicker
                        products={products}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Selectează rever"
                        dialogTitle="Selectează produsul pentru rever"
                        dialogDescription="Alege produsul pentru rolul backhand."
                      />
                    </FormItem>
                  )}
                />
              </div>
            ) : null}

            {mode === "custom" ? (
              <div className="space-y-3">
                <div className="text-muted-foreground text-sm">
                  Adaugă între 1 și {MAX_CUSTOM_ITEMS} produse. Rolul este opțional.
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {customItems.map((item, index) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="mb-2 font-medium text-sm">Item {index + 1}</div>
                      <div className="grid gap-3 md:grid-cols-12">
                        <div className="md:col-span-7">
                          <FormLabel>Produs</FormLabel>
                          <PackageProductPicker
                            products={products}
                            value={item.productId ?? ""}
                            onChange={(value) => updateCustomItem(item.id, { productId: value })}
                            placeholder="Selectează produsul"
                            dialogTitle={`Selectează produsul pentru item ${index + 1}`}
                            dialogDescription="Alege produsul care intră în acest item din pachet."
                          />
                        </div>
                        <div className="md:col-span-4">
                          <FormLabel>Rol (opțional)</FormLabel>
                          <Select
                            value={item.role ?? ROLE_NONE}
                            onValueChange={(value) =>
                              updateCustomItem(item.id, {
                                role: value === ROLE_NONE ? undefined : (value as PackageItemRole),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ROLE_NONE}>Fără rol</SelectItem>
                              <SelectItem value="single">{formatRole("single")}</SelectItem>
                              <SelectItem value="blade">{formatRole("blade")}</SelectItem>
                              <SelectItem value="forehand">{formatRole("forehand")}</SelectItem>
                              <SelectItem value="backhand">{formatRole("backhand")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end md:col-span-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeCustomItem(item.id)}
                            disabled={customItems.length <= 1}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCustomItem}
                    disabled={customItems.length >= MAX_CUSTOM_ITEMS}
                  >
                    <Plus className="mr-2 size-4" />
                    Adaugă produs
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 rounded-md border bg-muted/40 p-3 md:grid-cols-2">
              <div>
                <div className="text-muted-foreground text-xs">Preț total (calculat)</div>
                <div className="font-semibold text-lg">{totalPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Monedă</div>
                <div className="font-semibold text-lg">{currencyLabel}</div>
              </div>
              {currencies.length > 1 ? (
                <div className="text-destructive text-xs md:col-span-2">
                  Produsele selectate au monede diferite. Salvarea este blocată.
                </div>
              ) : null}
              {customOutOfBounds ? (
                <div className="text-destructive text-xs md:col-span-2">
                  Pachetul custom trebuie să conțină între 1 și {MAX_CUSTOM_ITEMS} produse.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scenarii recomandare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-muted-foreground text-sm">
              Definește condițiile de recomandare direct în pachet. Matching-ul folosește aceste scenarii.
            </div>
            {scenarios.length === 0 ? (
              <div className="text-muted-foreground text-sm">Nu există scenarii încă.</div>
            ) : (
              <div className="space-y-3">
                {scenarios.map((scenario, index) => {
                  const questionnaireId = scenario.questionnaireBinding?.questionnaireId ?? "";
                  const hasQuestionnaireData = questionnaireId ? questionnaireId in questionnaireQuestionsById : false;
                  const questionnaireQuestions = questionnaireId
                    ? (questionnaireQuestionsById[questionnaireId] ?? [])
                    : [];
                  const questionnaireWarnings =
                    questionnaireId && hasQuestionnaireData
                      ? analyzeQuestionnaireScenario(scenario, questionnaireQuestions).warnings
                      : [];
                  const questionnaireLoadError = questionnaireId
                    ? (questionnaireQuestionsError[questionnaireId] ?? null)
                    : null;
                  const isQuestionnaireChecking = questionnaireId
                    ? Boolean(questionnaireQuestionsLoading[questionnaireId])
                    : false;

                  return (
                    <div key={scenario.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="font-medium">Scenariu {index + 1}</div>
                          <div className="flex flex-wrap items-center gap-2">
                            {scenario.questionnaireBinding?.questionnaireId ? (
                              <Badge variant="secondary">
                                Chestionar: {scenario.questionnaireBinding.questionnaireTitleSnapshot || "Necunoscut"}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Legacy</Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {formatScenarioSummary(scenario, sortedVocabularyCategories)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {scenario.active ? "Activ" : "Inactiv"} • order: {scenario.order}
                          </div>
                          {isQuestionnaireChecking ? (
                            <div className="text-muted-foreground text-xs">
                              Se verifică întrebările chestionarului...
                            </div>
                          ) : null}
                          {questionnaireLoadError ? (
                            <div className="text-destructive text-xs">{questionnaireLoadError}</div>
                          ) : null}
                          {questionnaireWarnings.map((warning) => (
                            <div
                              key={`${scenario.id}-${warning.type}-${warning.key}`}
                              className="text-amber-700 text-xs"
                            >
                              {warning.message}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openScenarioDialog(index)}>
                            Editează
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteScenario(index)}>
                            Șterge
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRuleImportOpen(true)} disabled={isSubmitting}>
                Importă reguli reutilizabile
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsQuestionnaireDialogOpen(true)}
                disabled={isSubmitting}
              >
                Importă din chestionar
              </Button>
              <Button type="button" variant="outline" onClick={handleAddScenario} disabled={isSubmitting}>
                <Plus className="mr-2 size-4" />
                Adaugă scenariu
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={isScenarioDialogOpen}
          onOpenChange={(open) => {
            setIsScenarioDialogOpen(open);
            if (!open) setEditingScenarioIndex(null);
          }}
        >
          <DialogContent className="!max-w-none sm:!max-w-none flex h-[92vh] w-[96vw] flex-col gap-4 p-6">
            <DialogHeader className="shrink-0">
              <DialogTitle>{scenarioDialogMode === "edit" ? "Editează scenariu" : "Adaugă scenariu"}</DialogTitle>
              <DialogDescription>
                {editingScenario?.questionnaireBinding?.questionnaireId
                  ? "Alege răspunsurile bune direct din întrebările chestionarului selectat."
                  : "Configurează condițiile clasice pe Vocabulary."}
              </DialogDescription>
            </DialogHeader>
            {editingScenarioIndex !== null && editingScenario ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-muted-foreground text-sm">Scenariu {editingScenarioIndex + 1}</div>
                  <Switch
                    checked={editingScenario.active}
                    onCheckedChange={(checked) => updateScenario(editingScenarioIndex, { active: checked })}
                  />
                </div>

                {editingScenario.questionnaireBinding?.questionnaireId ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        Chestionar: {editingScenario.questionnaireBinding.questionnaireTitleSnapshot || "Necunoscut"}
                      </Badge>
                    </div>
                    {isEditingQuestionnaireLoading ? (
                      <div className="text-muted-foreground text-sm">Se încarcă întrebările chestionarului...</div>
                    ) : null}
                    {editingQuestionnaireError ? (
                      <div className="text-destructive text-sm">{editingQuestionnaireError}</div>
                    ) : null}
                    {editingQuestionnaireAnalysis?.warnings.length ? (
                      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                        {editingQuestionnaireAnalysis.warnings.map((warning) => (
                          <div key={`${warning.type}-${warning.key}`} className="text-amber-700 text-sm">
                            {warning.message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!isEditingQuestionnaireLoading &&
                    !editingQuestionnaireError &&
                    editingQuestionnaireAnalysis?.eligibleQuestions.length === 0 ? (
                      <div className="text-muted-foreground text-sm">
                        Nu există întrebări active eligibile (`single_select` sau `multi_select`) pentru acest
                        chestionar.
                      </div>
                    ) : null}
                    <div className="grid gap-4 xl:grid-cols-2">
                      {editingQuestionnaireAnalysis?.eligibleQuestions.map((question) => (
                        <div key={question.id} className="space-y-2 rounded-md border p-3">
                          <FormLabel className="flex items-center gap-2">
                            <InfoTip
                              text={
                                question.helpText?.trim() ||
                                "Selectează opțiunile care fac pachetul potrivit pentru această întrebare."
                              }
                            />
                            {question.label}
                          </FormLabel>
                          <div className="text-muted-foreground text-xs">Key: {question.key}</div>
                          <OptionMultiSelect
                            items={(question.options ?? [])
                              .filter((option) => option.active)
                              .map((option) => ({ value: option.value, label: option.label }))}
                            value={editingQuestionnaireAnalysis.selectionsByQuestionId[question.id] ?? []}
                            onChange={(value) =>
                              updateScenarios((prev) =>
                                prev.map((item, idx) =>
                                  idx === editingScenarioIndex
                                    ? updateScenarioQuestionSelection(item, question, value)
                                    : item,
                                ),
                              )
                            }
                            emptyMessage="Întrebarea nu are opțiuni active."
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {vocabularyError ? <div className="text-destructive text-sm">{vocabularyError}</div> : null}
                    {sortedVocabularyCategories.length === 0 ? (
                      <div className="text-muted-foreground text-sm">Nu există categorii în Vocabulary.</div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {sortedVocabularyCategories.map((category) => {
                          const label = category.active ? category.title : `${category.title} (inactiv)`;
                          const tip =
                            category.description?.trim() ||
                            `Alege valorile care fac pachetul potrivit pentru ${category.title.toLowerCase()}.`;
                          return (
                            <div key={category.key} className="space-y-2">
                              <FormLabel className="flex items-center gap-2">
                                <InfoTip text={tip} />
                                {label}
                              </FormLabel>
                              <VocabularyMultiSelect
                                vocabKey={category.key}
                                value={editingScenario.conditions[category.key] ?? []}
                                onChange={(value) =>
                                  updateScenario(editingScenarioIndex, {
                                    conditions: { ...editingScenario.conditions, [category.key]: value },
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <FormLabel className="flex items-center gap-2">
                      <InfoTip text="Mai mic = scenariul este verificat mai devreme." />
                      Ordine
                    </FormLabel>
                    <Input
                      type="number"
                      value={editingScenario.order}
                      onChange={(event) =>
                        updateScenario(editingScenarioIndex, { order: Number(event.target.value || 0) })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel className="flex items-center gap-2">
                    <InfoTip text="Textul afișat ca explicație pentru recomandare (opțional)." />
                    Explicație
                  </FormLabel>
                  <Textarea
                    rows={3}
                    value={editingScenario.explanationTemplate}
                    onChange={(event) =>
                      updateScenario(editingScenarioIndex, { explanationTemplate: event.target.value })
                    }
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => setIsScenarioDialogOpen(false)}>
                    {scenarioDialogMode === "edit" ? "Închide" : "Gata"}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={isRuleImportOpen}
          onOpenChange={(open) => {
            setIsRuleImportOpen(open);
            if (!open) {
              setSelectedRuleIds([]);
              setRuleImportError(null);
            }
          }}
        >
          <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
            <DialogHeader className="shrink-0">
              <DialogTitle>Importă reguli reutilizabile</DialogTitle>
              <DialogDescription>
                Selectează una sau mai multe reguli din pagina Reguli recomandări. Importul folosește append merge.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {ruleImportError ? <div className="text-destructive text-sm">{ruleImportError}</div> : null}

              {isRuleImportLoading ? (
                <div className="text-muted-foreground text-sm">Se încarcă regulile...</div>
              ) : ruleSets.length === 0 ? (
                <div className="text-muted-foreground text-sm">Nu există reguli reutilizabile disponibile.</div>
              ) : (
                <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-md border">
                  <div className="space-y-2 p-3">
                    {ruleSets.map((rule) => {
                      const source = getRuleScenario(rule);
                      const isChecked = selectedRuleIdSet.has(rule.id);
                      const summaryScenario = source ? toScenarioDraft(source, vocabularyKeys, rule.id) : null;
                      return (
                        <div
                          key={rule.id}
                          className={`flex items-start gap-3 rounded-md border p-3 ${source ? "" : "opacity-60"}`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleRuleImportSelection(rule.id)}
                            disabled={!source}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">{rule.title}</div>
                            <div className="text-muted-foreground text-xs">
                              {source && summaryScenario
                                ? formatScenarioSummary(summaryScenario, sortedVocabularyCategories)
                                : "Regula nu are scenariu valid."}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <Button asChild type="button" variant="outline" size="sm">
                  <Link href="/dashboard/recommendation-rules">Gestionează reguli</Link>
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsRuleImportOpen(false)}>
                    Anulează
                  </Button>
                  <Button
                    type="button"
                    onClick={handleImportSelectedRules}
                    disabled={isRuleImportApplying || selectedRuleIds.length === 0}
                  >
                    {isRuleImportApplying ? "Se importă..." : `Importă (${selectedRuleIds.length})`}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isQuestionnaireDialogOpen}
          onOpenChange={(open) => {
            setIsQuestionnaireDialogOpen(open);
            if (!open) setQuestionnaireError(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Importă din chestionar</DialogTitle>
              <DialogDescription>
                Alege chestionarul din care vrei să preiei întrebările și opțiunile pentru scenariul pachetului.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {questionnaireError ? <div className="text-destructive text-sm">{questionnaireError}</div> : null}
              {isQuestionnaireLoading ? (
                <div className="text-muted-foreground text-sm">Se încarcă chestionarele...</div>
              ) : questionnaires.length === 0 ? (
                <div className="text-muted-foreground text-sm">Nu există chestionare disponibile.</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <FormLabel>Chestionar</FormLabel>
                    <Select value={selectedQuestionnaireId} onValueChange={setSelectedQuestionnaireId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Alege chestionarul" />
                      </SelectTrigger>
                      <SelectContent>
                        {questionnaires.map((questionnaire) => (
                          <SelectItem key={questionnaire.id} value={questionnaire.id}>
                            {questionnaire.title}
                            {questionnaire.active ? "" : " (inactiv)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedQuestionnaire ? (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{selectedQuestionnaire.title}</Badge>
                        {!selectedQuestionnaire.active ? <Badge variant="outline">Inactiv</Badge> : null}
                      </div>
                      {selectedQuestionnaireId && questionnaireQuestionsLoading[selectedQuestionnaireId] ? (
                        <div className="text-muted-foreground text-sm">Se încarcă întrebările...</div>
                      ) : null}
                      {selectedQuestionnaireId && questionnaireQuestionsError[selectedQuestionnaireId] ? (
                        <div className="text-destructive text-sm">
                          {questionnaireQuestionsError[selectedQuestionnaireId]}
                        </div>
                      ) : null}
                      {selectedQuestionnaireAnalysis ? (
                        <>
                          <div className="text-muted-foreground text-sm">
                            {selectedQuestionnaireAnalysis.eligibleQuestions.length} întrebări eligibile pentru editor.
                          </div>
                          {selectedQuestionnaireAnalysis.warnings.map((warning) => (
                            <div key={`${warning.type}-${warning.key}`} className="text-amber-700 text-sm">
                              {warning.message}
                            </div>
                          ))}
                          {selectedQuestionnaireAnalysis.eligibleQuestions.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {selectedQuestionnaireAnalysis.eligibleQuestions.map((question) => (
                                <Badge key={question.id} variant="outline">
                                  {question.label}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsQuestionnaireDialogOpen(false)}>
                  Anulează
                </Button>
                <Button
                  type="button"
                  onClick={handleImportQuestionnaireScenario}
                  disabled={
                    !selectedQuestionnaire ||
                    Boolean(selectedQuestionnaireId && questionnaireQuestionsLoading[selectedQuestionnaireId]) ||
                    Boolean(selectedQuestionnaireId && questionnaireQuestionsError[selectedQuestionnaireId]) ||
                    (selectedQuestionnaireAnalysis?.eligibleQuestions.length ?? 0) === 0
                  }
                >
                  Importă și editează
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Renunță
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitBlocked}>
            {isSubmitting ? "Se salvează..." : "Salvează pachetul"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
