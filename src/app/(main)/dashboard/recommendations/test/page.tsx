"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";

import { CheckCircle2, ChevronLeft, ChevronRight, Heart, History, List } from "lucide-react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/hooks/use-auth-user";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import {
  createQuestionnaireCompletion,
  setQuestionnaireCompletionSpecialistRequestId,
} from "@/lib/firestore/completions";
import { listPackages } from "@/lib/firestore/packages";
import { listProducts, updateProduct } from "@/lib/firestore/products";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import { createSpecialistRequest } from "@/lib/firestore/requests";
import { getRecommendationSettings } from "@/lib/firestore/settings";
import type {
  Product,
  Questionnaire,
  QuestionnaireQuestion,
  QuestionnaireQuestionVisibilityRule,
  RecommendationPackage,
  WithId,
} from "@/lib/firestore/types";
import { listVocabularyOptions } from "@/lib/firestore/vocabulary";
import { matchProductScenarios, type RecommendationInput } from "@/lib/recommendations/match";
import { matchPackageScenarios } from "@/lib/recommendations/match-packages";

const isDebugEnabled =
  process.env.NEXT_PUBLIC_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_DEBUG === "true" ||
  process.env.NEXT_PUBLIC_DEBUG === "on";

type VocabularyOption = { value: string; label: string };
type VocabMap = Record<string, string>;

type AnswerMap = Record<string, unknown>;
type RangeAnswer = { min?: string; max?: string };
type ResultMode = "packages" | "products";
type SortMetric = "fit" | "price" | "speed" | "spin" | "control";
type SortDirection = "asc" | "desc";
type ProductMatchItem = ReturnType<typeof matchProductScenarios>[number];
type PackageMatchItem = ReturnType<typeof matchPackageScenarios>[number];
type HistorySession = {
  id: string;
  questionnaireId: string;
  questionnaireTitle: string;
  createdAt: number;
  answers: AnswerMap;
  input: RecommendationInput;
  resultMode: ResultMode;
  matchProductIds: string[];
  matchPackageIds: string[];
  askedQuestionIds?: string[];
};

const ANY_VALUE = "__any__";
const FAVORITES_KEY = "mb-test-favorites";
const HISTORY_KEY = "mb-test-history";
const SPECIALIST_PHONE = "+40-736-887467";

const generateSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const _formatAnswerValue = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object" && value) {
    const range = value as RangeAnswer;
    if (range.min !== undefined || range.max !== undefined) {
      return `min: ${range.min ?? "—"}, max: ${range.max ?? "—"}`;
    }
  }
  if (value === undefined || value === null) return "";
  return String(value);
};

const formatAnswerForQuestion = (value: unknown, question?: QuestionnaireQuestion) => {
  const optionMap = question?.options ? Object.fromEntries(question.options.map((opt) => [opt.value, opt.label])) : {};
  const toLabel = (val: unknown) => {
    const key = String(val ?? "").trim();
    if (!key) return "";
    return optionMap[key] ?? key;
  };
  if (Array.isArray(value))
    return value
      .map((item) => toLabel(item))
      .filter(Boolean)
      .join(", ");
  if (typeof value === "object" && value) {
    const range = value as RangeAnswer;
    if (range.min !== undefined || range.max !== undefined) {
      return `min: ${range.min ?? "—"}, max: ${range.max ?? "—"}`;
    }
    return JSON.stringify(value);
  }
  if (value === undefined || value === null) return "";
  return toLabel(value);
};

const buildImageGallery = (product: Product) => {
  const images = [...(product.imageUrls ?? []), ...(product.imageUrl ? [product.imageUrl] : [])]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(images));
};

const getPrestashopProductIdFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id_product");
    return id || null;
  } catch {
    return null;
  }
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

const buildRecommendationInput = (questions: WithId<QuestionnaireQuestion>[], answers: AnswerMap) => {
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

  return { input, preferences };
};

const isRequiredAnswered = (question: QuestionnaireQuestion, answer: unknown) => {
  if (!question.validation?.required) return true;
  if (question.type === "single_select") return Boolean(asSingleChoice(answer));
  if (question.type === "multi_select") return asStringArray(answer).length > 0;
  if (question.type === "text") return Boolean(asTrimmedString(answer));
  if (question.type === "range") {
    const range = answer as RangeAnswer | undefined;
    return Boolean(asTrimmedString(range?.min) && asTrimmedString(range?.max));
  }
  return true;
};

const isRuleSatisfied = (
  rule: QuestionnaireQuestionVisibilityRule,
  answers: AnswerMap,
  questionsById: Record<string, QuestionnaireQuestion>,
) => {
  const source = questionsById[rule.questionId];
  if (!source || !rule.optionValues.length) return false;
  const answer = answers[rule.questionId];
  if (source.type === "single_select") {
    const selected = asSingleChoice(answer);
    return Boolean(selected && rule.optionValues.includes(selected));
  }
  if (source.type === "multi_select") {
    const selected = asStringArray(answer);
    return selected.some((value) => rule.optionValues.includes(value));
  }
  return false;
};

const formatTagValue = (map: VocabMap, value: string) => map[value] ?? value;

const formatPackageRole = (role?: string) => {
  if (role === "single") return "Produs";
  if (role === "blade") return "Lemn";
  if (role === "rubber_fh") return "Față FH";
  if (role === "rubber_bh") return "Față BH";
  return "Produs";
};

const compareProductBase = (a: ProductMatchItem, b: ProductMatchItem) => {
  if (a.matchPercent !== b.matchPercent) return b.matchPercent - a.matchPercent;
  if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
  if (a.product.price !== b.product.price) return a.product.price - b.product.price;
  return a.product.name.localeCompare(b.product.name);
};

const comparePackageBase = (a: PackageMatchItem, b: PackageMatchItem) => {
  if (a.matchPercent !== b.matchPercent) return b.matchPercent - a.matchPercent;
  if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
  if (a.package.totalPrice !== b.package.totalPrice) return a.package.totalPrice - b.package.totalPrice;
  return a.package.title.localeCompare(b.package.title);
};

const compareMetricValue = (a: number | undefined, b: number | undefined, direction: SortDirection) => {
  const aMissing = a === undefined;
  const bMissing = b === undefined;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (a === b) return 0;
  const dir = direction === "asc" ? 1 : -1;
  return dir * (a - b);
};

