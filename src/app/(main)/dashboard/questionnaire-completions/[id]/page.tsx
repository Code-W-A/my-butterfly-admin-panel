"use client";

import { useEffect, useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getQuestionnaireCompletionById, setQuestionnaireCompletionMatchProductIds } from "@/lib/firestore/completions";
import { getProductsByIds, listProducts } from "@/lib/firestore/products";
import { listQuestions } from "@/lib/firestore/questions";
import type { Product, QuestionnaireCompletion, QuestionnaireQuestion, WithId } from "@/lib/firestore/types";
import { listVocabularyOptions } from "@/lib/firestore/vocabulary";
import { matchProductScenarios, type RecommendationInput } from "@/lib/recommendations/match";

type CompletionItem = WithId<QuestionnaireCompletion>;

type RangeAnswer = { min?: string; max?: string };

const buildImageGallery = (product: Product) => {
  const images = [...(product.imageUrls ?? []), ...(product.imageUrl ? [product.imageUrl] : [])]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(images));
};

const formatAnswer = (value: unknown, question?: QuestionnaireQuestion) => {
  const optionMap = question?.options ? Object.fromEntries(question.options.map((opt) => [opt.value, opt.label])) : {};
  const toLabel = (val: unknown) => {
    const key = String(val ?? "").trim();
    if (!key) return "—";
    return optionMap[key] ?? key;
  };
  if (Array.isArray(value)) return value.map((item) => toLabel(item)).join(", ");
  if (typeof value === "object" && value) {
    const range = value as RangeAnswer;
    if (range.min !== undefined || range.max !== undefined) {
      return `${range.min ?? "—"} - ${range.max ?? "—"}`;
    }
    return JSON.stringify(value);
  }
  if (value === undefined || value === null) return "—";
  return toLabel(value);
};

const asTrimmedString = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const asStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  const single = asTrimmedString(value);
  return single ? [single] : [];
};

const asSingleChoice = (value: unknown) => {
  const values = asStringArray(value);
  return values[0];
};

const parseRangeAnswer = (value: unknown) => {
  if (!value || typeof value !== "object") return { min: undefined, max: undefined };
  const range = value as RangeAnswer;
  return {
    min: asNumber(range.min),
    max: asNumber(range.max),
  };
};

const parsePreferences = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const buildRecommendationInput = (questions: WithId<QuestionnaireQuestion>[], answers: Record<string, unknown>) => {
  const getAnswerByKey = (key: QuestionnaireQuestion["key"]) => {
    const question = questions.find((item) => item.active && item.key === key);
    return question ? answers[question.id] : undefined;
  };

  const selectionsByKey = questions.reduce<Record<string, string[]>>((acc, question) => {
    if (!question.active) return acc;
    const answer = answers[question.id];
    if (question.type === "single_select") {
      const selected = asSingleChoice(answer);
      if (selected) acc[question.key] = [selected];
      return acc;
    }
    if (question.type === "multi_select") {
      const selected = asStringArray(answer);
      if (selected.length) acc[question.key] = selected;
    }
    return acc;
  }, {});

  const level = asSingleChoice(getAnswerByKey("level"));
  const style = asSingleChoice(getAnswerByKey("style"));
  const distance = asSingleChoice(getAnswerByKey("distance"));
  const priority = asSingleChoice(getAnswerByKey("priority"));

  const budgetAnswer = getAnswerByKey("budget");
  const budgetNumber = asNumber(budgetAnswer);
  const budgetRange = parseRangeAnswer(budgetAnswer);

  const preferencesAnswer = getAnswerByKey("preferences");
  const preferences = Array.isArray(preferencesAnswer)
    ? asStringArray(preferencesAnswer)
    : typeof preferencesAnswer === "string"
      ? parsePreferences(preferencesAnswer)
      : [];

  const input: RecommendationInput = {
    level,
    style,
    distance,
    priority,
    budget: budgetNumber,
    budgetMin: budgetRange.min,
    budgetMax: budgetRange.max,
    preferences: preferences.length ? preferences : undefined,
    selectionsByKey: Object.keys(selectionsByKey).length ? selectionsByKey : undefined,
  };

  return input;
};

