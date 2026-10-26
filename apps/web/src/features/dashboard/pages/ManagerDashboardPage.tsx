import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t as translate, useTranslation, useLocale } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  ArrowRight,
  Calendar,
  Flag,
  Chart21,
  CloseCircle,
  Danger,
  People,
  Refresh2,
  TaskSquare,
  TickCircle,
  Timer1,
} from "iconsax-reactjs";
import { useMemo, useState } from "react";
import { getTasks } from "../../tasks/api/tasksApi";
import type { Task } from "../../tasks/types";
import type { ComponentType, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  approveTimeOffRequest,
  getTimeOffRequests,
  rejectTimeOffRequest,
} from "../../attendance/api/attendanceApi";
import type { TimeOffRequest } from "../../attendance/types";
import {
  getManagerDashboard,
  getManagerMembers,
} from "../api/dashboardApi";
import type {
  ManagerDashboard,
  ManagerMemberDetail,
  ManagerProjectSummary,
} from "../types";

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

const formatDate = (value: string | null | undefined) => value ? formatDisplayDate(new Date(value), "MMM d") : "-";

const getInitials = (firstName?: string, lastName?: string, fallback = "?") =>
  `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || fallback;

const getHealth = (project: ManagerProjectSummary) => {
  const progress = project.total_tasks > 0 ? project.done_tasks / project.total_tasks : 0;
  const isPastDeadline = Boolean(project.deadline && new Date(project.deadline).getTime() < Date.now());
  if (project.status.toLowerCase().includes("completed")) return { label: translate("Complete"), tone: "success", progress: 1 };
  if (isPastDeadline && progress < 1) return { label: translate("Delayed"), tone: "error", progress };
  if (progress < 0.35) return { label: translate("At risk"), tone: "warning", progress };
  return { label: translate("On track"), tone: "success", progress };
};

const panelClass = "heledone-surface overflow-hidden";
const spring = { type: "spring" as const, stiffness: 360, damping: 32, bounce: 0 };

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
  icon: ComponentType<any>;
  tone?: "primary" | "warning" | "success" | "secondary" | "error";
}) => { useLocale(); return (
  <motion.section whileHover={{ y: -2 }} transition={spring} className={`${panelClass} p-5`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[13px] font-bold uppercase  text-heledone-ink-muted">{label}</p>
        <p className="mt-3 text-3xl font-black tracking-tight text-base-content">{value}</p>
        <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">{description}</p>
      </div>
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone === "warning" ? "bg-warning/10 text-warning" : tone === "success" ? "bg-success/10 text-success" : tone === "error" ? "bg-error/10 text-error" : tone === "secondary" ? "bg-secondary/10 text-secondary" : "bg-primary/10 text-primary"}`}>
        <Icon size={21} />
      </span>
    </div>
  </motion.section>
); };

