"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Check, ChevronsUpDown, Loader2, Package, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebounce } from "@/hooks/use-debounce";
import { convertEurToRonWithVat, normalizePricingConfig, type PricingConfig } from "@/lib/pricing/prestashop-price";
import { cn } from "@/lib/utils";

export type PrestashopListItem = {
  id: string;
  name: string;
  reference?: string;
  price: number;
  priceEur?: number;
};

type PrestashopProductPickerProps = {
  onSelect: (product: PrestashopListItem) => void;
  selectedId?: string;
  placeholder?: string;
  inline?: boolean;
  query?: string;
  onQueryChange?: (value: string) => void;
  pricingConfig?: PricingConfig;
};

const DEFAULT_LIMIT = 20;

const resolveEurPrice = (item: PrestashopListItem) => {
  const next = item.priceEur ?? item.price;
  return Number.isFinite(next) ? Math.max(0, next) : 0;
};

export function PrestashopProductPicker({
  onSelect,
  selectedId,
  placeholder,
  inline = false,
  query: externalQuery,
  onQueryChange: externalOnQueryChange,
  pricingConfig,
}: PrestashopProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const query = externalQuery ?? internalQuery;
  const setQuery = externalOnQueryChange ?? setInternalQuery;
  const debouncedQuery = useDebounce(query, 250);
  const [items, setItems] = useState<PrestashopListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PrestashopListItem | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const normalizedPricing = useMemo(() => normalizePricingConfig(pricingConfig), [pricingConfig]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? selectedProduct,
    [items, selectedId, selectedProduct],
  );

  useEffect(() => {
    if (!open && !inline) return;
    const term = debouncedQuery.trim();
    if (term.length < 2) {
      abortRef.current?.abort();
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    setItems([]);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/prestashop/products/search?q=${encodeURIComponent(term)}&limit=${DEFAULT_LIMIT}`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error("PrestaShop request failed");
        }
        const data = (await response.json()) as { items?: PrestashopListItem[] };
        if (!controller.signal.aborted) {
          setItems(data.items ?? []);
        }
      } catch (_err) {
        if (controller.signal.aborted) return;
        setError("Nu am putut încărca produsele.");
        setItems([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [open, inline, debouncedQuery]);

  const content = (
    <Command>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder ?? "Caută produs..."} />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Se caută...
          </div>
        ) : null}
        {error && !isLoading ? <div className="px-4 py-2 text-destructive text-xs">{error}</div> : null}
        {!isLoading && !error && items.length === 0 && debouncedQuery.trim().length >= 2 ? (
          <div className="px-4 py-2 text-muted-foreground text-sm">Niciun rezultat</div>
        ) : null}
        <CommandGroup>
          {items.map((item) => {
            const eurPrice = resolveEurPrice(item);
            const ronPrice = convertEurToRonWithVat(
              eurPrice,
              normalizedPricing.exchangeRateEurRon,
              normalizedPricing.vatPercent,
            );
            return (
              <CommandItem
                key={item.id}
                value={`${item.name} ${item.reference ?? ""} ${item.id}`}
                onSelect={() => {
                  setSelectedProduct(item);
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 size-4", selectedId === item.id ? "opacity-100" : "opacity-0")} />
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{item.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {item.reference ? `${item.reference} • ` : ""}
                    {ronPrice} RON (din {eurPrice.toFixed(2)} EUR)
                  </span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  if (inline) {
    return (
      <div className="flex h-full flex-col">
        {!externalQuery && !externalOnQueryChange ? (
          <div className="relative mb-4">
            <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder ?? "Caută produs în PrestaShop"}
              className="h-11 pl-9"
            />
          </div>
        ) : null}

        <ScrollArea className="h-full flex-1">
          <div className="space-y-3 pr-4 pb-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-sm">Se caută produse...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Package className="size-12 text-muted-foreground/50" />
                <p className="text-destructive text-sm">{error}</p>
              </div>
            ) : items.length === 0 && debouncedQuery.trim().length >= 2 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Package className="size-12 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">Niciun rezultat găsit</p>
                <p className="text-muted-foreground text-xs">Încearcă un alt termen de căutare</p>
              </div>
            ) : debouncedQuery.trim().length < 2 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Search className="size-12 text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">Introdu minim 2 caractere pentru căutare</p>
              </div>
            ) : (
              items.map((item) => {
                const eurPrice = resolveEurPrice(item);
                const ronPrice = convertEurToRonWithVat(
                  eurPrice,
                  normalizedPricing.exchangeRateEurRon,
                  normalizedPricing.vatPercent,
                );
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "cursor-pointer border-2 p-4 transition-all hover:border-primary hover:shadow-md",
                      selectedId === item.id ? "border-primary bg-primary/5" : "border-border",
                    )}
                    onClick={() => {
                      setSelectedProduct(item);
                      onSelect(item);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start gap-2">
                          {selectedId === item.id ? (
                            <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                          ) : (
                            <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm leading-tight">{item.name}</h4>
                            {item.reference ? (
                              <p className="mt-1 text-muted-foreground text-xs">Ref: {item.reference}</p>
                            ) : null}
                            <p className="mt-1 text-muted-foreground text-xs">din {eurPrice.toFixed(2)} EUR</p>
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {ronPrice} RON
                      </Badge>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
          {selectedItem ? selectedItem.name : (placeholder ?? "Selectează produs din PrestaShop")}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        {content}
      </PopoverContent>
    </Popover>
  );
}
