"use client";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { initFirebase, isFirebaseConfigured } from "@/lib/firebase/client";

const FormSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  remember: z.boolean().optional(),
});

export function LoginForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      if (!isFirebaseConfigured()) {
        toast.error("Firebase nu este configurat. Setează NEXT_PUBLIC_FIREBASE_* în .env.local și repornește.");
        return;
      }
      const { auth, db } = initFirebase();
      if (!auth || !db) return;
      const credentials = await signInWithEmailAndPassword(auth, data.email, data.password);
      const adminRef = doc(db, "admins", credentials.user.uid);
      const adminSnap = await getDoc(adminRef);
      const isActive = adminSnap.exists() && adminSnap.data()?.active === true;

      if (!isActive) {
        await signOut(auth);
        toast.error("Acces interzis. Contul tău nu este activ pentru admin.");
        return;
      }

      router.replace("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Autentificare eșuată. Încearcă din nou.";
      toast.error(message);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adresă de email</FormLabel>
              <FormControl>
                <Input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parolă</FormLabel>
              <FormControl>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center">
              <FormControl>
                <Checkbox
                  id="login-remember"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="size-4"
                />
              </FormControl>
              <FormLabel htmlFor="login-remember" className="ml-1 font-medium text-muted-foreground text-sm">
                Ține-mă minte 30 de zile
              </FormLabel>
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit">
          Autentificare
        </Button>
      </form>
    </Form>
  );
}
