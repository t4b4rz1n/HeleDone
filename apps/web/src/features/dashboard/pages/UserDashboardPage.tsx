import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  Clock3,
  Hourglass,
  MoreVertical,
  Monitor,
  LogIn,
  LogOut,
  Megaphone,
  FolderOpen,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  useTranslation,
  formatNumber,
  formatRelativeTime,
  useLocale,
} from "../../../i18n/locale";
import { getEmployeeDashboard } from "../api/dashboardApi";
import {
  getTimeOffRequests,
  checkIn,
  checkOut,
  getTodayAttendance,
  getOrganizations,
} from "../../attendance/api/attendanceApi";
import { useAttendanceStore } from "../../attendance/store/useAttendanceStore";
import { getProjects, getProjectMembers } from "../../projects/api/projectsApi";
import { getNotificationHistory } from "../../notifications/api/notificationsApi";
import { buildNotificationLink } from "../../notifications/utils/routing";
import { formatNotificationMessage } from "../../notifications/utils/messages";
import { useAuthStore } from "../../auth/store/authStore";
import { getErrorMessage } from "../../../core/utils/errorHandler";
import ApiService from "../../../core/api/apiService";
import type { EmployeeTaskSummary } from "../types";
import { StandupMatrix } from "../../tasks/components/StandupMatrix";
import "../home.css";

const asset = "/images/heledone-assets/";
const avatar = (id: number) => asset + `avatar-${String(id).padStart(2, "0")}.png`;
const taskLink = (task: EmployeeTaskSummary) =>
  `/tasks?project=${encodeURIComponent(task.project_id ?? "")}&board=${encodeURIComponent(
    task.board_id ?? ""
  )}&task=${encodeURIComponent(task.id)}`;

/* Smooth SVG sparkline curve for the KPI cards */
const Sparkline = ({
  color = "#087F83",
  pathData = "M 0,18 C 15,22 25,8 40,14 C 55,20 65,6 80,12 C 95,18 105,4 120,10",
}: {
  color?: string;
  pathData?: string;
}) => {
  const rawId = useId();
  const id = "sparkline-" + rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      className="w-full h-7 overflow-visible mt-2"
      viewBox="0 0 120 28"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={pathData}
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`${pathData} L 120,28 L 0,28 Z`}
        fill={`url(#${id})`}
      />
    </svg>
  );
};

