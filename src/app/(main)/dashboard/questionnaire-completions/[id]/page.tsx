"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getQuestionnaireCompletionById } from "@/lib/firestore/completions";
import { getProductsByIds } from "@/lib/firestore/products";
import { listQuestions } from "@/lib/firestore/questions";
import type { Product, QuestionnaireCompletion, QuestionnaireQuestion, WithId } from "@/lib/firestore/types";

type CompletionItem = WithId<QuestionnaireCompletion>;

type RangeAnswer = { min?: string; max?: string };

const formatAnswer = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object" && value) {
    const range = value as RangeAnswer;
    if (range.min !== undefined || range.max !== undefined) {
      return `${range.min ?? "—"} - ${range.max ?? "—"}`;
    }
    return JSON.stringify(value);
  }
  if (value === undefined || value === null) return "—";
  return String(value);
};

export default function QuestionnaireCompletionDetailPage() {
  const params = useParams();
  const completionId = params.id as string;
  const [completion, setCompletion] = useState<CompletionItem | null>(null);
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [products, setProducts] = useState<WithId<Product>[]>([]);
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

  const answersList = useMemo(() => {
    if (!completion) return [];
    const entries = Object.entries(completion.answers ?? {});
    const mapped = entries.map(([questionId, value]) => {
      const question = questions.find((q) => q.id === questionId);
      return {
        id: questionId,
        label: question?.label ?? questionId,
        key: question?.key,
        order: question?.order ?? 999,
        value,
      };
    });
    return mapped.sort((a, b) => a.order - b.order);
  }, [completion, questions]);

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
      <div>
        <h1 className="font-semibold text-2xl">Completare chestionar</h1>
        <p className="text-muted-foreground text-sm">
          {completion.questionnaireTitle} • {completion.createdAt?.toDate().toLocaleString()}
        </p>
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
                  <div className="mt-1 text-muted-foreground text-sm">{formatAnswer(entry.value)}</div>
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
          {products.length === 0 ? (
            <div className="text-muted-foreground text-sm">Nu există produse recomandate salvate.</div>
          ) : (
            products.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-muted-foreground text-sm">
                    {product.price} {product.currency}
                  </div>
                </div>
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={`/dashboard/products/${product.id}`}
                >
                  Vezi produs
                </Link>
              </div>
            ))
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
