export const DEFAULT_EUR_RON_EXCHANGE_RATE = 4.9;
export const DEFAULT_VAT_PERCENT = 21;

export type PricingConfig = {
  exchangeRateEurRon: number;
  vatPercent: number;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const sanitizeExchangeRate = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return DEFAULT_EUR_RON_EXCHANGE_RATE;
};

export const sanitizeVatPercent = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return clampPercent(value);
  return DEFAULT_VAT_PERCENT;
};

export const normalizePricingConfig = (value?: Partial<PricingConfig> | null): PricingConfig => ({
  exchangeRateEurRon: sanitizeExchangeRate(value?.exchangeRateEurRon),
  vatPercent: sanitizeVatPercent(value?.vatPercent),
});

export const roundHalfUpPositive = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const normalized = Number(value.toFixed(8));
  return Math.floor(normalized + 0.5);
};

export const convertEurToRonWithVat = (eurPrice: number, exchangeRateEurRon: number, vatPercent: number): number => {
  const normalizedEur = Number.isFinite(eurPrice) ? Math.max(0, eurPrice) : 0;
  const normalizedRate = sanitizeExchangeRate(exchangeRateEurRon);
  const normalizedVat = sanitizeVatPercent(vatPercent);
  const grossRon = normalizedEur * normalizedRate * (1 + normalizedVat / 100);
  return roundHalfUpPositive(grossRon);
};
