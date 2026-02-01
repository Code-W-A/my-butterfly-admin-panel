"use client";

import * as React from "react";

import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir } | null;

export function toggleSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

export function SortableTableHead<K extends string>({
  sortKey,
  sort,
  onSortChange,
  className,
  children,
  disabled,
}: {
  sortKey: K;
  sort: SortState<K>;
  onSortChange: (next: SortState<K>) => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const isActive = sort?.key === sortKey;
  const dir = isActive ? sort?.dir : undefined;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <TableHead className={cn("select-none", className)}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 text-left",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:text-foreground",
        )}
        onClick={() => {
          if (disabled) return;
          onSortChange(toggleSort(sort, sortKey));
        }}
      >
        <span className="whitespace-nowrap">{children}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </TableHead>
  );
}

