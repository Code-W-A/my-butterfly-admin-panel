"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";

import { CheckCircle2, ChevronLeft, ChevronRight, Heart, History, List } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { listProducts, updateProduct } from "@/lib/firestore/products";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import { createSpecialistRequest } from "@/lib/firestore/requests";
import type { Product, Questionnaire, QuestionnaireQuestion, WithId } from "@/lib/firestore/types";
import { listVocabularyOptions } from "@/lib/firestore/vocabulary";
import { matchProductScenarios, type RecommendationInput } from "@/lib/recommendations/match";

type VocabularyOption = { value: string; label: string };
type VocabMap = Record<string, string>;

type AnswerMap = Record<string, unknown>;
type RangeAnswer = { min?: string; max?: string };
type HistorySession = {
  id: string;
  questionnaireId: string;
  questionnaireTitle: string;
  createdAt: number;
  answers: AnswerMap;
  input: RecommendationInput;
  matchProductIds: string[];
};

const ANY_VALUE = "__any__";
const FAVORITES_KEY = "mb-test-favorites";
const HISTORY_KEY = "mb-test-history";
const SPECIALIST_PHONE = "+40-736-887467";

const generateSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const formatAnswerValue = (value: unknown) => {
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

const formatTagValue = (map: VocabMap, value: string) => map[value] ?? value;

export default function RecommendationTestPage() {
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("questionnaire");
  const { user: authUser } = useAuthUser();

  const [products, setProducts] = useState<WithId<Product>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  const [questionnaires, setQuestionnaires] = useState<WithId<Questionnaire>[]>([]);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState<string>("");
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [finalizedInput, setFinalizedInput] = useState<RecommendationInput | null>(null);
  const [finalizedMatches, setFinalizedMatches] = useState<ReturnType<typeof matchProductScenarios>>([]);
  const [selectedMatch, setSelectedMatch] = useState<ReturnType<typeof matchProductScenarios>[0] | null>(null);
  const [sortMode, setSortMode] = useState<"fit" | "price">("fit");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<HistorySession[]>([]);
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
  const orderedQuestions = useMemo(
    () => questions.filter((item) => item.active).sort((a, b) => a.order - b.order),
    [questions],
  );

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const [productsData, questionnairesData, levelOptions, styleOptions, distanceOptions] = await Promise.all([
        listProducts({ activeOnly: true }),
        listQuestionnaires(),
        listVocabularyOptions("level", { includeInactive: false }),
        listVocabularyOptions("style", { includeInactive: false }),
        listVocabularyOptions("distance", { includeInactive: false }),
      ]);
      setProducts(productsData);
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
    if (!selectedQuestionnaireId) {
      setQuestions([]);
      setAnswers({});
      setCurrentStep(0);
      setFinalizedInput(null);
      setFinalizedMatches([]);
      setSelectedMatch(null);
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
          const nextMatches = matchProductScenarios({ products, input: pendingSession.input });
          setFinalizedMatches(nextMatches);
          setActiveTab("results");
          setPendingSession(null);
        } else {
          setAnswers({});
          setCurrentStep(0);
          setFinalizedInput(null);
          setFinalizedMatches([]);
          setSelectedMatch(null);
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
  }, [selectedQuestionnaireId, products, pendingSession]);

  const updateAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const { input, preferences } = useMemo(
    () => buildRecommendationInput(orderedQuestions, answers),
    [orderedQuestions, answers],
  );

  const matches = useMemo(() => {
    return matchProductScenarios({
      products,
      input,
    });
  }, [products, input]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedFavorites = window.localStorage.getItem(FAVORITES_KEY);
      const storedHistory = window.localStorage.getItem(HISTORY_KEY);
      if (storedFavorites) setFavorites(JSON.parse(storedFavorites));
      if (storedHistory) setHistory(JSON.parse(storedHistory));
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
          matchProductIds: session.matchProductIds,
        });
        setCompletionId(ref.id);
      } catch (err) {
        logFirebaseError("RecommendationTest: createCompletion", err);
      }
    },
    [authUser, completionContact.email, completionContact.name],
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
    const session: HistorySession = {
      id: sessionId,
      questionnaireId: selectedQuestionnaireId,
      questionnaireTitle,
      createdAt: Date.now(),
      answers,
      input,
      matchProductIds: matches.map((match) => match.product.id),
    };
    setHistory((prev) => [session, ...prev].slice(0, 20));
    setFinalizedInput(input);
    setFinalizedMatches(matches);
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
    setFinalizedMatches([]);
    setSelectedMatch(null);
    setActiveTab("questionnaire");
    setRequestSent(false);
    setRequestError(null);
    setCompletionId(null);
    setCompletionError(null);
  };

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };

  const sortedMatches = useMemo(() => {
    const list = finalizedMatches.length ? finalizedMatches : matches;
    const next = [...list];
    if (sortMode === "price") {
      next.sort((a, b) => a.product.price - b.product.price);
      return next;
    }
    next.sort((a, b) => {
      if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
      return a.product.price - b.product.price;
    });
    return next;
  }, [finalizedMatches, matches, sortMode]);

  useEffect(() => {
    if (!finalizedInput) return;
    setSpecialistForm((prev) => {
      if (prev.note.trim()) return prev;
      const summary = orderedQuestions
        .map((question) => {
          const value = answers[question.id];
          const formatted = formatAnswerValue(value);
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
        matchProductIds: finalizedMatches.map((match) => match.product.id),
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
    const nextMatches = matchProductScenarios({ products, input: session.input });
    setFinalizedMatches(nextMatches);
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
        <Button type="button" variant="outline" onClick={() => load()} disabled={isLoading}>
          Reîmprospătează
        </Button>
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
                Produse recomandate pe baza răspunsurilor tale. Poți sorta după potrivire sau preț.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Label>Sortare:</Label>
                  <Select value={sortMode} onValueChange={(value) => setSortMode(value as "fit" | "price")}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fit">Cel mai potrivit</SelectItem>
                      <SelectItem value="price">Cel mai ieftin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={restartQuestionnaire}>
                  Reia chestionarul
                </Button>
              </div>

              {sortedMatches.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <p className="text-muted-foreground">Nu există produse care să se potrivească criteriilor tale.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedMatches.map((match, idx) => {
                    const gallery = buildImageGallery(match.product);
                    return (
                      <div
                        key={`${match.product.id}-${match.scenario.order}`}
                        className="group relative rounded-lg border p-4 transition-all hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start gap-3">
                              <Badge variant="secondary" className="mt-0.5">
                                #{idx + 1}
                              </Badge>
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
                            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMatch(match)}>
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
                          {session.matchProductIds.length} produse recomandate
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

      <Dialog open={Boolean(selectedMatch)} onOpenChange={(open) => (!open ? setSelectedMatch(null) : null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>Detalii produs</DialogTitle>
          {selectedMatch ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {buildImageGallery(selectedMatch.product).length ? (
                  <button
                    type="button"
                    className="relative size-20 overflow-hidden rounded-md border bg-muted/20"
                    onClick={() =>
                      openImageViewer(
                        buildImageGallery(selectedMatch.product),
                        0,
                        selectedMatch.product.name,
                        selectedMatch.product.productUrl,
                      )
                    }
                    title="Vezi pozele"
                  >
                    <Image
                      src={buildImageGallery(selectedMatch.product)[0]}
                      alt={selectedMatch.product.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ) : null}
                <div className="space-y-2">
                  <h3 className="font-bold text-2xl">{selectedMatch.product.name}</h3>
                  <div className="flex items-center gap-4 text-muted-foreground text-sm">
                    <span className="font-semibold text-foreground text-lg">
                      {selectedMatch.product.price} {selectedMatch.product.currency}
                    </span>
                    <Separator orientation="vertical" className="h-4" />
                    <span>Potrivire: {selectedMatch.fitScore.toFixed(2)}</span>
                  </div>
                  {selectedMatch.product.productUrl ? (
                    <a
                      href={selectedMatch.product.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-sm underline-offset-4 hover:underline"
                      onClick={(event) => {
                        event.preventDefault();
                        void openProductUrl(selectedMatch.product);
                      }}
                    >
                      Vezi produsul în magazin
                    </a>
                  ) : null}
                </div>
              </div>

              {selectedMatch.scenario.explanationTemplate ? (
                <div className="rounded-lg bg-muted p-4">
                  <h4 className="mb-2 font-medium">De ce se potrivește?</h4>
                  <p className="text-muted-foreground text-sm">{selectedMatch.scenario.explanationTemplate}</p>
                </div>
              ) : null}

              <div className="space-y-3">
                <h4 className="font-medium">Recomandat pentru</h4>
                <div className="space-y-2">
                  {renderTagBadges("Nivel", selectedMatch.product.tags.level ?? [], vocabMaps.level)}
                  {renderTagBadges("Stil", selectedMatch.product.tags.style ?? [], vocabMaps.style)}
                  {renderTagBadges("Distanță", selectedMatch.product.tags.distance ?? [], vocabMaps.distance)}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Atribute produs (informativ)</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedMatch.product.attributes.control !== undefined ? (
                    <Badge variant="outline">Control: {selectedMatch.product.attributes.control}</Badge>
                  ) : null}
                  {selectedMatch.product.attributes.spin !== undefined ? (
                    <Badge variant="outline">Spin: {selectedMatch.product.attributes.spin}</Badge>
                  ) : null}
                  {selectedMatch.product.attributes.speed !== undefined ? (
                    <Badge variant="outline">Viteză: {selectedMatch.product.attributes.speed}</Badge>
                  ) : null}
                  {selectedMatch.product.attributes.weight !== undefined ? (
                    <Badge variant="outline">Greutate: {selectedMatch.product.attributes.weight}</Badge>
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
                variant={favorites.includes(selectedMatch.product.id) ? "default" : "outline"}
                onClick={() => {
                  toggleFavorite(selectedMatch.product.id);
                  setSelectedMatch(null);
                }}
              >
                <Heart
                  className="mr-2 size-4"
                  fill={favorites.includes(selectedMatch.product.id) ? "currentColor" : "none"}
                />
                {favorites.includes(selectedMatch.product.id) ? "Elimină din favorite" : "Adaugă la favorite"}
              </Button>
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
    </div>
  );
}
