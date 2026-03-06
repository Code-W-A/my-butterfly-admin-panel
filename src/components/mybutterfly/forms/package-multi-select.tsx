"use client";

import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type PackageOption = {
  id: string;
  title: string;
  totalPrice: number;
  currency: string;
  mode: "single" | "triple" | "custom";
};

type PackageMultiSelectProps = {
  packages: PackageOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
};

export function PackageMultiSelect({
  packages,
  value,
  onChange,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: PackageMultiSelectProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return packages;
    const normalized = search.trim().toLowerCase();
    return packages.filter((item) => item.title.toLowerCase().includes(normalized));
  }, [packages, search]);

  const toggle = (packageId: string) => {
    if (value.includes(packageId)) {
      onChange(value.filter((id) => id !== packageId));
    } else {
      onChange([...value, packageId]);
    }
  };

  if (packages.length === 0) {
    return <div className="text-muted-foreground text-xs">Nu există pachete disponibile.</div>;
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
          {filtered.map((item) => {
            const checkboxId = `package-select-${item.id}`;
            return (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <Checkbox id={checkboxId} checked={value.includes(item.id)} onCheckedChange={() => toggle(item.id)} />
                <label htmlFor={checkboxId} className="flex-1 cursor-pointer">
                  {item.title} — {item.totalPrice} {item.currency} (
                  {item.mode === "single" ? "single" : item.mode === "triple" ? "triple" : "custom"})
                </label>
              </div>
            );
          })}
          {hasMore ? (
            <div className="pt-2 text-center text-muted-foreground text-xs">
              {isLoadingMore ? "Se încarcă..." : "Derulează pentru mai multe pachete"}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
