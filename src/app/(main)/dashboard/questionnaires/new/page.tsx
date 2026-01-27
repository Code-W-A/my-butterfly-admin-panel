"use client";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createQuestionnaire } from "@/lib/firestore/questionnaires";

const FormSchema = z.object({
  title: z.string().min(2, "Title is required."),
  active: z.boolean(),
});

export default function NewQuestionnairePage() {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "",
      active: true,
    },
  });

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    const ref = await createQuestionnaire(values);
    router.push(`/dashboard/questionnaires/${ref.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Creează chestionar</h1>
          <p className="text-muted-foreground text-sm">Adaugă un chestionar nou și începe să adaugi întrebări.</p>
        </div>
        <PageHelpDialog helpKey="questionnaires.new" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
          <div className="flex items-center gap-2">
            <Button type="submit">Creează</Button>
            <Button type="button" variant="outline" onClick={() => router.push("/dashboard/questionnaires")}>
              Anulează
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
