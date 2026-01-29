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
      "Aici definești listele de valori folosite în întrebări și reguli (ex: level/style/distance/priority/preferences). Activează/ordonează valorile ca să apară corect în chestionar.",
    links: [{ label: "Deschide Vocabulary", href: "/dashboard/vocabulary" }],
  },
  {
    title: "2) Chestionar",
    description:
      "Creezi chestionarul și întrebările. Pentru selectări, folosește tipurile single_select / multi_select și setează key-urile (ex: level, style, distance, priority, preferences, budget).",
    links: [{ label: "Deschide Chestionare", href: "/dashboard/questionnaires" }],
  },
  {
    title: "3) Produse",
    description:
      "Adaugi produse manual sau import din PrestaShop, setezi preț/monedă, imagini și atribute (control/spin/viteză/greutate).",
    links: [
      { label: "Deschide Produse", href: "/dashboard/products" },
      { label: "Adaugă produs", href: "/dashboard/products/new" },
    ],
  },
  {
    title: "4) Reguli recomandare (pe produs)",
    description:
      "În fiecare produs adaugi reguli cu condiții (nivel/stil/distanță/prioritate/buget) + order + activ. Aceste reguli determină dacă produsul apare în rezultate și cu ce prioritate.",
    links: [{ label: "Editează un produs (din listă)", href: "/dashboard/products" }],
  },
  {
    title: "5) Test recomandări",
    description:
      "Rulezi chestionarul ca să verifici rapid dacă regulile dau 1–5 rezultate și dacă explicațiile sunt OK. Poți vedea imagini + link către magazin (PrestaShop) acolo unde există.",
    links: [{ label: "Deschide Test recomandări", href: "/dashboard/recommendations/test" }],
  },
  {
    title: "6) Cereri specialist (opțional)",
    description:
      "Vezi cererile, schimbi statusul (nou / în lucru / trimis) și trimiți răspunsul: mesaj + 1–3 produse recomandate.",
    links: [{ label: "Deschide Cereri", href: "/dashboard/requests" }],
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
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cum folosești Admin-ul (pas cu pas)</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            <div className="text-muted-foreground text-sm">
              Începe cu Vocabulary, apoi Chestionar, apoi Produse + Reguli, și verifică în Test recomandări.
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
        <DialogFooter className="gap-2 sm:gap-0">
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
