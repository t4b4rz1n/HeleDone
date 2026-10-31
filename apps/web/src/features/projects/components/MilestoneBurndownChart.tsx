import { formatNumber, t as translate,  useTranslation, useLocale } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from "recharts";
import { getMilestoneBurndown } from "../api/analyticsApi";
import type { MilestoneBurndownData } from "../types/analytics";

interface MilestoneBurndownChartProps {
  milestoneId: string;
  tz?: string;
}

export default function MilestoneBurndownChart({
  milestoneId,
  tz,
}: MilestoneBurndownChartProps) {
  const t = useTranslation();
  const [mode, setMode] = useState<"burndown" | "burnup">("burndown");

  const resolvedTz = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ["projects", "milestone", milestoneId, "burndown", resolvedTz],
    queryFn: () => getMilestoneBurndown(milestoneId, { tz: resolvedTz }),
    staleTime: 5 * 60 * 1000,
  });

  if (loading) return <Skeleton />;
  if (error) return <ErrorState message={t("Failed to load milestone burndown data")} />;
  if (!data) return null;

  if (data.total_tasks === 0) {
    return (
      <div className="project-analytics-glass" style={containerStyle}>
        <Header data={data} mode={mode} setMode={setMode} />
        <EmptyState message={data.note ?? t("No tasks linked to this milestone.")} />
      </div>
    );
  }

  // Merge all three series by date
  const dateMap: Record<
    string,
    { ideal?: number; actual?: number; done?: number; total?: number }
  > = {};
  data.ideal_line.forEach((p) => {
    dateMap[p.date] = { ...dateMap[p.date], ideal: p.remaining };
  });
  data.actual_burndown.forEach((p) => {
    dateMap[p.date] = { ...dateMap[p.date], actual: p.remaining };
  });
  data.burnup.forEach((p) => {
    dateMap[p.date] = {
      ...dateMap[p.date],
      done: p.done,
      total: p.total,
    };
  });
  const chartData = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));

  const today = new Date().toISOString().slice(0, 10);
  const isDone = data.milestone.status === "completed";
  const isLate =
    !isDone &&
    new Date(data.milestone.target_date) < new Date() &&
    (data.actual_burndown.at(-1)?.remaining ?? 0) > 0;

  return (
    <div className="project-analytics-glass" style={containerStyle}>
      <Header data={data} mode={mode} setMode={setMode} />

      {/* Stats Row */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <StatBadge
          label={t("Total Tasks")}
          value={String(data.total_tasks)}
          color="var(--color-primary)"
        />
        <StatBadge
          label={t("انجام‌شده")}
          value={String(data.burnup.at(-1)?.done ?? 0)}
          color="var(--color-success)"
        />
        <StatBadge
          label={t("Remaining")}
          value={String(data.actual_burndown.at(-1)?.remaining ?? 0)}
          color={isLate ? "var(--color-error)" : "var(--color-warning)"}
        />
        {isLate && !isDone && (
          <StatBadge label={t("وضعیت")} value={t("Delayed")} color="var(--color-error)" />
        )}
        {isDone && (
          <StatBadge label={t("وضعیت")} value={t("Completed")} color="var(--color-success)" />
        )}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        {mode === "burndown" ? (
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="color-mix(in srgb, var(--color-base-content) 8%, transparent)"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
              tickFormatter={shortDate}
            />
            <YAxis
            tickFormatter={(value) => formatNumber(Number(value))}
              allowDecimals={false}
              tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
              width={32}
            />
            <Tooltip content={<BurndownTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 13, color: "var(--color-heledone-ink-muted)" }}
            />
            {/* Deadline reference line */}
            <ReferenceLine
              x={data.milestone.target_date}
              stroke="var(--color-error)"
              strokeDasharray="6 3"
              label={{
                value: t("Deadline"),
                position: "insideTopRight",
                fill: "var(--color-error)",
                fontSize: 13,
              }}
            />
            {/* Completed reference line */}
            {isDone && data.milestone.completed_date && (
              <ReferenceLine
                x={data.milestone.completed_date}
                stroke="var(--color-success)"
                strokeDasharray="4 4"
                label={{
                  value: t("Completed"),
                  position: "insideBottomLeft",
                  fill: "var(--color-success)",
                  fontSize: 13,
                }}
              />
            )}
            {/* Today line */}
            {today >= (data.start_date ?? today) && (
              <ReferenceLine
                x={today}
                stroke="color-mix(in srgb, var(--color-base-content) 20%, transparent)"
                strokeDasharray="4 4"
                label={{
                  value: t("امروز"),
                  position: "insideTopLeft",
                  fill: "var(--color-heledone-ink-muted)",
                  fontSize: 13,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="ideal"
              name={t("Ideal Line")}
              stroke="color-mix(in srgb, var(--color-base-content) 50%, transparent)"
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name={t("Actual Remaining")}
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "var(--color-primary)" }}
            />
            <Brush
              dataKey="date"
              height={30}
              stroke="var(--color-primary)"
              fill="var(--color-base-200)"
              tickFormatter={shortDate}
            />
          </LineChart>
        ) : (
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="color-mix(in srgb, var(--color-base-content) 8%, transparent)"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
              tickFormatter={shortDate}
            />
            <YAxis
            tickFormatter={(value) => formatNumber(Number(value))}
              allowDecimals={false}
              tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
              width={32}
            />
            <Tooltip content={<BurnupTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 13, color: "var(--color-heledone-ink-muted)" }}
            />
            <ReferenceLine
              x={data.milestone.target_date}
              stroke="var(--color-error)"
              strokeDasharray="6 3"
              label={{
                value: t("Deadline"),
                position: "insideTopRight",
                fill: "var(--color-error)",
                fontSize: 13,
              }}
            />
            {/* Completed reference line */}
            {isDone && data.milestone.completed_date && (
              <ReferenceLine
                x={data.milestone.completed_date}
                stroke="var(--color-success)"
                strokeDasharray="4 4"
                label={{
                  value: t("Completed"),
                  position: "insideBottomLeft",
                  fill: "var(--color-success)",
                  fontSize: 13,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="total"
              name={t("Total Tasks")}
              stroke="color-mix(in srgb, var(--color-base-content) 50%, transparent)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="done"
              name={t("Done Tasks")}
              stroke="var(--color-success)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: "var(--color-success)" }}
            />
            <Brush
              dataKey="date"
              height={30}
              stroke="var(--color-success)"
              fill="var(--color-base-200)"
              tickFormatter={shortDate}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Header({
  data,
  mode,
  setMode,
}: {
  data: MilestoneBurndownData;
  mode: "burndown" | "burnup";
  setMode: (m: "burndown" | "burnup") => void;
}) {
  useLocale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 16,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: "var(--color-base-content)",
          }}
        >
          {data.milestone.title}
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-heledone-ink-muted)" }}>
          {formatDisplayDate(data.start_date || "", "yyyy-MM-dd")} → {formatDisplayDate(data.target_date || "", "yyyy-MM-dd")}
        </p>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(["burndown", "burnup"] as const).map((m) => (
          <button
            key={m}
            id={`milestone-${m}-btn`}
            onClick={() => setMode(m)}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid color-mix(in srgb, var(--color-base-content) 15%, transparent)",
              cursor: "pointer",
              fontSize: 13,
              background: mode === m ? "var(--color-primary)" : "color-mix(in srgb, var(--color-base-content) 5%, transparent)",
              color: mode === m ? "var(--color-primary-content)" : "color-mix(in srgb, var(--color-base-content) 60%, transparent)",
              transition: "all 0.2s",
            }}
          >
            {m === "burndown" ? translate("Burndown") : translate("Burnup")}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  useLocale();
  return (
    <div
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        borderRadius: 10,
        padding: "8px 14px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div className="text-[13px] mt-[2px] opacity-70" style={{ color: "var(--color-base-content)" }}>{formatDisplayDate(label, "MMM d, yyyy")}</div>
    </div>
  );
}

const BurndownTooltip = ({ active, payload, label }: any) => {
  useLocale();
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--color-base-100)",
        border: "1px solid color-mix(in srgb, var(--color-base-content) 15%, transparent)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
      }}
    >
      <p style={{ margin: "0 0 6px", color: "var(--color-heledone-ink-muted)" }}>{formatDisplayDate(label, "MMM d, yyyy")}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ margin: "2px 0", color: p.color }}>
          {p.name}: {typeof p.value === "number" ? formatNumber(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

const BurnupTooltip = BurndownTooltip;

const containerStyle: React.CSSProperties = {
  background: "var(--color-surface, var(--color-base-100))",
  borderRadius: 16,
  padding: "24px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
};

function Skeleton() {
  useLocale();
  return (
    <div className="project-analytics-glass" style={{ ...containerStyle, height: 360, opacity: 0.5 }}>
      <div
        style={{
          background: "color-mix(in srgb, var(--color-base-content) 8%, transparent)",
          borderRadius: 8,
          height: "100%",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  useLocale();
  return (
    <div
      style={{
        ...containerStyle,
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-error)",
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  useLocale();
  return (
    <div
      style={{
        height: 160,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-heledone-ink-muted)",
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

const shortDate = (v: string) => formatDisplayDate(v, "M/d");;
