"use client";

import { useEffect, useState } from "react";

import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";

import { initFirebase } from "@/lib/firebase/client";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { auth } = initFirebase();
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { user, isLoading };
}
