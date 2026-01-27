"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ProductMultiSelect } from "@/components/mybutterfly/forms/product-multi-select";
import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { listProducts } from "@/lib/firestore/products";
import {
  getSpecialistRequestById,
  setSpecialistRequestReply,
  updateSpecialistRequestStatus,
} from "@/lib/firestore/requests";
import type { SpecialistRequest, WithId } from "@/lib/firestore/types";

type RequestWithUser = WithId<SpecialistRequest> & { userId: string };

type ProductOption = { id: string; name: string; price: number; currency: string };

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
          <div className="font-medium">{request.questionnaireId}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Status</div>
          <div className="font-medium capitalize">{formatStatus(request.status)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">ID utilizator</div>
          <div className="font-medium">{request.userId}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Nume</div>
          <div className="font-medium">{request.contact?.name ?? "—"}</div>
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
        <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-4 text-xs">
          {JSON.stringify(request.answers, null, 2)}
        </pre>
        {request.note ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="text-muted-foreground text-xs">Notiță</div>
            <div>{request.note}</div>
          </div>
        ) : null}
        {request.matchProductIds?.length ? (
          <div className="rounded-md border p-3 text-sm">
            <div className="text-muted-foreground text-xs">Recomandări generate</div>
            <div>{request.matchProductIds.join(", ")}</div>
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
          <h2 className="font-semibold text-lg">Răspuns</h2>
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