const SectionHeading = ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => { useLocale(); return (
  <div className="flex flex-col gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 className="text-base font-black tracking-tight text-base-content">{title}</h2>
      <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">{description}</p>
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

const ApprovalInbox = ({ requests, isLoading, onApprove, onReject, pendingId }: { requests: TimeOffRequest[]; isLoading: boolean; onApprove: (id: string | number) => void; onReject: (id: string | number) => void; pendingId: string | number | null }) => { const t = useTranslation(); return (
  <section className={panelClass}>
    <SectionHeading title={t("Approval inbox")} description={t("Requests waiting for a decision")} action={<span className="rounded-full bg-warning/10 px-2.5 py-1 text-[13px] font-black text-warning">{formatUiNumber(requests.length)}  {t("pending")}</span>} />
    {isLoading ? <div className="space-y-3 px-5 pb-5">{[1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-base-200" />)}</div> : requests.length === 0 ? <div className="px-5 pb-6"><div className="rounded-2xl bg-success/10 p-4"><div className="flex items-center gap-2 text-sm font-black text-success"><TickCircle size={18} />  {t("Inbox is clear")}</div><p className="mt-1 text-xs font-semibold text-heledone-ink-muted">{t("No requests need your attention right now.")}</p></div></div> : <div className="divide-y divide-base-content/8">{requests.slice(0, 5).map(request => <div key={request.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-xs font-black text-secondary">{getInitials(request.user_detail?.first_name, request.user_detail?.last_name, request.user_detail?.username?.[0]?.toUpperCase())}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-base-content">{request.user_detail?.first_name || request.user_detail?.username || t("Team member")}</p><p className="mt-0.5 text-xs font-semibold capitalize text-heledone-ink-muted">{request.request_type.replace("_", " ")} · {formatDate(request.start_datetime)}</p></div></div><span className="shrink-0 rounded-full bg-warning/10 px-2 py-1 text-[13px] font-black uppercase text-warning">{t("در انتظار")}</span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-heledone-ink-muted">{request.reason || t("No reason provided.")}</p><div className="mt-3 flex items-center gap-2"><button type="button" disabled={pendingId === request.id} onClick={() => onApprove(request.id)} className="motion-interactive inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-[13px] font-black text-success hover:bg-success/15 disabled:opacity-50"><TickCircle size={14} />  {t("Approve")}</button><button type="button" disabled={pendingId === request.id} onClick={() => onReject(request.id)} className="motion-interactive inline-flex items-center gap-1.5 rounded-lg bg-error/10 px-3 py-1.5 text-[13px] font-black text-error hover:bg-error/15 disabled:opacity-50"><CloseCircle size={14} />  {t("Decline")}</button></div></div>)}</div>}
  </section>
); };

const ProjectHealth = ({ projects }: { projects: ManagerProjectSummary[] }) => { const t = useTranslation(); return (
  <section className={panelClass}>
    <SectionHeading title={t("Project health")} description={t("Where attention may be needed next")} action={<Link to="/tasks" className="motion-interactive inline-flex items-center gap-1 text-xs font-black text-primary">{t("Open workspace")} <ArrowRight size={14} /></Link>} />
    {projects.length === 0 ? <div className="px-5 pb-6 text-sm font-semibold text-heledone-ink-muted">{t("No active projects in this scope.")}</div> : <div className="grid gap-3 px-5 pb-5">{projects.slice(0, 6).map(project => { const health = getHealth(project); return <motion.div key={project.id} layout className="rounded-2xl border border-base-content/8 bg-base-200/50 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-base-content">{project.name}</p><p className="mt-1 text-[13px] font-semibold text-heledone-ink-muted">{t("Due")} {formatDate(project.deadline)} · {formatUiNumber(project.active_member_count)}  {t("contributors")}</p></div><span className={`rounded-full px-2.5 py-1 text-[13px] font-black ${health.tone === "error" ? "bg-error/10 text-error" : health.tone === "warning" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>{health.label}</span></div><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-base-100"><div className={`h-full rounded-full ${health.tone === "error" ? "bg-error text-error-content" : health.tone === "warning" ? "bg-warning text-warning-content" : "bg-success text-success-content"}`} style={{ width: `${Math.round(health.progress * 100)}%` }} /></div><span className="text-xs font-black text-heledone-ink-muted">{formatUiNumber(Math.round(health.progress * 100))}%</span></div></motion.div>; })}</div>}
  </section>
); };

const ManagerDashboardPage = () => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const timezone = useMemo(getTimezone, []);
  const managerKey = ["manager-dashboard", timezone];
  const membersKey = ["manager-members", timezone];
  const approvalsKey = ["approval-inbox"];

  const [selectedProjectId, setSelectedProjectId] = useState<string | number | "">("");

  const dashboardQuery = useQuery<ManagerDashboard>({ queryKey: managerKey, queryFn: () => getManagerDashboard(null, timezone), staleTime: 30_000, refetchInterval: 60_000 });

  // Removed useEffect that forced selecting a project
  const membersQuery = useQuery<ManagerMemberDetail[]>({ queryKey: membersKey, queryFn: () => getManagerMembers(null, timezone), enabled: dashboardQuery.isSuccess, staleTime: 30_000 });
  const approvalQuery = useQuery<TimeOffRequest[]>({ queryKey: approvalsKey, queryFn: () => getTimeOffRequests({ status: "pending" }), enabled: dashboardQuery.isSuccess, staleTime: 15_000, refetchInterval: 60_000 });

  const { data: projectTasks, isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["project-tasks", selectedProjectId],
    queryFn: () => getTasks(selectedProjectId.toString()),
    enabled: Boolean(selectedProjectId),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string | number; action: "approve" | "reject" }) => action === "approve" ? approveTimeOffRequest(id) : rejectTimeOffRequest(id, ""),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: approvalsKey });
      const previousRequests = queryClient.getQueryData<TimeOffRequest[]>(approvalsKey) || [];
      queryClient.setQueryData<TimeOffRequest[]>(approvalsKey, previousRequests.filter(request => request.id.toString() !== id.toString()));
      return { previousRequests };
    },
    onSuccess: (_data, variables) => toast.success(variables.action === "approve" ? t("Request approved") : t("Request declined")),
    onError: (error: Error & { detail?: string }, _variables, context) => { if (context?.previousRequests) queryClient.setQueryData(approvalsKey, context.previousRequests); toast.error(translateError(error.detail || error.message || "Could not update request")); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: approvalsKey }),
  });

  const dashboard = dashboardQuery.data;
  const members = membersQuery.data || [];

  const isLoading = dashboardQuery.isLoading;

  if (isLoading) return <ManagerDashboardSkeleton />;

  if (dashboardQuery.isError || !dashboard) return <section className="mx-auto max-w-2xl py-14"><div className={`${panelClass} p-8 text-center`}><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-warning"><Danger size={24} /></div><h1 className="mt-4 text-xl font-black text-base-content">{t("Manager access is required")}</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-heledone-ink-muted">{t("This view is available to team leads, organization admins and owners. Your personal workspace is still available.")}</p><Link to="/dashboard" className="motion-interactive mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-content">{t("Go to today")} <ArrowRight size={15} /></Link></div></section>;

  const selectedProject = dashboard.project_summary.find(p => p.id.toString() === selectedProjectId.toString());

  // Global calculations
  const globalWorkHours = dashboard.work_hours || [];
  const maxTasks = Math.max(...members.map(member => member.total_tasks), 1);
  const workHoursByUser = new Map(globalWorkHours.map(member => [member.user_id.toString(), member.total_seconds]));
  const globalTotalTasks = dashboard.task_stats.reduce((total, item) => total + item.count, 0) || 0;
  const globalDoneTasks = dashboard.task_stats.filter(item => item.status_code?.toLowerCase() === "done").reduce((total, item) => total + item.count, 0) || 0;
  const atRiskProjects = dashboard.project_summary.filter(project => ["error", "warning"].includes(getHealth(project).tone)).length || 0;
  const globalUtilization = globalWorkHours.length && dashboard.team_member_count ? Math.round(globalWorkHours.reduce((total, member) => total + Number(member.total_seconds || 0), 0) / (dashboard.team_member_count * 40 * 3600) * 100) : 0;
  const globalDecisionCount = (dashboard.overdue_summary.total_overdue || 0) + atRiskProjects + (approvalQuery.data?.length || 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-[1480px] space-y-5 sm:space-y-6">
      <section className="heledone-page-heading flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase  text-primary">
            <Chart21 size={15} /> {selectedProject ? t("Project Scope") : t("Decision Dashboard")}
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-base-content sm:text-4xl">
            {selectedProject ? selectedProject.name : t("See where the team needs you")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-heledone-ink-muted sm:text-base">
            {selectedProject ? t("Viewing specific workload and task focus for {value0}.", { value0: selectedProject.name }) : t("A calm view of workload, delivery risk and decisions waiting in your inbox.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dashboard.project_summary.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="select select-bordered select-sm rounded-xl text-xs font-bold h-10 border-base-content/10 bg-base-100 hover:border-primary/30"
            >
              <option value="">{t("All Projects (Global Scope)")}</option>
              {dashboard.project_summary.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-3 text-xs font-bold text-heledone-ink-muted">
            <Activity size={15} className="text-success" />  {t("Live scope")}</span>
          <button type="button" onClick={() => { void dashboardQuery.refetch(); void membersQuery.refetch(); void approvalQuery.refetch(); }} className="motion-interactive inline-flex h-10 items-center gap-2 rounded-xl border border-base-content/10 bg-base-100 px-3 text-xs font-bold text-heledone-ink-muted hover:border-primary/30 hover:text-primary">
            <Refresh2 size={15} />  {t("Refresh")}</button>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {!selectedProject ? (
          <motion.div
            key="global-scope"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5 sm:space-y-6"
          >
            <section className={`${panelClass} flex flex-col gap-4 bg-gradient-to-br from-primary/[0.08] via-base-100 to-base-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-content">
                  <Danger size={19} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase  text-primary">{t("Your decision queue")}</p>
                  <h2 className="mt-1 text-lg font-black text-base-content">{globalDecisionCount === 0 ? t("Everything looks steady") : t("Signals needing attention: {count}", { count: globalDecisionCount })}</h2>
                  <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">{formatUiNumber(dashboard.overdue_summary.total_overdue)}  {t("overdue tasks ·")} {formatUiNumber(atRiskProjects)}  {t("project risks ·")} {formatUiNumber(approvalQuery.data?.length || 0)}  {t("approvals")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-heledone-ink-muted"><Calendar size={15} />  {t("Updated just now")}</div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label={t("تیم")} value={dashboard.team_member_count} description={t("people in your scope")} icon={People} tone="primary" />
              <MetricCard label={t("Open work")} value={Math.max(0, globalTotalTasks - globalDoneTasks)} description={t("{value0} completed tasks", { value0: globalDoneTasks })} icon={TaskSquare} tone="secondary" />
              <MetricCard label={t("Overdue")} value={dashboard.overdue_summary.total_overdue} description={t("needs attention")} icon={Danger} tone="warning" />
              <MetricCard label={t("Utilization")} value={`${globalUtilization}%`} description={t("based on weekly focus time")} icon={Timer1} tone="success" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.8fr)]">
              <section className={panelClass}>
                <SectionHeading title={t("Team overview")} description={t("A quick read on delivery and capacity")} action={<span className="text-[13px] font-bold text-heledone-ink-muted">{t("این هفته")}</span>} />
                {dashboard.managed_team_count === 0 ? (
                  <div className="px-5 pb-6">
                    <div className="flex flex-col gap-4 rounded-2xl border border-primary/15 bg-primary/5 p-5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary"><People size={20} /></div>
                      <div>
                        <p className="text-sm font-black text-base-content">{t("No teams connected yet")}</p>
                        <p className="mt-1 text-xs text-heledone-ink-muted">{t("Create a team and assign members to it so this section can display workload, attendance and delivery analytics .")}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link to="/teams" className="motion-interactive inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-content"><ArrowRight size={13} />  {t("Manage Teams")}</Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="hidden grid-cols-[minmax(13rem,1.2fr)_minmax(12rem,1fr)_5rem_5rem_6rem] gap-3 px-5 pb-2 text-[13px] font-black uppercase tracking-wider text-heledone-ink-muted sm:grid"><span>{t("Member")}</span><span>{t("Workload")}</span><span className="text-end">{t("انجام‌شده")}</span><span className="text-end">{t("Risk")}</span><span className="text-end">{t("تمرکز")}</span></div>
                    {members.length === 0 ? <div className="px-5 pb-6 text-sm font-semibold text-heledone-ink-muted">{t("No team members are visible in this scope.")}</div> : <div>{members.slice(0, 8).map(member => <MemberRow key={member.id} member={member} maxTasks={maxTasks} workSeconds={workHoursByUser.get(member.id.toString()) || member.week_seconds || 0} />)}</div>}
                  </>
                )}
              </section>
              <ApprovalInbox requests={approvalQuery.data || []} isLoading={approvalQuery.isLoading} pendingId={approvalMutation.isPending ? approvalMutation.variables?.id || null : null} onApprove={id => approvalMutation.mutate({ id, action: "approve" })} onReject={id => approvalMutation.mutate({ id, action: "reject" })} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <WorkloadPanel taskStats={dashboard.task_stats} />
              <ProjectHealth projects={dashboard.project_summary} />
            </section>
          </motion.div>
        ) : (
          <motion.div
            key="project-scope"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-5 sm:space-y-6"
          >
            <ProjectSpecificView project={selectedProject!} tasks={projectTasks} isLoading={isLoadingTasks} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ProjectSpecificView = ({ project, tasks, isLoading }: { project: ManagerProjectSummary, tasks?: Task[], isLoading: boolean }) => {
  const t = useTranslation();
  const allTasks = useMemo(() => tasks || [], [tasks]);

  const projTotalTasks = allTasks.length;
  const projDoneTasks = allTasks.filter(t => t.is_finished || t.status_detail?.name.toLowerCase() === 'done').length;
  const projOverdueTasks = allTasks.filter(t => !t.is_finished && t.due_date && new Date(t.due_date).getTime() < Date.now()).length;
  const projBlockedTasks = allTasks.filter(t => !t.is_finished && t.is_blocked).length;

  const taskStats = useMemo(() => {
    const statsMap = new Map<string, { count: number; name: string; code: string }>();
    allTasks.forEach(task => {
      const code = task.status_detail?.code || "unknown";
      const name = task.status_detail?.name || "Unsorted";
      if (!statsMap.has(code)) {
        statsMap.set(code, { count: 0, name, code });
      }
      statsMap.get(code)!.count += 1;
    });
    return Array.from(statsMap.values());
  }, [allTasks]);

  const health = getHealth(project);

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className={`${panelClass} flex flex-col gap-4 bg-gradient-to-br from-primary/[0.08] via-base-100 to-base-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${health.tone === "error" ? "bg-error text-error-content" : health.tone === "warning" ? "bg-warning text-warning-content" : "bg-success text-success-content"}`}>
            <Chart21 size={19} />
          </div>
          <div>
            <p className="text-xs font-black uppercase  text-primary">{t("Project Health")}</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-lg font-black text-base-content">{health.label}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[13px] font-black ${health.tone === "error" ? "bg-error/10 text-error" : health.tone === "warning" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>{formatUiNumber(Math.round(health.progress * 100))}{t("% Completed")}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-heledone-ink-muted">
              {t("Due")} {formatDate(project.deadline)} · {formatUiNumber(project.active_member_count)}  {t("contributors")}</p>
          </div>
        </div>
        <div className="w-full sm:w-1/3">
          <div className="flex items-center justify-between text-xs font-bold text-heledone-ink-muted mb-1">
            <span>{t("Progress")}</span>
            <span>{formatUiNumber(Math.round(health.progress * 100))}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-base-200">
            <div className={`h-full rounded-full ${health.tone === "error" ? "bg-error text-error-content" : health.tone === "warning" ? "bg-warning text-warning-content" : "bg-success text-success-content"}`} style={{ width: `${Math.round(health.progress * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t("Total Tasks")} value={projTotalTasks} description={t("tracked in this project")} icon={TaskSquare} tone="primary" />
        <MetricCard label={t("Open work")} value={Math.max(0, projTotalTasks - projDoneTasks)} description={t("{value0} completed", { value0: projDoneTasks })} icon={Activity} tone="secondary" />
        <MetricCard label={t("Overdue")} value={projOverdueTasks} description={t("past due date")} icon={Danger} tone="warning" />
        <MetricCard label={t("مسدود")} value={projBlockedTasks} description={t("currently blocked")} icon={CloseCircle} tone="error" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <WorkloadPanel taskStats={taskStats} />
        <ProjectFocusPanel tasks={tasks} isLoading={isLoading} />
      </section>
    </div>
  );
};

const WorkloadPanel = ({ taskStats }: { taskStats: { status_code?: string | null; status_name?: string | null; count: number; code?: string | null; name?: string | null }[] }) => {
  const t = useTranslation();
  const total = Math.max(taskStats.reduce((sum, stat) => sum + stat.count, 0), 1);
  const palette = ["bg-primary", "bg-secondary", "bg-warning", "bg-success", "bg-error", "bg-info"];
  return (
    <section className={panelClass}>
      <SectionHeading title={t("Workload")} description={t("How active work is distributed by status")} />
      <div className="px-5 pb-6">
        <div className="flex h-3 overflow-hidden rounded-full bg-base-200">
          {taskStats.map((stat, index) => (
            <motion.div
              key={`${stat.status_code || stat.code}-${index}`}
              initial={{ width: 0 }}
              animate={{ width: `${(stat.count / total) * 100}%` }}
              transition={{ duration: 0.7, delay: index * 0.06 }}
              className={`${palette[index % palette.length]} min-w-1`}
            />
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {taskStats.map((stat, index) => (
            <div key={`${stat.status_code || stat.code}-legend`} className="flex items-center justify-between rounded-xl bg-base-200/60 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${palette[index % palette.length]}`} />
                <span className="truncate text-xs font-bold text-heledone-ink-muted">{stat.status_name || stat.name || stat.status_code || stat.code || t("Unsorted")}</span>
              </div>
              <span className="text-sm font-black text-base-content">{formatUiNumber(stat.count)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const ManagerDashboardSkeleton = () => { useLocale(); return <div className="mx-auto max-w-[1480px] animate-pulse space-y-6"><div className="h-28 rounded-3xl bg-base-100" /><div className="h-28 rounded-3xl bg-base-100" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-32 rounded-2xl bg-base-100" />)}</div><div className="grid gap-5 xl:grid-cols-2"><div className="h-[30rem] rounded-2xl bg-base-100" /><div className="h-[30rem] rounded-2xl bg-base-100" /></div></div>; };

const ProjectFocusPanel = ({ tasks, isLoading }: { tasks?: Task[], isLoading: boolean }) => {
  const t = useTranslation();
  const activeTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t => !t.is_finished);
  }, [tasks]);

  const tasksByUser = useMemo(() => {
    const grouped = new Map<string, { user: any, tasks: Task[] }>();
    activeTasks.forEach(task => {
      const assignees = (task.assignees_detail && task.assignees_detail.length > 0)
        ? task.assignees_detail
        : (task.assignee_detail ? [task.assignee_detail] : []);

      if (assignees.length === 0) {
        const key = "unassigned";
        if (!grouped.has(key)) {
          grouped.set(key, {
            user: { id: "unassigned", username: t("بدون مسئول"), first_name: t("بدون مسئول"), last_name: "" },
            tasks: []
          });
        }
        grouped.get(key)!.tasks.push(task);
      } else {
        assignees.forEach(u => {
          const key = u.id.toString();
          if (!grouped.has(key)) {
            grouped.set(key, {
              user: u,
              tasks: []
            });
          }
          grouped.get(key)!.tasks.push(task);
        });
      }
    });
    return Array.from(grouped.values()).sort((a, b) => {
      if (a.user.id === "unassigned") return 1;
      if (b.user.id === "unassigned") return -1;
      return (a.user.first_name || "").localeCompare(b.user.first_name || "");
    });
  }, [activeTasks, t]);

  return (
    <section className={panelClass}>
      <SectionHeading
        title={t("Project Focus")}
        description={t("See exactly what each person is working on")}
      />
      <div className="px-5 pb-6">
        {isLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-20 bg-base-200 rounded-2xl"></div>
            <div className="h-20 bg-base-200 rounded-2xl"></div>
          </div>
        ) : tasksByUser.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success mb-3">
              <TickCircle size={24} />
            </div>
            <p className="text-sm font-bold text-base-content">{t("No active tasks")}</p>
            <p className="text-xs font-semibold text-heledone-ink-muted mt-1">{t("Everyone is caught up on this project.")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasksByUser.map(group => (
              <div key={group.user.id} className="rounded-2xl border border-base-content/10 bg-base-200/30 p-4 transition duration-200 hover:border-primary/25 hover:shadow-sm">
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-base-content/5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-black text-primary">
                    {getInitials(group.user.first_name, group.user.last_name, group.user.username?.[0]?.toUpperCase())}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-base-content">
                      {group.user.id === "unassigned" ? t("بدون مسئول") : `${group.user.first_name || ""} ${group.user.last_name || ""}`.trim() || group.user.username}
                    </h3>
                    <p className="text-[13px] font-semibold text-heledone-ink-muted">{formatUiNumber(group.tasks.length)}  {t("active task")}{group.tasks.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="space-y-2 max-h-[350px] overflow-y-auto pe-2 heledone-scrollbar">
                  {group.tasks.map(task => (
                    <div key={task.id} className="group/task flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-xl bg-base-100 p-3 shadow-sm border border-base-content/5 transition hover:border-primary/20">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-base-content group-hover/task:text-primary transition-colors">{task.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[13px] font-bold text-heledone-ink-muted">
                          <span className="flex items-center gap-1.5"><Flag size={12} className={task.priority === 'critical' ? 'text-error' : task.priority === 'high' ? 'text-warning' : 'text-heledone-ink-muted'} /> {task.priority.toUpperCase()}</span>
                          {task.due_date && <span className="flex items-center gap-1.5"><Calendar size={12} /> {formatDate(task.due_date)}</span>}
                          {task.is_blocked && <span className="flex items-center gap-1.5 text-error bg-error/10 px-1.5 py-0.5 rounded-md"><CloseCircle size={10} />  {t("مسدود")}</span>}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <span className="inline-flex rounded-lg bg-base-200 px-2 py-1 text-[13px] font-bold text-base-content/70">
                          {task.status_detail?.name || t("در حال انجام")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ManagerDashboardPage;
