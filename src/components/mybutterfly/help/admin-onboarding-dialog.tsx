"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { CircleHelp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const DISMISSED_KEY = "mb-admin-onboarding-dismissed-v1";

type Step = {
  title: string;
  description: string;
  links?: Array<{ label: string; href: string }>;
};

const STEPS: Step[] = [
  {
    title: "1) Vocabulary (dicționare)",
    description:
      "Aici definești listele de valori folosite în întrebări și reguli (ex: level/style/distance/priority/preferences). Setează și „Întrebare standard” pe categorii ca să se completeze automat textul întrebării în editor.",
    links: [{ label: "Deschide Vocabulary", href: "/dashboard/vocabulary" }],
  },
  {
    title: "2) Chestionar",
    description:
      "Creezi chestionarul și întrebările. Pentru selectări, folosește tipurile single_select / multi_select și setează key-urile (ex: level, style, distance, priority, preferences, budget). Întrebările condiționale (visibility rules) pot fi sărite; la completări/cereri vei vedea „Întrebări sărite” cu motivul.",
    links: [{ label: "Deschide Chestionare", href: "/dashboard/questionnaires" }],
  },
  {
    title: "3) Reguli recomandări (reutilizabile)",
    description:
      "Creezi reguli reutilizabile (o regulă = un scenariu) pe care le poți atribui rapid pe multe produse. Din pagina regulilor poți și „Leagă produse” ca să mergi direct în atribuirea pe listă.",
    links: [{ label: "Deschide Reguli recomandări", href: "/dashboard/recommendation-rules" }],
  },
  {
    title: "4) Produse (import + reguli)",
    description:
      "Adaugi produse manual sau import din PrestaShop, setezi preț/monedă, imagini și atribute (control/spin/viteză/greutate). Apoi imporți/atribui reguli (merge) în produs. La import PrestaShop, produsele deja importate sunt marcate și nu pot fi selectate; poți deschide direct produsul existent.",
    links: [
      { label: "Deschide Produse", href: "/dashboard/products" },
      { label: "Adaugă produs", href: "/dashboard/products/new" },
    ],
  },
  {
    title: "5) Setări recomandări",
    description:
      "Configurezi pragul minim de potrivire (%). Vor fi afișate toate produsele care au matchPercent peste prag (nu există limită „top 5”).",
    links: [{ label: "Deschide Setări", href: "/dashboard/settings" }],
  },
  {
    title: "6) Test recomandări (debug + istoric)",
    description:
      "Rulezi chestionarul ca să verifici recomandările, badge-ul de potrivire (%) și explicațiile. Dacă NEXT_PUBLIC_DEBUG este activ, ai un buton „Debug” care arată calculele (inputs, prag, breakdown pe produse și „scenariul ales”).",
    links: [{ label: "Deschide Test recomandări", href: "/dashboard/recommendations/test" }],
  },
  {
    title: "7) Completări & Cereri specialist",
    description:
      "În „Chestionare completate” vezi istoricul (răspunsuri, recomandări, match%) și secțiunea „Întrebări sărite”. În „Cereri” analizezi cazul și trimiți răspunsul (mesaj + produse recomandate), cu aceleași informații despre întrebări sărite.",
    links: [
      { label: "Deschide Completări", href: "/dashboard/questionnaire-completions" },
      { label: "Deschide Cereri", href: "/dashboard/requests" },
    ],
  },
];

export function AdminOnboardingDialog({
  triggerLabel = "Ghid",
  autoShow = true,
}: {
  triggerLabel?: string;
  autoShow?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const isDismissed = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    if (!autoShow) return;
    if (isDismissed) return;
    setOpen(true);
  }, [autoShow, isDismissed]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <CircleHelp className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Cum folosești Admin-ul (pas cu pas)</DialogTitle>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 pr-4">
          <div className="space-y-6">
            <div className="text-muted-foreground text-sm">
              Începe cu Vocabulary, apoi Chestionar, apoi Reguli, apoi Produse, și verifică în Test recomandări.
            </div>
            <Separator />
            {STEPS.map((step) => (
              <section key={step.title} className="space-y-2">
                <div className="font-semibold">{step.title}</div>
                <div className="text-muted-foreground text-sm">{step.description}</div>
                {step.links?.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {step.links.map((link) => (
                      <Button key={link.href} asChild size="sm" variant="secondary">
                        <Link prefetch={false} href={link.href}>
                          {link.label}
                          <ExternalLink className="ml-2 size-3.5" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Închide
          </Button>
          <Button type="button" onClick={dismiss}>
            Am înțeles (nu mai arăta)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