/* Attendance check-in / check-out widget */
const HomeAttendanceCard = () => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useAttendanceStore();

  const orgsQuery = useQuery({
    queryKey: ["user-organizations"],
    queryFn: getOrganizations,
    enabled: !activeOrganizationId,
    staleTime: 60_000,
  });

  const resolvedOrgId: string | undefined =
    activeOrganizationId || orgsQuery.data?.[0]?.id;

  const {
    data: todayAttendance,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["today-attendance"],
    queryFn: getTodayAttendance,
    retry: false,
  });

  const [timer, setTimer] = useState(0);
  const attendanceData = (todayAttendance as any)?.data ?? todayAttendance;
  const isActive = attendanceData?.is_active || false;

  useEffect(() => {
    setTimer(attendanceData?.total_seconds || 0);

    const interval = setInterval(() => {
      const now = Date.now();
      const todayStr = new Date(now).toISOString().slice(0, 10);

      if (attendanceData?.date && attendanceData.date !== todayStr) {
        queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
        clearInterval(interval);
        return;
      }

      if (isActive && attendanceData?.active_session_start) {
        const startTime = new Date(attendanceData.active_session_start).getTime();
        const diffSeconds = Math.floor((now - startTime) / 1000);
        setTimer((attendanceData.base_total_seconds || 0) + diffSeconds);
      } else if (!isActive) {
        setTimer(attendanceData?.total_seconds || 0);
      }
    }, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    isActive,
    attendanceData?.date,
    attendanceData?.total_seconds,
    attendanceData?.active_session_start,
    attendanceData?.base_total_seconds,
    dataUpdatedAt,
    queryClient,
  ]);

  const checkInMutation = useMutation({
    mutationFn: (organizationId: string) => checkIn(organizationId),
    onSuccess: (data) => {
      queryClient.setQueryData(["today-attendance"], data);
      queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
      toast.success(t("ورود شما با موفقیت ثبت شد"));
    },
    onError: (error: any) =>
      toast.error(
        getErrorMessage(error?.detail || error?.message || "امکان ثبت ورود وجود ندارد.")
      ),
  });

  const checkOutMutation = useMutation({
    mutationFn: checkOut,
    onSuccess: (data) => {
      queryClient.setQueryData(["today-attendance"], data);
      queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
      toast.success(t("خروج شما با موفقیت ثبت شد"));
    },
    onError: (error: any) =>
      toast.error(
        getErrorMessage(error?.detail || error?.message || "امکان ثبت خروج وجود ندارد.")
      ),
  });

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section className="bg-base-100 rounded-2xl border border-base-300 p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-base-200 pb-3 mb-4">
        <Link
          to="/attendance"
          className="text-heledone-ink-muted hover:text-base-content transition-colors flex items-center gap-1 text-xs font-semibold"
          aria-label={t("مشاهده کارکرد کامل")}
        >
          <span>{t("مشاهده جزئیات")}</span>
          <MoreVertical size={16} />
        </Link>
        <h2 className="text-sm font-bold text-base-content flex items-center gap-2">
          <span>{t("ثبت حضور و غیاب")}</span>
          <Clock3 size={17} className="text-primary" />
        </h2>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
        {/* Status and live time */}
        <div className="flex items-center gap-3.5">
          <div
            className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isActive
                ? "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400"
                : "bg-base-200 text-heledone-ink-muted"
            }`}
          >
            {isActive ? <LogIn size={22} /> : <LogOut size={22} />}
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span
                className={`home-attendance-pulse ${
                  isActive ? "bg-emerald-500 text-emerald-500" : "bg-slate-400 text-slate-400"
                }`}
              />
              <span className="text-xs font-bold text-base-content">
                {isActive ? t("در حال حاضر حاضر هستید") : t("ثبت خروج شده‌اید")}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xs font-medium text-heledone-ink-muted">
                {t("کارکرد امروز:")}
              </span>
              <span className="text-xl md:text-2xl font-black text-base-content tabular-nums tracking-wide">
                {isLoading ? "--:--:--" : formatTimer(timer)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="w-full sm:w-auto">
          {!isActive ? (
            <button
              type="button"
              disabled={checkInMutation.isPending}
              onClick={() =>
                resolvedOrgId
                  ? checkInMutation.mutate(resolvedOrgId)
                  : toast.warning(t("سازمان فعالی انتخاب نشده است"))
              }
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary hover:bg-[#006D73] text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-sm active:scale-98 disabled:opacity-50"
            >
              <LogIn size={18} />
              <span>{checkInMutation.isPending ? t("در حال ثبت...") : t("ثبت ورود (شروع کار)")}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={checkOutMutation.isPending}
              onClick={() => checkOutMutation.mutate()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all shadow-sm active:scale-98 disabled:opacity-50"
            >
              <LogOut size={18} />
              <span>{checkOutMutation.isPending ? t("در حال ثبت...") : t("ثبت خروج (پایان کار)")}</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export const UserDashboardPage = () => {
  const t = useTranslation();
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [week, setWeek] = useState(false);
  const [liveNow, setLiveNow] = useState(Date.now());

  const dashboard = useQuery({
    queryKey: ["home-dashboard", user?.id, locale],
    queryFn: () =>
      getEmployeeDashboard(Intl.DateTimeFormat().resolvedOptions().timeZone),
    enabled: !!user?.id,
  });

  const projectQuery = useQuery({
    queryKey: ["home-projects", user?.id, locale],
    queryFn: () => getProjects(),
    enabled: !!user?.id,
  });

  const requests = useQuery({
    queryKey: ["home-requests", user?.id, locale],
    queryFn: () => getTimeOffRequests({ user: user?.id }),
    enabled: !!user?.id,
  });

  const news = useQuery({
    queryKey: ["home-news", user?.id, locale],
    queryFn: async () =>
      (await getNotificationHistory(new URLSearchParams("page_size=5"))).data.results,
    enabled: !!user?.id,
  });

  const projects = useMemo(
    () =>
      [...(projectQuery.data ?? [])]
        .filter((project) => project.status !== "archived")
        .sort(
          (a, b) =>
            (b.progress_percentage ?? 0) - (a.progress_percentage ?? 0)
        )
        .slice(0, 4),
    [projectQuery.data]
  );

  const projectMembers = useQuery({
    queryKey: ["home-project-members", projects.map((p) => p.id).join(",")],
    queryFn: async () =>
      Promise.all(projects.map((project) => getProjectMembers(project.id))),
    enabled: projects.length > 0,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const realTasks = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...(dashboard.data?.overdue_tasks ?? []),
            ...(dashboard.data?.upcoming_tasks ?? []),
          ].map((task) => [task.id, task])
        ).values()
      ),
    [dashboard.data]
  );

  const today = new Date().toDateString();
  const weekEnd = Date.now() + 7 * 86400000;
  const todayTasks = realTasks.filter((task) => {
    if (!task.due_date) return true;
    const due = new Date(task.due_date);
    return due.toDateString() === today || due.getTime() < Date.now();
  });
  const tasks = week
    ? realTasks.filter(
        (task) => !task.due_date || new Date(task.due_date).getTime() <= weekEnd
      )
    : todayTasks;

  const formatNews = (item: Parameters<typeof formatNotificationMessage>[0]) => ({
    heading: formatNotificationMessage(item),
    detail: "",
  });

  const statusLabel = (task: EmployeeTaskSummary) =>
    task.status_code === "in_progress" || task.status_code === "doing"
      ? t("در حال انجام")
      : task.status_code === "review" || task.status_code === "in_review"
      ? t("در حال بررسی")
      : task.status_code === "done"
      ? t("انجام‌شده")
      : task.status_code === "todo" || task.status_code === "to_do"
      ? t("برای انجام")
      : task.status_name ?? t("برای انجام");

  const clock = (value: number) =>
    [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
      .map((n) => formatNumber(n, { minimumIntegerDigits: 2, useGrouping: false }))
      .join(":");

  const todaySeconds = dashboard.data?.attendance_today?.check_in
    ? Math.max(
        0,
        Math.round(
          ((dashboard.data.attendance_today.check_out
            ? new Date(dashboard.data.attendance_today.check_out).getTime()
            : liveNow) -
            new Date(dashboard.data.attendance_today.check_in).getTime()) /
            1000
        )
      )
    : 0;

  // 5 Top KPI Cards with distinct, accurate metrics and zero duplicate labels
  const kpiStats = [
    {
      title: t("پروژه‌های باز"),
      value: formatNumber(projectQuery.data?.length ?? 0),
      Icon: FolderOpen,
      color: "#087F83",
      bgClass: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
      sparkline: "M 0,18 C 15,22 25,8 40,14 C 55,20 65,6 80,12 C 95,18 105,4 120,10",
    },
    {
      title: t("زمان امروز"),
      value: clock(todaySeconds).slice(0, -3) || "00:00",
      Icon: Clock3,
      color: "#F59E0B",
      bgClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
      sparkline: "M 0,12 C 20,6 40,22 60,10 C 80,18 100,8 120,14",
    },
    {
      title: t("کارهای امروز"),
      value: formatNumber(todayTasks.length),
      Icon: ClipboardCheck,
      color: "#3B82F6",
      bgClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
      sparkline: "M 0,16 C 15,10 30,22 50,12 C 70,24 90,6 120,16",
    },
    {
      title: t("تسک بررسی"),
      value: formatNumber(
        todayTasks.filter((task) =>
          ["review", "in_review"].includes(task.status_code ?? "")
        ).length
      ),
      Icon: Hourglass,
      color: "#14B8A6",
      bgClass: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
      sparkline: "M 0,20 C 20,24 40,6 60,18 C 80,6 100,20 120,8",
    },
    {
      title: t("پروژه‌های من"),
      value: formatNumber(projects.length),
      Icon: Monitor,
      color: "#0284C7",
      bgClass: "bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400",
      sparkline: "M 0,14 C 20,20 40,6 60,14 C 80,22 100,10 120,16",
    },
  ];

  const markDone = useMutation({
    mutationFn: (id: string) => ApiService.post(`/tasks/${id}/mark-done/`, {}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["home-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["home-projects"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.success(t("تسک انجام شد"));
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const primaryError =
    dashboard.isError ||
    projectQuery.isError ||
    requests.isError ||
    news.isError ||
    projectMembers.isError;

  return (
    <div className="reference-home space-y-4">
      {/* High-Contrast Coastal Welcome Header Banner */}
      <section className="home-welcome">
        <img
          src={asset + "home-welcome-v2.png"}
          alt=""
          aria-hidden="true"
          className="home-welcome-art"
        />
        <div className="home-welcome-overlay" />
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              {t("میز کار هله‌دان")}
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-base-content tracking-tight">
            {t("سلام، روزت بخیر!")}
          </h1>
          <p className="text-xs md:text-sm font-medium text-heledone-ink-muted mt-1 leading-relaxed">
            {t("کارهای امروزت اینجاست.")}
          </p>
        </div>
      </section>

      {/* ─── Row 1: 5 Top Metric KPI Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {kpiStats.map((kpi, idx) => {
          const Icon = kpi.Icon;
          return (
            <div
              key={idx}
              className="bg-base-100 rounded-2xl border border-base-300 p-4 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <span className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${kpi.bgClass}`}>
                  <Icon size={19} />
                </span>
                <span className="text-xs font-bold text-heledone-ink-muted truncate max-w-[110px]">
                  {kpi.title}
                </span>
              </div>
              <div className="mt-2.5 flex items-baseline justify-end">
                <strong className="text-2xl md:text-3xl font-black text-base-content tabular-nums">
                  {kpi.value}
                </strong>
              </div>
              <Sparkline color={kpi.color} pathData={kpi.sparkline} />
            </div>
          );
        })}
      </div>

      {primaryError && (
        <div
          className="home-data-error bg-error/10 text-error p-3.5 rounded-xl border border-error/20 text-xs flex items-center justify-between"
          role="alert"
        >
          <span>{t("دریافت اطلاعات با مشکل مواجه شد")}</span>
          <button
            type="button"
            className="underline font-bold"
            onClick={() => {
              void dashboard.refetch();
              void projectQuery.refetch();
              void requests.refetch();
              void news.refetch();
              void projectMembers.refetch();
            }}
          >
            {t("تلاش دوباره")}
          </button>
        </div>
      )}

      {/* ─── Row 2: 2 Balanced Columns ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Column 1: Projects & Team News */}
        <div className="space-y-4">
          {/* Card: پروژه‌های من */}
          <section className="bg-base-100 rounded-2xl border border-base-300 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-base-200 pb-3 mb-3">
              <Link
                to="/projects"
                className="text-heledone-ink-muted hover:text-base-content transition-colors"
                aria-label={t("مشاهده پروژه‌ها")}
              >
                <MoreVertical size={18} />
              </Link>
              <h2 className="text-sm font-bold text-base-content">
                {t("پروژه‌های من")}
              </h2>
            </div>

            <div className="divide-y divide-base-200">
              {projects.map((project, index) => {
                const icons = [Monitor, Megaphone, FolderOpen, Calendar];
                const RowIcon = icons[index % icons.length];
                const colors = [
                  "text-teal-600 bg-teal-50 dark:bg-teal-950/40",
                  "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
                  "text-rose-600 bg-rose-50 dark:bg-rose-950/40",
                  "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
                ];
                const colorClass = colors[index % colors.length];

                return (
                  <Link
                    to={`/projects/${project.id}`}
                    key={project.id}
                    className="flex items-center justify-between py-3 gap-3 hover:bg-base-200/60 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                        <RowIcon size={16} />
                      </span>
                      <span className="text-xs font-semibold text-heledone-ink-muted tabular-nums shrink-0">
                        {project.prefix || `${formatNumber(index + 1)}/۲`}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 text-start px-2">
                      <strong className="block text-xs md:text-sm font-bold text-base-content truncate">
                        {project.name}
                      </strong>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="w-full bg-base-300 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-300"
                            style={{ width: `${project.progress_percentage ?? 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-heledone-ink-muted shrink-0 tabular-nums">
                          {formatNumber(project.progress_percentage ?? 0)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {!projects.length && (
                <p className="py-6 text-center text-xs text-heledone-ink-muted">
                  {projectQuery.isLoading
                    ? t("در حال بارگذاری...")
                    : t("پروژه‌ای برای نمایش وجود ندارد")}
                </p>
              )}
            </div>
          </section>

          {/* Card: خبرهای تیم */}
          <section className="bg-base-100 rounded-2xl border border-base-300 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-base-200 pb-3 mb-3">
              <Link
                to="/notifications"
                className="text-heledone-ink-muted hover:text-base-content transition-colors"
                aria-label={t("مشاهده اعلان‌ها")}
              >
                <MoreVertical size={18} />
              </Link>
              <h2 className="text-sm font-bold text-base-content">
                {t("خبرهای تیم")}
              </h2>
            </div>

            <div className="divide-y divide-base-200">
              {news.data?.slice(0, 3).map((item, index) => {
                const formatted = formatNews(item);
                return (
                  <Link
                    to={
                      item.link?.startsWith("/")
                        ? buildNotificationLink(item.link)
                        : "/notifications"
                    }
                    key={item.id}
                    className="flex items-center justify-between py-3 gap-3 hover:bg-base-200/60 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={user?.profile_image_url || user?.avatar_url || avatar(index + 1)}
                        alt=""
                        className="size-8 rounded-full object-cover shrink-0 border border-base-300"
                      />
                      <div className="min-w-0 text-start">
                        <h3 className="text-xs font-bold text-base-content truncate">
                          {formatted.heading}
                        </h3>
                        <small className="text-[10px] text-heledone-ink-muted block mt-0.5">
                          {formatRelativeTime(item.created_at)}
                        </small>
                      </div>
                    </div>
                    <img
                      src={avatar(index + 2)}
                      alt=""
                      className="size-7 rounded-full object-cover shrink-0"
                    />
                  </Link>
                );
              })}

              {!news.data?.length && (
                <p className="py-6 text-center text-xs text-heledone-ink-muted">
                  {news.isLoading
                    ? t("در حال بارگذاری...")
                    : t("خبری برای نمایش وجود ندارد")}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Column 2: My Tasks & Attendance Timer */}
        <div className="space-y-4">
          {/* Card: کارهای من */}
          <section className="bg-base-100 rounded-2xl border border-base-300 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-base-200 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Link
                  to="/tasks"
                  className="text-heledone-ink-muted hover:text-base-content transition-colors"
                  aria-label={t("مشاهده همه")}
                >
                  <MoreVertical size={18} />
                </Link>
                <div className="flex items-center rounded-lg bg-base-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setWeek(false)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all ${
                      !week
                        ? "bg-base-100 text-primary shadow-xs"
                        : "text-heledone-ink-muted hover:text-base-content"
                    }`}
                  >
                    {t("امروز")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeek(true)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all ${
                      week
                        ? "bg-base-100 text-primary shadow-xs"
                        : "text-heledone-ink-muted hover:text-base-content"
                    }`}
                  >
                    {t("این هفته")}
                  </button>
                </div>
              </div>
              <h2 className="text-sm font-bold text-base-content">
                {t("کارهای من")}
              </h2>
            </div>

            <div className="divide-y divide-base-200">
              {tasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-3 gap-3 hover:bg-base-200/60 rounded-xl px-2 transition-colors"
                >
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      task.priority === "high"
                        ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                        : task.priority === "urgent"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400"
                    }`}
                  >
                    {statusLabel(task)}
                  </span>

                  <div className="flex-1 min-w-0 text-start px-2">
                    <Link
                      to={taskLink(task)}
                      className="text-xs md:text-sm font-bold text-base-content truncate block hover:text-primary transition-colors"
                    >
                      {task.title}
                    </Link>
                    <span className="text-[10px] text-heledone-ink-muted block truncate mt-0.5">
                      {task.project_name}
                    </span>
                  </div>

                  <input
                    type="checkbox"
                    checked={task.status_code === "done"}
                    disabled={markDone.isPending}
                    aria-label={t("تکمیل تسک {title}", { title: task.title })}
                    onChange={() => markDone.mutate(task.id)}
                    className="size-5 rounded-md border-base-300 text-primary focus:ring-primary shrink-0 cursor-pointer accent-primary"
                  />
                </div>
              ))}

              {!tasks.length && (
                <p className="py-6 text-center text-xs text-heledone-ink-muted">
                  {dashboard.isLoading
                    ? t("در حال بارگذاری...")
                    : t("تسکی برای نمایش وجود ندارد")}
                </p>
              )}
            </div>
          </section>

          {/* Card: ثبت حضور و غیاب (Check In / Check Out) */}
          <HomeAttendanceCard />
        </div>
      </div>

      {/* Standup Matrix */}
      <div className="mt-4 pt-4 border-t border-base-300">
        <StandupMatrix forceSelfView={true} />
      </div>
    </div>
  );
};

export default UserDashboardPage;
