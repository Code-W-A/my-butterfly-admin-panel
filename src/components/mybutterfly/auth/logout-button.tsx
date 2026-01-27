"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initFirebase } from "@/lib/firebase/client";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const { auth } = initFirebase();
      if (!auth) return;
      await signOut(auth);
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} disabled={isLoading}>
      <LogOut />
      <span className="ml-2">{isLoading ? "Se deconectează..." : "Deconectare"}</span>
    </Button>
  );
}
