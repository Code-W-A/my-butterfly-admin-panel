"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { deleteField } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { logFirebaseError } from "@/lib/firebase/error-utils.client";
import { createQuestion, deleteQuestion, listAllQuestionOptionValues, updateQuestion } from "@/lib/firestore/questions";
import type { QuestionnaireQuestion, QuestionnaireQuestionVisibilityRule, WithId } from "@/lib/firestore/types";
import { listVocabularyKeys, listVocabularyOptions, type VocabularyCategory } from "@/lib/firestore/vocabulary";

const questionSchema = z.object({
  active: z.boolean(),
  order: z.coerce.number().int().min(0),
  type: z.enum(["single_select", "multi_select", "text", "range"]),
  key: z.string().min(1),
  label: z.string().min(1),
  helpText: z.string().optional(),
  options: z
    .array(
      z.object({
        value: z.string().min(1),
        label: z.string().min(1),
        order: z.coerce.number().int(),
        active: z.boolean(),
      }),
    )
    .optional(),
  validation: z.object({
    required: z.boolean(),
    min: z.coerce.number().optional(),
    max: z.coerce.number().optional(),
  }),
  visibilityRules: z
    .array(
      z.object({
        questionId: z.string().min(1),
        optionValues: z.array(z.string().min(1)).min(1),
      }),
    )
    .optional(),
});

type QuestionFormValues = z.infer<typeof questionSchema>;
type OptionDraft = NonNullable<QuestionFormValues["options"]>[number];
type VocabularyKeyOption = { value: string; label: string };

const defaultValues: QuestionFormValues = {
  active: true,
  order: 0,
  type: "single_select",
  key: "level",
  label: "",
  helpText: "",
  options: [],
  validation: {
    required: false,
    min: undefined,
    max: undefined,
  },
  visibilityRules: [],
};

const questionTypeOptions: Array<{ value: QuestionFormValues["type"]; label: string }> = [
  { value: "single_select", label: "Selecție unică" },
  { value: "multi_select", label: "Selecție multiplă" },
  { value: "text", label: "Text" },
  { value: "range", label: "Interval" },
];

const guessQuestionKey = (selected: WithId<QuestionnaireQuestion>): QuestionFormValues["key"] | null => {
  // 1) Try option values (best signal for legacy questions)
  const optionValues = (selected.options ?? []).map((o) => String(o.value ?? "").toLowerCase());
  const optionLabels = (selected.options ?? []).map((o) => String(o.label ?? "").toLowerCase());
  const all = [...optionValues, ...optionLabels].join(" ");

  if (/(beginner|intermediate|advanced|incepator|începător|intermediar|avansat)/.test(all)) return "level";
  if (/(offensive|all[-_ ]?round|defensive|ofensiv|defensiv)/.test(all)) return "style";
  if (/(close|near|medium|mid|far|aproape|mediu|departe)/.test(all)) return "distance";
  if (/(control|spin|speed|vitez)/.test(all)) return "priority";

  // 2) Fallback to question text
  const text = `${selected.label ?? ""} ${selected.helpText ?? ""}`.toLowerCase();
  if (/(nivel)/.test(text)) return "level";
  if (/(stil)/.test(text)) return "style";
  if (/(distan)/.test(text)) return "distance";
  if (/(priorit)/.test(text)) return "priority";
  if (/(buget)/.test(text)) return "budget";
  if (/(prefer)/.test(text)) return "preferences";
  return null;
};

const normalizeQuestionKey = (selected: WithId<QuestionnaireQuestion>): QuestionFormValues["key"] => {
  if (typeof selected.key === "string" && selected.key.trim()) return selected.key;
  return guessQuestionKey(selected) ?? "level";
};

const normalizeQuestionType = (selected: WithId<QuestionnaireQuestion>): QuestionFormValues["type"] => {
  const t = selected.type;
  if (t === "single_select" || t === "multi_select" || t === "text" || t === "range") return t;
  if (selected.validation?.min !== undefined || selected.validation?.max !== undefined) return "range";
  if ((selected.options ?? []).length > 0) return "single_select";
  return "text";
};

const slugify = (value: string) => {
  const ascii = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "option";
};

const randomSuffix = () => {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0].toString(36).slice(0, 4);
  }
  return Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
};

const generateUniqueValue = (label: string, existing: Set<string>) => {
  const base = slugify(label);
  for (let i = 0; i < 6; i += 1) {
    const candidate = `${base}-${randomSuffix()}`;
    if (!existing.has(candidate)) return candidate;
  }
  return null;
};

