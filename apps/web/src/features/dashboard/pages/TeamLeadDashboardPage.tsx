import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { CoastalArtwork } from "../../../components/CoastalEmptyState";
import { getIntlLocale, t as translate, useTranslation, useLocale } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
/**
 * TeamLeadDashboardPage.tsx
 * -------------------------
 * Independent dashboard for Team Lead role.
 *
 * Data: GET /api/v1/reports/manager/dashboard/
 *   → team_id is not passed; backend finds the user's lead teams.
 *   → error 403: appropriate error state is shown.
 *
 * Design: Same design language (heledone-surface, DaisyUI tokens,
 *   iconsax-reactjs, Framer Motion) — no new components.
 *
 * ⚠️ Technical debt (recorded):
 *   - Texts are hardcoded (i18n is not implemented).
 *   - Inline components should be moved to /src/components/ui in the future.
 *
 */

import { motion } from "motion/react";
import {
  Activity,
  Add,
  ArrowRight,
  Building,
  Calendar,
  Chart21,
  Clock,
  Danger,
  People,
  Refresh2,
  TaskSquare,
  Timer1,
  TickCircle,
  CloseCircle,
} from "iconsax-reactjs";
import { useMemo } from "react";
import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getManagerDashboard, getManagerMembers } from "../api/dashboardApi";
import type {
  ManagerDashboard,
  ManagerProjectSummary,
  ManagerAttendance,
  ManagerMemberDetail,
} from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const formatHours = (seconds: number | null | undefined) => {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return translate("{value0}h {value1}m", { value0: hours, value1: minutes.toString().padStart(2, "0") });
};

const formatTime = (isoString: string | null | undefined) => {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: getTimezone(),
  }).format(new Date(isoString));
};

const formatDate = (value: string | null | undefined) => value ? formatDisplayDate(new Date(value), "MMM d, yyyy") : "-";;


/**
 * Color mapping for project.status — from backend real values (Project.Status)
 * "draft" | "active" | "on_hold" | "completed" | "archived"
 */
