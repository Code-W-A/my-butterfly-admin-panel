"use client";

import { useEffect, useRef, useState } from "react";

import Image from "next/image";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { VocabularyMultiSelect } from "@/components/mybutterfly/forms/vocabulary-multi-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { deleteProductImage, uploadProductImage } from "@/lib/firebase/storage.client";
import type { Product, ProductRecommendationScenario } from "@/lib/firestore/types";

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

type ScenarioDraft = {
  id: string;
  active: boolean;
  order: number;
  explanationTemplate: string;
  conditions: {
    level: string[];
    style: string[];
    distance: string[];
    priority: string[];
    budgetMin?: number;
    budgetMax?: number;
  };
};

const generateClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const toScenarioDraft = (scenario: ProductRecommendationScenario): ScenarioDraft => ({
  id: generateClientId(),
  active: scenario.active,
  order: scenario.order,
  explanationTemplate: scenario.explanationTemplate ?? "",
  conditions: {
    level: scenario.conditions.level ?? [],
    style: scenario.conditions.style ?? [],
    distance: scenario.conditions.distance ?? [],
    priority: scenario.conditions.priority ?? [],
    budgetMin: scenario.conditions.budgetMin,
    budgetMax: scenario.conditions.budgetMax,
  },
});

const buildConditions = (scenario: ScenarioDraft): ProductRecommendationScenario["conditions"] => ({
  ...(scenario.conditions.level.length ? { level: scenario.conditions.level } : {}),
  ...(scenario.conditions.style.length ? { style: scenario.conditions.style } : {}),
  ...(scenario.conditions.distance.length ? { distance: scenario.conditions.distance } : {}),
  ...(scenario.conditions.priority.length ? { priority: scenario.conditions.priority } : {}),
  ...(scenario.conditions.budgetMin !== undefined ? { budgetMin: scenario.conditions.budgetMin } : {}),
  ...(scenario.conditions.budgetMax !== undefined ? { budgetMax: scenario.conditions.budgetMax } : {}),
});

const formatScenarioSummary = (scenario: ScenarioDraft) => {
  const parts: string[] = [];
  const { conditions } = scenario;
  if (conditions.level.length) parts.push(`Nivel: ${conditions.level.length}`);
  if (conditions.style.length) parts.push(`Stil: ${conditions.style.length}`);
  if (conditions.distance.length) parts.push(`Distanță: ${conditions.distance.length}`);
  if (conditions.priority.length) parts.push(`Prioritate: ${conditions.priority.length}`);
  if (conditions.budgetMin !== undefined || conditions.budgetMax !== undefined) {
    const min = conditions.budgetMin ?? "—";
    const max = conditions.budgetMax ?? "—";
    parts.push(`Buget: ${min} - ${max}`);
  }
  if (scenario.explanationTemplate.trim()) {
    parts.push("Are explicație");
  }
  return parts.length ? parts.join(" • ") : "Fără condiții setate";
};

