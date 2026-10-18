import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { getIntlLocale, t as translate, useTranslation, useLocale } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Clock,
  TaskSquare,
  NoteText,
  Briefcase, Timer1,
  Play,
  Stop,
  TickCircle,
  Add,
  ArrowRight,
  User,
  LogoutCurve,
  Danger, ArrowDown2, Maximize4, NoteAdd,
} from "iconsax-reactjs";
import { toast } from "sonner";
import { useAuthStore } from "../../auth/store/authStore";
import { getEmployeeDashboard } from "../api/dashboardApi";
import {
  getTodayAttendance,
  checkIn,
  checkOut,
  startTimer,
  stopTimer,
  getOrganizations,
} from "../../attendance/api/attendanceApi";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTickets } from "../../tickets/hooks/useTickets";
import { updateTask, getTask } from "../../tasks/api/tasksApi";
import { StandupModal } from "../../tasks/components/StandupModal";
import { StandupMatrix } from "../../tasks/components/StandupMatrix";
import { TaskSheet } from "../../tasks/components/TaskSheet";
import { usePermissions } from "../../auth/hooks/usePermissions";
import type { EmployeeTaskSummary } from "../types";

const getTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const formatDay = () => formatDisplayDate(new Date(), "EEEE, MMMM d, yyyy");

const formatDecimalHours = (
  decimalValue: number | string | null | undefined,
): string => {
  const num = Number(decimalValue);
  if (!num || isNaN(num) || num <= 0) return translate("۰ ساعت");
  const h = Math.floor(num);
  const m = Math.round((num - h) * 60);
  return translate("{value0} ساعت و {value1} دقیقه", { value0: h, value1: m });
};

const ProgressRing = ({
  radius,
  stroke,
  progress,
  color,
}: {
  radius: number;
  stroke: number;
  progress: number;
  color: string;
}) => {
  useLocale();
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = Math.max(0, circumference - (progress / 100) * circumference);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        height={radius * 2}
        width={radius * 2}
        className="transform -rotate-90"
      >
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="opacity-10"
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="transition-all duration-1000 ease-in-out"
          filter={`drop-shadow(0 0 4px ${color}80)`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-black text-base-content">
          {formatUiNumber(Math.round(progress))}%
        </span>
      </div>
    </div>
  );
};

