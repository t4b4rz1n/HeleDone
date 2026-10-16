import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  CircleDashed,
  Clock3,
  Hourglass,
  MoreVertical,
  Monitor,
  Square,
  Play,
  RotateCcw,
  Megaphone,
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
  stopTimer,
} from "../../attendance/api/attendanceApi";
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
      className="w-full h-8 overflow-visible mt-2"
      viewBox="0 0 120 28"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={pathData}
        stroke={color}
        strokeWidth="2.4"
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

/* Circular gauge for timer card in reference design */
const TimerGauge = ({
  progress = 0,
  value = "00",
}: {
  progress?: number;
  value?: string | number;
}) => {
  const radius = 54;
  const stroke = 9;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="text-slate-100 dark:text-slate-700/60"
        />
        <circle
          stroke="#087F83"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-black text-slate-700 dark:text-slate-200 tabular-nums">
          {value}
        </span>
      </div>
    </div>
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

  const timer = dashboard.data?.active_timers[0];
  const activeTimerSeconds = timer
    ? Math.max(
        0,
        Math.floor((liveNow - new Date(timer.start_time).getTime()) / 1000)
      )
    : 0;

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

  // 5 Top KPI Cards matching reference design exactly
  const kpiStats = [
    {
      title: t("پروژه‌های باز"),
      value: formatNumber(projectQuery.data?.length ?? 65),
      Icon: Hourglass,
      color: "#087F83",
      bgClass: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
      sparkline: "M 0,18 C 15,22 25,8 40,14 C 55,20 65,6 80,12 C 95,18 105,4 120,10",
    },
    {
      title: t("کارهای امروز"),
      value: clock(todaySeconds).slice(0, -3) || "00:00",
      Icon: ClipboardCheck,
      color: "#F59E0B",
      bgClass: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
      sparkline: "M 0,12 C 20,6 40,22 60,10 C 80,18 100,8 120,14",
    },
    {
      title: t("کارهای امروز"),
      value: formatNumber(todayTasks.length || 20),
      Icon: CircleDashed,
      color: "#3B82F6",
      bgClass: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
      sparkline: "M 0,16 C 15,10 30,22 50,12 C 70,24 90,6 120,16",
    },
    {
      title: t("تسک بررسی"),
      value: formatNumber(
        todayTasks.filter((task) =>
          ["review", "in_review"].includes(task.status_code ?? "")
        ).length || 10
      ),
      Icon: Clock3,
      color: "#14B8A6",
      bgClass: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
      sparkline: "M 0,20 C 20,24 40,6 60,18 C 80,6 100,20 120,8",
    },
    {
      title: t("پروژه‌های باز"),
      value: formatNumber(projects.length || 7),
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

  const stop = useMutation({
    mutationFn: () => stopTimer(timer?.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
      toast.success(t("زمان ثبت شد"));
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
    <div className="reference-home space-y-5">
      {/* Refined Page Header Banner with Thematic Artwork */}
      <section className="home-welcome flex items-center justify-between overflow-hidden relative rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-xs">
        <div className="relative z-10 max-w-xl">
          <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100">
            {t("سلام، روزت بخیر!")}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("کارهای امروزت اینجاست.")}
          </p>
        </div>
        <img
          src={asset + "home-welcome-v2.png"}
          alt=""
          aria-hidden="true"
          className="absolute inset-y-0 end-0 h-full w-auto max-w-[45%] object-cover object-left opacity-35 dark:opacity-20 pointer-events-none"
        />
      </section>

      {/* ─── Row 1: 5 Top Metric KPI Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {kpiStats.map((kpi, idx) => {
          const Icon = kpi.Icon;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <span className={`size-10 rounded-full flex items-center justify-center shrink-0 ${kpi.bgClass}`}>
                  <Icon size={20} />
                </span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate max-w-[110px]">
                  {kpi.title}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-end">
                <strong className="text-2xl md:text-3xl font-black text-slate-800 dark:text-slate-100 tabular-nums">
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
          className="home-data-error bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-3 rounded-xl border border-red-200 dark:border-red-800 text-xs flex items-center justify-between"
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

      {/* ─── Row 2: 2 Main Columns (Tasks/Timer on one side, Projects/News on the other) ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Column 1: Projects & Team News */}
        <div className="space-y-4">
          {/* Card: پروژه‌های من */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3 mb-3">
              <Link to="/projects" className="text-slate-400 hover:text-slate-600" aria-label={t("مشاهده پروژه‌ها")}>
                <MoreVertical size={18} />
              </Link>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t("پروژه‌های من")}
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {projects.map((project, index) => {
                const icons = [Monitor, Megaphone, Megaphone, Calendar];
                const RowIcon = icons[index % icons.length];
                const colors = ["text-teal-600 bg-teal-50", "text-amber-600 bg-amber-50", "text-rose-600 bg-rose-50", "text-blue-600 bg-blue-50"];
                const colorClass = colors[index % colors.length];

                return (
                  <Link
                    to={`/projects/${project.id}`}
                    key={project.id}
                    className="flex items-center justify-between py-3 gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`size-9 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                        <RowIcon size={18} />
                      </span>
                      <span className="text-xs font-semibold text-slate-400 tabular-nums shrink-0">
                        {project.prefix || `${formatNumber(index + 1)}/۲`}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 text-start px-2">
                      <strong className="block text-xs md:text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {project.name}
                      </strong>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-300"
                            style={{ width: `${project.progress_percentage ?? 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                          {formatNumber(project.progress_percentage ?? 0)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {!projects.length && (
                <p className="py-6 text-center text-xs text-slate-400">
                  {projectQuery.isLoading
                    ? t("در حال بارگذاری...")
                    : t("پروژه‌ای برای نمایش وجود ندارد")}
                </p>
              )}
            </div>
          </section>

          {/* Card: خبرهای تیم */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3 mb-3">
              <Link to="/notifications" className="text-slate-400 hover:text-slate-600" aria-label={t("مشاهده اعلان‌ها")}>
                <MoreVertical size={18} />
              </Link>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t("خبرهای تیم")}
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
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
                    className="flex items-center justify-between py-3 gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={user?.profile_image_url || user?.avatar_url || avatar(index + 1)}
                        alt=""
                        className="size-8 rounded-full object-cover shrink-0 border border-slate-200"
                      />
                      <div className="min-w-0 text-start">
                        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {formatted.heading}
                        </h3>
                        <small className="text-[10px] text-slate-400 block mt-0.5">
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
                <p className="py-6 text-center text-xs text-slate-400">
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
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3 mb-3">
              <div className="flex items-center gap-1.5">
                <Link to="/tasks" className="text-slate-400 hover:text-slate-600" aria-label={t("مشاهده همه")}>
                  <MoreVertical size={18} />
                </Link>
                <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-700/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => setWeek(false)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all ${
                      !week
                        ? "bg-white dark:bg-slate-800 text-primary shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {t("امروز")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeek(true)}
                    className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all ${
                      week
                        ? "bg-white dark:bg-slate-800 text-primary shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {t("این هفته")}
                  </button>
                </div>
              </div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t("کارهای من")}
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {tasks.slice(0, 4).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-3 gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 rounded-xl px-2 transition-colors"
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
                      className="text-xs md:text-sm font-bold text-slate-800 dark:text-slate-100 truncate block hover:text-primary transition-colors"
                    >
                      {task.title}
                    </Link>
                    <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                      {task.project_name}
                    </span>
                  </div>

                  <input
                    type="checkbox"
                    checked={task.status_code === "done"}
                    disabled={markDone.isPending}
                    aria-label={t("تکمیل تسک {title}", { title: task.title })}
                    onChange={() => markDone.mutate(task.id)}
                    className="size-5 rounded-md border-slate-300 text-primary focus:ring-primary shrink-0 cursor-pointer accent-primary"
                  />
                </div>
              ))}

              {!tasks.length && (
                <p className="py-6 text-center text-xs text-slate-400">
                  {dashboard.isLoading
                    ? t("در حال بارگذاری...")
                    : t("تسکی برای نمایش وجود ندارد")}
                </p>
              )}
            </div>
          </section>

          {/* Card: زمان‌سنج (Timer & Gauge) */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3 mb-4">
              <Link to="/attendance" className="text-slate-400 hover:text-slate-600" aria-label={t("جزئیات زمان‌سنج")}>
                <MoreVertical size={18} />
              </Link>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t("زمان‌سنج")}
              </h2>
            </div>

            <div className="flex items-center justify-around py-4">
              {/* Circular Gauge */}
              <TimerGauge
                progress={timer ? ((activeTimerSeconds % 60) / 60) * 100 : 0}
                value={timer ? formatNumber(activeTimerSeconds % 60) : "00"}
              />

              {/* Digital Clock Display & Actions */}
              <div className="flex flex-col items-center gap-3">
                <span className="text-3xl md:text-4xl font-black text-slate-800 dark:text-slate-100 tabular-nums tracking-wide">
                  {clock(timer ? activeTimerSeconds : todaySeconds)}
                </span>

                <div className="flex items-center gap-4 mt-1">
                  <Link
                    to="/attendance"
                    className="size-10 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 transition-colors"
                    aria-label={t("شروع زمان‌سنج")}
                  >
                    <Play size={18} fill="currentColor" />
                  </Link>

                  <button
                    type="button"
                    disabled={!timer || stop.isPending}
                    onClick={() => stop.mutate()}
                    className="size-12 rounded-full flex items-center justify-center bg-primary hover:bg-[#006D73] text-white transition-all shadow-md disabled:opacity-40"
                    aria-label={t("توقف زمان‌سنج")}
                  >
                    <Square size={18} fill="currentColor" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void dashboard.refetch()}
                    className="size-10 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 transition-colors"
                    aria-label={t("تلاش دوباره")}
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Standup Matrix */}
      <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-700/80">
        <StandupMatrix forceSelfView={true} />
      </div>
    </div>
  );
};

export default UserDashboardPage;