export default function QuestionnaireCompletionDetailPage() {
  const params = useParams();
  const completionId = params.id as string;
  const [completion, setCompletion] = useState<CompletionItem | null>(null);
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [products, setProducts] = useState<WithId<Product>[]>([]);
  const [computedProducts, setComputedProducts] = useState<WithId<Product>[]>([]);
  const [vocabMaps, setVocabMaps] = useState<Record<string, Record<string, string>>>({
    level: {},
    style: {},
    distance: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const completionData = await getQuestionnaireCompletionById(completionId);
        if (!completionData) {
          setCompletion(null);
          setQuestions([]);
          setProducts([]);
          setIsLoading(false);
          return;
        }
        const [questionsData, productsData] = await Promise.all([
          listQuestions(completionData.questionnaireId),
          getProductsByIds(completionData.matchProductIds ?? []),
        ]);
        setCompletion(completionData);
        setQuestions(questionsData);
        setProducts(productsData);
        setComputedProducts([]);
        if (!completionData.matchProductIds?.length) {
          const activeProducts = await listProducts({ activeOnly: true });
          const input = buildRecommendationInput(questionsData, completionData.answers ?? {});
          const matches = matchProductScenarios({ products: activeProducts, input });
          const matchIds = matches.map((match) => match.product.id);
          const uniqueProducts = matches.map((match) => match.product);
          setComputedProducts(uniqueProducts);
          if (matchIds.length) {
            setQuestionnaireCompletionMatchProductIds(completionId, matchIds).catch(() => {
              // ignore update errors
            });
          }
        }
        setIsLoading(false);
      } catch (err) {
        logFirebaseError("Completion: load", err);
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setIsLoading(false);
      }
    };
    load();
  }, [completionId]);

  useEffect(() => {
    Promise.all([
      listVocabularyOptions("level", { includeInactive: false }),
      listVocabularyOptions("style", { includeInactive: false }),
      listVocabularyOptions("distance", { includeInactive: false }),
    ])
      .then(([levelOptions, styleOptions, distanceOptions]) => {
        const toMap = (items: { value: string; label: string }[]) =>
          Object.fromEntries(items.map((o) => [o.value, o.label]));
        setVocabMaps({
          level: toMap(levelOptions),
          style: toMap(styleOptions),
          distance: toMap(distanceOptions),
        });
      })
      .catch(() => {
        // keep empty maps if vocabulary fails
      });
  }, []);

  const answersList = useMemo(() => {
    if (!completion) return [];
    const entries = Object.entries(completion.answers ?? {});
    const mapped = entries.map(([questionId, value]) => {
      const question = questions.find((q) => q.id === questionId);
      return {
        id: questionId,
        label: question?.label ?? "Întrebare ștearsă",
        key: question?.key,
        order: question?.order ?? 999,
        value,
        question,
      };
    });
    return mapped.sort((a, b) => a.order - b.order);
  }, [completion, questions]);

  const displayedProducts = products.length ? products : computedProducts;

  const renderTagBadges = (label: string, values: string[], map: Record<string, string>) => {
    if (!values.length) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{label}:</span>
        {values.map((value) => (
          <Badge key={`${label}-${value}`} variant="outline">
            {map[value] ?? value}
          </Badge>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!completion) {
    return (
      <div className="space-y-2">
        <div className="text-muted-foreground">Completarea nu a fost găsită.</div>
        <Link className="text-primary underline-offset-4 hover:underline" href="/dashboard/questionnaire-completions">
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl">Completare chestionar</h1>
          <p className="text-muted-foreground text-sm">
            {completion.questionnaireTitle} • {completion.createdAt?.toDate().toLocaleString()}
          </p>
        </div>
        <PageHelpDialog helpKey="questionnaire-completions.detail" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date utilizator</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-muted-foreground text-xs">Nume</div>
            <div className="font-medium">{completion.contact?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Email</div>
            <div className="font-medium">{completion.contact?.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Telefon</div>
            <div className="font-medium">{completion.contact?.phone ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Tip utilizator</div>
            <div className="font-medium">{completion.user?.isAnonymous ? "Anonymous" : "Autentificat"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Răspunsuri ({answersList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[32rem] space-y-3 overflow-auto rounded-md border bg-muted p-4">
            {answersList.length === 0 ? (
              <div className="text-muted-foreground text-sm">Nu există răspunsuri salvate.</div>
            ) : (
              answersList.map((entry) => (
                <div key={entry.id} className="rounded-md border bg-background p-3">
                  <div className="font-medium text-sm">{entry.label}</div>
                  <div className="mt-1 text-muted-foreground text-sm">{formatAnswer(entry.value, entry.question)}</div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recomandări</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayedProducts.length === 0 ? (
            <div className="text-muted-foreground text-sm">Nu există produse recomandate salvate.</div>
          ) : (
            <div className="space-y-4">
              {displayedProducts.map((product, idx) => {
                const gallery = buildImageGallery(product);
                return (
                  <div key={product.id} className="group relative rounded-lg border p-4 transition-all hover:shadow-md">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start gap-3">
                          <Badge variant="secondary" className="mt-0.5">
                            #{idx + 1}
                          </Badge>
                          {gallery.length ? (
                            <div className="relative size-14 overflow-hidden rounded-md border bg-muted/20">
                              <Image
                                src={gallery[0]}
                                alt={product.name}
                                fill
                                sizes="56px"
                                className="object-cover"
                                unoptimized
                              />
                              {gallery.length > 1 ? (
                                <span className="absolute right-1 bottom-1 rounded bg-background/80 px-1 font-medium text-[10px]">
                                  +{gallery.length - 1}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <div>
                            <h3 className="font-semibold text-lg">{product.name}</h3>
                            <p className="text-muted-foreground text-sm">
                              {product.price} {product.currency}
                            </p>
                            {product.productUrl ? (
                              <a
                                href={product.productUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary text-sm underline-offset-4 hover:underline"
                              >
                                Vezi produsul în magazin
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <div className="space-y-2 pl-11">
                          {renderTagBadges("Nivel recomandat", product.tags.level ?? [], vocabMaps.level)}
                          {renderTagBadges("Stil", product.tags.style ?? [], vocabMaps.style)}
                          {renderTagBadges("Distanță", product.tags.distance ?? [], vocabMaps.distance)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link href={`/dashboard/products/${product.id}`}>Detalii</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cerere specialist</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {completion.specialistRequestId ? (
            <Link
              className="text-primary underline-offset-4 hover:underline"
              href={`/dashboard/requests/${completion.specialistRequestId}`}
            >
              Vezi cererea
            </Link>
          ) : (
            <div className="text-muted-foreground">Nu există cerere asociată.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
