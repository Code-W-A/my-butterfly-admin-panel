"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ProductMultiSelect } from "@/components/mybutterfly/forms/product-multi-select";
import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { listProducts } from "@/lib/firestore/products";
import { getQuestionnaire } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import {
  getSpecialistRequestById,
  setSpecialistRequestReply,
  updateSpecialistRequestStatus,
} from "@/lib/firestore/requests";
import type { Questionnaire, QuestionnaireQuestion, SpecialistRequest, WithId } from "@/lib/firestore/types";

type RequestWithUser = WithId<SpecialistRequest> & { userId: string };

type ProductOption = { id: string; name: string; price: number; currency: string };

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

const formatAnswerValue = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object" && value) {
    const range = value as RangeAnswer;
    if (range.min !== undefined || range.max !== undefined) {
      return `${range.min ?? "—"} - ${range.max ?? "—"}`;
    }
  }
  if (value === undefined || value === null) return "—";
  return String(value);
};

const formSchema = z.object({
  message: z.string().min(1, "Reply message is required."),
  recommendedProductIds: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  const [request, setRequest] = useState<RequestWithUser | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [questionnaire, setQuestionnaire] = useState<WithId<Questionnaire> | null>(null);
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: "",
      recommendedProductIds: [],
    },
  });
  const isSubmitting = form.formState.isSubmitting;
  const replyTooltipText =
    "Răspunsul tău va fi vizibil în aplicația mobilă și trimis pe emailul introdus de utilizator.";

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [requestData, productsData] = await Promise.all([
      getSpecialistRequestById(requestId),
      listProducts({ activeOnly: true }),
    ]);
    setRequest(requestData);
    setProducts(
      productsData.map((item) => ({ id: item.id, name: item.name, price: item.price, currency: item.currency })),
    );
    if (requestData) {
      form.reset({
        message: requestData.reply?.message ?? "",
        recommendedProductIds: requestData.reply?.recommendedProductIds ?? [],
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
    load();
  }, [load]);

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
    });
    if (request.contact?.email) {
      const recommendedProducts = values.recommendedProductIds
        .map((id) => productMap.get(id))
        .filter(Boolean)
        .map((item) => `${item?.name ?? "Produs"} — ${item?.price} ${item?.currency}`);
      try {
        await fetch("/api/requests/send-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toEmail: request.contact.email,
            userName: request.contact.name,
            message: values.message,
            recommendedProducts,
          }),
        });
      } catch (err) {
        logFirebaseError("RequestDetail: sendReplyEmail", err);
      }
    }
    await load();
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
          {questions.length > 0 ? (
            questions
              .filter((q) => request.answers[q.id] !== undefined)
              .sort((a, b) => a.order - b.order)
              .map((question) => (
                <div key={question.id} className="rounded-md border bg-background p-3">
                  <div className="font-medium text-sm">{question.label}</div>
                  <div className="mt-1 text-muted-foreground text-sm">
                    {formatAnswerValue(request.answers[question.id])}
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
        {request.note ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-semibold text-xs">Notițe suplimentare</div>
            <div className="mt-1 whitespace-pre-wrap">{request.note}</div>
          </div>
        ) : null}
        {request.matchProductIds?.length ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-semibold text-xs">Recomandări generate ({request.matchProductIds.length})</div>
            <div className="mt-1 text-muted-foreground">{request.matchProductIds.join(", ")}</div>
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
            name="recommendedProductIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Produse recomandate</FormLabel>
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
