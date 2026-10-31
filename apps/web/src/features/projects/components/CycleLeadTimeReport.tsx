import { getErrorMessage } from "../../../core/utils/errorHandler";
import { useTranslation, useLocale } from "../../../i18n/locale";
import { getWorkflowAppearance } from "../../../core/config/designTokens";
import { formatDisplayDate } from "../../../utils/date";
import { CustomDatePicker } from "../../../components/CustomDatePicker";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getProjectCycleTime } from "../api/analyticsApi";
import type { CycleLeadTimeData, CycleLeadTimeParams } from "../types/analytics";

interface CycleLeadTimeReportProps {
  projectId: string;
  params?: CycleLeadTimeParams;
  /** If true, hides the individual tasks table */
  compactMode?: boolean;
}

export default function CycleLeadTimeReport({
  projectId,
  params,
  compactMode = false,
}: CycleLeadTimeReportProps) {
  const t = useTranslation();
  const [data, setData] = useState<CycleLeadTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date range controls
  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const [start, setStart] = useState(params?.start_date ?? ninetyAgo);
  const [end, setEnd] = useState(params?.end_date ?? today);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getProjectCycleTime(projectId, {
      ...params,
      start_date: start,
      end_date: end,
      tz: params?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
      .then((result) => { if (active) setData(result); })
      .catch((requestError: unknown) => {
        if (active) {
          const isForbidden = typeof requestError === "object" && requestError !== null &&
            "response" in requestError &&
            typeof requestError.response === "object" && requestError.response !== null &&
            "status" in requestError.response && requestError.response.status === 403;
          setError(isForbidden
            ? t("You do not have permission to perform this action.")
            : getErrorMessage(requestError, "Error loading Cycle Time data"));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, start, end, params, t]);

  if (loading) return <Skeleton />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  if (data.task_count === 0) {
    return (
      <div className="project-analytics-glass" style={containerStyle}>
        <SectionHeader start={start} end={end} setStart={setStart} setEnd={setEnd} />
        <EmptyState />
      </div>
    );
  }

  const formatHours = (h: number | null) => {
    if (h === null) return "—";
    if (h < 1) return t("{minutes} minutes", { minutes: Math.round(h * 60) });
    if (h < 24) return t("{hours} hours", { hours: Number(h.toFixed(1)) });
    return t("{value0} days", { value0: Number((h / 24).toFixed(1)) });
  };

  const barData = data.by_status.map((s) => ({
    name: getWorkflowAppearance({ code: s.status_code }).label,
    color: getWorkflowAppearance({ code: s.status_code }).color,
    hours: s.avg_hours_in_status ?? 0,
  }));

  return (
    <div className="project-analytics-glass" style={containerStyle}>
      <SectionHeader start={start} end={end} setStart={setStart} setEnd={setEnd} />

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label={t("Avg Lead Time")}
          value={formatHours(data.avg_lead_time_hours)}
          sub={`P50: ${formatHours(data.p50_lead_time_hours)} | P95: ${formatHours(data.p95_lead_time_hours)}`}
          color="var(--color-primary)"
          id="kpi-lead-time"
        />
        <KpiCard
          label={t("Avg Cycle Time")}
          value={formatHours(data.avg_cycle_time_hours)}
          sub={`P50: ${formatHours(data.p50_cycle_time_hours)} | P95: ${formatHours(data.p95_cycle_time_hours)}`}
          color="var(--color-success)"
          id="kpi-cycle-time"
        />
        <KpiCard
          label={t("Tasks Analyzed")}
          value={String(data.task_count)}
          sub={`${formatDisplayDate(start, "yyyy-MM-dd")} to ${formatDisplayDate(end, "yyyy-MM-dd")}`}
          color="var(--color-warning)"
          id="kpi-task-count"
        />
      </div>

      {/* Time per status bar chart */}
      {barData.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-heledone-ink-muted)", fontWeight: 600 }}>
            {t("Avg time per status")}</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={barData}
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="color-mix(in srgb, var(--color-base-content) 6%, transparent)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
              />
              <YAxis
                tick={{ fontSize: 13, fill: "var(--color-heledone-ink-muted)" }}
                tickFormatter={(value) => t("{hours} hours", { hours: Number(value) })}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in srgb, var(--color-base-content) 4%, transparent)" }}
                contentStyle={{
                  background: "var(--color-base-100)",
                  border: "1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent)",
                  borderRadius: 8,
                  fontSize: 13,
                }}
                formatter={(value: any) => {
                  const hours = typeof value === "number" ? value : null;
                  return [formatHours(hours), t("Avg time in status")] as any;
                }}
              />
              <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tasks table */}
      {!compactMode && data.tasks.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-heledone-ink-muted)", fontWeight: 600 }}>
            {t("Completed Tasks")}</h4>
          <div style={{ overflowX: "auto" }}>
            <table
              id="cycle-time-tasks-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                color: "var(--color-base-content)",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-base-content) 8%, transparent)" }}>
                  {[t("Task Title"), t("Lead Time"), t("Cycle Time"), t("Done At")].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          textAlign: "start",
                          color: "var(--color-heledone-ink-muted)",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {data.tasks.slice(0, 50).map((t) => (
                  <tr
                    key={t.task_id}
                    style={{
                      borderBottom: "1px solid color-mix(in srgb, var(--color-base-content) 4%, transparent)",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "color-mix(in srgb, var(--color-base-content) 3%, transparent)")
                    }
                    onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "transparent")
                    }
                  >
                    <td style={{ padding: "8px 12px" }}>{t.title}</td>
                    <td style={{ padding: "8px 12px", color: "var(--color-primary)" }}>
                      {formatHours(t.lead_time_hours)}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--color-success)" }}>
                      {formatHours(t.cycle_time_hours)}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--color-heledone-ink-muted)" }}>
                      {formatDisplayDate(t.done_at, "yyyy-MM-dd")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────


function SectionHeader({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (s: string) => void;
  setEnd: (s: string) => void;
}) {
  const t = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-base-content)" }}>
          {t("Cycle Time & Lead Time")}</h3>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-heledone-ink-muted)" }}>
          {t("Average task lifecycle from creation to Done")}</p>
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
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
  id,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  id: string;
}) {
  useLocale();
  return (
    <div
      id={id}
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--color-heledone-ink-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-heledone-ink-muted)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: "var(--color-surface, var(--color-base-100))",
  borderRadius: 16,
  padding: "24px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
};


function Skeleton() {
  useLocale();
  return (
    <div style={{ ...containerStyle, height: 360, opacity: 0.5 }}>
      <div
        style={{
          background: "color-mix(in srgb, var(--color-base-content) 6%, transparent)",
          borderRadius: 8,
          height: "100%",
        }}
      />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const t = useTranslation();
  useLocale();
  const isAccessDenied = message === t("You do not have permission to perform this action.");
  return (
    <div role="alert" style={{ ...containerStyle, height: 120, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: isAccessDenied ? "var(--color-base-content)" : "var(--color-error)", fontSize: 14 }}>
      <span>{isAccessDenied ? t("Access Denied") : message}</span>
      {isAccessDenied && <span className="mt-2 text-heledone-ink-muted">{t("You do not have permission to view this team's performance data.")}</span>}
    </div>
  );
}

function EmptyState() {
  const t = useTranslation();
  return (
    <div
      style={{
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-heledone-ink-muted)",
        fontSize: 14,
      }}
    >
      {t("No tasks completed in this period yet.")}</div>
  );
}
