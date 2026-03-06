"use client";

import { useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type OptionMultiSelectProps = {
  items: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
};

export function OptionMultiSelect({
  items,
  value,
  onChange,
  disabled,
  emptyMessage = "Nu există opțiuni disponibile.",
}: OptionMultiSelectProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const normalized = search.trim().toLowerCase();
    return items.filter(
      (item) => item.label.toLowerCase().includes(normalized) || item.value.toLowerCase().includes(normalized),
    );
  }, [items, search]);

  const toggle = (optionValue: string) => {
    if (disabled) return;
    if (value.includes(optionValue)) onChange(value.filter((item) => item !== optionValue));
    else onChange([...value, optionValue]);
  };

  if (items.length === 0) {
    return <div className="text-muted-foreground text-xs">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Caută"
        disabled={disabled}
      />
      <ScrollArea className="h-40 rounded-md border p-3">
        <div className="space-y-2">
          {filtered.map((item) => {
            const checkboxId = `option-${item.value}`;
            return (
              <div key={item.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={checkboxId}
                  checked={value.includes(item.value)}
                  onCheckedChange={() => toggle(item.value)}
                  disabled={disabled}
                />
                <label htmlFor={checkboxId} className="flex-1 cursor-pointer">
                  {item.label}
                </label>
                <span className="font-mono text-muted-foreground text-xs">{item.value}</span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
