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

type MetricKey = "total" | "new" | "in_progress" | "sent";

type RequestsChartPoint = {
  date: string; // YYYY-MM-DD (UTC)
  total: number;
  new: number;
  in_progress: number;
  sent: number;
};

const chartConfig = {
  total: { label: "Total", color: "var(--chart-1)" },
  new: { label: "Noi", color: "var(--chart-2)" },
  in_progress: { label: "În lucru", color: "var(--chart-3)" },
  sent: { label: "Trimise", color: "var(--chart-4)" },
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
  const [metric, setMetric] = React.useState<MetricKey>("total");
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

        const counts = new Map<string, { total: number; new: number; in_progress: number; sent: number }>();
        for (const r of requests) {
          const createdAt = r.createdAt?.toDate?.();
          if (!createdAt) continue;
          const key = dateKeyUTC(createdAt);
          const prev = counts.get(key) ?? { total: 0, new: 0, in_progress: 0, sent: 0 };
          prev.total += 1;
          if (r.status === "new") prev.new += 1;
          if (r.status === "in_progress") prev.in_progress += 1;
          if (r.status === "sent") prev.sent += 1;
          counts.set(key, prev);
        }

        const points: RequestsChartPoint[] = [];
        for (let day = start; day.getTime() <= end.getTime(); day = addDaysUTC(day, 1)) {
          const key = dateKeyUTC(day);
          points.push({ date: key, ...(counts.get(key) ?? { total: 0, new: 0, in_progress: 0, sent: 0 }) });
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

  // Defensive normalization: keep Recharts input stable even if runtime data is unexpectedly malformed.
  const chartData = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const total = React.useMemo(() => chartData.reduce((sum, p) => sum + p[metric], 0), [chartData, metric]);
  const defaultTooltipIndex = chartData.length ? Math.min(10, chartData.length - 1) : undefined;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Cereri către specialist</CardTitle>
        <CardDescription>
          {error ? <span className="text-destructive">Eroare: {error}</span> : null}
          {!error ? (
            <>
              <span className="@[540px]/card:block hidden">
                {chartConfig[metric].label} {total.toLocaleString("ro-RO")} în perioada selectată
              </span>
              <span className="@[540px]/card:hidden">
                {chartConfig[metric].label} {total.toLocaleString("ro-RO")}
              </span>
            </>
          ) : null}
        </CardDescription>
        <CardAction>
          <Select value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <SelectTrigger
              className="w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
              aria-label="Selectează metrica"
            >
              <SelectValue placeholder="Metrică" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="total" className="rounded-lg">
                Total
              </SelectItem>
              <SelectItem value="new" className="rounded-lg">
                Noi
              </SelectItem>
              <SelectItem value="in_progress" className="rounded-lg">
                În lucru
              </SelectItem>
              <SelectItem value="sent" className="rounded-lg">
                Trimise
              </SelectItem>
            </SelectContent>
          </Select>
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
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fill-total" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fill-new" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-new)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-new)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fill-in_progress" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-in_progress)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-in_progress)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fill-sent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sent)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-sent)" stopOpacity={0.1} />
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
              dataKey={metric}
              type="monotone"
              fill={`url(#fill-${metric})`}
              stroke={`var(--color-${metric})`}
              isAnimationActive={!isLoading}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
