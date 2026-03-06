"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Image from "next/image";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
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
import { deleteProductImage, uploadProductImage } from "@/lib/firebase/storage.client";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import { listRuleSets } from "@/lib/firestore/recommendation-rule-sets";
import type {
  Product,
  Questionnaire,
  QuestionnaireQuestion,
  RecommendationRuleSet,
  WithId,
} from "@/lib/firestore/types";
import { listVocabularyKeys, type VocabularyCategory } from "@/lib/firestore/vocabulary";
import { convertEurToRonWithVat, normalizePricingConfig, type PricingConfig } from "@/lib/pricing/prestashop-price";
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

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number().optional(),
);

const formSchema = z.object({
  active: z.boolean(),
  name: z.string().min(1, "Name is required."),
  brand: z.string().optional(),
  imageUrls: z.array(z.string()),
  price: z.coerce.number().min(0, "Price must be positive."),
  currency: z.enum(["EUR", "RON"]),
  attributes: z.object({
    control: optionalNumber,
    spin: optionalNumber,
    speed: optionalNumber,
    weight: optionalNumber,
  }),
});

type ProductFormValues = z.infer<typeof formSchema>;

const defaultValues: ProductFormValues = {
  active: true,
  name: "",
  brand: "",
  imageUrls: [],
  price: 0,
  currency: "EUR",
  attributes: {
    control: undefined,
    spin: undefined,
    speed: undefined,
    weight: undefined,
  },
};

type ProductFormProps = {
  initialValues?: Product;
  prefillValues?: Partial<ProductFormValues>;
  imageSource?: "manual" | "prestashop";
  pricingConfig?: PricingConfig;
  basePriceEur?: number;
  enableAutoRonConversion?: boolean;
  onSubmit: (values: Omit<Product, "createdAt" | "updatedAt">) => Promise<void>;
  onCancel?: () => void;
};

const compactNumberFields = (values: Record<string, number | undefined>) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

type PendingImageFile = {
  id: string;
  file: File;
  previewUrl: string;
};

const generateClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export function ProductForm({
  initialValues,
  prefillValues,
  imageSource = "manual",
  pricingConfig,
  basePriceEur,
  enableAutoRonConversion = true,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues
      ? {
          active: initialValues.active,
          name: initialValues.name,
          brand: initialValues.brand ?? "",
          imageUrls: initialValues.imageUrls ?? [],
          price: initialValues.price,
          currency: initialValues.currency,
          attributes: {
            control: initialValues.attributes.control,
            spin: initialValues.attributes.spin,
            speed: initialValues.attributes.speed,
            weight: initialValues.attributes.weight,
          },
        }
      : defaultValues,
  });
  const isSubmitting = form.formState.isSubmitting;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageUrlsValue = form.watch("imageUrls");
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingImageFile[]>([]);
  const [pendingDeleteUrls, setPendingDeleteUrls] = useState<Set<string>>(new Set());
  const pendingFilesRef = useRef<PendingImageFile[]>([]);

  const [scenarios, setScenarios] = useState<ScenarioDraft[]>([]);
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false);
  const [editingScenarioIndex, setEditingScenarioIndex] = useState<number | null>(null);
  const [scenarioDialogMode, setScenarioDialogMode] = useState<"add" | "edit">("edit");
  const [isRuleSetDialogOpen, setIsRuleSetDialogOpen] = useState(false);
  const [isQuestionnaireDialogOpen, setIsQuestionnaireDialogOpen] = useState(false);
  const [ruleSets, setRuleSets] = useState<WithId<RecommendationRuleSet>[]>([]);
  const [ruleSetSelection, setRuleSetSelection] = useState<string[]>([]);
  const [isRuleSetLoading, setIsRuleSetLoading] = useState(false);
  const [ruleSetError, setRuleSetError] = useState<string | null>(null);
  const [questionnaires, setQuestionnaires] = useState<WithId<Questionnaire>[]>([]);
  const [isQuestionnaireLoading, setIsQuestionnaireLoading] = useState(false);
  const [questionnaireError, setQuestionnaireError] = useState<string | null>(null);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState("");
  const [questionnaireQuestionsById, setQuestionnaireQuestionsById] = useState<
    Record<string, WithId<QuestionnaireQuestion>[]>
  >({});
  const [questionnaireQuestionsLoading, setQuestionnaireQuestionsLoading] = useState<Record<string, boolean>>({});
  const [questionnaireQuestionsError, setQuestionnaireQuestionsError] = useState<Record<string, string | null>>({});
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

  const ruleSetSelectionSet = useMemo(() => new Set(ruleSetSelection), [ruleSetSelection]);
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
  const normalizedPricing = useMemo(() => normalizePricingConfig(pricingConfig), [pricingConfig]);
  const watchedCurrency = form.watch("currency");
  const previousCurrencyRef = useRef<"EUR" | "RON">(form.getValues("currency"));
  const lastEurBeforeRonRef = useRef<number | null>(
    typeof basePriceEur === "number" && Number.isFinite(basePriceEur) ? basePriceEur : null,
  );
  const skipNextCurrencyTransitionRef = useRef(false);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      pendingFilesRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (!initialValues) {
      setScenarios([]);
      return;
    }
    setScenarios(
      (initialValues.recommendationScenarios ?? []).map((scenario) =>
        toScenarioDraft(scenario, vocabularyKeys, generateClientId()),
      ),
    );
  }, [initialValues, vocabularyKeys]);

  useEffect(() => {
    listVocabularyKeys({ includeInactive: true })
      .then((items) => {
        setVocabularyCategories(items);
        setVocabularyError(null);
      })
      .catch((err) => {
        logFirebaseError("Products: loadVocabularyKeys", err);
        const info = getFirebaseErrorInfo(err);
        setVocabularyError(info.message || "Nu pot încărca Vocabulary.");
        setVocabularyCategories([]);
      });
  }, []);

  useEffect(() => {
    if (!isRuleSetDialogOpen) return;
    setIsRuleSetLoading(true);
    setRuleSetError(null);
    listRuleSets()
      .then((items) => {
        setRuleSets(items);
      })
      .catch((err) => {
        logFirebaseError("Products: loadRuleSets", err);
        const info = getFirebaseErrorInfo(err);
        setRuleSetError(info.message || "Nu pot încărca seturile de reguli.");
        setRuleSets([]);
      })
      .finally(() => {
        setIsRuleSetLoading(false);
      });
  }, [isRuleSetDialogOpen]);

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
      logFirebaseError("Products: loadQuestionnaires", err);
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
        logFirebaseError("Products: loadQuestionnaireQuestions", err);
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
    if (!prefillValues) return;
    if (prefillValues.name !== undefined) form.setValue("name", prefillValues.name, { shouldDirty: true });
    if (prefillValues.brand !== undefined) form.setValue("brand", prefillValues.brand, { shouldDirty: true });
    if (prefillValues.price !== undefined) form.setValue("price", prefillValues.price, { shouldDirty: true });
    if (prefillValues.currency !== undefined) {
      skipNextCurrencyTransitionRef.current = true;
      form.setValue("currency", prefillValues.currency, { shouldDirty: true });
      previousCurrencyRef.current = prefillValues.currency;
    }
    if (prefillValues.active !== undefined) form.setValue("active", prefillValues.active, { shouldDirty: true });
    if (prefillValues.imageUrls !== undefined) {
      form.setValue("imageUrls", prefillValues.imageUrls, { shouldDirty: true });
    }
  }, [form, prefillValues]);

  useEffect(() => {
    if (typeof basePriceEur === "number" && Number.isFinite(basePriceEur)) {
      lastEurBeforeRonRef.current = basePriceEur;
    }
  }, [basePriceEur]);

  useEffect(() => {
    const currentCurrency = watchedCurrency;
    const previousCurrency = previousCurrencyRef.current;
    if (currentCurrency === previousCurrency) return;
    if (skipNextCurrencyTransitionRef.current) {
      skipNextCurrencyTransitionRef.current = false;
      previousCurrencyRef.current = currentCurrency;
      return;
    }
    if (!enableAutoRonConversion) {
      previousCurrencyRef.current = currentCurrency;
      return;
    }

    if (previousCurrency === "EUR" && currentCurrency === "RON") {
      const eurPrice = Number(form.getValues("price") ?? 0);
      if (Number.isFinite(eurPrice)) {
        lastEurBeforeRonRef.current = eurPrice;
        const converted = convertEurToRonWithVat(
          eurPrice,
          normalizedPricing.exchangeRateEurRon,
          normalizedPricing.vatPercent,
        );
        form.setValue("price", converted, { shouldDirty: true, shouldValidate: true });
      }
    }

    if (previousCurrency === "RON" && currentCurrency === "EUR") {
      const fallbackEur = lastEurBeforeRonRef.current;
      if (typeof fallbackEur === "number" && Number.isFinite(fallbackEur)) {
        form.setValue("price", fallbackEur, { shouldDirty: true, shouldValidate: true });
      }
    }

    previousCurrencyRef.current = currentCurrency;
  }, [
    enableAutoRonConversion,
    form,
    normalizedPricing.exchangeRateEurRon,
    normalizedPricing.vatPercent,
    watchedCurrency,
  ]);

  const handleSubmit = async (values: ProductFormValues) => {
    const attributes = compactNumberFields(values.attributes);
    const recommendationScenarios = scenarios.map(serializeScenarioDraft);
    const activeScenarios = scenarios.filter((s) => s.active);
    const tags = {
      level: [...new Set(activeScenarios.flatMap((s) => s.conditions.level ?? []))],
      style: [...new Set(activeScenarios.flatMap((s) => s.conditions.style ?? []))],
      distance: [...new Set(activeScenarios.flatMap((s) => s.conditions.distance ?? []))],
    };

    try {
      setUploadError(null);
      setIsUploading(true);

      // Upload staged files only when user submits.
      const uploadedUrls = pendingFiles.length
        ? await Promise.all(pendingFiles.map((item) => uploadProductImage(item.file)))
        : [];

      const finalImageUrls = [...(values.imageUrls ?? []), ...uploadedUrls];

      const payload: Omit<Product, "createdAt" | "updatedAt"> = {
        active: values.active,
        name: values.name.trim(),
        ...(values.brand?.trim() ? { brand: values.brand.trim() } : {}),
        ...(finalImageUrls.length ? { imageUrls: finalImageUrls } : {}),
        price: values.price,
        currency: values.currency,
        tags,
        attributes,
        recommendationScenarios,
      };

      await onSubmit(payload);

      // Delete marked images only after Firestore update succeeds.
      if (pendingDeleteUrls.size > 0) {
        await Promise.all([...pendingDeleteUrls].map((url) => deleteProductImage(url)));
      }

      // Clear staged UI state after success.
      pendingFiles.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
      });
      setPendingFiles([]);
      setPendingDeleteUrls(new Set());
      form.setValue("imageUrls", finalImageUrls, { shouldDirty: true, shouldValidate: true });
    } catch (err) {
      logFirebaseError("Products: submitWithImages", err);
      const info = getFirebaseErrorInfo(err);
      setUploadError(info.message || "Salvarea produsului a eșuat.");
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setUploadError("Te rugăm să selectezi fișiere imagine.");
      return;
    }

    try {
      setUploadError(null);
      // UI-only: stage files locally. Upload happens on submit.
      const staged = imageFiles.map((file) => ({
        id: generateClientId(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setPendingFiles((prev) => [...prev, ...staged]);
    } catch (err) {
      logFirebaseError("Products: stageImages", err);
      const info = getFirebaseErrorInfo(err);
      setUploadError(info.message || "Adăugarea imaginilor a eșuat.");
    } finally {
      event.target.value = "";
    }
  };

  const handleRemoveExistingImage = (url: string) => {
    // UI-only: mark for deletion; actual Storage delete happens on submit.
    setPendingDeleteUrls((prev) => new Set(prev).add(url));
    const currentUrls = form.getValues("imageUrls");
    form.setValue(
      "imageUrls",
      currentUrls.filter((u) => u !== url),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const handleRemovePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const updateScenario = (index: number, patch: Partial<ScenarioDraft>) => {
    setScenarios((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const handleDeleteScenario = async (_scenario: ScenarioDraft, index: number) => {
    setScenarios((prev) => prev.filter((_, idx) => idx !== index));
    if (editingScenarioIndex === index) {
      setIsScenarioDialogOpen(false);
      setEditingScenarioIndex(null);
    }
  };

  const handleAddScenario = () => {
    const nextOrder = scenarios.length ? Math.max(...scenarios.map((s) => s.order)) + 1 : 0;
    const nextScenario = createLegacyScenarioDraft(generateClientId(), nextOrder, vocabularyKeys);
    setScenarios((prev) => [...prev, nextScenario]);
    setEditingScenarioIndex(scenarios.length);
    setScenarioDialogMode("add");
    setIsScenarioDialogOpen(true);
  };

  const handleImportRuleSets = () => {
    if (ruleSetSelection.length === 0) return;
    const selectedSets = ruleSets.filter((item) => ruleSetSelectionSet.has(item.id));
    if (selectedSets.length === 0) return;
    setScenarios((prev) => {
      const maxOrder = prev.length ? Math.max(...prev.map((s) => s.order)) : -1;
      let nextOrder = maxOrder + 1;
      const additions: ScenarioDraft[] = [];
      selectedSets.forEach((set) => {
        const source = set.scenario ?? set.scenarios?.[0];
        if (!source) return;
        additions.push({
          ...toScenarioDraft(source, vocabularyKeys, generateClientId()),
          order: nextOrder,
        });
        nextOrder += 1;
      });
      return [...prev, ...additions];
    });
    setIsRuleSetDialogOpen(false);
    setRuleSetSelection([]);
  };

  const handleImportQuestionnaireScenario = () => {
    if (!selectedQuestionnaire) return;
    if (!selectedQuestionnaireAnalysis || selectedQuestionnaireAnalysis.eligibleQuestions.length === 0) return;
    const nextOrder = scenarios.length ? Math.max(...scenarios.map((scenario) => scenario.order)) + 1 : 0;
    const nextScenario = createQuestionnaireScenarioDraft({
      id: generateClientId(),
      order: nextOrder,
      questionnaireId: selectedQuestionnaire.id,
      questionnaireTitleSnapshot: selectedQuestionnaire.title,
    });
    setScenarios((prev) => [...prev, nextScenario]);
    setEditingScenarioIndex(scenarios.length);
    setScenarioDialogMode("add");
    setIsQuestionnaireDialogOpen(false);
    setIsScenarioDialogOpen(true);
  };

  const openScenarioDialog = (index: number) => {
    setEditingScenarioIndex(index);
    setScenarioDialogMode("edit");
    setIsScenarioDialogOpen(true);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-md border p-4">
              <FormLabel>Activ</FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nume</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preț</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monedă</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Alege moneda" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="RON">RON</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Brand</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Card data-tour="product-scenarios">
          <CardHeader>
            <CardTitle>Reguli recomandare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-muted-foreground text-sm">
              Aici definești când acest produs este recomandat. Regulile se salvează odată cu produsul și se folosesc
              direct în Test recomandări și în aplicația mobilă.
            </div>
            {scenarios.length === 0 ? (
              <div className="text-muted-foreground text-sm">Nu există reguli încă.</div>
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
                          <div className="font-medium">Regulă {index + 1}</div>
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteScenario(scenario, index)}
                          >
                            Șterge
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsRuleSetDialogOpen(true)}>
                Importă reguli
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsQuestionnaireDialogOpen(true)}>
                Importă din chestionar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddScenario}
                disabled={isSubmitting || isUploading}
              >
                <Plus className="mr-2 size-4" />
                Adaugă regulă
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
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{scenarioDialogMode === "edit" ? "Editează regulă" : "Adaugă regulă"}</DialogTitle>
              <DialogDescription>
                {editingScenario?.questionnaireBinding?.questionnaireId
                  ? "Alege răspunsurile bune direct din întrebările chestionarului selectat."
                  : "Configurează condițiile clasice pe Vocabulary."}
              </DialogDescription>
            </DialogHeader>
            {editingScenarioIndex !== null && editingScenario ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-muted-foreground text-sm">Regulă {editingScenarioIndex + 1}</div>
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
                    <div className="space-y-4">
                      {editingQuestionnaireAnalysis?.eligibleQuestions.map((question) => (
                        <div key={question.id} className="space-y-2 rounded-md border p-3">
                          <FormLabel className="flex items-center gap-2">
                            <InfoTip
                              text={
                                question.helpText?.trim() ||
                                "Selectează opțiunile care fac produsul potrivit pentru această întrebare."
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
                              setScenarios((prev) =>
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
                      <div className="grid gap-4 md:grid-cols-2">
                        {sortedVocabularyCategories.map((category) => {
                          const label = category.active ? category.title : `${category.title} (inactiv)`;
                          const tip =
                            category.description?.trim() ||
                            `Alege valorile care fac produsul potrivit pentru ${category.title.toLowerCase()}.`;
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
                      <InfoTip text="Mai mic = regula este verificată mai devreme." />
                      Ordine
                    </FormLabel>
                    <Input
                      type="number"
                      value={editingScenario.order}
                      onChange={(e) => updateScenario(editingScenarioIndex, { order: Number(e.target.value || 0) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel className="flex items-center gap-2">
                    <InfoTip text="Textul pe care îl vede utilizatorul ca motiv al recomandării (opțional)." />
                    Explicație
                  </FormLabel>
                  <Textarea
                    rows={3}
                    value={editingScenario.explanationTemplate}
                    onChange={(e) => updateScenario(editingScenarioIndex, { explanationTemplate: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-end">
                  <Button type="button" onClick={() => setIsScenarioDialogOpen(false)}>
                    {scenarioDialogMode === "edit" ? "Închide" : "Gata"}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={isRuleSetDialogOpen}
          onOpenChange={(open) => {
            setIsRuleSetDialogOpen(open);
            if (!open) setRuleSetSelection([]);
          }}
        >
          <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
            <DialogTitle>Importă reguli</DialogTitle>
            <DialogDescription>Alege unul sau mai multe seturi de reguli.</DialogDescription>
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {ruleSetError ? <div className="text-destructive text-sm">{ruleSetError}</div> : null}
              <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-md border">
                <div className="space-y-3 p-4">
                  {isRuleSetLoading ? (
                    <div className="text-muted-foreground text-sm">Se încarcă seturile...</div>
                  ) : ruleSets.length === 0 ? (
                    <div className="text-muted-foreground text-sm">Nu există reguli.</div>
                  ) : (
                    ruleSets.map((set) => {
                      const isChecked = ruleSetSelectionSet.has(set.id);
                      const toggle = () =>
                        setRuleSetSelection((prev) =>
                          prev.includes(set.id) ? prev.filter((id) => id !== set.id) : [...prev, set.id],
                        );
                      return (
                        <button
                          key={set.id}
                          type="button"
                          className="flex items-start gap-3 rounded-md border p-3 text-sm"
                          onClick={toggle}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => {
                              /* handled by row click */
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle();
                            }}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{set.title}</div>
                            <div className="text-muted-foreground text-xs">1 regulă</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsRuleSetDialogOpen(false)}>
                  Anulează
                </Button>
                <Button type="button" onClick={handleImportRuleSets} disabled={ruleSetSelection.length === 0}>
                  Importă reguli
                </Button>
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
                Alege chestionarul din care vrei să preiei întrebările și opțiunile pentru scenariul de recomandare.
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

        <div className="space-y-3">
          <FormLabel>Imagini produs</FormLabel>
          {imageSource === "prestashop" ? (
            <>
              <div className="text-muted-foreground text-xs">
                Imaginile sunt preluate din PrestaShop și nu sunt încărcate în Firebase. Poți vedea previzualizarea
                aici; la nevoie deschide imaginea într-un tab nou.
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {imageUrlsValue.length === 0 ? (
                  <div className="text-muted-foreground text-xs">Nu există imagini asociate produsului.</div>
                ) : (
                  imageUrlsValue.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/20"
                    >
                      <Image
                        src={url}
                        alt="Product"
                        fill
                        sizes="25vw"
                        className="object-cover"
                        unoptimized
                        onError={() => setFailedImages((prev) => new Set(prev).add(url))}
                      />
                    </a>
                  ))
                )}
              </div>
              {imageUrlsValue.length > 0 && failedImages.size > 0 ? (
                <div className="text-destructive text-xs">Public URL not accessible. Use proxy mode.</div>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {imageUrlsValue.map((url) => (
                  <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/20">
                    <Image src={url} alt="Product" fill sizes="25vw" className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingImage(url)}
                      className="absolute top-2 right-2 rounded-md bg-destructive p-1.5 text-destructive-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                      title="Șterge imaginea"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {pendingFiles.map((item) => (
                  <div
                    key={item.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-muted/20"
                  >
                    <Image src={item.previewUrl} alt="Preview" fill sizes="25vw" className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => handleRemovePendingFile(item.id)}
                      className="absolute top-2 right-2 rounded-md bg-destructive p-1.5 text-destructive-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100"
                      title="Elimină (ne-salvat)"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-tour="product-image-upload"
                  className="flex aspect-square items-center justify-center rounded-lg border-2 border-muted-foreground/25 border-dashed bg-muted/10 transition-colors hover:border-muted-foreground/50 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <Plus className="size-6" />
                    </div>
                    <span className="font-medium text-sm">{isUploading ? "Se încarcă..." : "Adaugă poze"}</span>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>
              {uploadError ? <div className="text-destructive text-xs">{uploadError}</div> : null}
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <FormField
            control={form.control}
            name="attributes.control"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Control</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="attributes.spin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rotire</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="attributes.speed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Viteză</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="attributes.weight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Greutate</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isSubmitting || isUploading}>
            {isSubmitting ? "Se salvează..." : "Salvează produsul"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Anulează
            </Button>
          ) : null}
        </div>
      </form>
    </Form>
  );
}
