"use client";

import { useState } from "react";

import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MultiValueInputProps = {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
};

export function MultiValueInput({ label, value, onChange, placeholder }: MultiValueInputProps) {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const next = draft.trim();
    if (!next || value.includes(next)) return;
    onChange([...value, next]);
    setDraft("");
  };

  const removeValue = (item: string) => {
    onChange(value.filter((entry) => entry !== item));
  };

  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{label}</div>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder ?? "Adaugă o valoare"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addValue}>
          Adaugă
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 ? (
          <span className="text-muted-foreground text-xs">Nu există valori adăugate.</span>
        ) : (
          value.map((item) => (
            <Badge key={item} variant="secondary" className="flex items-center gap-1">
              {item}
              <button type="button" onClick={() => removeValue(item)}>
                <X className="size-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}
