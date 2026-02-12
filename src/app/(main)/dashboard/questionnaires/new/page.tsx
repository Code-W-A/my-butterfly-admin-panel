"use client";

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { createQuestionnaire } from "@/lib/firestore/questionnaires";
import { createQuestion } from "@/lib/firestore/questions";
import { listRuleSets } from "@/lib/firestore/recommendation-rule-sets";
import type { RecommendationRuleSet, WithId } from "@/lib/firestore/types";
import { listVocabularyKeys, listVocabularyOptions } from "@/lib/firestore/vocabulary";
import { generateQuestionsFromRuleSet } from "@/lib/questionnaires/generate-from-rule-set";

const FormSchema = z.object({
  title: z.string().min(2, "Title is required."),
  active: z.boolean(),
});

type CreationMode = "manual" | "rule";

const getRuleScenario = (ruleSet: RecommendationRuleSet) => ruleSet.scenario ?? ruleSet.scenarios?.[0] ?? null;

export default function NewQuestionnairePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [creationMode, setCreationMode] = useState<CreationMode>("manual");
  const [ruleSets, setRuleSets] = useState<WithId<RecommendationRuleSet>[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [isRuleSetsLoading, setIsRuleSetsLoading] = useState(false);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "",
      active: true,
    },
  });

  const presetImportRuleId = searchParams.get("importRuleId")?.trim() ?? "";
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    setIsRuleSetsLoading(true);
    setFormError(null);
    listRuleSets()
      .then((items) => {
        setRuleSets(items);
      })
      .catch((err) => {
        logFirebaseError("Questionnaires/New: loadRuleSets", err);
        const info = getFirebaseErrorInfo(err);
        setFormError(info.message || "Nu pot încărca seturile de reguli.");
        setRuleSets([]);
      })
      .finally(() => setIsRuleSetsLoading(false));
  }, []);

  useEffect(() => {
    if (!presetImportRuleId || isRuleSetsLoading) return;
    const preset = ruleSets.find((item) => item.id === presetImportRuleId);
    if (!preset) {
      setPresetNotice("Nu am găsit setul de reguli presetat. Poți continua manual sau selecta alt set.");
      return;
    }
    if (!getRuleScenario(preset)) {
      setPresetNotice("Setul presetat nu are scenariu valid. Poți selecta alt set sau continua manual.");
      return;
    }
    setPresetNotice(null);
    setCreationMode("rule");
    setSelectedRuleId(preset.id);
    form.setValue("title", preset.title ?? "", { shouldDirty: true, shouldTouch: true });
  }, [form, isRuleSetsLoading, presetImportRuleId, ruleSets]);

  useEffect(() => {
    if (creationMode !== "rule" || !selectedRuleId) return;
    const selectedRule = ruleSets.find((item) => item.id === selectedRuleId);
    if (!selectedRule) return;
    form.setValue("title", selectedRule.title ?? "", { shouldDirty: true, shouldTouch: true });
  }, [creationMode, form, ruleSets, selectedRuleId]);

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    setFormError(null);
    try {
      if (creationMode === "manual") {
        const ref = await createQuestionnaire(values);
        router.push(`/dashboard/questionnaires/${ref.id}`);
        return;
      }

      if (!selectedRuleId) {
        setFormError("Selectează un set de reguli pentru generare.");
        return;
      }

      const selectedRule = ruleSets.find((item) => item.id === selectedRuleId);
      if (!selectedRule) {
        setFormError("Setul de reguli selectat nu există.");
        return;
      }

      if (!getRuleScenario(selectedRule)) {
        setFormError("Regula selectată nu are scenariu valid.");
        return;
      }

      const questionnaireRef = await createQuestionnaire({
        title: values.title,
        active: false,
        linkedRuleSetId: selectedRule.id,
      });

      const vocabularyKeys = await listVocabularyKeys({ includeInactive: true });
      const { questions } = await generateQuestionsFromRuleSet({
        ruleSet: selectedRule,
        vocabularyKeys,
        getVocabularyOptionsByKey: async (key: string) =>
          listVocabularyOptions(key, {
            includeInactive: false,
          }),
      });

      for (const question of questions) {
        await createQuestion(questionnaireRef.id, question);
      }

      router.push(`/dashboard/questionnaires/${questionnaireRef.id}${questions.length === 0 ? "?generated=0" : ""}`);
    } catch (err) {
      logFirebaseError("Questionnaires/New: create", err);
      const info = getFirebaseErrorInfo(err);
      setFormError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {formError ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <div className="font-semibold">Eroare</div>
          <div className="text-muted-foreground">{formError}</div>
        </div>
      ) : null}
      {presetNotice ? (
        <div className="rounded-md border bg-muted p-4 text-sm">
          <div className="font-semibold">Notă</div>
          <div className="text-muted-foreground">{presetNotice}</div>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Creează chestionar</h1>
          <p className="text-muted-foreground text-sm">Adaugă un chestionar nou și începe să adaugi întrebări.</p>
        </div>
        <PageHelpDialog helpKey="questionnaires.new" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormItem>
            <FormLabel>Mod creare</FormLabel>
            <Select
              value={creationMode}
              onValueChange={(value) => {
                const mode = value as CreationMode;
                setCreationMode(mode);
                setFormError(null);
                if (mode === "manual") {
                  setSelectedRuleId("");
                  return;
                }
                const firstValidRule = ruleSets.find((item) => Boolean(getRuleScenario(item)));
                if (!selectedRuleId && firstValidRule) {
                  setSelectedRuleId(firstValidRule.id);
                }
              }}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Alege modul de creare" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="rule">Din set de reguli</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>

          {creationMode === "rule" ? (
            <FormItem>
              <FormLabel>Set de reguli</FormLabel>
              <Select value={selectedRuleId} onValueChange={setSelectedRuleId} disabled={isRuleSetsLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={isRuleSetsLoading ? "Se încarcă..." : "Alege setul"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ruleSets.map((item) => {
                    const hasScenario = Boolean(getRuleScenario(item));
                    return (
                      <SelectItem key={item.id} value={item.id} disabled={!hasScenario}>
                        {item.title}
                        {hasScenario ? "" : " (fără scenariu valid)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Chestionarul va fi creat ca draft (inactiv). Poți adăuga ulterior întrebări precum buget.
              </p>
            </FormItem>
          ) : null}

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem data-tour="questionnaire-title-input">
                <FormLabel>Titlu</FormLabel>
                <FormControl>
                  <Input placeholder="Chestionar de onboarding" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {creationMode === "manual" ? (
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-4">
                  <div>
                    <FormLabel>Activ</FormLabel>
                    <p className="text-muted-foreground text-xs">Chestionarele active apar în aplicația mobilă.</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          ) : (
            <div className="rounded-md border p-4 text-sm">
              <div className="font-medium">Draft automat</div>
              <div className="text-muted-foreground">
                La creare din reguli, chestionarul este salvat inactiv (`draft`) și îl finalizezi în pagina de editare.
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || (creationMode === "rule" && (isRuleSetsLoading || !selectedRuleId))}
            >
              {isSubmitting ? "Se creează..." : creationMode === "rule" ? "Creează draft din reguli" : "Creează"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/questionnaires")}>
              Anulează
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
