"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PackageMultiSelect } from "@/components/mybutterfly/forms/package-multi-select";
import { ProductMultiSelect } from "@/components/mybutterfly/forms/product-multi-select";
import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getPackagesByIds, listPackages } from "@/lib/firestore/packages";
import { getProductsByIds, listProducts } from "@/lib/firestore/products";
import { getQuestionnaire } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import {
  getSpecialistRequestById,
  setSpecialistRequestReply,
  updateSpecialistRequestStatus,
} from "@/lib/firestore/requests";
import { getRecommendationSettings } from "@/lib/firestore/settings";
import type {
  Product,
  Questionnaire,
  QuestionnaireQuestion,
  RecommendationPackage,
  SpecialistRequest,
  WithId,
} from "@/lib/firestore/types";
import { listVocabularyKeys, listVocabularyOptions } from "@/lib/firestore/vocabulary";
import { matchProductScenarios, type RecommendationInput } from "@/lib/recommendations/match";
import { matchPackageScenarios } from "@/lib/recommendations/match-packages";

type RequestWithUser = WithId<SpecialistRequest> & { userId: string };

type ProductOption = { id: string; name: string; price: number; currency: string };
type PackageOption = {
  id: string;
  title: string;
  totalPrice: number;
  currency: string;
  mode: "single" | "triple" | "custom";
};

type RangeAnswer = { min?: string; max?: string };

const formatStatus = (status: SpecialistRequest["status"]) => {
  switch (status) {
    case "new":
      return "nou";
    case "in_progress":
      return "în lucru";
    case "sent":
      return "trimis";
  }
};

const formatPackageRole = (role?: string) => {
  if (role === "single") return "Produs";
  if (role === "blade") return "Lemn";
  if (role === "rubber_fh") return "Față FH";
  if (role === "rubber_bh") return "Față BH";
  return "Produs";
};

