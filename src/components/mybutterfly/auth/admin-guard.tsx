"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { initFirebase, isFirebaseConfigured } from "@/lib/firebase/client";

type GuardStatus = "loading" | "allowed" | "denied";

export function AdminGuard({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<GuardStatus>("loading");
  const [_user, setUser] = useState<User | null>(null);
  const mountedRef = useRef(true);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!isConfigured) return;
    mountedRef.current = true;
    const { auth, db } = initFirebase();
    if (!auth || !db) return;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setStatus("loading");
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      try {
        const adminRef = doc(db, "admins", nextUser.uid);
        const adminSnap = await getDoc(adminRef);
        const isActive = adminSnap.exists() && adminSnap.data()?.active === true;
        if (!mountedRef.current) return;
        setStatus(isActive ? "allowed" : "denied");
      } catch {
        if (!mountedRef.current) return;
        setStatus("denied");
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [isConfigured, router]);

  if (!isConfigured) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Firebase nu este configurat</CardTitle>
            <CardDescription>
              Setează variabilele <code className="font-mono">NEXT_PUBLIC_FIREBASE_*</code> în{" "}
              <code className="font-mono">.env.local</code> și repornește serverul de dezvoltare.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link prefetch={false} href="/login">
                Mergi la autentificare
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-muted-foreground text-sm">Se verifică accesul…</div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acces interzis</CardTitle>
            <CardDescription>Contul tău nu are acces la panoul de administrare.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link prefetch={false} href="/unauthorized">
                Vezi detalii
              </Link>
            </Button>
            <Button asChild>
              <Link prefetch={false} href="/login">
                Schimbă contul
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
