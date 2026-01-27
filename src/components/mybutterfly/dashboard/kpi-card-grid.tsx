import type * as React from "react";

import { cn } from "@/lib/utils";

type KpiCardGridProps = React.ComponentProps<"div">;

/**
 * Wraps a KPI card section and applies a consistent "dashboard card" look
 * (gradient background + subtle shadow) to all children `Card` components via
 * `data-slot="card"`.
 *
 * Note: expects to be used under an `@container/main` parent for container-query
 * breakpoints like `@xl/main:*`.
 */
export function KpiCardGrid({ className, ...props }: KpiCardGridProps) {
  return (
    <div
      className={cn(
        "grid @5xl/main:grid-cols-4 @xl/main:grid-cols-2 grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card",
        className,
      )}
      {...props}
    />
  );
}
