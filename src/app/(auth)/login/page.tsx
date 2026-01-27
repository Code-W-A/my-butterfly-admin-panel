"use client";

import dynamic from "next/dynamic";

const LoginForm = dynamic(() => import("@/app/(main)/auth/_components/login-form").then((m) => m.LoginForm), {
  ssr: false,
});

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-semibold text-2xl">Autentificare admin</h1>
          <p className="text-muted-foreground text-sm">Intră cu datele contului de administrator.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
