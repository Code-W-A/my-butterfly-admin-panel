"use client";

import { useEffect, useState } from "react";

import { PageHelpDialog } from "@/components/mybutterfly/help/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { recalculatePrestashopRonPrices } from "@/lib/firestore/products";
import { getRecommendationSettings, updateRecommendationSettings } from "@/lib/firestore/settings";
import { sanitizeExchangeRate, sanitizeVatPercent } from "@/lib/pricing/prestashop-price";

const DEFAULT_MIN_MATCH = 65;

type RecalculationSummary = {
  scanned: number;
  updated: number;
  ignored: number;
  ignoredMissingEurPrice: number;
  ignoredUnchangedPrice: number;
  ignoredInvalidComputedPrice: number;
  failed: number;
};

export default function SettingsPage() {
  const [minMatchPercent, setMinMatchPercent] = useState<number>(DEFAULT_MIN_MATCH);
  const [exchangeRateEurRon, setExchangeRateEurRon] = useState<number>(4.9);
  const [vatPercent, setVatPercent] = useState<number>(21);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [recalculationSummary, setRecalculationSummary] = useState<RecalculationSummary | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);
        const settings = await getRecommendationSettings();
        setMinMatchPercent(settings.minMatchPercent);
        setExchangeRateEurRon(settings.exchangeRateEurRon);
        setVatPercent(settings.vatPercent);
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

  const validatePricingValues = () => {
    const normalizedRate = sanitizeExchangeRate(exchangeRateEurRon);
    const normalizedVat = sanitizeVatPercent(vatPercent);
    if (normalizedRate !== exchangeRateEurRon) {
      setError("Cursul EUR -> RON trebuie să fie un număr mai mare ca 0.");
      return null;
    }
    if (normalizedVat !== vatPercent) {
      setError("TVA trebuie să fie între 0 și 100.");
      return null;
    }
    return { normalizedRate, normalizedVat };
  };

  const handleSave = async () => {
    try {
      setError(null);
      setSuccess(null);
      const values = validatePricingValues();
      if (!values) return;
      setIsSaving(true);
      await updateRecommendationSettings({
        minMatchPercent,
        exchangeRateEurRon: values.normalizedRate,
        vatPercent: values.normalizedVat,
      });
      setSuccess("Setările au fost salvate.");
    } catch (err) {
      logFirebaseError("Settings: saveRecommendation", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Salvarea a eșuat.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!window.confirm("Recalculezi prețurile pentru produsele PrestaShop cu moneda RON. Continui?")) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      const values = validatePricingValues();
      if (!values) return;
      setIsRecalculating(true);
      const summary = await recalculatePrestashopRonPrices({
        exchangeRateEurRon: values.normalizedRate,
        vatPercent: values.normalizedVat,
      });
      setRecalculationSummary(summary);
      setSuccess("Recalcularea prețurilor s-a încheiat.");
    } catch (err) {
      logFirebaseError("Settings: recalculatePrestashopRonPrices", err);
      const info = getFirebaseErrorInfo(err);
      setError(info.message || "Recalcularea a eșuat.");
    } finally {
      setIsRecalculating(false);
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
          <CardTitle>Recomandări și pricing PrestaShop</CardTitle>
          <CardDescription>
            Pragul minim de potrivire și formula de conversie pentru EUR -&gt; RON (cu TVA și rotunjire half-up).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-destructive text-sm">{error}</div> : null}
          {success ? <div className="text-emerald-600 text-sm">{success}</div> : null}
          <div className="grid gap-4 md:grid-cols-3">
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
            <div className="space-y-2">
              <Label htmlFor="exchange-rate">Curs EUR -&gt; RON</Label>
              <Input
                id="exchange-rate"
                type="number"
                min={0.0001}
                step={0.0001}
                value={exchangeRateEurRon}
                disabled={isLoading}
                onChange={(event) => setExchangeRateEurRon(Number(event.target.value || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat-percent">TVA (%)</Label>
              <Input
                id="vat-percent"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={vatPercent}
                disabled={isLoading}
                onChange={(event) => setVatPercent(Number(event.target.value || 0))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleSave} disabled={isSaving || isLoading || isRecalculating}>
              {isSaving ? "Se salvează..." : "Salvează"}
            </Button>
            {/* 
            RAMANE COMENTAT SI SCOATEM LA NEVOIE
            <Button
              type="button"
              variant="outline"
              onClick={handleRecalculate}
              disabled={isRecalculating || isLoading || isSaving}
            >
              {isRecalculating ? "Se recalculează..." : "Recalculează prețuri PrestaShop (RON)"}
            </Button> */}
          </div>

          {recalculationSummary ? (
            <div className="rounded-md border bg-muted p-3 text-sm">
              <div className="font-medium">Rezultat recalculare</div>
              <div className="text-muted-foreground text-xs">
                Scanate: {recalculationSummary.scanned} • Actualizate: {recalculationSummary.updated} • Ignorate:{" "}
                {recalculationSummary.ignored} • Eșuate: {recalculationSummary.failed}
              </div>
              <div className="text-muted-foreground text-xs">
                Ignorate fără bază EUR: {recalculationSummary.ignoredMissingEurPrice} • Ignorate neschimbate:{" "}
                {recalculationSummary.ignoredUnchangedPrice} • Ignorate calcul invalid:{" "}
                {recalculationSummary.ignoredInvalidComputedPrice}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
