"use client";

import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type ProductOption = {
  id: string;
  name: string;
  price: number;
  currency: string;
};

type ProductMultiSelectProps = {
  products: ProductOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
};

export function ProductMultiSelect({
  products,
  value,
  onChange,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: ProductMultiSelectProps) {
  const toggle = (productId: string) => {
    if (value.includes(productId)) {
      onChange(value.filter((id) => id !== productId));
    } else {
      onChange([...value, productId]);
    }
  };

  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const normalized = search.trim().toLowerCase();
    return products.filter((product) => product.name.toLowerCase().includes(normalized));
  }, [products, search]);

  if (products.length === 0) {
    return <div className="text-muted-foreground text-xs">Nu există produse active disponibile.</div>;
  }

  return (
    <div className="space-y-2">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută în pagina curentă" />
      <ScrollArea
        className="h-48 rounded-md border p-3"
        onScrollCapture={(event) => {
          const target = event.currentTarget;
          const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 24;
          if (nearBottom && hasMore && onLoadMore && !isLoadingMore) {
            onLoadMore();
          }
        }}
      >
        <div className="space-y-2">
          {filteredProducts.map((product) => {
            const checkboxId = `product-select-${product.id}`;
            return (
              <div key={product.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={checkboxId}
                  checked={value.includes(product.id)}
                  onCheckedChange={() => toggle(product.id)}
                />
                <label htmlFor={checkboxId} className="flex-1 cursor-pointer">
                  {product.name} — {product.price} {product.currency}
                </label>
              </div>
            );
          })}
          {hasMore ? (
            <div className="pt-2 text-center text-muted-foreground text-xs">
              {isLoadingMore ? "Se încarcă..." : "Derulează pentru mai multe produse"}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
