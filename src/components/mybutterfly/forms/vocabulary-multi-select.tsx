"use client";

import { useEffect, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getFirebaseErrorInfo, logFirebaseError } from "@/lib/firebase/error-utils.client";
import { listVocabularyOptions } from "@/lib/firestore/vocabulary";

type VocabularyMultiSelectProps = {
  vocabKey: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
};

export function VocabularyMultiSelect({ vocabKey, value, onChange, disabled }: VocabularyMultiSelectProps) {
  const [items, setItems] = useState<{ value: string; label: string }[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const options = await listVocabularyOptions(vocabKey, { includeInactive: false });
        setItems(options.map((o) => ({ value: o.value, label: o.label })));
      } catch (err) {
        logFirebaseError("VocabularyMultiSelect: load", err);
        const info = getFirebaseErrorInfo(err);
        setError(info.message || "Nu pot încărca vocabulary.");
      }
    };
    load();
  }, [vocabKey]);

  const toggle = (optionValue: string) => {
    if (disabled) return;
    if (value.includes(optionValue)) onChange(value.filter((v) => v !== optionValue));
    else onChange([...value, optionValue]);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const normalized = search.trim().toLowerCase();
    return items.filter(
      (i) => i.label.toLowerCase().includes(normalized) || i.value.toLowerCase().includes(normalized),
    );
  }, [items, search]);

  if (error) return <div className="text-destructive text-xs">{error}</div>;
  if (items.length === 0)
    return <div className="text-muted-foreground text-xs">Nu există valori active în Vocabulary.</div>;

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
            const checkboxId = `vocab-${vocabKey}-${item.value}`;
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
