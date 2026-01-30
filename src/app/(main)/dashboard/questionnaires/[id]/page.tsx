"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { QuestionEditor } from "@/components/mybutterfly/questionnaires/question-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getQuestionnaire, updateQuestionnaire } from "@/lib/firestore/questionnaires";
import { listQuestions } from "@/lib/firestore/questions";
import type { Questionnaire, QuestionnaireQuestion, WithId } from "@/lib/firestore/types";

const FormSchema = z.object({
  title: z.string().min(2, "Title is required."),
  active: z.boolean(),
});

const formatQuestionType = (type: QuestionnaireQuestion["type"]) => {
  switch (type) {
    case "single_select":
      return "selectare unică";
    case "multi_select":
      return "selectare multiplă";
    case "text":
      return "text";
    case "range":
      return "interval";
  }
};

export default function QuestionnaireDetailPage() {
  const router = useRouter();
  const params = useParams();
  const questionnaireId = params.id as string;
  const [questionnaire, setQuestionnaire] = useState<WithId<Questionnaire> | null>(null);
  const [questions, setQuestions] = useState<WithId<QuestionnaireQuestion>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "",
      active: true,
    },
  });
  const isSubmitting = form.formState.isSubmitting;

  const selectedQuestion = useMemo(
    () => (selectedId ? (questions.find((item) => item.id === selectedId) ?? null) : null),
    [questions, selectedId],
  );
  const nextQuestionOrder = useMemo(() => {
    if (questions.length === 0) return 0;
    const maxOrder = Math.max(...questions.map((q) => Number(q.order ?? 0)));
    return Number.isFinite(maxOrder) ? maxOrder + 1 : 0;
  }, [questions]);

  const load = useCallback(async () => {
    const [questionnaireData, questionsData] = await Promise.all([
      getQuestionnaire(questionnaireId),
      listQuestions(questionnaireId),
    ]);
    setQuestionnaire(questionnaireData);
    setQuestions(questionsData);
    if (questionnaireData) {
      form.reset({
        title: questionnaireData.title,
        active: questionnaireData.active,
      });
    }
  }, [form, questionnaireId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    await updateQuestionnaire(questionnaireId, values);
    await load();
  };

  if (!questionnaire) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Editează chestionarul</h1>
          <p className="text-muted-foreground text-sm">Actualizează detaliile chestionarului și întrebările.</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelpDialog helpKey="questionnaires.edit" />
          <Button variant="outline" onClick={() => router.push("/dashboard/questionnaires")}>
            Înapoi la listă
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 rounded-md border p-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem data-tour="questionnaire-title-input">
                <FormLabel>Titlu</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                <FormLabel>Activ</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Se salvează..." : "Salvează chestionarul"}
          </Button>
        </form>
      </Form>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-xl">Întrebări</h2>
            <p className="text-muted-foreground text-sm">Întrebările sunt ordonate după câmpul „order”.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setIsEditorOpen(true);
            }}
          >
            Adaugă întrebare
          </Button>
        </div>

        <div className="rounded-md border" data-tour="questionnaire-questions-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordine</TableHead>
                <TableHead>Cheie</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Text întrebare</TableHead>
                <TableHead>Activ</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-sm">
                    Nu există întrebări încă.
                  </TableCell>
                </TableRow>
              ) : (
                questions.map((question) => (
                  <TableRow key={question.id}>
                    <TableCell>{question.order}</TableCell>
                    <TableCell>{question.key}</TableCell>
                    <TableCell>{formatQuestionType(question.type)}</TableCell>
                    <TableCell>{question.label}</TableCell>
                    <TableCell>{question.active ? "Da" : "Nu"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedId(question.id);
                          setIsEditorOpen(true);
                        }}
                      >
                        Editează
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open);
          if (!open) {
            setSelectedId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogTitle className="sr-only">{selectedQuestion ? "Editează întrebarea" : "Adaugă întrebare"}</DialogTitle>
          <QuestionEditor
            questionnaireId={questionnaireId}
            selected={selectedQuestion}
            defaultOrder={nextQuestionOrder}
            onSaved={async () => {
              await load();
              setSelectedId(null);
              setIsEditorOpen(false);
            }}
            onCancelEdit={() => {
              setSelectedId(null);
              setIsEditorOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
