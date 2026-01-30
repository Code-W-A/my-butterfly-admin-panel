"use client";

import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type InfoTipProps = {
  text: string;
  ariaLabel?: string;
};

export function InfoTip({ text, ariaLabel = "Info" }: InfoTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="inline-flex items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Info className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[320px] text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