export function ProductForm({
  initialValues,
  prefillValues,
  imageSource = "manual",
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
    setScenarios((initialValues.recommendationScenarios ?? []).map((scenario) => toScenarioDraft(scenario)));
  }, [initialValues]);

  useEffect(() => {
    if (!prefillValues) return;
    if (prefillValues.name !== undefined) form.setValue("name", prefillValues.name, { shouldDirty: true });
    if (prefillValues.brand !== undefined) form.setValue("brand", prefillValues.brand, { shouldDirty: true });
    if (prefillValues.price !== undefined) form.setValue("price", prefillValues.price, { shouldDirty: true });
    if (prefillValues.currency !== undefined) form.setValue("currency", prefillValues.currency, { shouldDirty: true });
    if (prefillValues.active !== undefined) form.setValue("active", prefillValues.active, { shouldDirty: true });
    if (prefillValues.imageUrls !== undefined) {
      form.setValue("imageUrls", prefillValues.imageUrls, { shouldDirty: true });
    }
  }, [form, prefillValues]);

  const handleSubmit = async (values: ProductFormValues) => {
    const attributes = compactNumberFields(values.attributes);
    const recommendationScenarios = scenarios.map((scenario) => ({
      active: scenario.active,
      order: scenario.order,
      explanationTemplate: scenario.explanationTemplate.trim(),
      conditions: buildConditions(scenario),
    }));
    const activeScenarios = scenarios.filter((s) => s.active);
    const tags = {
      level: [...new Set(activeScenarios.flatMap((s) => s.conditions.level))],
      style: [...new Set(activeScenarios.flatMap((s) => s.conditions.style))],
      distance: [...new Set(activeScenarios.flatMap((s) => s.conditions.distance))],
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
    const nextScenario: ScenarioDraft = {
      id: generateClientId(),
      active: true,
      order: nextOrder,
      explanationTemplate: "",
      conditions: { level: [], style: [], distance: [], priority: [], budgetMin: undefined, budgetMax: undefined },
    };
    setScenarios((prev) => [...prev, nextScenario]);
    setEditingScenarioIndex(scenarios.length);
    setIsScenarioDialogOpen(true);
  };

  const openScenarioDialog = (index: number) => {
    setEditingScenarioIndex(index);
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
                {scenarios.map((scenario, index) => (
                  <div key={scenario.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">Regulă {index + 1}</div>
                        <div className="text-muted-foreground text-xs">{formatScenarioSummary(scenario)}</div>
                        <div className="text-muted-foreground text-xs">
                          {scenario.active ? "Activ" : "Inactiv"} • order: {scenario.order}
                        </div>
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
                ))}
              </div>
            )}

            <div className="flex items-center justify-end">
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
            <DialogTitle>Editează regulă</DialogTitle>
            {editingScenarioIndex !== null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground text-sm">Regulă {editingScenarioIndex + 1}</div>
                  <Switch
                    checked={scenarios[editingScenarioIndex]?.active ?? false}
                    onCheckedChange={(checked) => updateScenario(editingScenarioIndex, { active: checked })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <FormLabel>Nivel</FormLabel>
                    <VocabularyMultiSelect
                      vocabKey="level"
                      value={scenarios[editingScenarioIndex]?.conditions.level ?? []}
                      onChange={(value) =>
                        updateScenario(editingScenarioIndex, {
                          conditions: { ...scenarios[editingScenarioIndex].conditions, level: value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Stil</FormLabel>
                    <VocabularyMultiSelect
                      vocabKey="style"
                      value={scenarios[editingScenarioIndex]?.conditions.style ?? []}
                      onChange={(value) =>
                        updateScenario(editingScenarioIndex, {
                          conditions: { ...scenarios[editingScenarioIndex].conditions, style: value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Distanță</FormLabel>
                    <VocabularyMultiSelect
                      vocabKey="distance"
                      value={scenarios[editingScenarioIndex]?.conditions.distance ?? []}
                      onChange={(value) =>
                        updateScenario(editingScenarioIndex, {
                          conditions: { ...scenarios[editingScenarioIndex].conditions, distance: value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>Prioritate</FormLabel>
                    <VocabularyMultiSelect
                      vocabKey="priority"
                      value={scenarios[editingScenarioIndex]?.conditions.priority ?? []}
                      onChange={(value) =>
                        updateScenario(editingScenarioIndex, {
                          conditions: { ...scenarios[editingScenarioIndex].conditions, priority: value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <FormLabel>Buget minim</FormLabel>
                    <Input
                      type="number"
                      value={scenarios[editingScenarioIndex]?.conditions.budgetMin ?? ""}
                      onChange={(e) =>
                        updateScenario(editingScenarioIndex, {
                          conditions: {
                            ...scenarios[editingScenarioIndex].conditions,
                            budgetMin: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <FormLabel>Buget maxim</FormLabel>
                    <Input
                      type="number"
                      value={scenarios[editingScenarioIndex]?.conditions.budgetMax ?? ""}
                      onChange={(e) =>
                        updateScenario(editingScenarioIndex, {
                          conditions: {
                            ...scenarios[editingScenarioIndex].conditions,
                            budgetMax: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <FormLabel>Ordine</FormLabel>
                    <Input
                      type="number"
                      value={scenarios[editingScenarioIndex]?.order ?? 0}
                      onChange={(e) => updateScenario(editingScenarioIndex, { order: Number(e.target.value || 0) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FormLabel>Explicație</FormLabel>
                  <Textarea
                    rows={3}
                    value={scenarios[editingScenarioIndex]?.explanationTemplate ?? ""}
                    onChange={(e) => updateScenario(editingScenarioIndex, { explanationTemplate: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
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
