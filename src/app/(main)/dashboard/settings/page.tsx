"use client";

import { useEffect, useState } from "react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { getRecommendationSettings, updateRecommendationSettings } from "@/lib/firestore/settings";

const DEFAULT_MIN_MATCH = 65;

export default function SettingsPage() {
  const [minMatchPercent, setMinMatchPercent] = useState<number>(DEFAULT_MIN_MATCH);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const settings = await getRecommendationSettings();
        if (settings?.minMatchPercent !== undefined) {
          setMinMatchPercent(settings.minMatchPercent);
        }
        setIsLoading(false);
      } catch (err) {
        logFirebaseError("Settings: loadRecommendation", err);
        const info = getFirebaseErrorInfo(err);
        setError(info.message || "Nu pot încărca setările.");
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsSaving(true);
      await updateRecommendationSettings({ minMatchPercent });
      setSuccess("Setările au fost salvate.");
    } catch (err) {
      logFirebaseError("Settings: saveRecommendation", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Salvarea a eșuat.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Setări</h1>
          <p className="text-muted-foreground text-sm">Configurează comportamentul recomandărilor.</p>
        </div>
        <PageHelpDialog helpKey="settings" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recomandări</CardTitle>
          <CardDescription>Pragul minim de potrivire pentru afișarea produselor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-destructive text-sm">{error}</div> : null}
          {success ? <div className="text-emerald-600 text-sm">{success}</div> : null}
          <div className="space-y-2">
            <Label htmlFor="min-match">Potrivire minimă (%)</Label>
            <Input
              id="min-match"
              type="number"
              min={0}
              max={100}
              value={minMatchPercent}
              disabled={isLoading}
              onChange={(event) => setMinMatchPercent(Number(event.target.value || 0))}
            />
          </div>
          <Button type="button" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Se salvează..." : "Salvează"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