type QuestionEditorProps = {
  questionnaireId: string;
  selected: WithId<QuestionnaireQuestion> | null;
  availableQuestions: WithId<QuestionnaireQuestion>[];
  defaultOrder?: number;
  onSaved: () => void;
  onCancelEdit: () => void;
};

export function QuestionEditor({
  questionnaireId,
  selected,
  availableQuestions,
  defaultOrder,
  onSaved,
  onCancelEdit,
}: QuestionEditorProps) {
  const router = useRouter();
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues,
  });

  const { fields, append, remove, replace, update } = useFieldArray({
    control: form.control,
    name: "options",
  });
  const {
    fields: ruleFields,
    append: appendRule,
    remove: removeRule,
  } = useFieldArray({
    control: form.control,
    name: "visibilityRules",
  });

  const typeValue = form.watch("type");
  const isSubmitting = form.formState.isSubmitting;
  const requiresOptions = typeValue === "single_select" || typeValue === "multi_select";
  const isRangeType = typeValue === "range";
  const keyValue = form.watch("key");
  const rulesValue = form.watch("visibilityRules") ?? [];
  const [vocabularyCategories, setVocabularyCategories] = useState<WithId<VocabularyCategory>[]>([]);
  const [vocabularyOptionCounts, setVocabularyOptionCounts] = useState<Record<string, number>>({});
  const vocabularyKeyValues = useMemo(() => vocabularyCategories.map((item) => item.key), [vocabularyCategories]);
  const vocabularyKeyOptions = useMemo<VocabularyKeyOption[]>(() => {
    const base: VocabularyKeyOption[] = [
      ...vocabularyCategories
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          value: item.key,
          label:
            (item.active ? item.title : `${item.title} (inactiv)`) +
            ((vocabularyOptionCounts[item.key] ?? 0) === 0 ? " (fara raspunsuri)" : ""),
        })),
      ...(vocabularyKeyValues.includes("preferences") ? [] : [{ value: "preferences", label: "Preferințe" }]),
      ...(vocabularyKeyValues.includes("budget") ? [] : [{ value: "budget", label: "Buget" }]),
    ];
    const currentKey = String(keyValue ?? "").trim();
    if (currentKey && !base.some((option) => option.value === currentKey)) {
      base.unshift({ value: currentKey, label: `${currentKey} (legacy)` });
    }
    return base;
  }, [vocabularyCategories, vocabularyKeyValues, keyValue, vocabularyOptionCounts]);
  const isVocabularyKey = vocabularyKeyValues.includes(String(keyValue));
  const vocabularyKeysWithoutAnswers = useMemo(
    () => vocabularyCategories.filter((category) => (vocabularyOptionCounts[category.key] ?? 0) === 0),
    [vocabularyCategories, vocabularyOptionCounts],
  );

  const keyHelpText = useMemo(() => {
    const key = String(keyValue || "");
    const category = vocabularyCategories.find((c) => c.key === key);

    if (key === "preferences") {
      return "Preferințe: răspunsul ajută la ordonarea recomandărilor (ex: control/spin/viteză/greutate). Nu elimină produse direct, ci poate schimba ordinea în rezultate.";
    }
    if (key === "budget") {
      return "Buget: răspunsul filtrează recomandările în funcție de preț (ex: interval minim–maxim) și de regulile de buget din scenariile produselor.";
    }
    if (key === "priority") {
      return "Prioritate: este folosită ca criteriu de potrivire cu scenariile (dacă un scenariu cere o anumită prioritate, produsul apare doar când răspunsul se potrivește).";
    }
    if (key === "level" || key === "style" || key === "distance") {
      return "Răspunsul este folosit ca criteriu de potrivire cu scenariile produselor (dacă un scenariu are această condiție setată, produsul apare doar când răspunsul se potrivește).";
    }
    if (category) {
      return `Categorie din Vocabulary: “${category.title}”. Răspunsul este folosit ca criteriu de potrivire cu scenariile produselor pentru această categorie.`;
    }
    return "Răspunsul este folosit în calculul recomandărilor, în funcție de reguli/scenarii configurate la produse.";
  }, [keyValue, vocabularyCategories]);
  const [isOptionDialogOpen, setIsOptionDialogOpen] = useState(false);
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null);
  const [optionDraft, setOptionDraft] = useState<OptionDraft | null>(null);
  const [optionError, setOptionError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const prevKeyRef = useRef<string | null>(null);

  const conditionQuestions = useMemo(
    () =>
      availableQuestions.filter(
        (q) => q.id !== selected?.id && (q.type === "single_select" || q.type === "multi_select"),
      ),
    [availableQuestions, selected?.id],
  );

  const getQuestionOptions = useCallback(
    (questionId: string) => {
      const question = conditionQuestions.find((q) => q.id === questionId);
      if (!question?.options?.length) return [];
      return question.options.filter((opt) => opt.active);
    },
    [conditionQuestions],
  );

  useEffect(() => {
    listVocabularyKeys({ includeInactive: true })
      .then((items) => setVocabularyCategories(items))
      .catch((err) => {
        logFirebaseError("QuestionEditor: loadVocabularyKeys", err);
        setVocabularyCategories([]);
      });
  }, []);

  useEffect(() => {
    if (!vocabularyCategories.length) {
      setVocabularyOptionCounts({});
      return;
    }
    let cancelled = false;
    Promise.all(
      vocabularyCategories.map(async (category) => {
        try {
          const options = await listVocabularyOptions(category.key, { includeInactive: false });
          return [category.key, options.length] as const;
        } catch (err) {
          logFirebaseError("QuestionEditor: loadVocabularyOptionsCount", err);
          return [category.key, 0] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setVocabularyOptionCounts(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [vocabularyCategories]);

  useEffect(() => {
    if (selected) {
      const normalizedType = normalizeQuestionType(selected);
      const normalizedKey = normalizeQuestionKey(selected);
      form.reset({
        active: selected.active,
        order: selected.order,
        type: normalizedType,
        key: normalizedKey,
        label: selected.label,
        helpText: selected.helpText ?? "",
        options: selected.options ?? [],
        validation: {
          required: selected.validation?.required ?? false,
          min: selected.validation?.min,
          max: selected.validation?.max,
        },
        visibilityRules: selected.visibilityRules ?? [],
      });
    } else {
      form.reset({
        ...defaultValues,
        order: Number.isFinite(defaultOrder) ? (defaultOrder as number) : defaultValues.order,
      });
    }
  }, [defaultOrder, form, selected]);

  useEffect(() => {
    // Keep validation constraints relevant to the selected type.
    // For non-range questions, we don't want numeric min/max lingering in Firestore.
    if (!isRangeType) {
      form.setValue("validation.min", undefined);
      form.setValue("validation.max", undefined);
    }
  }, [form, isRangeType]);

  useEffect(() => {
    if (String(keyValue) !== "budget") return;
    if (form.getValues("type") !== "range") {
      form.setValue("type", "range", { shouldDirty: true });
    }
    if (form.getValues("options")?.length) {
      form.setValue("options", [], { shouldDirty: true });
    }
  }, [form, keyValue]);

  useEffect(() => {
    if (String(keyValue) !== "preferences") return;
    if (form.getValues("type") !== "multi_select") {
      form.setValue("type", "multi_select", { shouldDirty: true });
    }
  }, [form, keyValue]);

  const options = form.watch("options") ?? [];
  const importVocabularyOptions = useCallback(async () => {
    if (!isVocabularyKey) return;
    setImportError(null);
    setIsImporting(true);
    try {
      const vocabOptions = await listVocabularyOptions(String(keyValue), { includeInactive: true });
      const next = vocabOptions.map((option) => ({
        value: option.value,
        label: option.label,
        order: option.order,
        active: option.active,
      }));
      replace(next);
    } catch (_err) {
      setImportError("Nu pot importa opțiunile din Vocabulary.");
    } finally {
      setIsImporting(false);
    }
  }, [isVocabularyKey, keyValue, replace]);

  useEffect(() => {
    if (!keyValue) return;
    const currentLabel = form.getValues("label")?.trim() ?? "";
    const prevKey = prevKeyRef.current;
    const prevCategory = prevKey
      ? vocabularyCategories.find((category) => category.key === String(prevKey))
      : undefined;
    const prevStandard = prevCategory?.standardQuestion?.trim();
    const prevBudget = prevKey === "budget" ? "Care este bugetul tău?" : undefined;

    const currentCategory = vocabularyCategories.find((category) => category.key === String(keyValue));
    const standardQuestion = currentCategory?.standardQuestion?.trim();
    const fallbackStandard = keyValue === "budget" ? "Care este bugetul tău?" : undefined;
    const nextStandard = standardQuestion ?? fallbackStandard;
    if (!nextStandard) return;

    const shouldReplace =
      !currentLabel || (prevStandard && currentLabel === prevStandard) || (prevBudget && currentLabel === prevBudget);
    if (!shouldReplace) return;
    form.setValue("label", nextStandard, { shouldDirty: true, shouldTouch: true });
  }, [form, keyValue, vocabularyCategories]);

  useEffect(() => {
    prevKeyRef.current = keyValue;
    if (!requiresOptions || !isVocabularyKey) return;
    void importVocabularyOptions();
  }, [isVocabularyKey, keyValue, requiresOptions, importVocabularyOptions]);

  const openNewOptionDialog = () => {
    setEditingOptionIndex(null);
    setOptionError(null);
    setOptionDraft({
      value: "",
      label: "",
      order: fields.length,
      active: true,
    });
    setIsOptionDialogOpen(true);
  };

  const openEditOptionDialog = (index: number) => {
    const current = form.getValues(`options.${index}`);
    setEditingOptionIndex(index);
    setOptionError(null);
    setOptionDraft({
      value: current?.value ?? "",
      label: current?.label ?? "",
      order: current?.order ?? index,
      active: current?.active ?? true,
    });
    setIsOptionDialogOpen(true);
  };

  const closeOptionDialog = () => {
    setIsOptionDialogOpen(false);
    setEditingOptionIndex(null);
    setOptionDraft(null);
    setOptionError(null);
  };

  const canSaveOption = Boolean(optionDraft?.label.trim());
  const handleSaveOption = async () => {
    if (!optionDraft) return;
    setOptionError(null);
    const label = optionDraft.label.trim();
    if (!label) {
      setOptionError("Completează textul afișat.");
      return;
    }
    const existingValues = await listAllQuestionOptionValues();
    options.forEach((option, index) => {
      if (editingOptionIndex !== null && index === editingOptionIndex) return;
      if (option.value) existingValues.add(option.value);
    });
    let resolvedValue: string | null = optionDraft.value?.trim() ?? null;
    if (!resolvedValue || existingValues.has(resolvedValue)) {
      resolvedValue = generateUniqueValue(label, existingValues);
    }
    if (!resolvedValue) {
      setOptionError("Nu pot genera un ID unic. Încearcă un alt text.");
      return;
    }
    const payload: OptionDraft = {
      ...optionDraft,
      value: resolvedValue,
      label,
      order: Number.isFinite(optionDraft.order) ? Number(optionDraft.order) : 0,
    };
    if (editingOptionIndex === null) {
      append(payload);
    } else {
      update(editingOptionIndex, payload);
    }
    closeOptionDialog();
  };

  const onSubmit = async (values: QuestionFormValues) => {
    let resolvedOptions = values.options ?? [];
    if (requiresOptions && vocabularyKeyValues.includes(String(values.key))) {
      const vocabOptions = await listVocabularyOptions(String(values.key), { includeInactive: true });
      resolvedOptions = vocabOptions.map((option) => ({
        value: option.value,
        label: option.label,
        order: option.order ?? 0,
        active: option.active,
      }));
    }

    const basePayload: Omit<QuestionnaireQuestion, "createdAt" | "updatedAt"> = {
      active: values.active,
      order: values.order,
      type: values.type,
      key: values.key,
      label: values.label.trim(),
      ...(values.helpText?.trim() ? { helpText: values.helpText.trim() } : {}),
      validation: {
        required: values.validation.required,
        ...(values.validation.min !== undefined ? { min: values.validation.min } : {}),
        ...(values.validation.max !== undefined ? { max: values.validation.max } : {}),
      },
    };

    if (selected) {
      const updatePayload: Record<string, unknown> = {
        ...basePayload,
        ...(requiresOptions ? { options: resolvedOptions } : { options: deleteField() }),
        visibilityRules: values.visibilityRules?.length ? values.visibilityRules : deleteField(),
      };
      await updateQuestion(questionnaireId, selected.id, updatePayload);
    } else {
      const createPayload = requiresOptions ? { ...basePayload, options: resolvedOptions } : basePayload;
      if (values.visibilityRules?.length) {
        createPayload.visibilityRules = values.visibilityRules;
      }
      await createQuestion(questionnaireId, createPayload);
    }
    onSaved();
    if (!selected) {
      form.reset(defaultValues);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    await deleteQuestion(questionnaireId, selected.id);
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{selected ? "Editează întrebarea" : "Adaugă întrebare"}</h3>
        {selected ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancelEdit}>
              Anulează editarea
            </Button>
            <Button type="button" variant="destructive" onClick={onDelete}>
              Șterge
            </Button>
          </div>
        ) : null}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem data-tour="question-editor-key">
                  <FormLabel>
                    <InfoTip text="Alege ce fel de întrebare este (Nivel, Stil, Distanță, Prioritate, Preferințe, Buget). Răspunsul se folosește la calculul recomandărilor." />
                    Cheie
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (!value) return;
                      field.onChange(value);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Alege cheia" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {vocabularyKeyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {vocabularyKeysWithoutAnswers.length > 0 ? (
                    <div className="text-muted-foreground text-xs">
                      Fără răspunsuri active în Vocabulary:{" "}
                      {vocabularyKeysWithoutAnswers.map((item) => item.title).join(", ")}.
                    </div>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem data-tour="question-editor-type">
                  <FormLabel>
                    <InfoTip text="Cum răspunde utilizatorul: o opțiune, mai multe, text liber sau un interval." />
                    Tip
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      if (!value) return;
                      field.onChange(value);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Alege tipul" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {questionTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="text-muted-foreground text-xs leading-relaxed">{keyHelpText}</div>

          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <InfoTip text="Întrebarea exactă pe care o vede utilizatorul în aplicație." />
                  Text întrebare
                </FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Care este nivelul tău?" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <InfoTip text="Poziția întrebării în chestionar. Un număr mai mic înseamnă că apare mai sus." />
                    Ordine
                  </FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel>
                    <InfoTip text="Dacă e oprit, întrebarea nu apare utilizatorilor." />
                    Activ
                  </FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="helpText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <InfoTip text="Un rând scurt sub întrebare, ca să explice mai clar ce trebuie completat (opțional)." />
                  Text de ajutor
                </FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className={`grid gap-4 ${isRangeType ? "md:grid-cols-3" : ""}`}>
            <FormField
              control={form.control}
              name="validation.required"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel>
                    <InfoTip text="Dacă e pornit, utilizatorul trebuie să răspundă ca să continue." />
                    Obligatoriu
                  </FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {isRangeType ? (
              <>
                <FormField
                  control={form.control}
                  name="validation.min"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <InfoTip text="Cea mai mică valoare permisă pentru interval." />
                        Minim
                      </FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="validation.max"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <InfoTip text="Cea mai mare valoare permisă pentru interval." />
                        Maxim
                      </FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : null}
          </div>

          {requiresOptions && String(keyValue) !== "budget" ? (
            <div className="space-y-3" data-tour="question-editor-options">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 font-medium">
                  <InfoTip text="Listele de răspuns pe care utilizatorul le poate alege." />
                  Opțiuni
                </h4>
                <div className="flex items-center gap-2">
                  {isVocabularyKey ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void importVocabularyOptions()}
                        disabled={isImporting}
                      >
                        {isImporting ? "Se încarcă..." : "Reîncarcă din Vocabulary"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => router.push("/dashboard/vocabulary")}>
                        Deschide Vocabulary
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" onClick={openNewOptionDialog}>
                      Adaugă opțiune
                    </Button>
                  )}
                </div>
              </div>
              {isVocabularyKey ? (
                <div className="text-muted-foreground text-xs">
                  Opțiunile sunt gestionate exclusiv în Vocabulary și se sincronizează automat aici.
                </div>
              ) : null}
              {importError ? <div className="text-destructive text-xs">{importError}</div> : null}
              {fields.length === 0 ? (
                <div className="text-muted-foreground text-xs">
                  {isVocabularyKey
                    ? "Nu există opțiuni active în Vocabulary pentru această cheie."
                    : "Nu există opțiuni adăugate încă."}
                </div>
              ) : (
                <div className="rounded-md border">
                  {fields.map((fieldItem, index) => {
                    const current = options[index] ?? fieldItem;
                    return (
                      <div
                        key={fieldItem.id}
                        className="flex flex-col gap-3 border-b p-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="space-y-1 text-sm">
                          <div className="font-medium">{current.label || current.value || "Opțiune fără etichetă"}</div>
                          <div className="text-muted-foreground text-xs">
                            Valoare: {current.value || "-"} · Ordine: {current.order ?? "-"} ·{" "}
                            {current.active ? "Activ" : "Inactiv"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isVocabularyKey ? (
                            <span className="text-muted-foreground text-xs">Gestionat în Vocabulary</span>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEditOptionDialog(index)}
                              >
                                Editează
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => remove(index)}>
                                Elimină
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 font-medium">
                <InfoTip text="Definește când această întrebare trebuie să apară, în funcție de răspunsurile anterioare." />
                Se afișează dacă
              </h4>
              <Button type="button" variant="outline" onClick={() => appendRule({ questionId: "", optionValues: [] })}>
                Adaugă condiție
              </Button>
            </div>
            {ruleFields.length === 0 ? (
              <div className="text-muted-foreground text-xs">Întrebarea apare mereu (fără condiții).</div>
            ) : (
              <div className="space-y-3">
                {ruleFields.map((field, index) => {
                  const currentRule = rulesValue[index] as QuestionnaireQuestionVisibilityRule | undefined;
                  const selectedQuestionId = currentRule?.questionId ?? "";
                  const availableOptions = selectedQuestionId ? getQuestionOptions(selectedQuestionId) : [];
                  return (
                    <div key={field.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <FormLabel className="flex items-center gap-2">
                            <InfoTip text="Selectează întrebarea de care depinde afișarea." />
                            Întrebarea
                          </FormLabel>
                          <Select
                            value={selectedQuestionId}
                            onValueChange={(value) => {
                              form.setValue(`visibilityRules.${index}.questionId`, value, { shouldDirty: true });
                              form.setValue(`visibilityRules.${index}.optionValues`, [], { shouldDirty: true });
                            }}
                          >
                            <SelectTrigger className="w-72">
                              <SelectValue placeholder="Alege întrebarea" />
                            </SelectTrigger>
                            <SelectContent className="max-w-sm">
                              {conditionQuestions.map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                  {q.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => removeRule(index)}>
                          Elimină
                        </Button>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="text-muted-foreground text-xs">
                          Întrebarea se afișează dacă răspunsul ales este una dintre valorile de mai jos.
                        </div>
                        {selectedQuestionId ? (
                          availableOptions.length ? (
                            <div className="grid gap-2 md:grid-cols-2">
                              {availableOptions.map((option) => {
                                const checked = currentRule?.optionValues?.includes(option.value) ?? false;
                                const toggle = () => {
                                  const current = currentRule?.optionValues ?? [];
                                  const next = checked
                                    ? current.filter((v) => v !== option.value)
                                    : [...current, option.value];
                                  form.setValue(`visibilityRules.${index}.optionValues`, next, { shouldDirty: true });
                                };
                                return (
                                  <div key={option.value} className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={checked} onCheckedChange={toggle} aria-label={option.label} />
                                    <button type="button" className="text-left hover:underline" onClick={toggle}>
                                      {option.label}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-xs">Nu există opțiuni active.</div>
                          )
                        ) : (
                          <div className="text-muted-foreground text-xs">Alege mai întâi o întrebare.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button type="submit" data-tour="questionnaire-add-question" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {selected ? "Se actualizează..." : "Se adaugă..."}
              </>
            ) : selected ? (
              "Actualizează întrebarea"
            ) : (
              "Adaugă întrebarea"
            )}
          </Button>
        </form>
      </Form>

      <Dialog
        open={isOptionDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeOptionDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOptionIndex === null ? "Adaugă opțiune" : "Editează opțiunea"}</DialogTitle>
          </DialogHeader>
          {optionDraft ? (
            <div className="space-y-4">
              <div className="text-muted-foreground text-xs">ID-ul se generează automat din text.</div>
              <div className="space-y-2">
                <Label>
                  <InfoTip text="Textul pe care îl vede utilizatorul în listă." />
                  Text (afișat)
                </Label>
                <Input
                  value={optionDraft.label}
                  onChange={(event) =>
                    setOptionDraft((current) => (current ? { ...current, label: event.target.value } : current))
                  }
                />
              </div>
              {optionError ? <div className="text-destructive text-xs">{optionError}</div> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    <InfoTip text="Ordinea în care apare opțiunea în listă." />
                    Ordine
                  </Label>
                  <Input
                    type="number"
                    value={optionDraft.order}
                    onChange={(event) =>
                      setOptionDraft((current) =>
                        current
                          ? { ...current, order: event.target.value === "" ? 0 : Number(event.target.value) }
                          : current,
                      )
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label>
                    <InfoTip text="Dacă e oprită, opțiunea nu apare utilizatorului." />
                    Activ
                  </Label>
                  <Switch
                    checked={optionDraft.active}
                    onCheckedChange={(value) =>
                      setOptionDraft((current) => (current ? { ...current, active: value } : current))
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeOptionDialog}>
              Anulează
            </Button>
            <Button type="button" onClick={handleSaveOption} disabled={!canSaveOption}>
              Salvează opțiunea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