const formatSeconds = (
  seconds: number | null | undefined,
): string => {
  const value = Math.max(0, Number(seconds || 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  return translate("{value0} ساعت و {value1} دقیقه", { value0: h, value1: m });
};

export const UserDashboardPage = () => {
  const t = useTranslation();
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timezone = useMemo(getTimezone, []);

  const { hasAnyPermission } = usePermissions();
  const isManager = hasAnyPermission(["org.manage_settings", "report.view"]);

  const [isStandupOpen, setStandupOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 1. Dashboard Query
  const dashboardQuery = useQuery({
    queryKey: ["employee-dashboard", timezone],
    queryFn: () => getEmployeeDashboard(timezone),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // 2. Attendance & Organizations Query
  const attendanceQuery = useQuery({
    queryKey: ["today-attendance"],
    queryFn: getTodayAttendance,
  });

  const orgsQuery = useQuery({
    queryKey: ["user-organizations"],
    queryFn: getOrganizations,
  });

  // 3. Projects Query
  const { data: projectsData = [] } = useProjects(undefined);

  // 4. Tickets Query
  const { data: ticketsData } = useTickets(
    new URLSearchParams({ page_size: "10" }),
  );
  const openTickets = useMemo(() => {
    const list = Array.isArray(ticketsData?.data?.results)
      ? ticketsData.data.results
      : Array.isArray(ticketsData?.results)
        ? ticketsData.results
        : [];
    return list.filter(
      (t: any) => t.status !== "closed" && t.status !== "resolved",
    );
  }, [ticketsData]);

  // 5. Selected Task Query
  const taskQuery = useQuery({
    queryKey: ["task", selectedTaskId],
    queryFn: () => getTask(selectedTaskId!),
    enabled: Boolean(selectedTaskId),
  });

  const dashboard = dashboardQuery.data;
  const attendance = attendanceQuery.data;

  // Use is_active (session-based) if available, fall back to check_in && !check_out
  const isCheckedIn = Boolean(
    attendance &&
    ((attendance as any).is_active ||
      (attendance.check_in && !attendance.check_out)),
  );
  const checkInTime = attendance?.check_in
    ? new Date(attendance.check_in).toLocaleTimeString(getIntlLocale(), {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  // Attendance Check-In / Check-Out mutations
  const checkInMutation = useMutation({
    mutationFn: async () => {
      let orgs = orgsQuery.data;
      if (!orgs || orgs.length === 0) {
        orgs = await getOrganizations();
      }
      const targetOrgId = orgs[0]?.id;
      if (!targetOrgId) {
        throw new Error(
          t("No active organization found. Please create or join an organization first."),
        );
      }
      return checkIn(String(targetOrgId));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["today-attendance"], data);
      queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
      toast.success(t("ورود شما ثبت شد"));
    },
    onError: (err: any) => {
      // axiosClient transforms errors: err is already the response body
      const msg =
        err?.error ||
        err?.detail ||
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        t("ثبت ورود ممکن نشد");
      toast.error(translateError(msg));
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: () => checkOut(),
    onSuccess: (data) => {
      queryClient.setQueryData(["today-attendance"], data);
      queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
      toast.success(t("خروج شما ثبت شد"));
    },
    onError: () => toast.error(t("ثبت خروج ممکن نشد")),
  });

  // Timer Mutations
  const startTimerMutation = useMutation({
    mutationFn: (taskId: string) => startTimer(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("زمان‌سنج شروع شد"));
    },
    onError: () => toast.error(t("شروع زمان‌سنج ممکن نشد")),
  });

  const stopTimerMutation = useMutation({
    mutationFn: (timerId?: string) => stopTimer(timerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("زمان‌سنج متوقف شد"));
    },
    onError: () => toast.error(t("توقف زمان‌سنج ممکن نشد")),
  });

  // Mark Done Mutation
  const markDoneMutation = useMutation({
    mutationFn: (taskId: string) => updateTask(taskId, { is_finished: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("تسک انجام شد؛ خسته نباشید!"));
    },
    onError: () => toast.error(t("ثبت انجام‌شدن تسک ممکن نشد")),
  });

  const displayName = user?.first_name || user?.username || t("دوست من");
  const allTasks: EmployeeTaskSummary[] = useMemo(() => {
    if (!dashboard) return [];
    return [
      ...(dashboard.overdue_tasks?.map((t: EmployeeTaskSummary) => ({ ...t, is_overdue: true })) || []),
      ...(dashboard.upcoming_tasks?.map((t: EmployeeTaskSummary) => ({ ...t, is_overdue: false })) || []),
    ];
  }, [dashboard]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="personal-coastal-page space-y-6 pb-12"
    >
      {/* ─── 1. Header Bar with Greetings & Quick Actions ─── */}
      <div className="heledone-welcome relative min-h-[138px] overflow-hidden rounded-2xl border border-[#DCE6E2] bg-[#FFF8EE] shadow-sm">
        <img src="/images/heledone-assets/coastal-welcome.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-left" />
        <div className="relative z-10 flex h-full flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="ms-auto max-w-[52%] text-end">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-base-content sm:text-2xl">
              {t("سلام")} {displayName}{t("، روزت به‌خیر")}</h1>
          </div>
          <p className="mt-0.5 text-xs text-heledone-ink-muted">
            {formatDay()}  {t("· امروز را با هم پیش می‌بریم.")}</p>
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
          {/* Check In / Out Button */}
          {isCheckedIn ? (
            <button
              type="button"
              onClick={() => checkOutMutation.mutate()}
              disabled={checkOutMutation.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-error/20 bg-error/10 px-3.5 text-xs font-bold text-error hover:bg-error/20 transition-all"
            >
              <LogoutCurve size={15} />
              <span>{t("ثبت خروج")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => checkInMutation.mutate()}
              disabled={checkInMutation.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-success/20 bg-success/10 px-3.5 text-xs font-bold text-success dark:text-success hover:bg-success/20 transition-all"
            >
              <User size={15} />
              <span>{t("ثبت ورود")}</span>
            </button>
          )}

          {/* Log Standup Button */}
          <button
            type="button"
            onClick={() => setStandupOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/95 transition-all"
          >
            <TickCircle size={15} />
            <span>
              {dashboard?.today_standup ? t("ویرایش گزارش روزانه") : t("ثبت گزارش روزانه")}
            </span>
          </button>
        </div>

      {/* ─── 2. Top Metrics Grid (4 Summary Cards) ─── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Attendance */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("حضور و کارکرد")}</span>
            <Clock size={16} className="text-primary" />
          </div>
          <p className="mt-2 text-base font-bold text-base-content">
            {isCheckedIn ? t("ورود: {value0}", { value0: checkInTime }) : t("ورود ثبت نشده")}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-heledone-ink-muted">
            {isCheckedIn
              ? t("زمان کار امروز آغاز شده است")
              : t("برای آغاز کار، ورود را ثبت کنید")}
          </p>
        </div>

        {/* Focus Tasks */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("تسک‌های پیش رو")}</span>
            <TaskSquare size={16} className="text-primary" />
          </div>
          <p className="mt-2 text-base font-bold text-base-content">
            {formatUiNumber(allTasks.length)} {allTasks.length === 1 ? t("تسک") : t("تسک‌ها")}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-heledone-ink-muted">
            {dashboard?.overdue_tasks?.length
              ? t("{value0} تسک عقب‌افتاده", { value0: dashboard.overdue_tasks.length })
              : t("کارها طبق برنامه پیش می‌روند")}
          </p>
        </div>

        {/* Daily Standup */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("گزارش روزانه")}</span>
            <NoteText size={16} className="text-success" />
          </div>
          <p className="mt-2 text-base font-bold text-base-content">
            {dashboard?.today_standup ? t("ثبت‌شده") : t("در انتظار")}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-heledone-ink-muted">
            {dashboard?.today_standup
              ? t("{value0} ثبت‌شده", { value0: formatDecimalHours(dashboard.today_standup.hours_worked) })
              : t("پیشرفت امروز را ثبت کنید")}
          </p>
        </div>


        {/* Weekly Hours */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("کارکرد این هفته")}</span>
            <Timer1 size={16} className="text-secondary" />
          </div>
          <p className="mt-2 text-base font-bold text-base-content">
            {formatSeconds(dashboard?.weekly_time?.total_seconds)}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-heledone-ink-muted">
            {t("{value0} ثبت کارکرد در این هفته", { value0: dashboard?.weekly_time?.total_logs ?? 0 })}
          </p>
        </div>

      </div>

      {/* ─── 3. Main Dashboard Layout (2 Columns) ─── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2 Cols wide on LG): Tasks & Projects */}
        <div className="space-y-6 lg:col-span-2">
          {/* Tasks Section */}
          <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-base-content/8 pb-3">
              <div className="flex items-center gap-2">
                <TaskSquare size={16} className="text-primary" />
                <h2 className="text-lg font-bold text-base-content uppercase tracking-wider">
                  {t("تسک‌های مهم من (")}{formatUiNumber(allTasks.length)})
                </h2>
              </div>
              <Link
                to="/tasks"
                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>{t("مشاهده کانبان")}</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            {allTasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-heledone-ink-muted">
                {t("در حال حاضر تسک فعالی به شما سپرده نشده است.")}</div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pe-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-base-content/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-base-content/20">
                {allTasks.map((t: EmployeeTaskSummary) => {
                  const isRunningTimer = dashboard?.active_timers?.some(
                    (at) => String(at.task_id) === String(t.id),
                  );

                  return (
                    <DashboardTaskCard
                       key={t.id}
                       task={t}
                       isRunningTimer={isRunningTimer || false}
                       onMarkDone={(id) => markDoneMutation.mutate(id)}
                       onStartTimer={(id) => startTimerMutation.mutate(id)}
                       onStopTimer={() => stopTimerMutation.mutate(undefined)}
                       onClickTitle={(id) => setSelectedTaskId(id)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Projects Grid */}
          {isManager && (
            <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-base-content/8 pb-3">
              <div className="flex items-center gap-2">
                <Briefcase size={16} className="text-primary" />
                <h2 className="text-lg font-bold text-base-content uppercase tracking-wider">
                  {t("پروژه‌های فعال (")}{formatUiNumber(projectsData.filter((p: any) => p.status === "active").length)})
                </h2>
              </div>
              <Link
                to="/projects"
                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>{t("همه پروژه‌ها")}</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            {projectsData.filter((p: any) => p.status === "active").length === 0 ? (
              <div className="py-8 text-center text-xs text-heledone-ink-muted">
                {t("هنوز پروژه فعالی به شما سپرده نشده است.")}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projectsData.filter((p: any) => p.status === "active").slice(0, 4).map((p: any) => {
                  const color = p.color || "#087F83";

                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-base-content/10 bg-base-100/50 backdrop-blur-md p-5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-base-content/5"
                    >
                      {/* Decorative colored glow based on project color */}
                      <div
                        className="absolute -end-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40 pointer-events-none"
                        style={{ backgroundColor: color }}
                      />

                      <div className="relative z-10 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {p.prefix && (
                            <span className="mb-2 inline-block rounded-md px-2 py-0.5 text-[13px] font-extrabold uppercase tracking-widest text-base-content bg-base-200 border border-heledone-border shadow-sm" style={{ borderInlineStart: `3px solid ${color}` }}>
                              {p.prefix}
                            </span>
                          )}
                          <h3

                            className="text-lg font-bold text-base-content break-words"
                            title={p.name}
                          >
                            {p.name}
                          </h3>
                        </div>
                        <span className="shrink-0 rounded-full bg-base-200 px-2 py-1 text-[13px] font-bold uppercase tracking-wider text-base-content/70">
                          {p.status}
                        </span>
                      </div>

                      <div className="relative z-10 mt-6 flex items-end justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[13px] font-bold text-heledone-ink-muted uppercase tracking-wider">
                            {t("پیشرفت تسک‌ها")}</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-base-content">
                              {formatUiNumber(Math.round(((p.task_count || 0) * (p.progress_percentage || 0)) / 100))}
                            </span>
                            <span className="text-[13px] font-bold text-heledone-ink-muted">
                              / {p.task_count || 0}  {t("Done")}</span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <ProgressRing radius={28} stroke={4} progress={p.progress_percentage || 0} color={color} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>

        {/* Right Column: Standup, Blockers & Tickets */}
        <div className="space-y-6">
          {/* Daily Standup Widget */}
          <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-base-content uppercase tracking-wider">
                {t("گزارش امروز")}</h3>
              <button
                type="button"
                onClick={() => setStandupOpen(true)}
                className="text-xs font-bold text-primary hover:underline"
              >
                {dashboard?.today_standup ? t("ویرایش") : t("نوشتن")}
              </button>
            </div>

            {dashboard?.today_standup ? (
              <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-bold text-success dark:text-success">
                  <span>
                    {t("ثبت‌شده:")}{" "}
                    {formatDecimalHours(dashboard.today_standup.hours_worked)}
                  </span>
                  <TickCircle size={15} />
                </div>
                {dashboard.today_standup.today_work && (
                  <p

                    className="text-base-content/75 text-[13px] line-clamp-2"
                  >
                    {dashboard.today_standup.today_work}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-base-content/15 p-4 text-center">
                <p className="text-xs text-heledone-ink-muted">
                  {t("گزارش امروز را هنوز ثبت نکرده‌اید.")}</p>
                <button
                  type="button"
                  onClick={() => setStandupOpen(true)}
                  className="mt-2.5 inline-flex h-8 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-content"
                >
                  <Add size={14} />  {t("ثبت گزارش روزانه")}</button>
              </div>
            )}
          </div>

          {/* Blocked Tasks Widget */}
          {dashboard?.blocked_tasks && dashboard.blocked_tasks.length > 0 && (
            <div className="rounded-2xl border border-error/20 bg-error/5 p-5 space-y-3">
              <div className="flex items-center gap-2 text-error dark:text-error">
                <Danger size={16} />
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  {t("تسک‌های مسدود (")}{formatUiNumber(dashboard.blocked_tasks.length)})
                </h3>
              </div>
              <p className="text-sm text-error">{t("علت مانع را بررسی و قدم بعدی را با مسئول تسک هماهنگ کنید.")}</p>
              <div className="space-y-2">
                {dashboard.blocked_tasks.map((t: any) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-error/20 bg-base-100 p-2.5 text-xs"
                  >
                    <p

                      className="font-bold text-base-content break-words"
                    >
                      {t.title}
                    </p>
                    {t.blockers_reason && (
                      <p

                        className="mt-0.5 text-[13px] text-error font-medium break-words"
                      >
                        {t.blockers_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Support Tickets Widget */}
          {isManager && (
            <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-base-content uppercase tracking-wider">
                {t("درخواست‌های پشتیبانی")}</h3>
              <Link
                to="/tickets"
                className="text-xs font-bold text-primary hover:underline"
              >
                {t("مشاهده همه")}</Link>
            </div>

            {openTickets.length === 0 ? (
              <p className="py-4 text-center text-xs text-heledone-ink-muted">
                {t("در حال حاضر درخواست بازی ندارید.")}</p>
            ) : (
              <div className="space-y-2">
                {openTickets.slice(0, 3).map((t: any) => (
                  <div
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-base-content/6 bg-base-200/40 p-2.5 text-xs cursor-pointer hover:bg-base-200/70 transition"
                  >
                    <div className="min-w-0">
                      <p

                        className="font-bold text-base-content truncate"
                      >
                        {t.subject || t.title}
                      </p>
                      <span className="text-[13px] text-heledone-ink-muted capitalize">
                        {t.status}
                      </span>
                    </div>
                    <ArrowRight
                      size={13}
                      className="shrink-0 text-heledone-ink-muted"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {!isManager && (
        <div className="mt-6">
          <StandupMatrix forceSelfView={true} />
        </div>
      )}

      {/* Standup & Task Modals */}
      <StandupModal
        isOpen={isStandupOpen}
        onClose={() => {
          setStandupOpen(false);
          queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
        }}
        onSaved={() => {
          setStandupOpen(false);
          queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
        }}
        entryId={dashboard?.today_standup?.id}
        projectId={dashboard?.today_standup?.project}
        date={dashboard?.today_standup?.date}
        initial={
          dashboard?.today_standup
            ? {
                hoursWorked: String(dashboard.today_standup.hours_worked),
                todayWork: dashboard.today_standup.today_work,
                blockers: dashboard.today_standup.blockers ?? "",
              }
            : undefined
        }
      />
      <TaskSheet
        task={taskQuery.data ?? null}
        onClose={() => setSelectedTaskId(null)}
        onPatch={(taskId, patch) => {
          queryClient.setQueryData(["task", String(taskId)], (old: any) =>
            old ? { ...old, ...patch } : old
          );
          queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
    </motion.div>
  );
};

export default UserDashboardPage;

function DashboardTaskCard({
  task,
  isRunningTimer,
  onMarkDone,
  onStartTimer,
  onStopTimer,
  onClickTitle,
}: {
  task: EmployeeTaskSummary;
  isRunningTimer: boolean;
  onMarkDone: (id: string) => void;
  onStartTimer: (id: string) => void;
  onStopTimer: () => void;
  onClickTitle: (id: string) => void;
}) {
  const t = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isOverdue = task.is_overdue;

  return (
    <motion.div
      layout
      className="group relative overflow-hidden rounded-xl border border-base-content/6 bg-base-200/40 hover:bg-base-200/70 transition-all"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 relative z-10 cursor-pointer" onClick={() => setExpanded(!expanded)}>
         {/* Checkbox and Title */}
         <div className="flex items-center gap-3 min-w-0">
           <button
             type="button"
             onClick={(e) => { e.stopPropagation(); onMarkDone(String(task.id)); }}
             className={`size-4.5 rounded-md border shrink-0 transition ${
                isOverdue ? "border-error/30 bg-base-100 hover:border-error" : "border-heledone-ink-muted bg-base-100 hover:border-primary"
             }`}
             title={t("ثبت انجام‌شدن")}
           />
           <div className="min-w-0">
             <div className="flex items-center gap-2">
               <p

                 onClick={(e) => { e.stopPropagation(); onClickTitle(String(task.id)); }}
                 className="font-bold break-words hover:underline text-base-content hover:text-primary"
               >
                 {task.title}
               </p>
             </div>

             <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-heledone-ink-muted">
               {task.project_name && (
                 <span className="font-semibold text-primary">
                   {task.project_name}
                 </span>
               )}
               {task.priority && (
                 <span className="capitalize font-semibold text-warning">
                   • {{ low: t("کم"), medium: t("متوسط"), high: t("بالا"), critical: t("فوری") }[task.priority]}
                 </span>
               )}
               {task.due_date && (
                 <div className="flex items-center gap-1 font-semibold ms-1">
                   <Clock size={10} className={isOverdue ? "text-error" : "text-heledone-ink-muted"} />
                   <span className={isOverdue ? "text-error" : "text-heledone-ink-muted"}>
                     {formatDisplayDate(task.due_date, "yyyy-MM-dd")}
                   </span>
                 </div>
               )}
             </div>
           </div>
         </div>

         {/* Timer and Expand indicator */}
         <div className="flex items-center gap-2 shrink-0">
           <div onClick={(e) => e.stopPropagation()}>
             {isRunningTimer ? (
                <button
                  type="button"
                  onClick={() => onStopTimer()}
                  className="inline-flex h-7 items-center gap-1 rounded-lg bg-error/10 px-2.5 text-[13px] font-bold text-error hover:bg-error/20"
                >
                  <Stop size={12} variant="Bold" />
                  <span>{t("توقف")}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartTimer(String(task.id))}
                  aria-label={t("شروع زمان‌سنج تمرکز")}
                  title={t("شروع زمان‌سنج تمرکز")}
                  className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                >
                  <Play size={12} variant="Bold" />
                </button>
              )}
           </div>
           <ArrowDown2 size={14} className={`text-heledone-ink-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
         </div>
      </div>

      {/* Expanded Content: Action Buttons */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-base-content/5 bg-base-100/50"
          >
            <div className="flex items-center gap-2 p-2">
              <button
                type="button"
                onClick={() => onClickTitle(String(task.id))}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-base-content/10 bg-base-100 py-1.5 text-[13px] font-bold text-base-content hover:bg-base-200/50"
              >
                <Maximize4 size={14} />
                <span>{t("باز کردن تسک")}</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-base-content/10 bg-base-100 p-1.5 text-base-content/70 hover:bg-base-200/50"
                title={t("افزودن یادداشت")}
              >
                <NoteAdd size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