const formatAnswerValue = (
  value: unknown,
  question?: QuestionnaireQuestion,
  vocabOptionMaps?: Record<string, Record<string, string>>,
) => {
  const optionMap = question?.options ? Object.fromEntries(question.options.map((opt) => [opt.value, opt.label])) : {};
  const fallbackMap = question?.key ? vocabOptionMaps?.[question.key] : undefined;
  const toLabel = (val: unknown) => {
    const key = String(val ?? "").trim();
    if (!key) return "—";
    return optionMap[key] ?? fallbackMap?.[key] ?? key;
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

const formatSkippedReason = (reason?: string) => {
  if (reason === "inactive") return "Întrebare inactivă";
  if (reason === "prerequisite_not_answered") return "Întrebare necesară necompletată";
  if (reason === "rule_not_met") return "Regulă de afișare neîndeplinită";
  return "Întrebare sărită";
};

const getSkippedBadgeClass = (reason?: string) => {
  if (reason === "inactive") return "border-slate-400 text-slate-700 dark:text-slate-300";
  if (reason === "prerequisite_not_answered") return "border-amber-500 text-amber-700 dark:text-amber-300";
  if (reason === "rule_not_met") return "border-rose-500 text-rose-700 dark:text-rose-300";
  return "border-muted-foreground text-muted-foreground";
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

const formSchema = z.object({
  message: z.string().min(1, "Reply message is required."),
  recommendedProductIds: z.array(z.string()),
  recommendedPackageIds: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  const [request, setRequest] = useState<RequestWithUser | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [generatedProducts, setGeneratedProducts] = useState<WithId<Product>[]>([]);
  const [replyProducts, setReplyProducts] = useState<WithId<Product>[]>([]);
  const [generatedPackages, setGeneratedPackages] = useState<WithId<RecommendationPackage>[]>([]);
  const [replyPackages, setReplyPackages] = useState<WithId<RecommendationPackage>[]>([]);
  const [packageProducts, setPackageProducts] = useState<WithId<Product>[]>([]);
  const [vocabMaps, setVocabMaps] = useState<Record<string, Record<string, string>>>({
    level: {},
    style: {},
    distance: {},
  });
  const [answerOptionMaps, setAnswerOptionMaps] = useState<Record<string, Record<string, string>>>({});
  const [questionnaire, setQuestionnaire] = useState<WithId<Questionnaire> | null>(null);
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [minMatchPercent, setMinMatchPercent] = useState<number>(65);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: "",
      recommendedProductIds: [],
      recommendedPackageIds: [],
    },
  });
  const isSubmitting = form.formState.isSubmitting;
  const replyTooltipText =
    "Răspunsul tău va fi vizibil în aplicația mobilă și trimis pe emailul introdus de utilizator.";

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const combinedProducts = useMemo(() => {
    const byId = new Map<string, WithId<Product>>();
    generatedProducts.forEach((product) => {
      byId.set(product.id, product);
    });
    replyProducts.forEach((product) => {
      byId.set(product.id, product);
    });
    packageProducts.forEach((product) => {
      byId.set(product.id, product);
    });
    return [...byId.values()];
  }, [generatedProducts, packageProducts, replyProducts]);
  const combinedPackages = useMemo(() => {
    const byId = new Map<string, WithId<RecommendationPackage>>();
    generatedPackages.forEach((item) => {
      byId.set(item.id, item);
    });
    replyPackages.forEach((item) => {
      byId.set(item.id, item);
    });
    return [...byId.values()];
  }, [generatedPackages, replyPackages]);
  const answersList = useMemo(() => {
    if (!request) return [];
    const answerMap = request.answers ?? {};
    const skippedMap = new Map((request.skippedQuestions ?? []).map((item) => [item.questionId, item.reason]));
    const entries = questions.map((question) => {
      const value = answerMap[question.id];
      const skippedReason = skippedMap.get(question.id);
      return {
        id: question.id,
        label: question.label ?? "Întrebare ștearsă",
        order: question.order ?? 999,
        value,
        question,
        status: skippedReason ? "skipped" : value !== undefined ? "answered" : "unknown",
        skippedReason,
      };
    });
    return entries.filter((entry) => entry.status !== "unknown").sort((a, b) => a.order - b.order);
  }, [questions, request]);
  const skippedList = useMemo(() => answersList.filter((entry) => entry.status === "skipped"), [answersList]);
  const matchPercentById = useMemo(() => {
    if (!request || combinedProducts.length === 0 || questions.length === 0) return new Map<string, number>();
    const input = buildRecommendationInput(questions, request.answers ?? {});
    const askedKeys = request.askedQuestionIds
      ? request.askedQuestionIds
          .map((id) => questions.find((q) => q.id === id)?.key)
          .filter((key): key is string => Boolean(key))
      : undefined;
    const matches = matchProductScenarios({ products: combinedProducts, input, minMatchPercent, askedKeys });
    return new Map(matches.map((match) => [match.product.id, match.matchPercent]));
  }, [combinedProducts, minMatchPercent, questions, request]);
  const packageMatchPercentById = useMemo(() => {
    if (!request || combinedPackages.length === 0 || combinedProducts.length === 0 || questions.length === 0) {
      return new Map<string, number>();
    }
    const input = buildRecommendationInput(questions, request.answers ?? {});
    const askedKeys = request.askedQuestionIds
      ? request.askedQuestionIds
          .map((id) => questions.find((q) => q.id === id)?.key)
          .filter((key): key is string => Boolean(key))
      : undefined;
    const productsById = new Map(combinedProducts.map((product) => [product.id, product]));
    const matches = matchPackageScenarios({
      packages: combinedPackages,
      productsById,
      input,
      minMatchPercent,
      askedKeys,
    });
    return new Map(matches.map((match) => [match.package.id, match.matchPercent]));
  }, [combinedPackages, combinedProducts, minMatchPercent, questions, request]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [requestData, productsData, packagesData, levelOptions, styleOptions, distanceOptions] = await Promise.all([
      getSpecialistRequestById(requestId),
      listProducts({ activeOnly: true }),
      listPackages(),
      listVocabularyOptions("level", { includeInactive: false }),
      listVocabularyOptions("style", { includeInactive: false }),
      listVocabularyOptions("distance", { includeInactive: false }),
    ]);
    setRequest(requestData);
    setProducts(
      productsData.map((item) => ({ id: item.id, name: item.name, price: item.price, currency: item.currency })),
    );
    setPackages(
      packagesData.map((item) => ({
        id: item.id,
        title: item.title,
        totalPrice: item.totalPrice,
        currency: item.currency,
        mode: item.mode,
      })),
    );
    const toMap = (items: { value: string; label: string }[]) =>
      Object.fromEntries(items.map((o) => [o.value, o.label]));
    setVocabMaps({
      level: toMap(levelOptions),
      style: toMap(styleOptions),
      distance: toMap(distanceOptions),
    });
    setGeneratedProducts([]);
    setReplyProducts([]);
    setGeneratedPackages([]);
    setReplyPackages([]);
    setPackageProducts([]);
    if (requestData) {
      const generatedIds = requestData.matchProductIds ?? [];
      const replyIds = requestData.reply?.recommendedProductIds ?? [];
      const generatedPackageIds = requestData.matchPackageIds ?? [];
      const replyPackageIds = requestData.reply?.recommendedPackageIds ?? [];
      const allPackageIds = Array.from(new Set([...generatedPackageIds, ...replyPackageIds]));

      let fetchedPackages: WithId<RecommendationPackage>[] = [];
      if (allPackageIds.length) {
        fetchedPackages = await getPackagesByIds(allPackageIds);
        const byId = new Map(fetchedPackages.map((item) => [item.id, item]));
        setGeneratedPackages(
          generatedPackageIds.map((id) => byId.get(id)).filter(Boolean) as WithId<RecommendationPackage>[],
        );
        setReplyPackages(replyPackageIds.map((id) => byId.get(id)).filter(Boolean) as WithId<RecommendationPackage>[]);
      }

      const packageProductIds = fetchedPackages.flatMap((item) => item.items.map((entry) => entry.productId));
      const allProductIds = Array.from(new Set([...generatedIds, ...replyIds, ...packageProductIds]));
      if (allProductIds.length) {
        const fetchedProducts = await getProductsByIds(allProductIds);
        const byId = new Map(fetchedProducts.map((item) => [item.id, item]));
        setGeneratedProducts(generatedIds.map((id) => byId.get(id)).filter(Boolean) as WithId<Product>[]);
        setReplyProducts(replyIds.map((id) => byId.get(id)).filter(Boolean) as WithId<Product>[]);
        setPackageProducts(packageProductIds.map((id) => byId.get(id)).filter(Boolean) as WithId<Product>[]);
      }
      form.reset({
        message: requestData.reply?.message ?? "",
        recommendedProductIds: requestData.reply?.recommendedProductIds ?? [],
        recommendedPackageIds: requestData.reply?.recommendedPackageIds ?? [],
      });
      if (requestData.questionnaireId) {
        const [questionnaireData, questionsData] = await Promise.all([
          getQuestionnaire(requestData.questionnaireId),
          listQuestions(requestData.questionnaireId),
        ]);
        setQuestionnaire(questionnaireData);
        setQuestions(questionsData);
      }
    }
    setIsLoading(false);
  }, [form, requestId]);

  useEffect(() => {
    if (questions.length === 0) {
      setAnswerOptionMaps({});
      return;
    }
    let isCancelled = false;
    const loadAnswerMaps = async () => {
      try {
        const categories = await listVocabularyKeys({ includeInactive: true });
        const categoryKeys = new Set(categories.map((item) => item.key));
        const questionKeys = Array.from(new Set(questions.map((q) => q.key).filter(Boolean)));
        const keysToLoad = questionKeys.filter((key) => categoryKeys.has(key));
        if (keysToLoad.length === 0) {
          if (!isCancelled) setAnswerOptionMaps({});
          return;
        }
        const entries = await Promise.all(
          keysToLoad.map(async (key) => {
            const options = await listVocabularyOptions(key, { includeInactive: true });
            return [key, Object.fromEntries(options.map((opt) => [opt.value, opt.label]))] as const;
          }),
        );
        if (!isCancelled) {
          setAnswerOptionMaps(Object.fromEntries(entries));
        }
      } catch {
        if (!isCancelled) setAnswerOptionMaps({});
      }
    };
    void loadAnswerMaps();
    return () => {
      isCancelled = true;
    };
  }, [questions]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getRecommendationSettings()
      .then((settings) => {
        if (settings?.minMatchPercent !== undefined) {
          setMinMatchPercent(settings.minMatchPercent);
        }
      })
      .catch(() => {
        // ignore settings load errors
      });
  }, []);

  const updateStatus = async (status: SpecialistRequest["status"]) => {
    if (!request) return;
    setIsUpdatingStatus(true);
    await updateSpecialistRequestStatus(request.userId, request.id, status);
    await load();
    setIsUpdatingStatus(false);
  };

  const onSubmit = async (values: FormValues) => {
    if (!request) return;
    await setSpecialistRequestReply(request.userId, request.id, {
      message: values.message,
      recommendedProductIds: values.recommendedProductIds.length ? values.recommendedProductIds : undefined,
      recommendedPackageIds: values.recommendedPackageIds.length ? values.recommendedPackageIds : undefined,
    });
    if (request.contact?.email) {
      const recommendedProducts = values.recommendedProductIds
        .map((id) => productMap.get(id))
        .filter(Boolean)
        .map((item) => `${item?.name ?? "Produs"} — ${item?.price} ${item?.currency}`);
      const fullPackageMap = new Map(combinedPackages.map((item) => [item.id, item]));
      const fullProductMap = new Map(combinedProducts.map((item) => [item.id, item]));
      const recommendedPackages = values.recommendedPackageIds
        .map((id) => fullPackageMap.get(id))
        .filter(Boolean)
        .map((item) => ({
          name: item?.title ?? "Pachet",
          items:
            item?.items.map((entry) => {
              const product = fullProductMap.get(entry.productId);
              return `${formatPackageRole(entry.role)}: ${product?.name ?? entry.productId}`;
            }) ?? [],
          totalPrice: item?.totalPrice ?? 0,
          currency: (item?.currency ?? "RON") as "RON" | "EUR",
        }));
      try {
        await fetch("/api/requests/send-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toEmail: request.contact.email,
            userName: request.contact.name,
            message: values.message,
            recommendedProducts,
            recommendedPackages,
          }),
        });
      } catch (err) {
        logFirebaseError("RequestDetail: sendReplyEmail", err);
      }
    }
    await load();
  };

  const buildImageGallery = (product: Product) => {
    const images = [...(product.imageUrls ?? []), ...(product.imageUrl ? [product.imageUrl] : [])]
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(images));
  };

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

  const renderPackageCards = (list: WithId<RecommendationPackage>[]) => {
    if (list.length === 0) {
      return <div className="text-muted-foreground">Nu există detalii pentru pachete.</div>;
    }
    const packageProductMap = new Map(packageProducts.map((item) => [item.id, item]));
    return (
      <div className="space-y-4">
        {list.map((item, idx) => {
          const matchPercent = packageMatchPercentById.get(item.id);
          return (
            <div key={item.id} className="group relative rounded-lg border p-4 transition-all hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-2">
                      <Badge variant="secondary">#{idx + 1}</Badge>
                      {matchPercent !== undefined ? <Badge variant="outline">Potrivire {matchPercent}%</Badge> : null}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{item.title}</h3>
                      <p className="text-muted-foreground text-sm">
                        {item.totalPrice} {item.currency} •{" "}
                        {item.mode === "single" ? "single" : item.mode === "triple" ? "triple" : "custom"}
                      </p>
                      {item.description ? (
                        <p className="mt-1 text-muted-foreground text-sm">{item.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2 pl-11">
                    {item.items.map((entry, index) => {
                      const product = packageProductMap.get(entry.productId);
                      return (
                        <div
                          key={`${item.id}-${index}-${entry.productId}`}
                          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-sm"
                        >
                          <Badge variant="outline">{formatPackageRole(entry.role)}</Badge>
                          <span className="font-medium">{product?.name ?? entry.productId}</span>
                          {product ? (
                            <span className="text-muted-foreground">
                              {product.price} {product.currency}
                            </span>
                          ) : null}
                          {product?.productUrl ? (
                            <a
                              href={product.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              Magazin
                            </a>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/dashboard/packages/${item.id}`}>Detalii</Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderProductCards = (list: WithId<Product>[]) => {
    if (list.length === 0) {
      return <div className="text-muted-foreground">Nu există detalii pentru produse.</div>;
    }
    return (
      <div className="space-y-4">
        {list.map((product, idx) => {
          const gallery = buildImageGallery(product);
          const matchPercent = matchPercentById.get(product.id);
          return (
            <div key={product.id} className="group relative rounded-lg border p-4 transition-all hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-2">
                      <Badge variant="secondary">#{idx + 1}</Badge>
                      {matchPercent !== undefined ? <Badge variant="outline">Potrivire {matchPercent}%</Badge> : null}
                    </div>
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
    );
  };

  if (!request) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Cerere către specialist</h1>
          <p className="text-muted-foreground text-sm">Verifică răspunsurile și trimite un răspuns.</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="requests.detail" />
          <Button variant="outline" onClick={() => router.push("/dashboard/requests")}>
            Înapoi la listă
          </Button>
        </div>
      </div>

      <div className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
        <div>
          <div className="text-muted-foreground text-xs">Creat</div>
          <div className="font-medium">{request.createdAt?.toDate().toLocaleString() ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Chestionar</div>
          <div className="font-medium">{questionnaire?.title ?? request.questionnaireId}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Status</div>
          <div className="font-medium capitalize">{formatStatus(request.status)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Utilizator</div>
          <div className="font-medium">{request.contact?.name ?? request.userId}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Telefon</div>
          <div className="font-medium">{request.contact?.phone ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Email</div>
          <div className="font-medium">{request.contact?.email ?? "—"}</div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-lg">Răspunsuri</h2>
        <div className="max-h-96 space-y-3 overflow-auto rounded-md border bg-muted p-4">
          {answersList.length > 0 ? (
            answersList.map((entry) => (
              <div key={entry.id} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{entry.label}</div>
                  <Badge
                    variant={entry.status === "skipped" ? "outline" : "secondary"}
                    className={entry.status === "skipped" ? getSkippedBadgeClass(entry.skippedReason) : undefined}
                  >
                    {entry.status === "skipped" ? "Sărită" : "Răspuns"}
                  </Badge>
                </div>
                <div className="mt-1 text-muted-foreground text-sm">
                  {entry.status === "skipped"
                    ? formatSkippedReason(entry.skippedReason)
                    : formatAnswerValue(entry.value, entry.question, answerOptionMaps)}
                </div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground text-sm">
              {Object.keys(request.answers).length > 0
                ? "Răspunsurile sunt disponibile, dar întrebările nu au fost găsite."
                : "Nu există răspunsuri."}
            </div>
          )}
        </div>
        {skippedList.length > 0 ? (
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="font-semibold text-sm">Întrebări sărite</div>
            <div className="mt-3 space-y-2">
              {skippedList.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-background p-3"
                >
                  <div>
                    <div className="font-medium text-sm">{entry.label}</div>
                    <div className="text-muted-foreground text-xs">{formatSkippedReason(entry.skippedReason)}</div>
                  </div>
                  <Badge variant="outline" className={getSkippedBadgeClass(entry.skippedReason)}>
                    Sărită
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {request.note ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-semibold text-xs">Notițe suplimentare</div>
            <div className="mt-1 whitespace-pre-wrap">{request.note}</div>
          </div>
        ) : null}
        {request.matchPackageIds?.length ? (
          <div className="space-y-2">
            <div className="font-semibold text-sm">Pachete generate ({request.matchPackageIds.length})</div>
            {renderPackageCards(generatedPackages)}
          </div>
        ) : null}
        {request.matchProductIds?.length ? (
          <div className="space-y-2">
            <div className="font-semibold text-sm">Produse generate ({request.matchProductIds.length})</div>
            {renderProductCards(generatedProducts)}
          </div>
        ) : null}
        {request.reply?.recommendedPackageIds?.length ? (
          <div className="space-y-2">
            <div className="font-semibold text-sm">Pachete trimise ({request.reply.recommendedPackageIds.length})</div>
            {renderPackageCards(replyPackages)}
          </div>
        ) : null}
        {request.reply?.recommendedProductIds?.length ? (
          <div className="space-y-2">
            <div className="font-semibold text-sm">Produse trimise ({request.reply.recommendedProductIds.length})</div>
            {renderProductCards(replyProducts)}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-3 font-semibold text-lg">Actualizează statusul</h2>
        <div className="flex items-center gap-2">
          <Select
            value={request.status}
            onValueChange={(value) => updateStatus(value as SpecialistRequest["status"])}
            disabled={isUpdatingStatus || isLoading}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Alege statusul" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Nou</SelectItem>
              <SelectItem value="in_progress">În lucru</SelectItem>
              <SelectItem value="sent">Trimis</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 rounded-md border p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg">Răspuns</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Info"
                  className="inline-flex items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <CircleHelp className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="max-w-[280px] text-left">
                {replyTooltipText}
              </TooltipContent>
            </Tooltip>
          </div>
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mesaj</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recommendedPackageIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pachete recomandate</FormLabel>
                <FormControl>
                  <PackageMultiSelect packages={packages} value={field.value} onChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recommendedProductIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Produse recomandate (fallback / legacy)</FormLabel>
                <FormControl>
                  <ProductMultiSelect products={products} value={field.value} onChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Se trimite..." : "Trimite răspunsul"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
