"use client";

import * as React from "react";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { getFirebaseErrorInfo } from "@/lib/firebase/error-utils.client";
import { listQuestionnaireAnalyticsDailyInRange } from "@/lib/firestore/analytics";
import { listQuestionnaires } from "@/lib/firestore/questionnaires";
import type { Questionnaire, QuestionnaireAnalyticsDaily, WithId } from "@/lib/firestore/types";

type TimeRange = "7d" | "30d" | "90d";

type Point = {
  date: string; // YYYY-MM-DD (UTC)
  starts: number;
  completes: number;
};

type DistributionKey = "level" | "style" | "distance" | "priority" | "preferences" | "budget";

const chartConfig = {
  starts: { label: "Starts", color: "var(--chart-1)" },
  completes: { label: "Completări", color: "var(--chart-2)" },
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
  return addDaysUTC(endDayUTC, -(days - 1));
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

function parseBucketStart(label: string) {
  const match = label.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.NaN;
}

function formatBudgetBucket(label: string) {
  const start = parseBucketStart(label);
  if (!Number.isFinite(start)) return label;
  const end = start + 100;
  return `${start}–${end}`;
}

function mergeCounters(target: Record<string, number>, source: Record<string, number> | undefined) {
  if (!source) return;
  Object.entries(source).forEach(([key, count]) => {
    if (!Number.isFinite(count)) return;
    target[key] = (target[key] ?? 0) + Number(count);
  });
}

function getAnswerCounters(
  answers: QuestionnaireAnalyticsDaily["answers"] | undefined,
  key: DistributionKey,
): Record<string, number> {
  if (!answers) return {};
  if (key === "budget") return answers.budgetBuckets ?? {};
  if (key === "level") return answers.level ?? {};
  if (key === "style") return answers.style ?? {};
  if (key === "distance") return answers.distance ?? {};
  if (key === "priority") return answers.priority ?? {};
  return answers.preferences ?? {};
}

export function QuestionnaireAnalyticsCard() {
  const isMobile = useIsMobile();

  const [timeRange, setTimeRange] = React.useState<TimeRange>("30d");
  const [questionnaires, setQuestionnaires] = React.useState<WithId<Questionnaire>[]>([]);
  const [questionnaireId, setQuestionnaireId] = React.useState<string>("");

  const [points, setPoints] = React.useState<Point[]>([]);
  const [distributions, setDistributions] = React.useState<Record<DistributionKey, Record<string, number>>>({
    level: {},
    style: {},
    distance: {},
    priority: {},
    preferences: {},
    budget: {},
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<DistributionKey>("level");

  React.useEffect(() => {
    if (isMobile) setTimeRange("7d");
  }, [isMobile]);

  React.useEffect(() => {
    const loadQuestionnaires = async () => {
      try {
        const list = await listQuestionnaires();
        const active = list.filter((q) => q.active);
        setQuestionnaires(active);
        setQuestionnaireId((prev) => (active.some((q) => q.id === prev) ? prev : (active[0]?.id ?? "")));
      } catch (err) {
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setQuestionnaires([]);
        setQuestionnaireId("");
      }
    };
    void loadQuestionnaires();
  }, []);

  React.useEffect(() => {
    const load = async () => {
      if (!questionnaireId) {
        setPoints([]);
        setDistributions({ level: {}, style: {}, distance: {}, priority: {}, preferences: {}, budget: {} });
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        setIsLoading(true);

        const end = startOfDayUTC(new Date());
        const start = getRangeStart(end, timeRange);
        const untilExclusive = addDaysUTC(end, 1);

        const docs = await listQuestionnaireAnalyticsDailyInRange({
          questionnaireId,
          since: start,
          untilExclusive,
          order: "asc",
          max: 5000,
        });

        const byDay = new Map<string, { starts: number; completes: number }>();
        const dist: Record<DistributionKey, Record<string, number>> = {
          level: {},
          style: {},
          distance: {},
          priority: {},
          preferences: {},
          budget: {},
        };

        docs.forEach((d) => {
          const day = d.day?.toDate?.();
          if (!day) return;
          const key = dateKeyUTC(day);
          const prev = byDay.get(key) ?? { starts: 0, completes: 0 };
          prev.starts += Number(d.starts ?? 0);
          prev.completes += Number(d.completes ?? 0);
          byDay.set(key, prev);

          mergeCounters(dist.level, getAnswerCounters(d.answers, "level"));
          mergeCounters(dist.style, getAnswerCounters(d.answers, "style"));
          mergeCounters(dist.distance, getAnswerCounters(d.answers, "distance"));
          mergeCounters(dist.priority, getAnswerCounters(d.answers, "priority"));
          mergeCounters(dist.preferences, getAnswerCounters(d.answers, "preferences"));
          mergeCounters(dist.budget, getAnswerCounters(d.answers, "budget"));
        });

        const nextPoints: Point[] = [];
        for (let day = start; day.getTime() <= end.getTime(); day = addDaysUTC(day, 1)) {
          const key = dateKeyUTC(day);
          const totals = byDay.get(key) ?? { starts: 0, completes: 0 };
          nextPoints.push({ date: key, starts: totals.starts, completes: totals.completes });
        }

        setPoints(nextPoints);
        setDistributions(dist);
        setIsLoading(false);
      } catch (err) {
        const info = getFirebaseErrorInfo(err);
        setError(`${info.code ? `Cod: ${info.code}. ` : ""}${info.message}`);
        setPoints([]);
        setDistributions({ level: {}, style: {}, distance: {}, priority: {}, preferences: {}, budget: {} });
        setIsLoading(false);
      }
    };

    void load();
  }, [questionnaireId, timeRange]);

  const totals = React.useMemo(() => {
    const starts = points.reduce((sum, p) => sum + p.starts, 0);
    const completes = points.reduce((sum, p) => sum + p.completes, 0);
    const conversion = starts ? completes / starts : 0;
    return { starts, completes, conversion };
  }, [points]);

  const distributionRows = React.useMemo(() => {
    const counters = distributions[activeTab] ?? {};
    const entries = Object.entries(counters).filter(([, v]) => Number.isFinite(v) && v > 0);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    const sorted = entries.sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (activeTab === "budget") {
      return sorted
        .sort((a, b) => (parseBucketStart(a[0]) || 0) - (parseBucketStart(b[0]) || 0))
        .map(([label, count]) => ({ label: formatBudgetBucket(label), count, share: total ? count / total : 0 }));
    }

    return sorted.map(([label, count]) => ({ label, count, share: total ? count / total : 0 }));
  }, [activeTab, distributions]);

  const selectedTitle =
    questionnaires.find((q) => q.id === questionnaireId)?.title ?? (questionnaireId ? "Chestionar" : "—");

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Analytics chestionare</CardTitle>
        <CardDescription>
          {error ? <span className="text-destructive">Eroare: {error}</span> : null}
          {!error ? (
            <>
              <span className="@[540px]/card:block hidden">
                {selectedTitle}: {totals.starts.toLocaleString("ro-RO")} starts •{" "}
                {totals.completes.toLocaleString("ro-RO")} completări • {percent(totals.conversion)} rata de completare
              </span>
              <span className="@[540px]/card:hidden">{percent(totals.conversion)} completare</span>
            </>
          ) : null}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Select value={questionnaireId} onValueChange={setQuestionnaireId}>
            <SelectTrigger
              className="w-64 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
              aria-label="Selectează chestionarul"
            >
              <SelectValue placeholder="Chestionar" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {questionnaires.map((q) => (
                <SelectItem key={q.id} value={q.id} className="rounded-lg">
                  {q.title}
                </SelectItem>
              ))}
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
      <CardContent className="space-y-4 px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-62 w-full">
          <AreaChart data={points}>
            <defs>
              <linearGradient id="fill-starts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-starts)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-starts)" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="fill-completes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-completes)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-completes)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => new Date(value).toLocaleDateString("ro-RO", { month: "short", day: "numeric" })}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("ro-RO", { month: "short", day: "numeric" })
                  }
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="starts"
              type="monotone"
              fill="url(#fill-starts)"
              stroke="var(--color-starts)"
              isAnimationActive={!isLoading}
            />
            <Area
              dataKey="completes"
              type="monotone"
              fill="url(#fill-completes)"
              stroke="var(--color-completes)"
              isAnimationActive={!isLoading}
            />
          </AreaChart>
        </ChartContainer>

        <Separator />

        <div className="space-y-3">
          <div className="font-semibold text-sm">Distribuția răspunsurilor (top)</div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DistributionKey)}>
            <TabsList className="flex flex-wrap justify-start">
              <TabsTrigger value="level">Nivel</TabsTrigger>
              <TabsTrigger value="style">Stil</TabsTrigger>
              <TabsTrigger value="distance">Distanță</TabsTrigger>
              <TabsTrigger value="priority">Prioritate</TabsTrigger>
              <TabsTrigger value="preferences">Preferințe</TabsTrigger>
              <TabsTrigger value="budget">Buget</TabsTrigger>
            </TabsList>
            {(["level", "style", "distance", "priority", "preferences", "budget"] as DistributionKey[]).map((key) => (
              <TabsContent key={key} value={key} className="mt-3">
                {distributionRows.length === 0 ? (
                  <div className="text-muted-foreground text-sm">Nu există date în perioada selectată.</div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {distributionRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-sm">{row.label}</div>
                          <div className="text-muted-foreground text-xs">{percent(row.share)}</div>
                        </div>
                        <div className="font-semibold tabular-nums">{row.count.toLocaleString("ro-RO")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
