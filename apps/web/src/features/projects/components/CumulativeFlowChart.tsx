import { getErrorMessage } from "../../../core/utils/errorHandler";
import { formatNumber, useTranslation, useLocale } from "../../../i18n/locale";
import { getWorkflowAppearance } from "../../../core/config/designTokens";
import { formatDisplayDate } from "../../../utils/date";
import { CustomDatePicker } from "../../../components/CustomDatePicker";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import { getProjectCfd } from "../api/analyticsApi";
import type { CfdData, CfdStatus } from "../types/analytics";

interface CumulativeFlowChartProps {
  projectId: string;
  boardId?: string;
  startDate?: string;
  endDate?: string;
  tz?: string;
  /** If true, shows the header and date-range controls */
  showControls?: boolean;
}

export default function CumulativeFlowChart({
  projectId,
  boardId,
  startDate: initialStart,
  endDate: initialEnd,
  tz,
  showControls = true,
}: CumulativeFlowChartProps) {
  const t = useTranslation();
  const [data, setData] = useState<CfdData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local range state (only used when showControls=true)
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);

  const [start, setStart] = useState(initialStart ?? thirtyDaysAgo);
  const [end, setEnd] = useState(initialEnd ?? today);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getProjectCfd(projectId, {
      board_id: boardId,
      start_date: start,
      end_date: end,
      tz: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
      .then((result) => { if (active) setData(result); })
      .catch((requestError: unknown) => { if (active) setError(getErrorMessage(requestError, "Error loading CFD data")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, boardId, start, end, tz, t]);

  // Build recharts-compatible data: [{date, <code>: count, ...}]
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.data.map((day) => ({
      date: day.date,
      ...day.counts,
    }));
  }, [data]);

  const colorFor = (index: number) =>
    getWorkflowAppearance(data?.statuses[index]).color;

  if (loading) return <CFDSkeleton />;
  if (error) return <CFDError message={error} />;
  if (!data || data.data.length === 0)
    return <CFDEmpty message={t("No data available for this time range.")} />;

  const statuses: CfdStatus[] = data.statuses;

  return (
    <div
      id="cfd-chart-container"
      style={{
        background: "var(--color-surface, var(--color-base-100))",
        borderRadius: 16,
        padding: "24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
      }}
    >
      {showControls && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 12,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--color-text-primary, var(--color-base-content))",
              }}
            >
              {t("Cumulative Flow Diagram (CFD)")}</h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "var(--color-text-secondary, color-mix(in srgb, var(--color-base-content) 60%, transparent))",
              }}
            >
              {t("Task distribution across statuses over time")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <CustomDatePicker
              value={start}
              onChange={(v) => setStart(v)}
              triggerClassName="h-9 rounded-xl border border-base-content/10 bg-base-100/50 px-3 text-xs font-semibold text-base-content hover:bg-base-100"
            />
            <CustomDatePicker
              value={end}
              onChange={(v) => setEnd(v)}
              triggerClassName="h-9 rounded-xl border border-base-content/10 bg-base-100/50 px-3 text-xs font-semibold text-base-content hover:bg-base-100"
            />
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <defs>
            {statuses.map((s, i) => (
              <linearGradient
                key={s.code}
                id={`cfd-grad-${s.code}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={colorFor(i)} stopOpacity={0.5} />
                <stop offset="95%" stopColor={colorFor(i)} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb, var(--color-base-content) 6%, transparent)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
            tickFormatter={(v) => formatDisplayDate(v, "M/d")}
          />
          <YAxis
            tickFormatter={(value) => formatNumber(Number(value))}
            allowDecimals={false}
            tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
            width={32}
          />
          <Tooltip
            labelFormatter={(label) => typeof label === "string" ? formatDisplayDate(label, "MMM d, yyyy") : ""}
            contentStyle={{
              background: "var(--color-base-100)",
              border: "1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent)",
              borderRadius: 8,
              fontSize: 13,
            }}
            formatter={(value: any, name: any) => [
              formatNumber(Number(value ?? 0)),
              statuses.find((s) => s.code === String(name))?.name ?? name,
            ] as any}
          />
          <Legend
            formatter={(value: any) =>
              statuses.find((s) => s.code === value)?.name ?? value
            }
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 13, color: "var(--color-heledone-ink-muted)" }}
          />
          {statuses.map((s, i) => (
            <Area
              key={s.code}
              type="monotone"
              dataKey={s.code}
              name={getWorkflowAppearance(s).label}
              stackId="1"
              stroke={colorFor(i)}
              fill={`url(#cfd-grad-${s.code})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Bottleneck hint */}
      <BottleneckHint data={data} />
    </div>
  );
}

// ── Bottleneck detection ─────────────────────────────────────────────────────

function BottleneckHint({ data }: { data: CfdData }) {
  const t = useTranslation();
  if (data.data.length < 2) return null;

  const last = data.data[data.data.length - 1];
  const first = data.data[0];
  const bottleneck = data.statuses.find(
    (s) =>
      s.code !== "done" &&
      (last.counts[s.code] ?? 0) > (first.counts[s.code] ?? 0) * 1.5 &&
      (last.counts[s.code] ?? 0) > 2
  );

  if (!bottleneck) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "8px 14px",
        background: "color-mix(in srgb, var(--color-warning) 10%, transparent)",
        borderRadius: 8,
        borderLeft: "3px solid var(--color-warning)",
        fontSize: 13,
        color: "var(--color-warning)",
      }}
    >
      {t("Possible bottleneck: tasks in «")}{bottleneck.name}{t("» are growing faster than other columns.")}</div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────


function CFDSkeleton() {
  useLocale();
  return (
    <div
      style={{
        height: 360,
        background: "var(--color-surface, var(--color-base-100))",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(90deg,color-mix(in srgb, var(--color-base-content) 4%, transparent) 25%,color-mix(in srgb, var(--color-base-content) 8%, transparent) 50%,color-mix(in srgb, var(--color-base-content) 4%, transparent) 75%)",
          borderRadius: 8,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function CFDError({ message }: { message: string }) {
  const t = useTranslation();
  return (
    <div
      style={{
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-error)",
        fontSize: 14,
        background: "var(--color-surface, var(--color-base-100))",
        borderRadius: 16,
      }}
    >
      {t("Error loading CFD data:")} {message}
    </div>
  );
}

function CFDEmpty({ message }: { message: string }) {
  useLocale();
  return (
    <div
      style={{
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-heledone-ink-muted)",
        fontSize: 14,
        background: "var(--color-surface, var(--color-base-100))",
        borderRadius: 16,
      }}
    >
      {message}
    </div>
  );
}
