"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 text-center">
      <h1 className="font-semibold text-2xl">Pagina nu a fost găsită.</h1>
      <p className="text-muted-foreground">Pagina pe care o cauți nu există sau a fost mutată.</p>
      <Link prefetch={false} replace href="/dashboard">
        <Button variant="outline">Înapoi la panou</Button>
      </Link>
    </div>
  );
}