const getProjectStatusStyle = (
  status: string
): { label: string; tone: "success" | "warning" | "error" | "neutral" } => {
  switch (status) {
    case "active":
      return { label: translate("فعال"), tone: "success" };
    case "completed":
      return { label: translate("Completed"), tone: "success" };
    case "on_hold":
      return { label: translate("On Hold"), tone: "warning" };
    case "draft":
      return { label: translate("Draft"), tone: "neutral" };
    case "archived":
      return { label: translate("Archived"), tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
};

const getProjectProgress = (project: ManagerProjectSummary) =>
  project.total_tasks > 0
    ? Math.round((project.done_tasks / project.total_tasks) * 100)
    : 0;

// ─── Design constants ─────────────────────────────────────────────────────────

const panelClass = "heledone-surface overflow-hidden";
const spring = { type: "spring" as const, stiffness: 360, damping: 32, bounce: 0 };

// ─── Sub-components (inline — Technical debt: should be moved to /components/ui) ──

const MetricCard = ({
  label,
  value,
  description,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  description: string;
  icon: ComponentType<{ size?: number }>;
  tone?: "primary" | "warning" | "success" | "secondary" | "error";
}) => {
  useLocale();
  const iconClass =
    tone === "warning"
      ? "bg-warning/10 text-warning"
      : tone === "success"
        ? "bg-success/10 text-success"
        : tone === "secondary"
          ? "bg-secondary/10 text-secondary"
          : tone === "error"
            ? "bg-error/10 text-error"
            : "bg-primary/10 text-primary";

  return (
    <motion.section
      whileHover={{ y: -2 }}
      transition={spring}
      className={`${panelClass} p-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold uppercase  text-heledone-ink-muted">
            {label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-base-content">
            {value}
          </p>
          <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">
            {description}
          </p>
        </div>
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${iconClass}`}
        >
          <Icon size={21} />
        </span>
      </div>
    </motion.section>
  );
};

const SectionHeading = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) => { useLocale(); return (
  <div className="flex flex-col gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 className="text-base font-black tracking-tight text-base-content">
        {title}
      </h2>
      <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">
        {description}
      </p>
    </div>
    {action}
  </div>
); };

const MemberRow = ({ member, maxTasks, workSeconds }: { member: ManagerMemberDetail; maxTasks: number; workSeconds: number }) => {
  const t = useTranslation();
  const completion = member.total_tasks ? Math.round((member.done_tasks / member.total_tasks) * 100) : 0;
  const workload = maxTasks ? Math.round((member.total_tasks / maxTasks) * 100) : 0;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-3 border-t border-base-content/8 px-5 py-4 sm:grid-cols-[minmax(13rem,1.2fr)_minmax(12rem,1fr)_5rem_5rem] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <ProfileAvatar src={member.avatar_url} name={`${member.first_name} ${member.last_name}`} className="size-9 shrink-0 overflow-hidden rounded-full" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary" />
        <div className="min-w-0"><p className="truncate text-sm font-bold text-base-content">{member.first_name || member.username} {member.last_name}</p><p className="truncate text-xs text-heledone-ink-muted">@{member.username}</p></div>
      </div>
      <div><div className="mb-1 flex items-center justify-between text-[13px] font-bold text-heledone-ink-muted"><span>{t("Workload")}</span><span>{formatUiNumber(member.total_tasks)}  {t("tasks")}</span></div><div className="h-2 overflow-hidden rounded-full bg-base-200"><motion.div initial={{ width: 0 }} animate={{ width: `${workload}%` }} transition={{ duration: 0.7 }} className="h-full rounded-full bg-primary" /></div></div>
      <div className="text-start sm:text-end"><p className="text-sm font-black text-base-content">{formatUiNumber(completion)}%</p><p className="text-[13px] font-bold text-heledone-ink-muted">{t("done")}</p></div>
      <div className="text-start sm:text-end"><p className={`text-sm font-black ${member.overdue_tasks > 0 ? "text-error" : "text-base-content"}`}>{formatUiNumber(member.overdue_tasks)}</p><p className="text-[13px] font-bold text-heledone-ink-muted">{t("overdue")}</p></div>
      <div className="col-span-full flex items-center gap-1 text-[13px] font-semibold text-heledone-ink-muted sm:col-auto sm:justify-end"><Timer1 size={13} /> {formatHours(workSeconds)}</div>
    </motion.div>
  );
};

// ─── Attendance Panel ─────────────────────────────────────────────────────────