export default function RecommendationTestPage() {
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("questionnaire");
  const { user: authUser } = useAuthUser();

  const [products, setProducts] = useState<WithId<Product>[]>([]);
  const [packages, setPackages] = useState<WithId<RecommendationPackage>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  const [questionnaires, setQuestionnaires] = useState<WithId<Questionnaire>[]>([]);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState<string>("");
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [finalizedInput, setFinalizedInput] = useState<RecommendationInput | null>(null);
  const [finalizedProductMatches, setFinalizedProductMatches] = useState<ReturnType<typeof matchProductScenarios>>([]);
  const [finalizedPackageMatches, setFinalizedPackageMatches] = useState<ReturnType<typeof matchPackageScenarios>>([]);
  const [finalizedResultMode, setFinalizedResultMode] = useState<ResultMode | null>(null);
  const [selectedProductMatch, setSelectedProductMatch] = useState<ReturnType<typeof matchProductScenarios>[0] | null>(
    null,
  );
  const [selectedPackageMatch, setSelectedPackageMatch] = useState<ReturnType<typeof matchPackageScenarios>[0] | null>(
    null,
  );
  const [sortMetric, setSortMetric] = useState<SortMetric>("fit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [minMatchPercent, setMinMatchPercent] = useState<number>(65);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [pendingSession, setPendingSession] = useState<HistorySession | null>(null);
  const [completionId, setCompletionId] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionContact, setCompletionContact] = useState({
    name: "",
    email: "",
  });
  const [specialistForm, setSpecialistForm] = useState({
    name: "",
    phone: "",
    email: "",
    note: "",
  });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [imageViewer, setImageViewer] = useState<{
    images: string[];
    index: number;
    title: string;
    productUrl?: string;
  } | null>(null);
  const [vocabMaps, setVocabMaps] = useState<Record<string, VocabMap>>({
    level: {},
    style: {},
    distance: {},
    priority: {},
  });

  const questionsById = useMemo(
    () =>
      Object.fromEntries(questions.map((question) => [question.id, question])) as Record<string, QuestionnaireQuestion>,
    [questions],
  );
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const openProductUrl = useCallback(async (product: WithId<Product>) => {
    const fallbackUrl = product.productUrl;
    if (!fallbackUrl) return;
    let resolvedUrl = fallbackUrl;
    if (product.source?.provider === "prestashop") {
      const productId = product.source.prestashopProductId || getPrestashopProductIdFromUrl(fallbackUrl);
      if (productId) {
        try {
          const response = await fetch(`/api/prestashop/products/${productId}`);
          const data = (await response.json()) as { productUrl?: string };
          if (data?.productUrl) resolvedUrl = data.productUrl;
        } catch {
          // ignore and fall back to current URL
        }
      }
    }
    if (resolvedUrl !== fallbackUrl) {
      updateProduct(product.id, { productUrl: resolvedUrl }).catch(() => {
        // ignore save errors for link updates
      });
    }
    console.info("[recommendations] open product url", {
      productId: product.id,
      fallbackUrl,
      resolvedUrl,
    });
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  }, []);

  const activeQuestionnaires = useMemo(() => questionnaires.filter((item) => item.active), [questionnaires]);
  const orderedQuestions = useMemo(() => {
    return questions
      .filter((item) => item.active)
      .sort((a, b) => a.order - b.order)
      .filter((question) => {
        const rules = question.visibilityRules ?? [];
        if (!rules.length) return true;
        return rules.every((rule) => isRuleSatisfied(rule, answers, questionsById));
      });
  }, [answers, questions, questionsById]);

  const getAskedKeysFromIds = useCallback(
    (ids?: string[]) => {
      if (!ids?.length) return undefined;
      const keys = ids.map((id) => questionsById[id]?.key).filter((key): key is string => Boolean(key));
      return keys.length ? keys : undefined;
    },
    [questionsById],
  );

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const [productsData, packagesData, questionnairesData, levelOptions, styleOptions, distanceOptions] =
        await Promise.all([
          listProducts({ activeOnly: true }),
          listPackages({ activeOnly: true }),
          listQuestionnaires(),
          listVocabularyOptions("level", { includeInactive: false }),
          listVocabularyOptions("style", { includeInactive: false }),
          listVocabularyOptions("distance", { includeInactive: false }),
        ]);
      setProducts(productsData);
      setPackages(packagesData);
      setQuestionnaires(questionnairesData);
      const toMap = (options: VocabularyOption[]) =>
        Object.fromEntries(options.map((o) => [o.value, o.label])) as VocabMap;
      setVocabMaps((prev) => ({
        ...prev,
        level: toMap(levelOptions),
        style: toMap(styleOptions),
        distance: toMap(distanceOptions),
      }));
      const activeItems = questionnairesData.filter((item) => item.active);
      const nextId = activeItems.some((item) => item.id === selectedQuestionnaireId)
        ? selectedQuestionnaireId
        : (activeItems[0]?.id ?? "");
      setSelectedQuestionnaireId(nextId);
    } finally {
      setIsLoading(false);
    }
  }, [selectedQuestionnaireId]);

  useEffect(() => {
    load().catch((err) => {
      logFirebaseError("RecommendationTest: load", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Încărcarea a eșuat.");
    });
  }, [load]);

  useEffect(() => {
    getRecommendationSettings()
      .then((settings) => {
        if (settings?.minMatchPercent !== undefined) {
          setMinMatchPercent(settings.minMatchPercent);
        }
      })
      .catch((err) => {
        logFirebaseError("RecommendationTest: loadSettings", err);
      });
  }, []);

  useEffect(() => {
    if (!selectedQuestionnaireId) {
      setQuestions([]);
      setAnswers({});
      setCurrentStep(0);
      setFinalizedInput(null);
      setFinalizedProductMatches([]);
      setFinalizedPackageMatches([]);
      setFinalizedResultMode(null);
      setSelectedProductMatch(null);
      setSelectedPackageMatch(null);
      setPendingSession(null);
      return;
    }
    setIsLoadingQuestions(true);
    listQuestions(selectedQuestionnaireId)
      .then((items) => {
        setQuestions(items);
        if (pendingSession && pendingSession.questionnaireId === selectedQuestionnaireId) {
          setAnswers(pendingSession.answers);
          setFinalizedInput(pendingSession.input);
          const itemsById = Object.fromEntries(items.map((question) => [question.id, question] as const)) as Record<
            string,
            QuestionnaireQuestion
          >;
          const askedKeys = pendingSession.askedQuestionIds
            ? pendingSession.askedQuestionIds
                .map((id) => itemsById[id]?.key)
                .filter((key): key is string => Boolean(key))
            : undefined;
          const questionnaireKeys = Array.from(
            new Set(
              items
                .filter((question) => question.active)
                .map((question) => question.key)
                .filter(Boolean),
            ),
          );
          const nextProductMatches = matchProductScenarios({
            products,
            input: pendingSession.input,
            minMatchPercent,
            askedKeys,
            questionnaireKeys,
            debug: isDebugEnabled,
          });
          const nextPackageMatches = matchPackageScenarios({
            packages,
            productsById,
            input: pendingSession.input,
            minMatchPercent,
            askedKeys,
            questionnaireKeys,
            debug: isDebugEnabled,
          });
          const nextMode: ResultMode =
            pendingSession.resultMode === "packages" && nextPackageMatches.length > 0 ? "packages" : "products";
          setFinalizedProductMatches(nextProductMatches);
          setFinalizedPackageMatches(nextPackageMatches);
          setFinalizedResultMode(nextMode);
          setActiveTab("results");
          setPendingSession(null);
        } else {
          setAnswers({});
          setCurrentStep(0);
          setFinalizedInput(null);
          setFinalizedProductMatches([]);
          setFinalizedPackageMatches([]);
          setFinalizedResultMode(null);
          setSelectedProductMatch(null);
          setSelectedPackageMatch(null);
        }
      })
      .catch((err) => {
        logFirebaseError("RecommendationTest: loadQuestions", err);
        const info = getFirebaseErrorInfo(err);
        setError(info.message || "Încărcarea întrebărilor a eșuat.");
      })
      .finally(() => {
        setIsLoadingQuestions(false);
      });
  }, [selectedQuestionnaireId, products, packages, pendingSession, minMatchPercent, productsById]);

  useEffect(() => {
    if (orderedQuestions.length === 0) {
      if (currentStep !== 0) setCurrentStep(0);
      return;
    }
    if (currentStep > orderedQuestions.length - 1) {
      setCurrentStep(orderedQuestions.length - 1);
    }
  }, [currentStep, orderedQuestions.length]);

  const updateAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const isMissingAnswer = useCallback((value: unknown) => {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim().length === 0;
    if (typeof value === "object") {
      const range = value as { min?: string; max?: string };
      return !(range.min?.toString().trim() && range.max?.toString().trim());
    }
    return false;
  }, []);

  const computeSkippedQuestions = useCallback(() => {
    const askedIds = new Set(orderedQuestions.map((question) => question.id));
    return questions
      .filter((question) => !askedIds.has(question.id))
      .map((question) => {
        const rules = question.visibilityRules ?? [];
        if (!question.active) {
          return { questionId: question.id, reason: "inactive" as const };
        }
        if (rules.length > 0 && !rules.every((rule) => isRuleSatisfied(rule, answers, questionsById))) {
          const hasMissingPrereq = rules.some((rule) => isMissingAnswer(answers[rule.questionId]));
          return {
            questionId: question.id,
            reason: hasMissingPrereq ? ("prerequisite_not_answered" as const) : ("rule_not_met" as const),
          };
        }
        return { questionId: question.id, reason: "rule_not_met" as const };
      });
  }, [answers, isMissingAnswer, orderedQuestions, questions, questionsById]);

  const { input, preferences } = useMemo(
    () => buildRecommendationInput(orderedQuestions, answers),
    [orderedQuestions, answers],
  );

  const askedKeysForCurrent = useMemo(() => orderedQuestions.map((question) => question.key), [orderedQuestions]);
  const questionnaireKeysForCurrent = useMemo(
    () =>
      Array.from(
        new Set(
          questions
            .filter((question) => question.active)
            .map((question) => question.key)
            .filter(Boolean),
        ),
      ),
    [questions],
  );
  const productMatches = useMemo(() => {
    return matchProductScenarios({
      products,
      input,
      minMatchPercent,
      askedKeys: askedKeysForCurrent,
      questionnaireKeys: questionnaireKeysForCurrent,
      debug: isDebugEnabled,
    });
  }, [products, input, minMatchPercent, askedKeysForCurrent, questionnaireKeysForCurrent]);
  const packageMatches = useMemo(() => {
    return matchPackageScenarios({
      packages,
      productsById,
      input,
      minMatchPercent,
      askedKeys: askedKeysForCurrent,
      questionnaireKeys: questionnaireKeysForCurrent,
      debug: isDebugEnabled,
    });
  }, [packages, productsById, input, minMatchPercent, askedKeysForCurrent, questionnaireKeysForCurrent]);
  const liveResultMode: ResultMode = packageMatches.length > 0 ? "packages" : "products";
  const liveProductMatches = liveResultMode === "products" ? productMatches : [];
  const livePackageMatches = liveResultMode === "packages" ? packageMatches : [];
  const currentResultMode = finalizedResultMode ?? liveResultMode;
  const currentProductMatches = finalizedResultMode ? finalizedProductMatches : liveProductMatches;
  const currentPackageMatches = finalizedResultMode ? finalizedPackageMatches : livePackageMatches;

  const sortedProductMatches = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    const next = [...currentProductMatches];
    next.sort((a, b) => {
      if (sortMetric === "fit") {
        if (a.matchPercent !== b.matchPercent) return dir * (a.matchPercent - b.matchPercent);
        if (a.fitScore !== b.fitScore) return dir * (a.fitScore - b.fitScore);
        return compareProductBase(a, b);
      }
      if (sortMetric === "price") {
        if (a.product.price !== b.product.price) return dir * (a.product.price - b.product.price);
        return compareProductBase(a, b);
      }

      const metricComparison = compareMetricValue(
        a.product.attributes?.[sortMetric],
        b.product.attributes?.[sortMetric],
        sortDirection,
      );
      if (metricComparison !== 0) return metricComparison;
      return compareProductBase(a, b);
    });
    return next;
  }, [currentProductMatches, sortMetric, sortDirection]);
  const sortedPackageMatches = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    const next = [...currentPackageMatches];
    next.sort((a, b) => {
      if (sortMetric === "fit") {
        if (a.matchPercent !== b.matchPercent) return dir * (a.matchPercent - b.matchPercent);
        if (a.fitScore !== b.fitScore) return dir * (a.fitScore - b.fitScore);
        return comparePackageBase(a, b);
      }
      if (sortMetric === "price") {
        if (a.package.totalPrice !== b.package.totalPrice) return dir * (a.package.totalPrice - b.package.totalPrice);
        return comparePackageBase(a, b);
      }

      const metricComparison = compareMetricValue(
        a.package.attributes?.[sortMetric],
        b.package.attributes?.[sortMetric],
        sortDirection,
      );
      if (metricComparison !== 0) return metricComparison;
      return comparePackageBase(a, b);
    });
    return next;
  }, [currentPackageMatches, sortMetric, sortDirection]);

  const debugPayload = useMemo(() => {
    if (!isDebugEnabled) return null;
    const askedQuestionIds = orderedQuestions.map((question) => question.id);
    const askedKeys = orderedQuestions.map((question) => question.key);
    const base = {
      meta: {
        mode: currentResultMode,
        minMatchPercent,
        askedQuestionIds,
        askedKeys,
        orderedQuestionCount: orderedQuestions.length,
        totalQuestionCount: questions.length,
      },
      input: finalizedInput ?? input,
      answers,
      skippedQuestions: computeSkippedQuestions(),
    };
    if (currentResultMode === "packages") {
      if (!sortedPackageMatches.length) return null;
      return {
        ...base,
        results: sortedPackageMatches.map((match) => ({
          package: {
            id: match.package.id,
            title: match.package.title,
            totalPrice: match.package.totalPrice,
            currency: match.package.currency,
            mode: match.package.mode,
            items: match.package.items,
          },
          scenario: match.scenario,
          matchPercent: match.matchPercent,
          fitScore: match.fitScore,
          debug: match.debug ?? null,
        })),
      };
    }
    if (!sortedProductMatches.length) return null;
    return {
      ...base,
      results: sortedProductMatches.map((match) => ({
        product: {
          id: match.product.id,
          name: match.product.name,
          brand: match.product.brand,
          price: match.product.price,
          currency: match.product.currency,
        },
        scenario: match.scenario,
        matchPercent: match.matchPercent,
        fitScore: match.fitScore,
        debug: match.debug ?? null,
      })),
    };
  }, [
    answers,
    computeSkippedQuestions,
    currentResultMode,
    finalizedInput,
    input,
    minMatchPercent,
    orderedQuestions,
    questions.length,
    sortedPackageMatches,
    sortedProductMatches,
  ]);

  const debugJson = useMemo(() => {
    if (!debugPayload) return "";
    try {
      return JSON.stringify(debugPayload, null, 2);
    } catch {
      return "Nu pot serializa debug payload.";
    }
  }, [debugPayload]);

  const hasNoResults =
    currentResultMode === "packages" ? sortedPackageMatches.length === 0 : sortedProductMatches.length === 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedFavorites = window.localStorage.getItem(FAVORITES_KEY);
      const storedHistory = window.localStorage.getItem(HISTORY_KEY);
      if (storedFavorites) setFavorites(JSON.parse(storedFavorites));
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory) as Array<Partial<HistorySession>>;
        setHistory(
          parsed.map((session) => ({
            id: session.id ?? generateSessionId(),
            questionnaireId: session.questionnaireId ?? "",
            questionnaireTitle: session.questionnaireTitle ?? "Chestionar",
            createdAt: session.createdAt ?? Date.now(),
            answers: session.answers ?? {},
            input: session.input ?? {},
            resultMode: session.resultMode === "packages" ? "packages" : "products",
            matchProductIds: session.matchProductIds ?? [],
            matchPackageIds: session.matchPackageIds ?? [],
            askedQuestionIds: session.askedQuestionIds,
          })),
        );
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  const currentQuestion = orderedQuestions[currentStep];
  const canProceed = currentQuestion ? isRequiredAnswered(currentQuestion, answers[currentQuestion.id]) : false;

  const logQuestionnaireCompletion = useCallback(
    async (session: HistorySession) => {
      try {
        const name = completionContact.name.trim();
        const email = completionContact.email.trim();
        const ref = await createQuestionnaireCompletion({
          questionnaireId: session.questionnaireId,
          questionnaireTitle: session.questionnaireTitle,
          user: {
            uid: authUser?.uid,
            isAnonymous: !authUser?.uid,
            ...(authUser?.email ? { email: authUser.email } : {}),
          },
          contact: {
            name,
            email,
          },
          answers: session.answers,
          ...(session.matchProductIds.length ? { matchProductIds: session.matchProductIds } : {}),
          ...(session.matchPackageIds.length ? { matchPackageIds: session.matchPackageIds } : {}),
          askedQuestionIds: session.askedQuestionIds,
          skippedQuestions: computeSkippedQuestions(),
        });
        setCompletionId(ref.id);
      } catch (err) {
        logFirebaseError("RecommendationTest: createCompletion", err);
      }
    },
    [authUser, completionContact.email, completionContact.name, computeSkippedQuestions],
  );

  const finalizeQuestionnaire = () => {
    const name = completionContact.name.trim();
    const email = completionContact.email.trim();
    if (!name || !email) {
      setCompletionError("Completează numele și emailul înainte de a vedea rezultatele.");
      return;
    }
    setCompletionError(null);
    const sessionId = generateSessionId();
    const questionnaireTitle =
      questionnaires.find((item) => item.id === selectedQuestionnaireId)?.title ?? "Chestionar";
    const resultMode: ResultMode = packageMatches.length > 0 ? "packages" : "products";
    const session: HistorySession = {
      id: sessionId,
      questionnaireId: selectedQuestionnaireId,
      questionnaireTitle,
      createdAt: Date.now(),
      answers,
      input,
      resultMode,
      matchProductIds: resultMode === "products" ? liveProductMatches.map((match) => match.product.id) : [],
      matchPackageIds: resultMode === "packages" ? livePackageMatches.map((match) => match.package.id) : [],
      askedQuestionIds: orderedQuestions.map((question) => question.id),
    };
    setHistory((prev) => [session, ...prev].slice(0, 20));
    setFinalizedInput(input);
    setFinalizedProductMatches(productMatches);
    setFinalizedPackageMatches(packageMatches);
    setFinalizedResultMode(resultMode);
    setSelectedProductMatch(null);
    setSelectedPackageMatch(null);
    setActiveTab("results");
    setRequestSent(false);
    void logQuestionnaireCompletion(session);
    if (!specialistForm.name || !specialistForm.email) {
      setSpecialistForm((prev) => ({
        ...prev,
        name: prev.name || completionContact.name,
        email: prev.email || completionContact.email,
      }));
    }
  };

  const restartQuestionnaire = () => {
    setAnswers({});
    setCurrentStep(0);
    setFinalizedInput(null);
    setFinalizedProductMatches([]);
    setFinalizedPackageMatches([]);
    setFinalizedResultMode(null);
    setSelectedProductMatch(null);
    setSelectedPackageMatch(null);
    setActiveTab("questionnaire");
    setRequestSent(false);
    setRequestError(null);
    setCompletionId(null);
    setCompletionError(null);
  };

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };

  useEffect(() => {
    if (!finalizedInput) return;
    setSpecialistForm((prev) => {
      if (prev.note.trim()) return prev;
      const summary = orderedQuestions
        .map((question) => {
          const value = answers[question.id];
          const formatted = formatAnswerForQuestion(value, question);
          if (!formatted) return null;
          return `${question.label}: ${formatted}`;
        })
        .filter(Boolean)
        .join("\n");
      return {
        ...prev,
        note: summary,
      };
    });
  }, [finalizedInput, orderedQuestions, answers]);

  const submitSpecialistRequest = async () => {
    if (!finalizedInput) return;
    const name = specialistForm.name.trim();
    const phone = specialistForm.phone.trim();
    const email = specialistForm.email.trim();
    const note = specialistForm.note.trim();
    const mode = finalizedResultMode ?? liveResultMode;
    const matchProductIds = mode === "products" ? finalizedProductMatches.map((match) => match.product.id) : [];
    const matchPackageIds = mode === "packages" ? finalizedPackageMatches.map((match) => match.package.id) : [];
    if (!name || !phone) {
      setRequestError("Completează numele și telefonul.");
      return;
    }
    try {
      setIsSubmittingRequest(true);
      setRequestError(null);
      const userId = generateSessionId();
      const requestRef = await createSpecialistRequest(userId, {
        questionnaireId: selectedQuestionnaireId,
        answers,
        note: note || undefined,
        contact: {
          name,
          phone,
          ...(email ? { email } : {}),
        },
        ...(matchProductIds.length ? { matchProductIds } : {}),
        ...(matchPackageIds.length ? { matchPackageIds } : {}),
        askedQuestionIds: orderedQuestions.map((question) => question.id),
        skippedQuestions: computeSkippedQuestions(),
        source: "recommendation_test",
      });
      if (completionId) {
        await setQuestionnaireCompletionSpecialistRequestId(completionId, requestRef.id);
      }
      setRequestSent(true);
    } catch (err) {
      logFirebaseError("RecommendationTest: createSpecialistRequest", err);
      const info = getFirebaseErrorInfo(err);
      setRequestError(info.message || "Trimiterea cererii a eșuat.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const openImageViewer = (images: string[], index: number, title: string, productUrl?: string) => {
    if (!images.length) return;
    setImageViewer({
      images,
      index,
      title,
      productUrl,
    });
  };

  const goToImage = (nextIndex: number) => {
    if (!imageViewer) return;
    const total = imageViewer.images.length;
    const index = ((nextIndex % total) + total) % total;
    setImageViewer({ ...imageViewer, index });
  };

  const openHistorySession = (session: HistorySession) => {
    if (session.questionnaireId !== selectedQuestionnaireId) {
      setPendingSession(session);
      setSelectedQuestionnaireId(session.questionnaireId);
      return;
    }
    setAnswers(session.answers);
    setFinalizedInput(session.input);
    const askedKeys = getAskedKeysFromIds(session.askedQuestionIds);
    const nextProductMatches = matchProductScenarios({
      products,
      input: session.input,
      minMatchPercent,
      askedKeys,
      questionnaireKeys: questionnaireKeysForCurrent,
      debug: isDebugEnabled,
    });
    const nextPackageMatches = matchPackageScenarios({
      packages,
      productsById,
      input: session.input,
      minMatchPercent,
      askedKeys,
      questionnaireKeys: questionnaireKeysForCurrent,
      debug: isDebugEnabled,
    });
    const nextMode: ResultMode =
      session.resultMode === "packages" && nextPackageMatches.length > 0 ? "packages" : "products";
    setFinalizedProductMatches(nextProductMatches);
    setFinalizedPackageMatches(nextPackageMatches);
    setFinalizedResultMode(nextMode);
    setSelectedProductMatch(null);
    setSelectedPackageMatch(null);
    setActiveTab("results");
  };

  const renderTagBadges = (label: string, values: string[], map: VocabMap) => {
    if (!values.length) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{label}:</span>
        {values.map((value) => (
          <Badge key={`${label}-${value}`} variant="outline">
            {formatTagValue(map, value)}
          </Badge>
        ))}
      </div>
    );
  };

  const renderSpeedSpinControlBadges = (attributes?: { speed?: number; spin?: number; control?: number }) => {
    const speed = attributes?.speed;
    const spin = attributes?.spin;
    const control = attributes?.control;
    if (speed === undefined && spin === undefined && control === undefined) return null;

    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Atribute:</span>
        {speed !== undefined ? <Badge variant="outline">Viteză: {speed}</Badge> : null}
        {spin !== undefined ? <Badge variant="outline">Spin: {spin}</Badge> : null}
        {control !== undefined ? <Badge variant="outline">Control: {control}</Badge> : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border bg-destructive/10 p-4 text-sm">
          <div className="font-semibold text-destructive">Eroare</div>
          <div className="text-muted-foreground">{error}</div>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Test recomandări</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Simulare completă a fluxului de recomandări din aplicația mobilă.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="recommendations.test" />
          <Button type="button" variant="outline" onClick={() => load()} disabled={isLoading}>
            Reîmprospătează
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="questionnaire">
            <List className="mr-2" />
            Chestionar
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!finalizedInput}>
            <CheckCircle2 className="mr-2" />
            Rezultate
          </TabsTrigger>
          <TabsTrigger value="favorites">
            <Heart className="mr-2" />
            Favorite
            {favorites.length ? <Badge className="ml-2">{favorites.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-2" />
            Istoric
            {history.length ? <Badge className="ml-2">{history.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questionnaire" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Chestionar ghidat</CardTitle>
              <CardDescription>
                Răspunde pas cu pas la întrebări. La final, apasă „Vezi rezultate" pentru recomandări personalizate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : activeQuestionnaires.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-muted-foreground">Nu există chestionare active pentru test.</p>
                </div>
              ) : (
                <>
                  {activeQuestionnaires.length > 1 ? (
                    <div className="space-y-2">
                      <Label>Alege chestionarul</Label>
                      <Select value={selectedQuestionnaireId} onValueChange={setSelectedQuestionnaireId}>
                        <SelectTrigger className="max-w-md">
                          <SelectValue placeholder="Selectează" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeQuestionnaires.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{activeQuestionnaires[0]?.title}</Badge>
                    </div>
                  )}

                  <Separator />

                  {isLoadingQuestions ? (
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-32 w-full" />
                    </div>
                  ) : orderedQuestions.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center">
                      <p className="text-muted-foreground">Nu există întrebări active în chestionar.</p>
                    </div>
                  ) : currentQuestion ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">
                          Întrebarea {currentStep + 1} din {orderedQuestions.length}
                        </Badge>
                        <div className="flex gap-1">
                          {orderedQuestions.map((question, idx) => (
                            <div
                              key={question.id}
                              className={`h-1.5 w-8 rounded-full transition-colors ${
                                idx === currentStep ? "bg-primary" : idx < currentStep ? "bg-primary/60" : "bg-muted"
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 rounded-lg border p-6">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2 font-medium text-lg">
                            {currentQuestion.label}
                            {currentQuestion.validation?.required ? (
                              <span className="text-base text-destructive">*</span>
                            ) : null}
                          </Label>
                          {currentQuestion.helpText ? (
                            <p className="text-muted-foreground text-sm">{currentQuestion.helpText}</p>
                          ) : null}
                        </div>

                        <div className="pt-2">
                          {currentQuestion.type === "single_select" ? (
                            (currentQuestion.options ?? []).filter((option) => option.active).length === 0 ? (
                              <p className="text-muted-foreground text-sm">Nu există opțiuni active.</p>
                            ) : (
                              <Select
                                value={asSingleChoice(answers[currentQuestion.id]) || ANY_VALUE}
                                onValueChange={(value) =>
                                  updateAnswer(currentQuestion.id, value === ANY_VALUE ? "" : value)
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Selectează o opțiune" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={ANY_VALUE}>(fără selecție)</SelectItem>
                                  {(currentQuestion.options ?? [])
                                    .filter((option) => option.active)
                                    .sort((a, b) => a.order - b.order)
                                    .map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )
                          ) : null}

                          {currentQuestion.type === "multi_select" ? (
                            (currentQuestion.options ?? []).filter((option) => option.active).length === 0 ? (
                              <p className="text-muted-foreground text-sm">Nu există opțiuni active.</p>
                            ) : (
                              <div className="grid gap-3">
                                {(currentQuestion.options ?? [])
                                  .filter((option) => option.active)
                                  .sort((a, b) => a.order - b.order)
                                  .map((option) => {
                                    const selected = asStringArray(answers[currentQuestion.id]);
                                    const isChecked = selected.includes(option.value);
                                    const checkboxId = `${currentQuestion.id}-${option.value}`;
                                    return (
                                      <div
                                        key={option.value}
                                        className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                                      >
                                        <Checkbox
                                          id={checkboxId}
                                          checked={isChecked}
                                          onCheckedChange={() => {
                                            const next = isChecked
                                              ? selected.filter((value) => value !== option.value)
                                              : [...selected, option.value];
                                            updateAnswer(currentQuestion.id, next);
                                          }}
                                        />
                                        <label htmlFor={checkboxId} className="cursor-pointer">
                                          {option.label}
                                        </label>
                                      </div>
                                    );
                                  })}
                              </div>
                            )
                          ) : null}

                          {currentQuestion.type === "text" ? (
                            <Textarea
                              rows={4}
                              value={
                                typeof answers[currentQuestion.id] === "string"
                                  ? (answers[currentQuestion.id] as string)
                                  : ""
                              }
                              onChange={(event) => updateAnswer(currentQuestion.id, event.target.value)}
                              placeholder="Scrie răspunsul aici..."
                            />
                          ) : null}

                          {currentQuestion.type === "range" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label>Valoare minimă</Label>
                                <Input
                                  type="number"
                                  value={(answers[currentQuestion.id] as RangeAnswer | undefined)?.min ?? ""}
                                  onChange={(event) =>
                                    updateAnswer(currentQuestion.id, {
                                      ...(answers[currentQuestion.id] as RangeAnswer | undefined),
                                      min: event.target.value,
                                    })
                                  }
                                  placeholder={
                                    currentQuestion.validation?.min !== undefined
                                      ? `Min: ${currentQuestion.validation.min}`
                                      : "Minim"
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Valoare maximă</Label>
                                <Input
                                  type="number"
                                  value={(answers[currentQuestion.id] as RangeAnswer | undefined)?.max ?? ""}
                                  onChange={(event) =>
                                    updateAnswer(currentQuestion.id, {
                                      ...(answers[currentQuestion.id] as RangeAnswer | undefined),
                                      max: event.target.value,
                                    })
                                  }
                                  placeholder={
                                    currentQuestion.validation?.max !== undefined
                                      ? `Max: ${currentQuestion.validation.max}`
                                      : "Maxim"
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {currentStep === orderedQuestions.length - 1 ? (
                          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Nume (pentru istoric)</Label>
                              <Input
                                value={completionContact.name}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setCompletionContact((prev) => ({ ...prev, name: value }));
                                  if (completionError) setCompletionError(null);
                                }}
                                placeholder="Nume complet"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Email (pentru istoric)</Label>
                              <Input
                                type="email"
                                value={completionContact.email}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setCompletionContact((prev) => ({ ...prev, email: value }));
                                  if (completionError) setCompletionError(null);
                                }}
                                placeholder="email@exemplu.ro"
                              />
                            </div>
                            {completionError ? (
                              <div className="text-destructive text-sm md:col-span-2">{completionError}</div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="flex items-center justify-between">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
                            disabled={currentStep === 0}
                          >
                            Înapoi
                          </Button>
                          {currentStep < orderedQuestions.length - 1 ? (
                            <Button
                              type="button"
                              onClick={() => setCurrentStep((prev) => Math.min(orderedQuestions.length - 1, prev + 1))}
                              disabled={!canProceed}
                            >
                              Următoarea
                            </Button>
                          ) : (
                            <Button type="button" onClick={finalizeQuestionnaire} disabled={!canProceed}>
                              Vezi rezultate
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Rezultate recomandări</CardTitle>
              <CardDescription>
                {currentResultMode === "packages"
                  ? "Pachete recomandate pe baza răspunsurilor tale. Poți sorta după potrivire, preț, viteză, spin sau control. Dacă nu există pachete eligibile, se folosește fallback pe produse."
                  : "Produse recomandate pe baza răspunsurilor tale (fallback). Poți sorta după potrivire, preț, viteză, spin sau control."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Label>Criteriu:</Label>
                  <Select value={sortMetric} onValueChange={(value) => setSortMetric(value as SortMetric)}>
                    <SelectTrigger className="w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fit">Potrivire</SelectItem>
                      <SelectItem value="price">Preț</SelectItem>
                      <SelectItem value="speed">Viteză</SelectItem>
                      <SelectItem value="spin">Spin</SelectItem>
                      <SelectItem value="control">Control</SelectItem>
                    </SelectContent>
                  </Select>

                  <Label>Direcție:</Label>
                  <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Crescător</SelectItem>
                      <SelectItem value="desc">Descrescător</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={restartQuestionnaire}>
                  Reia chestionarul
                </Button>
              </div>

              {hasNoResults ? (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <p className="text-muted-foreground">
                    {currentResultMode === "packages"
                      ? "Nu există pachete care să se potrivească criteriilor tale."
                      : "Nu există produse care să se potrivească criteriilor tale."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentResultMode === "packages"
                    ? sortedPackageMatches.map((match, idx) => {
                        return (
                          <div
                            key={`${match.package.id}-${match.scenario.order}`}
                            className="group relative rounded-lg border p-4 transition-all hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-start gap-3">
                                  <div className="flex flex-col gap-2">
                                    <Badge variant="secondary">#{idx + 1}</Badge>
                                    <Badge variant="outline">Potrivire {match.matchPercent}%</Badge>
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-lg">{match.package.title}</h3>
                                    <p className="text-muted-foreground text-sm">
                                      {match.package.totalPrice} {match.package.currency} •{" "}
                                      {match.package.mode === "single"
                                        ? "single"
                                        : match.package.mode === "triple"
                                          ? "triple"
                                          : "custom"}
                                    </p>
                                    {renderSpeedSpinControlBadges(match.package.attributes) ? (
                                      <div className="mt-2">
                                        {renderSpeedSpinControlBadges(match.package.attributes)}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                {match.scenario.explanationTemplate ? (
                                  <p className="pl-11 text-muted-foreground text-sm">
                                    {match.scenario.explanationTemplate}
                                  </p>
                                ) : null}
                                <div className="space-y-2 pl-11">
                                  {match.package.items.map((item, index) => {
                                    const product = productsById.get(item.productId);
                                    const gallery = product ? buildImageGallery(product) : [];
                                    return (
                                      <div
                                        key={`${match.package.id}-${index}-${item.productId}`}
                                        className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2"
                                      >
                                        <Badge variant="outline">{formatPackageRole(item.role)}</Badge>
                                        {gallery.length ? (
                                          <button
                                            type="button"
                                            className="relative size-10 overflow-hidden rounded border bg-muted/20"
                                            onClick={() =>
                                              openImageViewer(
                                                gallery,
                                                0,
                                                product?.name ?? item.productId,
                                                product?.productUrl,
                                              )
                                            }
                                          >
                                            <Image
                                              src={gallery[0]}
                                              alt={product?.name ?? item.productId}
                                              fill
                                              sizes="40px"
                                              className="object-cover"
                                              unoptimized
                                            />
                                          </button>
                                        ) : null}
                                        <span className="font-medium">{product?.name ?? item.productId}</span>
                                        {product ? (
                                          <span className="text-muted-foreground text-sm">
                                            {product.price} {product.currency}
                                          </span>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedPackageMatch(match)}
                                >
                                  Detalii
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    : sortedProductMatches.map((match, idx) => {
                        const gallery = buildImageGallery(match.product);
                        return (
                          <div
                            key={`${match.product.id}-${match.scenario.order}`}
                            className="group relative rounded-lg border p-4 transition-all hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-start gap-3">
                                  <div className="flex flex-col gap-2">
                                    <Badge variant="secondary">#{idx + 1}</Badge>
                                    <Badge variant="outline">Potrivire {match.matchPercent}%</Badge>
                                  </div>
                                  {gallery.length ? (
                                    <button
                                      type="button"
                                      className="relative size-14 overflow-hidden rounded-md border bg-muted/20"
                                      onClick={() =>
                                        openImageViewer(gallery, 0, match.product.name, match.product.productUrl)
                                      }
                                      title="Vezi pozele"
                                    >
                                      <Image
                                        src={gallery[0]}
                                        alt={match.product.name}
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
                                    </button>
                                  ) : null}
                                  <div>
                                    <h3 className="font-semibold text-lg">{match.product.name}</h3>
                                    <p className="text-muted-foreground text-sm">
                                      {match.product.price} {match.product.currency}
                                    </p>
                                    {renderSpeedSpinControlBadges(match.product.attributes) ? (
                                      <div className="mt-2">
                                        {renderSpeedSpinControlBadges(match.product.attributes)}
                                      </div>
                                    ) : null}
                                    {match.product.productUrl ? (
                                      <a
                                        href={match.product.productUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary text-sm underline-offset-4 hover:underline"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          void openProductUrl(match.product);
                                        }}
                                      >
                                        Vezi produsul în magazin
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                                {match.scenario.explanationTemplate ? (
                                  <p className="pl-11 text-muted-foreground text-sm">
                                    {match.scenario.explanationTemplate}
                                  </p>
                                ) : null}
                                <div className="space-y-2 pl-11">
                                  {renderTagBadges("Nivel recomandat", match.product.tags.level ?? [], vocabMaps.level)}
                                  {renderTagBadges("Stil", match.product.tags.style ?? [], vocabMaps.style)}
                                  {renderTagBadges("Distanță", match.product.tags.distance ?? [], vocabMaps.distance)}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedProductMatch(match)}
                                >
                                  Detalii
                                </Button>
                                <Button
                                  type="button"
                                  variant={favorites.includes(match.product.id) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => toggleFavorite(match.product.id)}
                                >
                                  <Heart
                                    className="mr-1 size-4"
                                    fill={favorites.includes(match.product.id) ? "currentColor" : "none"}
                                  />
                                  {favorites.includes(match.product.id) ? "Salvat" : "Salvează"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                </div>
              )}

              <Separator />

              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">Ai nevoie de părerea unui specialist?</h3>
                    <p className="text-muted-foreground text-sm">
                      Completează formularul și un specialist te va contacta.
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <a href={`tel:${SPECIALIST_PHONE}`}>Sună acum: {SPECIALIST_PHONE}</a>
                  </Button>
                </div>

                {requestSent ? (
                  <div className="rounded-md border bg-muted p-3 text-sm">Cererea ta a fost trimisă. Îți mulțumim!</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nume</Label>
                      <Input
                        value={specialistForm.name}
                        onChange={(event) => setSpecialistForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nume complet"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefon</Label>
                      <Input
                        value={specialistForm.phone}
                        onChange={(event) => setSpecialistForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="07xx xxx xxx"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={specialistForm.email}
                        onChange={(event) => setSpecialistForm((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="email@exemplu.ro"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Mesaj / răspunsuri</Label>
                      <Textarea
                        rows={4}
                        value={specialistForm.note}
                        onChange={(event) => setSpecialistForm((prev) => ({ ...prev, note: event.target.value }))}
                      />
                    </div>
                    {requestError ? <div className="text-destructive text-sm md:col-span-2">{requestError}</div> : null}
                    <div className="md:col-span-2">
                      <Button type="button" onClick={submitSpecialistRequest} disabled={isSubmittingRequest}>
                        {isSubmittingRequest ? "Se trimite..." : "Trimite cererea"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="favorites" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Produse favorite</CardTitle>
              <CardDescription>Produsele pe care le-ai marcat ca favorite în timpul testului.</CardDescription>
            </CardHeader>
            <CardContent>
              {favorites.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <Heart className="mx-auto mb-4 size-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nu ai încă produse favorite.</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Marchează produse din rezultatele recomandărilor.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {favorites.map((id) => {
                    const product = products.find((item) => item.id === id);
                    if (!product) return null;
                    return (
                      <div key={id} className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <h4 className="font-medium">{product.name}</h4>
                          <p className="text-muted-foreground text-sm">
                            {product.price} {product.currency}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => toggleFavorite(id)}>
                          Elimină
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Istoric recomandări</CardTitle>
              <CardDescription>Sesiunile anterioare de recomandări. Poți revedea oricând rezultatele.</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <History className="mx-auto mb-4 size-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nu există încă sesiuni salvate.</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    Finalizează un chestionar pentru a crea primul istoric.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((session) => (
                    <div key={session.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-1">
                        <h4 className="font-medium">{session.questionnaireTitle}</h4>
                        <p className="text-muted-foreground text-sm">
                          {new Date(session.createdAt).toLocaleDateString("ro-RO", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {session.resultMode === "packages"
                            ? `${session.matchPackageIds.length} pachete recomandate`
                            : `${session.matchProductIds.length} produse recomandate`}
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => openHistorySession(session)}>
                        Vezi sesiunea
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(selectedProductMatch)}
        onOpenChange={(open) => (!open ? setSelectedProductMatch(null) : null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>Detalii produs</DialogTitle>
          {selectedProductMatch ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {buildImageGallery(selectedProductMatch.product).length ? (
                  <button
                    type="button"
                    className="relative size-20 overflow-hidden rounded-md border bg-muted/20"
                    onClick={() =>
                      openImageViewer(
                        buildImageGallery(selectedProductMatch.product),
                        0,
                        selectedProductMatch.product.name,
                        selectedProductMatch.product.productUrl,
                      )
                    }
                    title="Vezi pozele"
                  >
                    <Image
                      src={buildImageGallery(selectedProductMatch.product)[0]}
                      alt={selectedProductMatch.product.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ) : null}
                <div className="space-y-2">
                  <h3 className="font-bold text-2xl">{selectedProductMatch.product.name}</h3>
                  <div className="flex items-center gap-4 text-muted-foreground text-sm">
                    <span className="font-semibold text-foreground text-lg">
                      {selectedProductMatch.product.price} {selectedProductMatch.product.currency}
                    </span>
                    <Separator orientation="vertical" className="h-4" />
                    <span>Potrivire: {selectedProductMatch.fitScore.toFixed(2)}</span>
                  </div>
                  {selectedProductMatch.product.productUrl ? (
                    <a
                      href={selectedProductMatch.product.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-sm underline-offset-4 hover:underline"
                      onClick={(event) => {
                        event.preventDefault();
                        void openProductUrl(selectedProductMatch.product);
                      }}
                    >
                      Vezi produsul în magazin
                    </a>
                  ) : null}
                </div>
              </div>

              {selectedProductMatch.scenario.explanationTemplate ? (
                <div className="rounded-lg bg-muted p-4">
                  <h4 className="mb-2 font-medium">De ce se potrivește?</h4>
                  <p className="text-muted-foreground text-sm">{selectedProductMatch.scenario.explanationTemplate}</p>
                </div>
              ) : null}

              <div className="space-y-3">
                <h4 className="font-medium">Recomandat pentru</h4>
                <div className="space-y-2">
                  {renderTagBadges("Nivel", selectedProductMatch.product.tags.level ?? [], vocabMaps.level)}
                  {renderTagBadges("Stil", selectedProductMatch.product.tags.style ?? [], vocabMaps.style)}
                  {renderTagBadges("Distanță", selectedProductMatch.product.tags.distance ?? [], vocabMaps.distance)}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Atribute produs (informativ)</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedProductMatch.product.attributes.control !== undefined ? (
                    <Badge variant="outline">Control: {selectedProductMatch.product.attributes.control}</Badge>
                  ) : null}
                  {selectedProductMatch.product.attributes.spin !== undefined ? (
                    <Badge variant="outline">Spin: {selectedProductMatch.product.attributes.spin}</Badge>
                  ) : null}
                  {selectedProductMatch.product.attributes.speed !== undefined ? (
                    <Badge variant="outline">Viteză: {selectedProductMatch.product.attributes.speed}</Badge>
                  ) : null}
                  {selectedProductMatch.product.attributes.weight !== undefined ? (
                    <Badge variant="outline">Greutate: {selectedProductMatch.product.attributes.weight}</Badge>
                  ) : null}
                </div>
              </div>

              {preferences.length ? (
                <div className="space-y-2">
                  <h4 className="font-medium">Preferințele tale</h4>
                  <div className="flex flex-wrap gap-2">
                    {preferences.map((pref) => (
                      <Badge key={pref} variant="outline">
                        {pref}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <Separator />

              <Button
                type="button"
                className="w-full"
                variant={favorites.includes(selectedProductMatch.product.id) ? "default" : "outline"}
                onClick={() => {
                  toggleFavorite(selectedProductMatch.product.id);
                  setSelectedProductMatch(null);
                }}
              >
                <Heart
                  className="mr-2 size-4"
                  fill={favorites.includes(selectedProductMatch.product.id) ? "currentColor" : "none"}
                />
                {favorites.includes(selectedProductMatch.product.id) ? "Elimină din favorite" : "Adaugă la favorite"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedPackageMatch)}
        onOpenChange={(open) => (!open ? setSelectedPackageMatch(null) : null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>Detalii pachet</DialogTitle>
          {selectedPackageMatch ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-2xl">{selectedPackageMatch.package.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {selectedPackageMatch.package.totalPrice} {selectedPackageMatch.package.currency} •{" "}
                  {selectedPackageMatch.package.mode === "single"
                    ? "single"
                    : selectedPackageMatch.package.mode === "triple"
                      ? "triple"
                      : "custom"}
                </p>
              </div>

              {renderSpeedSpinControlBadges(selectedPackageMatch.package.attributes) ? (
                <div className="space-y-2">
                  <h4 className="font-medium">Atribute pachet (informativ)</h4>
                  {renderSpeedSpinControlBadges(selectedPackageMatch.package.attributes)}
                </div>
              ) : null}

              {selectedPackageMatch.scenario.explanationTemplate ? (
                <div className="rounded-lg bg-muted p-4">
                  <h4 className="mb-2 font-medium">De ce se potrivește?</h4>
                  <p className="text-muted-foreground text-sm">{selectedPackageMatch.scenario.explanationTemplate}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <h4 className="font-medium">Componente pachet</h4>
                <div className="space-y-2">
                  {selectedPackageMatch.package.items.map((item, index) => {
                    const product = productsById.get(item.productId);
                    const gallery = product ? buildImageGallery(product) : [];
                    return (
                      <div
                        key={`${selectedPackageMatch.package.id}-${index}-${item.productId}`}
                        className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2"
                      >
                        <Badge variant="outline">{formatPackageRole(item.role)}</Badge>
                        {gallery.length ? (
                          <button
                            type="button"
                            className="relative size-10 overflow-hidden rounded border bg-muted/20"
                            onClick={() =>
                              openImageViewer(gallery, 0, product?.name ?? item.productId, product?.productUrl)
                            }
                          >
                            <Image
                              src={gallery[0]}
                              alt={product?.name ?? item.productId}
                              fill
                              sizes="40px"
                              className="object-cover"
                              unoptimized
                            />
                          </button>
                        ) : null}
                        <span className="font-medium">{product?.name ?? item.productId}</span>
                        {product ? (
                          <span className="text-muted-foreground text-sm">
                            {product.price} {product.currency}
                          </span>
                        ) : null}
                        {product?.productUrl ? (
                          <a
                            href={product.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary text-sm underline-offset-4 hover:underline"
                            onClick={(event) => {
                              event.preventDefault();
                              void openProductUrl(product);
                            }}
                          >
                            Vezi produsul
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(imageViewer)} onOpenChange={(open) => (!open ? setImageViewer(null) : null)}>
        <DialogContent className="flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden">
          {imageViewer ? (
            <div className="flex h-full flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <DialogTitle>Imagini produs</DialogTitle>
                  <div className="text-muted-foreground text-sm">{imageViewer.title}</div>
                </div>
                {imageViewer.productUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={imageViewer.productUrl} target="_blank" rel="noreferrer">
                      Vezi produsul în magazin
                    </a>
                  </Button>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1 items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => goToImage(imageViewer.index - 1)}
                  disabled={imageViewer.images.length < 2}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="min-h-0 flex-1">
                  <div className="relative h-full min-h-[240px] w-full overflow-hidden rounded-md border bg-muted/20">
                    <Image
                      src={imageViewer.images[imageViewer.index]}
                      alt={imageViewer.title}
                      fill
                      sizes="90vw"
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => goToImage(imageViewer.index + 1)}
                  disabled={imageViewer.images.length < 2}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {imageViewer.images.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {imageViewer.images.map((img, idx) => (
                    <button
                      key={img}
                      type="button"
                      className={`relative size-16 overflow-hidden rounded-md border ${idx === imageViewer.index ? "ring-2 ring-primary" : ""}`}
                      onClick={() => goToImage(idx)}
                    >
                      <Image
                        src={img}
                        alt={`${imageViewer.title} ${idx + 1}`}
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {isDebugEnabled ? (
        <>
          <Button
            type="button"
            variant="secondary"
            className="fixed right-6 bottom-6 z-50 shadow-lg"
            onClick={() => setIsDebugOpen(true)}
            disabled={activeTab !== "results" || !debugPayload}
          >
            Debug
          </Button>

          <Dialog open={isDebugOpen} onOpenChange={setIsDebugOpen}>
            <DialogContent className="!max-w-none flex h-[85vh] w-[95vw] flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Debug recomandări</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted p-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed">{debugJson || "Nimic de afișat."}</pre>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      if (!debugJson) return;
                      await navigator.clipboard.writeText(debugJson);
                    } catch {
                      // ignore clipboard errors
                    }
                  }}
                  disabled={!debugJson}
                >
                  Copiază JSON
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
