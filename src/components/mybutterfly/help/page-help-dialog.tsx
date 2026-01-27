"use client";

import { CircleHelp } from "lucide-react";

import { HELP_CONTENT, type HelpKey } from "@/components/mybutterfly/help/help-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type PageHelpDialogProps = {
  helpKey: HelpKey;
  triggerLabel?: string;
};

export function PageHelpDialog({ helpKey, triggerLabel = "Ajutor" }: PageHelpDialogProps) {
  const content = HELP_CONTENT[helpKey];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <CircleHelp className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {content.sections.map((section) => (
              <section key={section.title} className="space-y-2">
                <div className="font-semibold">{section.title}</div>
                {section.paragraphs?.length ? (
                  <div className="space-y-2 text-muted-foreground text-sm">
                    {section.paragraphs.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                ) : null}
                {section.bullets?.length ? (
                  <ul className="list-disc pl-5 text-sm">
                    {section.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                ) : null}
                {section.notes?.length ? (
                  <div className="space-y-2">
                    <Separator />
                    <div className="text-sm">
                      <div className="font-medium">Note</div>
                      <ul className="list-disc pl-5 text-muted-foreground text-sm">
                        {section.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