const AttendancePanel = ({
  members,
}: {
  members: ManagerAttendance[];
}) => { const t = useTranslation(); return (
  <section className={panelClass}>
    <SectionHeading
      title={t("Member Attendance")}
      description={t("Today's Check-in/Check-out status")}
      action={
        <span className="text-[13px] font-bold text-heledone-ink-muted">
          {t("امروز")}</span>
      }
    />
    {members.length === 0 ? (
      <div className="px-5 pb-6">
        <div className="rounded-2xl bg-base-200/60 p-4 text-center">
          <p className="text-sm font-semibold text-heledone-ink-muted">
            {t("No attendance information recorded.")}</p>
        </div>
      </div>
    ) : (
      <div className="divide-y divide-base-content/8">
        {members.map((member) => {
          const isPresent = Boolean(member.check_in);
          const isOut = Boolean(member.check_in && member.check_out);
          return (
            <motion.div
              key={member.user_id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar src={member.avatar_url} name={member.first_name || member.username} className="size-9 shrink-0 overflow-hidden rounded-full" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-base-content">
                    {member.first_name || member.username}
                  </p>
                  <p className="truncate text-xs text-heledone-ink-muted">
                    @{member.username}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                {member.is_remote && (
                  <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[13px] font-black text-secondary">
                    {t("Remote")}</span>
                )}
                {!isPresent ? (
                  <span className="flex items-center gap-1 text-heledone-ink-muted">
                    <CloseCircle size={14} />
                    {t("Absent")}</span>
                ) : isOut ? (
                  <span className="flex items-center gap-1 text-heledone-ink-muted">
                    <TickCircle size={14} className="text-success" />
                    {formatTime(member.check_in)} — {formatTime(member.check_out)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-success">
                    <Activity size={14} />
                    {t("Since")} {formatTime(member.check_in)}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    )}
  </section>
); };

// ─── Work Hours Panel ─────────────────────────────────────────────────────────

const WorkHoursPanel = ({
  workHours,
  overdueByMember,
}: {
  workHours: ManagerDashboard["work_hours"];
  overdueByMember: ManagerDashboard["overdue_summary"]["by_member"];
}) => {
  const t = useTranslation();
  const maxSeconds = Math.max(...workHours.map((w) => w.total_seconds), 1);
  // Mapping username → count from overdue_summary.by_member (in main response)
  const overdueMap = new Map(
    overdueByMember.map((m) => [m.username, m.count])
  );

  return (
    <section className={panelClass}>
      <SectionHeading
        title={t("Weekly Work Hours")}
        description={t("Logged time per member this week")}
        action={
          <span className="inline-flex items-center gap-1 text-[13px] font-bold text-heledone-ink-muted">
            <Clock size={13} />
            {formatHours(
              workHours.reduce((s, w) => s + Number(w.total_seconds || 0), 0)
            )}{" "}
            {t("Total")}</span>
        }
      />
      {workHours.length === 0 ? (
        <div className="px-5 pb-6 text-sm font-semibold text-heledone-ink-muted">
          {t("No work hours recorded this week.")}</div>
      ) : (
        <div className="divide-y divide-base-content/8">
          {workHours.map((item) => {
            const pct = Math.round((item.total_seconds / maxSeconds) * 100);
            const overdueTasks = overdueMap.get(item.username) ?? 0;
            return (
              <div key={item.user_id} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ProfileAvatar src={item.avatar_url} name={`${item.first_name} ${item.last_name}`} className="size-8 shrink-0 overflow-hidden rounded-full" fallbackClassName="flex size-full items-center justify-center rounded-full bg-secondary/10 text-[13px] font-black text-secondary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-base-content">
                        {item.first_name} {item.last_name}
                      </p>
                      {overdueTasks > 0 && (
                        <p className="text-[13px] font-bold text-error">
                          {formatUiNumber(overdueTasks)}  {t("Overdue Tasks")}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-black text-base-content">
                    {formatHours(item.total_seconds)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-base-200">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: 0.05 }}
                    className="h-full rounded-full bg-primary"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

// ─── Project Summary Panel ────────────────────────────────────────────────────

const ProjectSummaryPanel = ({
  projects,
}: {
  projects: ManagerProjectSummary[];
}) => { const t = useTranslation(); return (
  <section className={panelClass}>
    <SectionHeading
      title={t("Project Status")}
      description={t("Summary of team projects")}
      action={
        <Link
          to="/tasks"
          className="motion-interactive inline-flex items-center gap-1 text-xs font-black text-primary"
        >
          {t("فضای کار")} <ArrowRight size={14} />
        </Link>
      }
    />
    {projects.length === 0 ? (
      <div className="px-5 pb-6 text-sm font-semibold text-heledone-ink-muted">
        {t("No projects recorded in this team.")}</div>
    ) : (
      <div className="grid gap-3 px-5 pb-5">
        {projects.map((project) => {
          const { label, tone } = getProjectStatusStyle(project.status);
          const progress = getProjectProgress(project);
          const toneClass =
            tone === "success"
              ? "bg-success/10 text-success"
              : tone === "warning"
                ? "bg-warning/10 text-warning"
                : tone === "error"
                  ? "bg-error/10 text-error"
                  : "bg-base-200 text-heledone-ink-muted";
          const barClass =
            tone === "success"
              ? "bg-success"
              : tone === "warning"
                ? "bg-warning"
                : tone === "error"
                  ? "bg-error"
                  : "bg-base-content/20";

          return (
            <motion.div
              key={project.id}
              layout
              className="rounded-2xl border border-base-content/8 bg-base-200/50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-base-content">
                    {project.name}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-heledone-ink-muted">
                    {t("Deadline")} {formatDate(project.deadline)} ·{" "}
                    {formatUiNumber(project.active_member_count)}  {t("members ·")}{" "}
                    {formatUiNumber(project.done_tasks)}/{formatUiNumber(project.total_tasks)}  {t("tasks")}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-black ${toneClass}`}
                >
                  {label}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-100">
                  <div
                    className={`h-full rounded-full ${barClass}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-black text-heledone-ink-muted">
                  {formatUiNumber(progress)}%
                </span>
              </div>
              {project.total_time_seconds != null && (
                <p className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-heledone-ink-muted">
                  <Timer1 size={12} />
                  {formatHours(project.total_time_seconds)}  {t("logged")}</p>
              )}
            </motion.div>
          );
        })}
      </div>
    )}
  </section>
); };

// ─── Overdue Summary Panel ────────────────────────────────────────────────────

const OverdueSummaryPanel = ({
  overdue,
}: {
  overdue: ManagerDashboard["overdue_summary"];
}) => { const t = useTranslation(); return (
  <section className={panelClass}>
    <SectionHeading
      title={t("Overdue Tasks")}
      description={t("Members with overdue tasks")}
      action={
        overdue.total_overdue > 0 ? (
          <span className="rounded-full bg-error/10 px-2.5 py-1 text-[13px] font-black text-error">
            {formatUiNumber(overdue.total_overdue)}  {t("tasks")}</span>
        ) : (
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[13px] font-black text-success">
            {t("All Up to Date")}</span>
        )
      }
    />
    {overdue.total_overdue === 0 ? (
      <div className="px-5 pb-6">
        <div className="rounded-2xl bg-success/10 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-success">
            <TickCircle size={18} />
            {t("No overdue tasks")}</div>
          <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">
            {t("The team is moving on schedule.")}</p>
        </div>
      </div>
    ) : (
      <div className="divide-y divide-base-content/8">
        {overdue.by_member.map((member) => (
          <div
            key={member.username}
            className="flex items-center justify-between gap-3 px-5 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar src={member.avatar_url} name={member.first_name || member.username} className="size-8 shrink-0 overflow-hidden rounded-full" fallbackClassName="flex size-full items-center justify-center rounded-full bg-error/10 text-[13px] font-black text-error" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-base-content">
                  {member.first_name || member.username}
                </p>
                <p className="text-xs text-heledone-ink-muted">
                  @{member.username}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-error/10 px-2.5 py-1 text-xs font-black text-error">
              {formatUiNumber(member.count)}  {t("tasks")}</span>
          </div>
        ))}
      </div>
    )}
  </section>
); };

// ─── Task Stats / Workload Panel ──────────────────────────────────────────────

const TaskStatsPanel = ({
  taskStats,
}: {
  taskStats: ManagerDashboard["task_stats"];
}) => {
  const t = useTranslation();
  const total = Math.max(
    taskStats.reduce((s, stat) => s + stat.count, 0),
    1
  );
  const palette = [
    "bg-primary",
    "bg-secondary",
    "bg-warning",
    "bg-success",
    "bg-error",
  ];

  return (
    <section className={panelClass}>
      <SectionHeading
        title={t("Task Distribution")}
        description={t("Task breakdown by status")}
      />
      <div className="px-5 pb-6">
        {taskStats.length === 0 ? (
          <p className="text-sm font-semibold text-heledone-ink-muted">
            {t("No tasks in this team.")}</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-base-200">
              {taskStats.map((stat, idx) => (
                <motion.div
                  key={`${stat.status_code}-${idx}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${(stat.count / total) * 100}%` }}
                  transition={{ duration: 0.7, delay: idx * 0.06 }}
                  className={`${palette[idx % palette.length]} min-w-1`}
                />
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {taskStats.map((stat, idx) => (
                <div
                  key={`${stat.status_code}-legend`}
                  className="flex items-center justify-between rounded-xl bg-base-200/60 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${palette[idx % palette.length]}`}
                    />
                    <span className="truncate text-xs font-bold text-heledone-ink-muted">
                      {stat.status_name || stat.status_code || t("Uncategorized")}
                    </span>
                  </div>
                  <span className="text-sm font-black text-base-content">
                    {formatUiNumber(stat.count)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const TeamLeadDashboardSkeleton = () => { useLocale(); return (
  <div className="mx-auto max-w-[1480px] animate-pulse space-y-6">
    <div className="h-28 rounded-3xl bg-base-100" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-2xl bg-base-100" />
      ))}
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="h-72 rounded-2xl bg-base-100" />
      <div className="h-72 rounded-2xl bg-base-100" />
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="h-64 rounded-2xl bg-base-100" />
      <div className="h-64 rounded-2xl bg-base-100" />
    </div>
  </div>
); };

// ─── Main Page ────────────────────────────────────────────────────────────────

const TeamLeadDashboardPage = () => {
  const t = useTranslation();
  const timezone = useMemo(getTimezone, []);

  const dashboardQuery = useQuery<ManagerDashboard>({
    queryKey: ["reports", "team-lead-dashboard", timezone],
    queryFn: () => getManagerDashboard(null, timezone),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const membersQuery = useQuery<ManagerMemberDetail[]>({
    queryKey: ["reports", "team-lead-members", timezone],
    queryFn: () => getManagerMembers(null, timezone),
    enabled: dashboardQuery.isSuccess,
    staleTime: 30_000,
  });

  const dashboard = dashboardQuery.data;
  const members = membersQuery.data || [];

  const workHours = dashboard?.work_hours || [];
  const maxTasks = Math.max(...members.map((m) => m.total_tasks), 1);
  const workHoursByUser = new Map(
    workHours.map((m) => [m.user_id.toString(), m.total_seconds])
  );

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (dashboardQuery.isLoading) return <TeamLeadDashboardSkeleton />;

  // ─── Error / 403 state ──────────────────────────────────────────────────────
  if (dashboardQuery.isError || !dashboard) {
    const isAccessDenied =
      (dashboardQuery.error as { status?: number } | null)?.status === 403;

    return (
      <section className="mx-auto max-w-2xl py-14">
        <div className={`${panelClass} p-8 text-center`}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
            <Danger size={24} />
          </div>
          <h1 className="mt-4 text-xl font-black text-base-content">
            {isAccessDenied ? t("Access Denied") : t("Error Loading Dashboard")}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-heledone-ink-muted">
            {isAccessDenied
              ? t("This section is only accessible to authorized team members. If you believe this is a mistake, contact your manager.")
              : t("An error occurred fetching data. Please try again.")}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void dashboardQuery.refetch()}
              className="motion-interactive inline-flex items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-4 py-2.5 text-xs font-black text-base-content/70 hover:border-primary/30 hover:text-primary"
            >
              <Refresh2 size={14} />
              {t("Try Again")}</button>
            <Link
              to="/dashboard"
              className="motion-interactive inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-content"
            >
              {t("Personal Dashboard")}<ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ─── KPI aggregates ─────────────────────────────────────────────────────────
  const totalTasks = dashboard.task_stats.reduce(
    (sum, stat) => sum + stat.count,
    0
  );
  const doneTasks = dashboard.task_stats
    .filter((stat) => stat.status_code?.toLowerCase() === "done")
    .reduce((sum, stat) => sum + stat.count, 0);

  const totalWorkSeconds = dashboard.work_hours.reduce(
    (sum, w) => sum + Number(w.total_seconds || 0),
    0
  );

  const membersPresent = dashboard.members_attendance.filter(
    (m) => m.check_in
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-[1480px] space-y-5 sm:space-y-6"
    >
      {/* ─── Header ─── */}
      <section className="heledone-page-heading flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase  text-primary">
            <Chart21 size={15} />
            {t("Team Overview")}</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-base-content sm:text-4xl">
            {t("Your Team Status")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-heledone-ink-muted sm:text-base">
            {t("Overview of attendance, tasks, and project progress of your team.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-3 text-xs font-bold text-heledone-ink-muted">
            <Activity size={15} className="text-success" />
            {t("Live Data")}</span>
          <button
            type="button"
            onClick={() => {
              void dashboardQuery.refetch();
            }}
            className="motion-interactive inline-flex h-10 items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-3 text-xs font-bold text-heledone-ink-muted hover:border-primary/30 hover:text-primary"
          >
            <Refresh2 size={15} />
            {t("Refresh")}</button>
        </div>
      </section>

      {/* ─── No Team Empty State ─── */}
      {dashboard.managed_team_count === 0 && (
        <section className="mx-auto max-w-2xl py-6">
          <div className={`${panelClass} overflow-hidden`}>
            <CoastalArtwork motif="coast" className="mx-auto mt-6" />

            <div className="px-6 pb-7 pt-5">
              <h2 className="text-xl font-black tracking-tight text-base-content">
                {t("No Team Connected Yet")}</h2>
              <p className="mt-2 text-sm leading-6 text-heledone-ink-muted">
                {t("To get started, create a team and assign members to it, or connect an existing team to the project.")}</p>

              {/* Steps guide */}
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    step: "1",
                    label: t("Create a Team"),
                    desc: t("Set up a team in your organization"),
                    tone: "primary",
                  },
                  {
                    step: "2",
                    label: t("Add Members"),
                    desc: t("Assign users to your team"),
                    tone: "secondary",
                  },
                  {
                    step: "3",
                    label: t("Link to Project"),
                    desc: t("Connect the team to your projects"),
                    tone: "success",
                  },
                ].map(({ step, label, desc, tone }) => (
                  <div
                    key={step}
                    className={`rounded-2xl border bg-base-200/50 p-3.5 ${
                      tone === "primary"
                        ? "border-primary/20"
                        : tone === "secondary"
                          ? "border-secondary/20"
                          : "border-success/20"
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-black ${
                        tone === "primary"
                          ? "bg-primary/15 text-primary"
                          : tone === "secondary"
                            ? "bg-secondary/15 text-secondary"
                            : "bg-success/15 text-success"
                      }`}
                    >
                      {step}
                    </span>
                    <p className="mt-2 text-xs font-bold text-base-content">{label}</p>
                    <p className="mt-0.5 text-[13px] text-heledone-ink-muted">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  to="/teams"
                  className="motion-interactive inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-primary-content shadow-md shadow-primary/20"
                >
                  <Add size={16} />
                  {t("Create or Manage Teams")}</Link>
                <Link
                  to="/projects"
                  className="motion-interactive inline-flex h-10 items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-4 text-xs font-black text-base-content/70 hover:border-primary/30 hover:text-primary"
                >
                  <ArrowRight size={15} />
                  {t("View Projects")}</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── Data Panels — only visible when a team exists ─── */}
      {dashboard.managed_team_count > 0 && (
        <>
          {/* ─── Decision Banner ─── */}
          {dashboard.overdue_summary.total_overdue > 0 && (
            <section
              className={`${panelClass} flex flex-col gap-4 bg-gradient-to-br from-error/[0.06] via-base-100 to-base-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-error/10 text-error">
                  <Danger size={19} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase  text-error">
                    {t("Needs Attention")}</p>
                  <h2 className="mt-1 text-lg font-black text-base-content">
                    {formatUiNumber(dashboard.overdue_summary.total_overdue)}  {t("tasks behind schedule")}</h2>
                  <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">
                    {t("See details in the overdue tasks section.")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-heledone-ink-muted">
                <Calendar size={15} />
                {t("Updated just now")}</div>
            </section>
          )}

          {/* ─── KPI Cards ─── */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label={t("Team Members")}
              value={dashboard.team_member_count}
              description={t("members in this team")}
              icon={People}
              tone="primary"
            />
            <MetricCard
              label={t("Today's Attendance")}
              value={`${membersPresent} / ${dashboard.team_member_count}`}
              description={t("present out of total")}
              icon={Building}
              tone="success"
            />
            <MetricCard
              label={t("Overdue Tasks")}
              value={dashboard.overdue_summary.total_overdue}
              description={
                totalTasks > 0
                  ? doneTasks > 0
                    ? t("{value0} completed out of {value1} total tasks", { value0: doneTasks, value1: totalTasks })
                    : t("Out of {value0} total tasks", { value0: totalTasks })
                  : t("No tasks assigned")
              }
              icon={Danger}
              tone={dashboard.overdue_summary.total_overdue > 0 ? "warning" : "success"}
            />
          </section>

          {/* ─── Team Overview ─── */}
          <section className={panelClass}>
            <SectionHeading
              title={t("Team overview")}
              description={t("A quick read on delivery and capacity")}
              action={
                <span className="text-[13px] font-bold text-heledone-ink-muted">
                  {t("این هفته")}</span>
              }
            />
            <div className="hidden grid-cols-[minmax(13rem,1.2fr)_minmax(12rem,1fr)_5rem_5rem_6rem] gap-3 px-5 pb-2 text-[13px] font-black uppercase tracking-wider text-heledone-ink-muted sm:grid">
              <span>{t("Member")}</span>
              <span>{t("Workload")}</span>
              <span className="text-end">{t("انجام‌شده")}</span>
              <span className="text-end">{t("Risk")}</span>
              <span className="text-end">{t("تمرکز")}</span>
            </div>
            {members.length === 0 ? (
              <div className="px-5 pb-6 text-sm font-semibold text-heledone-ink-muted">
                {t("No team members are visible in this scope.")}</div>
            ) : (
              <div>
                {members.slice(0, 8).map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    maxTasks={maxTasks}
                    workSeconds={
                      workHoursByUser.get(member.id.toString()) ||
                      member.week_seconds ||
                      0
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* ─── Attendance + Work Hours ─── */}
          <section className="grid gap-5 xl:grid-cols-2">
            <AttendancePanel members={dashboard.members_attendance} />
            <WorkHoursPanel
              workHours={dashboard.work_hours}
              overdueByMember={dashboard.overdue_summary.by_member}
            />
          </section>

          {/* ─── Task Stats + Overdue Summary ─── */}
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <TaskStatsPanel taskStats={dashboard.task_stats} />
            <OverdueSummaryPanel overdue={dashboard.overdue_summary} />
          </section>

          {/* ─── Project Summary ─── */}
          {dashboard.project_summary.length > 0 && (
            <section className="grid gap-5">
              <ProjectSummaryPanel projects={dashboard.project_summary} />
            </section>
          )}

          {/* ─── Weekly focus footer ─── */}
          <section className="flex items-center justify-between rounded-2xl border border-base-content/8 bg-base-200/40 px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-bold text-heledone-ink-muted">
              <Timer1 size={14} />
              {t("Total weekly work hours of the team:")}<span className="font-black text-base-content">
                {formatHours(totalWorkSeconds)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-heledone-ink-muted">
              <TaskSquare size={14} />
              {formatUiNumber(totalTasks)}  {t("tasks ·")} {formatUiNumber(doneTasks)}  {t("Completed")}</div>
          </section>
        </>
      )}
    </motion.div>
  );
};

export default TeamLeadDashboardPage;
