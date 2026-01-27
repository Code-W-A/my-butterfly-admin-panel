"use client";

import * as React from "react";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { getFirebaseErrorInfo } from "@/lib/firebase/error-utils.client";
import { listSpecialistRequestsInRange } from "@/lib/firestore/requests";

type TimeRange = "7d" | "30d" | "90d";

type RequestsChartPoint = {
  date: string; // YYYY-MM-DD (UTC)
  requests: number;
};

const chartConfig = {
  requests: {
    label: "Cereri",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function startOfDayUTC(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKeyUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getRangeStart(endDayUTC: Date, timeRange: TimeRange) {
  const days = timeRange === "30d" ? 30 : timeRange === "7d" ? 7 : 90;
  // inclusive range: endDayUTC minus (days-1)
  return addDaysUTC(endDayUTC, -(days - 1));
}

export function RequestsActivityCard() {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState<TimeRange>("90d");
  const [data, setData] = React.useState<RequestsChartPoint[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isMobile) setTimeRange("7d");
  }, [isMobile]);

  React.useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        setIsLoading(true);

        const end = startOfDayUTC(new Date());
        const start = getRangeStart(end, timeRange);
        const untilExclusive = addDaysUTC(end, 1);

        // Firestore read: requests in range, aggregate on client.
        const requests = await listSpecialistRequestsInRange({
          since: start,
          untilExclusive,
          order: "asc",
          max: 2000,
        });

        const counts = new Map<string, number>();
        for (const r of requests) {
          const createdAt = r.createdAt?.toDate?.();
          if (!createdAt) continue;
          const key = dateKeyUTC(createdAt);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        const points: RequestsChartPoint[] = [];
        for (let day = start; day.getTime() <= end.getTime(); day = addDaysUTC(day, 1)) {
          const key = dateKeyUTC(day);
          points.push({ date: key, requests: counts.get(key) ?? 0 });
        }

        setData(points);
        setIsLoading(false);
      } catch (err) {
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setData([]);
        setIsLoading(false);
      }
    };

    load();
  }, [timeRange]);

  const total = React.useMemo(() => data.reduce((sum, p) => sum + p.requests, 0), [data]);
  const defaultTooltipIndex = data.length ? Math.min(10, data.length - 1) : undefined;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Cereri către specialist</CardTitle>
        <CardDescription>
          {error ? <span className="text-destructive">Eroare: {error}</span> : null}
          {!error ? (
            <>
              <span className="@[540px]/card:block hidden">
                Total {total.toLocaleString("ro-RO")} în perioada selectată
              </span>
              <span className="@[540px]/card:hidden">Total {total.toLocaleString("ro-RO")}</span>
            </>
          ) : null}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => {
              if (value) setTimeRange(value as TimeRange);
            }}
            variant="outline"
            className="@[767px]/card:flex hidden *:data-[slot=toggle-group-item]:px-4!"
          >
            <ToggleGroupItem value="90d">90 zile</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 zile</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 zile</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger
              className="flex @[767px]/card:hidden w-36 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
              aria-label="Selectează perioada"
            >
              <SelectValue placeholder="Perioadă" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                90 zile
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                30 zile
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                7 zile
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-62 w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("ro-RO", { month: "short", day: "numeric" });
              }}
            />
            <ChartTooltip
              cursor={false}
              defaultIndex={isMobile ? undefined : defaultTooltipIndex}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("ro-RO", { month: "short", day: "numeric" });
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="requests"
              type="monotone"
              fill="url(#fillRequests)"
              stroke="var(--color-requests)"
              isAnimationActive={!isLoading}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
