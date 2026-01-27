"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PrestashopListItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  imageUrl?: string;
  imageId?: number;
  productUrl?: string;
};

type PrestashopProductPickerProps = {
  onSelect: (product: PrestashopListItem) => void;
  selectedId?: string;
  placeholder?: string;
  inline?: boolean;
};

type CacheEntry = {
  items: PrestashopListItem[];
  page: number;
  hasMore: boolean;
};

const DEFAULT_LIMIT = 20;

export function PrestashopProductPicker({
  onSelect,
  selectedId,
  placeholder,
  inline = false,
}: PrestashopProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PrestashopListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);

  const load = useCallback(async (nextQuery: string, nextPage = 1, append = false) => {
    const cacheKey = `${nextQuery}::${nextPage}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setItems((prev) => (append ? [...prev, ...cached.items] : cached.items));
      setHasMore(cached.hasMore);
      setPage(cached.page);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      params.set("page", String(nextPage));
      params.set("limit", String(DEFAULT_LIMIT));
      const response = await fetch(`/api/prestashop/products?${params.toString()}`);
      const data = (await response.json()) as {
        items?: PrestashopListItem[];
        hasMore?: boolean;
        page?: number;
      };
      const list = data.items ?? [];
      cacheRef.current.set(cacheKey, { items: list, hasMore: Boolean(data.hasMore), page: nextPage });
      setItems((prev) => (append ? [...prev, ...list] : list));
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open && !inline) return;
    const handle = setTimeout(() => {
      load(query, 1, false).catch(() => undefined);
    }, 300);
    return () => clearTimeout(handle);
  }, [open, query, inline, load]);

  const loadMore = async () => {
    if (isLoading || !hasMore) return;
    const nextPage = page + 1;
    await load(query, nextPage, true);
  };

  const content = (
    <Command>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder ?? "Caută produs..."} />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Se încarcă produse...
          </div>
        ) : null}
        <CommandEmpty>{isLoading ? "Se încarcă..." : "Nu am găsit produse."}</CommandEmpty>
        <CommandGroup>
          {items.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.name} ${item.id}`}
              onSelect={() => {
                onSelect(item);
                setOpen(false);
              }}
            >
              <Check className={cn("mr-2 size-4", selectedId === item.id ? "opacity-100" : "opacity-0")} />
              <div className="flex flex-col">
                <span className="font-medium text-sm">{item.name}</span>
                <span className="text-muted-foreground text-xs">
                  {item.price} {item.active ? "• activ" : "• inactiv"}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
        {hasMore ? (
          <div className="p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={loadMore}
              disabled={isLoading}
            >
              {isLoading ? "Se încarcă..." : "Încarcă mai multe"}
            </Button>
          </div>
        ) : null}
      </CommandList>
    </Command>
  );

  if (inline) {
    return <div className="rounded-md border">{content}</div>;
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
