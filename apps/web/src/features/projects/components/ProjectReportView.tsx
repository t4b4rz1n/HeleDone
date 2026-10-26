import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { formatNumber, useTranslation } from "../../../i18n/locale";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Task, TickCircle, Profile2User, TrendUp } from "iconsax-reactjs";
import { getTasks } from "../../tasks/api/tasksApi";
import { useProjectMembers } from "../hooks/useProjects";

interface ProjectReportViewProps {
  projectId: string;
}

interface MemberStats {
  userId: string | number;
  name: string;
  email: string;
  avatar?: string;
  totalTasks: number;
  completedTasks: number;
  spentHours: number;
}

export function ProjectReportView({ projectId }: ProjectReportViewProps) {
  const t = useTranslation();
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: () => getTasks(projectId, undefined, 1000),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchOnWindowFocus: true, // Refresh when window gets focus
    staleTime: 0, // Consider data stale immediately
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  // Calculate project-level stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.is_finished).length;
  const totalSpentHours = tasks.reduce(
    (sum, t) => sum + (parseFloat(String(t.spent_hours || 0))),
    0
  );

  // Calculate per-member stats
  const memberStatsMap = new Map<string | number, MemberStats>();

  members.forEach((member) => {
    const userId = member.user?.id || member.id;
    const name =
      member.user
        ? `${member.user.first_name || ""} ${member.user.last_name || ""}`.trim() ||
        member.user.username ||
        member.user.email ||
        "Unknown"
        : member.team?.name || "Unknown";

    memberStatsMap.set(userId, {
      userId,
      name,
      email: member.user?.email || "",
      avatar: member.user?.avatar || undefined,
      totalTasks: 0,
      completedTasks: 0,
      spentHours: 0
    });
  });

  tasks.forEach((task) => {
    const assignees = (task.assignees_detail && task.assignees_detail.length > 0)
      ? task.assignees_detail
      : (task.assignee_detail ? [task.assignee_detail] : (task.assignee ? [{ id: task.assignee }] : []));

    if (assignees.length === 0) return;

    assignees.forEach((assigneeUser: any) => {
      const assigneeId = assigneeUser.id;
      if (!assigneeId) return;

      const stats = memberStatsMap.get(assigneeId);
      if (!stats) {
        const name = `${assigneeUser.first_name || ""} ${assigneeUser.last_name || ""}`.trim() ||
          assigneeUser.username ||
          assigneeUser.email ||
          "Unknown";

        memberStatsMap.set(assigneeId, {
          userId: assigneeId,
          name,
          email: assigneeUser.email || "",
          avatar: assigneeUser.avatar || undefined,
          totalTasks: 0,
          completedTasks: 0,
          spentHours: 0
        });
      }

      const memberStats = memberStatsMap.get(assigneeId)!;
      memberStats.totalTasks++;
      memberStats.spentHours += parseFloat(String(task.spent_hours || 0));

      if (task.is_finished) {
        memberStats.completedTasks++;
      }
    });
  });

  const memberStatsList = Array.from(memberStatsMap.values()).sort(
    (a, b) => b.totalTasks - a.totalTasks
  );

  return (
    <div className="space-y-6">
      {/* Project Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-base-content/8 bg-base-100 p-6"
      >
        <div className="flex items-center gap-2 border-b border-base-content/8 pb-4 mb-5">
          <TrendUp size={18} className="text-primary" variant="Bold" />
          <h2 className="text-lg font-bold text-base-content">{t("Project Overview")}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-base-200/50 to-base-200/20 p-5 space-y-3 border border-base-content/5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-heledone-ink-muted">{t("Total Tasks")}</span>
              <div className="p-2 rounded-lg bg-base-content/5 text-base-content/70">
                <Task size={18} />
              </div>
            </div>
            <p className="text-4xl font-black text-base-content">{formatUiNumber(totalTasks)}</p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-success/10 to-success/5 p-5 space-y-3 border border-success/10 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-success/80">{t("Completed")}</span>
              <div className="p-2 rounded-lg bg-success/15 text-success">
                <TickCircle size={18} variant="Bold" />
              </div>
            </div>
            <p className="text-4xl font-black text-success">{formatUiNumber(completedTasks)}</p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 space-y-3 border border-primary/10 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary/80">{t("Time Spent")}</span>
              <div className="p-2 rounded-lg bg-primary/15 text-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              </div>
            </div>
            <p className="text-4xl font-black text-primary">
              {formatNumber(totalSpentHours, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-lg font-bold opacity-60">{t("hrs")}</span>
            </p>
          </div>
        </div>
      </motion.div>

      {/* Members Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-base-content/8 bg-base-100 p-6"
      >
        <div className="flex items-center gap-2 border-b border-base-content/8 pb-4 mb-5">
          <Profile2User size={18} className="text-primary" variant="Bold" />
          <h2 className="text-lg font-bold text-base-content">{t("Member Statistics")}</h2>
          <span className="ms-auto text-xs font-bold text-heledone-ink-muted">
            {formatUiNumber(memberStatsList.length)}  {t("Members")}</span>
        </div>

        {memberStatsList.length === 0 ? (
          <p className="text-center text-sm text-heledone-ink-muted py-8">
            {t("No member data available.")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {memberStatsList.map((member, idx) => (
              <motion.div
                key={member.userId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-xl border border-base-content/6 bg-base-200/40 p-4 hover:bg-base-200/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar
                      src={member.avatar}
                      name={member.name}
                      className="size-10 shrink-0 overflow-hidden rounded-full ring-2 ring-base-content/10"
                      fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-base-content truncate">{member.name}</p>
                      {member.email && (
                        <p className="text-xs text-heledone-ink-muted truncate">{member.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="rounded-lg bg-base-100/60 px-3 py-2 text-center">
                      <p className="text-xl font-black text-base-content">{formatUiNumber(member.totalTasks)}</p>
                      <p className="text-[13px] font-medium text-heledone-ink-muted uppercase tracking-wider">
                        {t("Total")}</p>
                    </div>
                    <div className="rounded-lg bg-success/15 px-3 py-2 text-center">
                      <p className="text-xl font-black text-success">{formatUiNumber(member.completedTasks)}</p>
                      <p className="text-[13px] font-medium text-success uppercase tracking-wider">
                        {t("انجام‌شده")}</p>
                    </div>
                  </div>
                </div>

                {/* Visual Progress & Time Spent */}
                <div className="mt-4 pt-4 border-t border-base-content/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-heledone-ink-muted uppercase tracking-wider">{t("Task Progress")}</span>
                    <span className="text-xs font-bold text-base-content">
                      {formatUiNumber(member.totalTasks > 0 ? Math.round((member.completedTasks / member.totalTasks) * 100) : 0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-base-content/10 rounded-full overflow-hidden mb-4">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${member.totalTasks > 0 ? (member.completedTasks / member.totalTasks) * 100 : 0}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full bg-success rounded-full"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
                    <div className="flex items-center gap-2 text-primary">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                      <span className="text-xs font-bold uppercase tracking-wider">{t("Time Spent")}</span>
                    </div>
                    <span className="text-sm font-black text-primary">
                      {formatNumber(member.spentHours, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs font-bold opacity-60">{t("hrs")}</span>
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
