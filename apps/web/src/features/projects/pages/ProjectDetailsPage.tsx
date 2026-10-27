import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getIntlLocale, t as translate, useTranslation, useLocale } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { useAuthStore } from "../../auth/store/authStore";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowDown2,
  People,
  TaskSquare,
  Activity,
  Add,
  Trash,
  Flag,
  Chart,
  DollarCircle,
} from "iconsax-reactjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useProject,
  useProjectMembers,
  useProjectMilestones,
  useProjectActivities,
  useRemoveProjectMember,
  useUpdateProject,
  useDeleteMilestone,
} from "../hooks/useProjects";
import type { Project, ProjectMember, Milestone, ProjectActivity, ViewMode } from "../types";
import { useTaskStore } from "../../tasks/store/useTaskStore";
import { AddMemberModal } from "../components/AddMemberModal";
import CumulativeFlowChart from "../components/CumulativeFlowChart";
import CycleLeadTimeReport from "../components/CycleLeadTimeReport";
import MilestoneBurndownChart from "../components/MilestoneBurndownChart";
import { CreateMilestoneModal } from "../components/CreateMilestoneModal";
import { EditMilestoneModal } from "../components/EditMilestoneModal";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { ProjectReportView } from "../components/ProjectReportView";
import { ProjectMemberSalaryPanel } from "../components/ProjectMemberSalaryPanel";
import { ProjectBillingTab } from "../components/ProjectBillingTab";
import { toast } from "sonner";
import { getUnlinkedTasks, getTask, getMilestoneTasks } from "../../tasks/api/tasksApi";
import { TaskSheet } from "../../tasks/components/TaskSheet";
import { ViewSwitcher } from "../../../components/ViewSwitcher";
import { OrbitView } from "../components/OrbitView";

type TabType = "overview" | "members" | "milestones" | "activity" | "analytics" | "reports" | "salaries" | "billing";


const DEFAULT_COLOR = "#087F83";

const statusStyles: Record<string, string> = {
  active: "bg-success/15 text-success dark:text-success",
  draft: "bg-base-200 text-heledone-ink-muted",
  on_hold: "bg-warning/15 text-warning dark:text-warning",
  completed: "bg-primary/15 text-primary dark:text-primary",
  archived: "bg-error/15 text-error",
};

const milestoneStatusConfig: Record<string, { label: string; cls: string }> = {
  pending: { get label() { return translate("در انتظار"); }, cls: "bg-base-200 text-heledone-ink-muted" },
  in_progress: { get label() { return translate("در حال انجام"); }, cls: "bg-primary/15 text-primary" },
  completed: { get label() { return translate("انجام‌شده"); }, cls: "bg-success/15 text-success" },
  cancelled: { get label() { return translate("Cancelled"); }, cls: "bg-error/15 text-error" },
};

const getUserDisplayName = (member: ProjectMember) => {
  if (member.team) return member.team.name;
  if (!member.user) return "Member";
  const fullName =
    `${member.user.first_name || ""} ${member.user.last_name || ""}`.trim();
  if (fullName) return fullName;
  return member.user.username || member.user.email || "User";
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  return formatDisplayDate(new Date(value), "MMM d, yyyy");
};

function MilestoneItem({
  ms,
  projectId,
  onEdit,
  onDelete
}: {
  ms: Milestone;
  projectId: string;
  onEdit: (ms: Milestone) => void;
  onDelete: (ms: Milestone) => void;
}) {
  const t = useTranslation();
  const { hasAnyPermission, isStaff } = usePermissions();
  const canManageProject = hasAnyPermission(["project.manage"]) || isStaff;


  const msCfg = milestoneStatusConfig[ms.status] ?? milestoneStatusConfig.pending;
  const [showChart, setShowChart] = useState(false);
  const setSelectedTaskId = useTaskStore(state => state.setSelectedTaskId);

  const { data: milestoneTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["milestone-tasks", projectId, ms.id],
    queryFn: () => getMilestoneTasks(projectId, ms.id),
    enabled: showChart,
  });

  const total = ms.task_count || 0;
  const completed = ms.completed_task_count || 0;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-base-content/6 bg-base-200/40 p-3 text-xs transition-all">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setShowChart(!showChart)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Flag size={15} className="shrink-0 text-primary" />
          <div className="min-w-0 flex flex-col gap-1">
            <p className="font-bold text-base-content truncate">
              {ms.title}
            </p>
            <div className="flex items-center gap-3 text-[13px] text-heledone-ink-muted">
              {ms.target_date && <span>{t("Target:")} {formatDate(ms.target_date)}</span>}
              <div className="flex items-center gap-1.5" title={t("{value0} of {value1} tasks completed", { value0: completed, value1: total })}>
                <TaskSquare size={12} className="text-heledone-ink-muted" />
                <span>{formatUiNumber(completed)}/{formatUiNumber(total)}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {canManageProject && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onEdit(ms)}
                className="p-1 rounded-md text-heledone-ink-muted hover:text-primary hover:bg-base-200"
                title={t("Edit Milestone")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button
                onClick={() => onDelete(ms)}
                className="p-1 rounded-md text-heledone-ink-muted hover:text-error hover:bg-base-200"
                title={t("Delete Milestone")}
              >
                <Trash size={14} variant="Bold" />
              </button>
            </div>
          )}
          <div className="hidden sm:flex flex-col items-end gap-1 me-2">
            <div className="text-[13px] font-medium text-heledone-ink-muted">{formatUiNumber(progressPercent)}%</div>
            <div className="w-16 h-1.5 rounded-full bg-base-300 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <span className={`rounded-md px-2.5 py-1 text-[13px] font-bold ${msCfg.cls}`}>
            {msCfg.label}
          </span>
          <ArrowDown2 size={14} className={`text-heledone-ink-muted transition-transform ${showChart ? "rotate-180" : ""}`} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showChart && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-3 border-t border-base-content/8 mt-1 flex flex-col gap-4">
              <MilestoneBurndownChart milestoneId={String(ms.id)} />

              {/* Tasks List */}
              <div className="px-2 pb-2">
                <h4 className="text-[13px] font-bold text-heledone-ink-muted uppercase tracking-wider mb-2">
                  {t("Linked Tasks (")}{formatUiNumber(milestoneTasks.length)})
                </h4>
                {isLoadingTasks ? (
                  <div className="flex justify-center p-4">
                    <span className="loading loading-dots loading-sm opacity-50"></span>
                  </div>
                ) : milestoneTasks.length > 0 ? (
                  <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pe-1 custom-scrollbar">
                    {milestoneTasks.map((task) => (
                      <div
                        key={task.id}
                        className="group/task flex items-center justify-between p-3 rounded-xl bg-base-100/40 hover:bg-base-100 border border-base-content/5 hover:border-base-content/10 hover:shadow-sm cursor-pointer transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskId(String(task.id));
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`size-2 shrink-0 rounded-full ${task.is_finished ? "bg-success" : "bg-base-content/20"}`} />
                          <p

                            className={`font-semibold truncate ${task.is_finished ? "line-through text-heledone-ink-muted" : "text-[13px] text-base-content/90 group-hover/task:text-primary transition-colors"}`}
                          >
                            {task.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 opacity-70 group-hover/task:opacity-100 transition-opacity">
                          {task.priority && (
                            <span className={`text-[13px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${task.priority === "critical"
                              ? "bg-error/15 text-error dark:text-error"
                              : task.priority === "high"
                                ? "bg-warning/15 text-warning dark:text-warning"
                                : task.priority === "medium"
                                  ? "bg-warning/15 text-warning dark:text-warning"
                                  : "bg-base-content/10 text-base-content/70"
                              }`}>
                              {task.priority}
                            </span>
                          )}
                          {task.status_detail?.name && (
                            <span className="text-[13px] font-medium text-heledone-ink-muted bg-base-content/5 px-2 py-0.5 rounded-full border border-base-content/10">
                              {task.status_detail.name}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-heledone-ink-muted text-center py-2 bg-base-100/30 rounded-lg">
                    {t("No tasks linked to this milestone yet.")}</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode }> = [
  { id: "overview", get label() { return translate("نمای کلی"); }, icon: <TaskSquare size={15} /> },
  { id: "members", get label() { return translate("اعضا"); }, icon: <People size={15} /> },
  { id: "milestones", get label() { return translate("Milestones"); }, icon: <Flag size={15} /> },
  { id: "activity", get label() { return translate("رویدادها"); }, icon: <Activity size={15} /> },
  { id: "analytics", get label() { return translate("Analytics"); }, icon: <Chart size={15} /> },
  { id: "reports", get label() { return translate("Reports"); }, icon: <Chart size={15} variant="Bold" /> },
  { id: "salaries", get label() { return translate("Salaries"); }, icon: <DollarCircle size={15} /> },
  { id: "billing", get label() { return translate("Billing"); }, icon: <DollarCircle size={15} variant="Bold" /> },
];


const STATUS_OPTIONS = [
  { value: "draft", get label() { return translate("Draft"); } },
  { value: "active", get label() { return translate("فعال"); } },
  { value: "on_hold", get label() { return translate("On Hold"); } },
  { value: "completed", get label() { return translate("Completed"); } },
  { value: "archived", get label() { return translate("Archived"); } },
] as const;


function StatusDropdown({
  currentStatus,
  onChange,
  disabled
}: {
  currentStatus: Project["status"];
  onChange: (s: Project["status"]) => void;
  disabled: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedOption = STATUS_OPTIONS.find((o) => o.value === currentStatus) || STATUS_OPTIONS[0];

  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, []);

  return (
    <div className="relative z-[100]" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 cursor-pointer appearance-none rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide outline-none transition-all hover:opacity-80 ${statusStyles[currentStatus] || statusStyles.draft}`}
      >
        {selectedOption.label}
        <ArrowDown2 size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute start-0 top-7 min-w-[120px] rounded-xl border border-base-content/10 bg-base-100 p-1.5 shadow-xl"
          >
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors hover:bg-base-content/5 ${currentStatus === opt.value ? "bg-primary/10 font-bold text-primary" : "font-medium text-base-content"
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── MilestonesTab ────────────────────────────────────────────────────────────

function MilestonesTab({
  milestones,
  projectId,
  project,
  onCreateMilestone,
}: {
  milestones: Milestone[];
  projectId: string;
  project?: Project;
  onCreateMilestone:
  | (() => void)
  | undefined;
}) {
  const t = useTranslation();
  const { hasAnyPermission, isStaff } = usePermissions();
  const canManageProject = hasAnyPermission(["project.manage"]) || isStaff;

  // Calculate weighted progress
  const totalWeight = milestones.reduce((s, m) => s + (m.weight || 1), 0);
  const completedWeight = milestones
    .filter((m) => m.status === "completed")
    .reduce((s, m) => s + (m.weight || 1), 0);
  const weightedProgress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

  const unlinkedCount = project?.unlinked_task_count || 0;

  // Only fetch unlinked tasks if there are any
  const { data: unlinkedTasks = [], isLoading: loadingUnlinked } = useQuery({
    queryKey: ["unlinked-tasks", projectId],
    queryFn: () => getUnlinkedTasks(projectId),
    enabled: unlinkedCount > 0,
    staleTime: 60_000,
  });

  const setSelectedTaskId = useTaskStore(state => state.setSelectedTaskId);
  const [milestoneToEdit, setMilestoneToEdit] = useState<Milestone | null>(null);
  const [milestoneToDelete, setMilestoneToDelete] = useState<Milestone | null>(null);
  const deleteMilestoneMutation = useDeleteMilestone(projectId);

  const handleDeleteConfirm = () => {
    if (!milestoneToDelete) return;
    deleteMilestoneMutation.mutate(milestoneToDelete.id, {
      onSuccess: () => {
        toast.success(t("Milestone deleted."));
        setMilestoneToDelete(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header card with weighted progress */}
      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
        <div className="flex items-center justify-between border-b border-base-content/8 pb-3 mb-4">
          <h3 className="text-sm font-bold text-base-content">
            {t("Project Milestones (")}{formatUiNumber(milestones.length)})
          </h3>
          {canManageProject && (
            <button
              type="button"
              onClick={onCreateMilestone}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-content"
            >
              <Add size={14} />  {t("New Milestone")}</button>
          )}
        </div>

        {/* Weighted progress bar */}
        {milestones.length > 0 && (
          <div className="mb-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-heledone-ink-muted uppercase tracking-wider text-[13px]">
                {t("Weighted Project Progress")}</span>
              <span className="font-black text-primary">{formatUiNumber(weightedProgress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-base-300">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${weightedProgress}%` }}
              />
            </div>
            <p className="text-[13px] text-heledone-ink-muted">
              {t("Based on milestone weights — only completed milestones count toward progress.")}</p>
          </div>
        )}

        {/* Milestone list */}
        {milestones.length === 0 ? (
          <p className="py-8 text-center text-xs text-heledone-ink-muted">
            {t("No milestones added to this project yet.")}</p>
        ) : (
          <div className="space-y-2">
            {milestones.map((ms: Milestone) => (
              <div key={ms.id} className="flex flex-col gap-2">
                {/* Weight badge added to each milestone row */}
                <div className="flex items-center gap-2 group">
                  <div className="flex-1">
                    <MilestoneItem
                      ms={ms}
                      projectId={projectId}
                      onEdit={setMilestoneToEdit}
                      onDelete={setMilestoneToDelete}
                    />
                  </div>
                  <div
                    className="shrink-0 rounded-lg bg-base-200 px-2 py-1 text-[13px] font-bold text-heledone-ink-muted whitespace-nowrap"
                    title={t("Milestone weight (contributes this much to project progress)")}
                  >
                    {t("Weight:")} {formatUiNumber(ms.weight || 1)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unlinked Tasks section */}
      {unlinkedCount > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-base-100 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-base-content/8 pb-3">
            <div className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-warning shrink-0">
                <path d="M12 2L2 22h20L12 2zm0 3.5L19.5 20h-15L12 5.5zM11 10v5h2v-5h-2zm0 6v2h2v-2h-2z" />
              </svg>
              <h3 className="text-sm font-bold text-base-content">
                {t("Unlinked Tasks")}<span className="ms-2 rounded-full bg-warning/15 px-2 py-0.5 text-[13px] font-bold text-warning">
                  {formatUiNumber(unlinkedCount)}
                </span>
              </h3>
            </div>
          </div>
          <p className="text-[13px] text-heledone-ink-muted -mt-2">
            {t("These tasks are not linked to any milestone and do")} <strong>{t("not")}</strong>  {t("affect project progress.")}</p>

          {loadingUnlinked ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-xl bg-base-200/70" />
              ))}
            </div>
          ) : unlinkedTasks.length === 0 ? (
            <p className="py-4 text-center text-xs text-heledone-ink-muted">{t("Loading…")}</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pe-1">
              {unlinkedTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(String(task.id))}
                  className="flex items-center justify-between rounded-xl border border-base-content/6 bg-base-200/40 px-3 py-2.5 text-xs cursor-pointer hover:bg-base-200/70 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`size-2 shrink-0 rounded-full ${task.is_finished ? "bg-success" : "bg-base-content/20"}`} />
                    <span

                      className={`font-semibold truncate ${task.is_finished ? "line-through text-heledone-ink-muted" : "text-base-content"}`}
                    >
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ms-2">
                    {task.priority && (
                      <span className={`rounded-md px-1.5 py-0.5 text-[13px] font-bold uppercase ${task.priority === "critical" ? "bg-error/15 text-error" :
                        task.priority === "high" ? "bg-warning/15 text-warning" :
                          task.priority === "medium" ? "bg-warning/15 text-warning" :
                            "bg-base-content/10 text-heledone-ink-muted"
                        }`}>
                        {task.priority}
                      </span>
                    )}
                    {(task.assignees_detail && task.assignees_detail.length > 0) ? (
                      <span className="text-[13px] text-heledone-ink-muted truncate max-w-[120px]">
                        {task.assignees_detail.map((u: any) => `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username).join(", ")}
                      </span>
                    ) : task.assignee_detail ? (
                      <span className="text-[13px] text-heledone-ink-muted truncate max-w-[80px]">
                        {`${task.assignee_detail.first_name || ""} ${task.assignee_detail.last_name || ""}`.trim() || task.assignee_detail.username || t("Assigned")}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Milestone Modal */}
      <EditMilestoneModal
        isOpen={!!milestoneToEdit}
        onClose={() => setMilestoneToEdit(null)}
        projectId={projectId}
        milestone={milestoneToEdit}
      />

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        isOpen={!!milestoneToDelete}
        onClose={() => setMilestoneToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title={t("Delete Milestone")}
        isLoading={deleteMilestoneMutation.isPending}
      />
    </div>
  );
}

export default function ProjectDetailsPage() {
  const t = useTranslation();

  const updateProjectMutation = useUpdateProject();
  const user = useAuthStore((state) => state.user);


  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setActiveProject = useTaskStore((state) => state.setActiveProject);
  const selectedTaskId = useTaskStore(state => state.selectedTaskId);
  const setSelectedTaskId = useTaskStore(state => state.setSelectedTaskId);
  const queryClient = useQueryClient();

  const { hasAnyPermission, hasPermission, isStaff } = usePermissions();
  const canManageProject = hasAnyPermission(["project.manage"]) || isStaff;

  const taskQuery = useQuery({
    queryKey: ["task", selectedTaskId],
    queryFn: () => getTask(selectedTaskId!),
    enabled: !!selectedTaskId,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabType) || "overview";
  const [activeTab, setActiveTabState] = useState<TabType>(initialTab);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [orbitPlaying, setOrbitPlaying] = useState<boolean>(true);
  const [orbitZoom, setOrbitZoom] = useState<number>(1);
  const [orbitRotation, setOrbitRotation] = useState<number>(0);
  const [orbitFilter, setOrbitFilter] = useState<string>("all");


  // Sync state to URL without full navigation
  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    setSearchParams(prev => {
      prev.set("tab", tab);
      return prev;
    }, { replace: true });
  };

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab") as TabType;
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }

    const taskFromUrl = searchParams.get("task");
    if (taskFromUrl) {
      setSelectedTaskId(taskFromUrl);
      setSearchParams(prev => {
        prev.delete("task");
        return prev;
      }, { replace: true });
    }
  }, [searchParams, activeTab, setSelectedTaskId, setSearchParams]);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isCreateMilestoneOpen, setIsCreateMilestoneOpen] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{
    open: boolean;
    memberId: string | number | null;
    memberName: string;
  }>({ open: false, memberId: null, memberName: "" });

  const {
    data: project,
    isLoading: isProjectLoading,
    refetch: refetchProject,
  } = useProject(id || "");
  const { data: members = [], refetch: refetchMembers } = useProjectMembers(id || "");
  const { data: milestones = [], refetch: refetchMilestones } = useProjectMilestones(id || "");
  const { data: activities = [], refetch: refetchActivities } = useProjectActivities(id || "");

  const removeMemberMutation = useRemoveProjectMember(id || "");

  useEffect(() => {
    if (id) {
      refetchProject();
      refetchMembers();
      refetchMilestones();
      refetchActivities();
    }
  }, [id, refetchProject, refetchMembers, refetchMilestones, refetchActivities]);

  const handleOpenTasksBoard = () => {
    if (id) {
      setActiveProject(id);
      navigate("/tasks");
    }
  };

  const handleConfirmDeleteMember = () => {
    if (deleteModalState.memberId && id) {
      removeMemberMutation.mutate(deleteModalState.memberId, {
        onSuccess: () => {
          toast.success(t("Member removed successfully."));
          setDeleteModalState({ open: false, memberId: null, memberName: "" });
          refetchMembers();
          refetchProject();
        },
        onError: () => {
          toast.error(t("Could not remove member."));
        },
      });
    }
  };

  if (isProjectLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <span className="loading loading-spinner loading-md text-primary"></span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed border-base-content/15 bg-base-100 p-12 text-center">
        <p className="text-base font-semibold text-base-content">{t("Project not found")}</p>
        <button
          onClick={() => navigate("/projects")}
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-content"
        >
          {t("Back to Projects")}</button>
      </div>
    );
  }

  const rawColor = project.color || DEFAULT_COLOR;
  const themeColor = rawColor.startsWith("#") ? rawColor : DEFAULT_COLOR;
  const progress = project.progress_percentage || 0;

  const getProjectOwnerName = () => {
    if (project.owner) {
      const fullName =
        `${project.owner.first_name || ""} ${project.owner.last_name || ""}`.trim();
      if (fullName) return fullName;
      if (project.owner.username) return project.owner.username;
      if (project.owner.email) return project.owner.email;
    }
    return t("Project Admin");
  };

  const ownerName = getProjectOwnerName();

  const isOwnerMember = (m: ProjectMember) => {
    if (!project?.owner) return false;
    if (m.user?.id && project.owner.id && String(m.user.id) === String(project.owner.id)) {
      return true;
    }
    if (m.user?.username && project.owner.username && m.user.username === project.owner.username) {
      return true;
    }
    return false;
  };

  const nonOwnerMembers = members.filter((m: ProjectMember) => !isOwnerMember(m));

  const isOwner = project.owner?.id === user?.id;
  const isSuperUser = user?.is_superuser;
  const canViewSalaries = isSuperUser || isOwner || hasPermission("org.manage_settings");

  return (
    <div key={id} className="space-y-5 pb-10">
      {/* Top Header */}
      <div className="heledone-page-heading flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate("/projects")}
            className="flex size-8.5 shrink-0 items-center justify-center rounded-xl border border-base-content/10 bg-base-100 text-heledone-ink-muted transition hover:bg-base-200 hover:text-base-content"
            aria-label={t("Back to projects")}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {project.prefix && (
                <span
                  className="rounded-lg px-2 py-0.5 text-[13px] font-bold text-base-content bg-base-200 border border-heledone-border"
                  style={{ borderInlineStart: `3px solid ${themeColor}` }}
                >
                  {project.prefix}
                </span>
              )}
              <h1 className="text-xl font-bold tracking-tight text-base-content sm:text-2xl truncate min-w-0">
                {project.name}
              </h1>
              {canManageProject ? (
                <StatusDropdown
                  currentStatus={project.status}
                  onChange={(s) => {
                    if (!project) return;
                    updateProjectMutation.mutate({ id: project.id, data: { status: s } }, {
                      onSuccess: () => toast.success(t("Project status updated.")),
                      onError: () => toast.error(t("Failed to update status."))
                    });
                  }}
                  disabled={updateProjectMutation.isPending}
                />
              ) : (
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                    statusStyles[project.status] || statusStyles.draft
                  }`}
                >
                  {STATUS_OPTIONS.find((o) => o.value === project.status)?.label || project.status}
                </span>
              )}
            </div>
            {project.description && (
              <p className="mt-0.5 text-xs text-heledone-ink-muted line-clamp-1">
                {project.description}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenTasksBoard}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-white shadow-sm shadow-primary/25 hover:bg-primary/90 transition-all self-start sm:self-auto shrink-0"
        >
          <TaskSquare size={16} />
          <span>{t("Open Tasks Board")}</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-base-content/8 bg-base-100 p-1">
        {tabs
          .filter(t => t.id !== "reports" || (canManageProject || hasAnyPermission(["report.view"])))
          .filter(t => t.id !== "salaries" || canViewSalaries)
          .filter(t => t.id !== "billing" || canViewSalaries)
          .map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${activeTab === tab.id
                ? "bg-primary text-primary-content shadow-xs"
                : "text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
                }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
      </div>

      {/* Tab Panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-base-content">{t("Project overview")}</h2>
                  <p className="mt-1 text-xs text-heledone-ink-muted">{t("Track delivery health, milestones, and team activity.")}</p>
                </div>
                <ViewSwitcher
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  modes={["grid", "table", "orbit"]}
                  className="self-start sm:self-auto"
                />
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {viewMode === "orbit" ? (
                  <motion.div
                    key="orbit-view"
                    initial={{ opacity: 0, y: 8, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                    transition={{ duration: 0.2 }}
                  >
                    <OrbitView
                      project={project}
                      members={members}
                      milestones={milestones}
                      isPlaying={orbitPlaying}
                      onPlayPauseChange={setOrbitPlaying}
                      zoom={orbitZoom}
                      onZoomChange={setOrbitZoom}
                      rotation={orbitRotation}
                      onRotationChange={setOrbitRotation}
                      filter={orbitFilter}
                      onFilterChange={setOrbitFilter}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="overview-layout"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                  >
                    {/* Quick Metrics Bar */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
                        <p className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                          {t("Budget")}</p>
                        <p className="mt-1 text-sm font-bold text-base-content truncate">
                          {project.budget
                            ? `${Number(project.budget).toLocaleString(getIntlLocale())} ${project.budget_currency || "IRR"}`
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
                        <p className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                          {t("Deadline")}</p>
                        <p className="mt-1 text-sm font-bold text-base-content truncate">
                          {formatDate(project.deadline) ?? t("No deadline")}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
                        <p className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                          {t("Progress")}</p>
                        <p className="mt-1 text-sm font-bold text-primary">
                          {formatUiNumber(progress)}%
                        </p>
                      </div>
                      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-4">
                        <p className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                          {t("تسک‌ها")}</p>
                        <p className="mt-1 text-sm font-bold text-base-content">
                          {formatUiNumber(project.task_count || 0)}
                        </p>
                      </div>
                    </div>

                    {/* Two Column Section: Milestones & Team */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* Milestones */}
                      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-base-content uppercase tracking-wider">
                            {t("Upcoming Milestones")}</h3>
                          <button
                            onClick={() => setActiveTab("milestones")}
                            className="text-xs font-bold text-primary hover:underline"
                          >
                            {t("View all (")}{formatUiNumber(milestones.length)})
                          </button>
                        </div>

                        {milestones.length === 0 ? (
                          <p className="py-6 text-center text-xs text-heledone-ink-muted">
                            {t("No milestones defined yet.")}</p>
                        ) : (
                          <div className="space-y-2">
                            {milestones.slice(0, 3).map((ms: Milestone) => {
                              const msCfg = milestoneStatusConfig[ms.status] ?? milestoneStatusConfig.pending;
                              return (
                                <div
                                  key={ms.id}
                                  className="flex items-center justify-between rounded-xl border border-base-content/6 bg-base-200/40 px-3 py-2 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Flag size={14} className="shrink-0 text-primary" />
                                    <span className="font-semibold text-base-content truncate">
                                      {ms.title}
                                    </span>
                                  </div>
                                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[13px] font-bold ${msCfg.cls}`}>
                                    {msCfg.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Team */}
                      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-base-content uppercase tracking-wider">
                            {t("Team Members")}</h3>
                          <button
                            onClick={() => setActiveTab("members")}
                            className="text-xs font-bold text-primary hover:underline"
                          >
                            {canManageProject ? t("Manage") : t("View all")} ({formatUiNumber(members.length)})
                          </button>
                        </div>

                        <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
                          <ProfileAvatar
                            src={project.owner?.avatar_url || project.owner?.avatar}
                            name={ownerName}
                            className="size-7 shrink-0 overflow-hidden rounded-lg"
                            fallbackClassName="flex size-full items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-content"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-base-content truncate">{ownerName}</p>
                            <p className="text-[13px] font-semibold text-primary">{t("Project Owner")}</p>
                          </div>
                        </div>

                        {nonOwnerMembers.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            {nonOwnerMembers.slice(0, 4).map((m: ProjectMember) => (
                              <div
                                key={m.id}
                                className="flex items-center gap-2 rounded-xl border border-base-content/6 bg-base-200/40 p-2 text-xs"
                              >
                                <ProfileAvatar src={m.user?.avatar_url || m.user?.avatar} name={getUserDisplayName(m)} className="size-6 shrink-0 overflow-hidden rounded-md" fallbackClassName="flex size-full items-center justify-center rounded-md bg-primary/10 text-[13px] font-bold text-primary" />
                                <span className="font-semibold text-base-content truncate text-[13px]">
                                  {getUserDisplayName(m)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── MEMBERS TAB ── */}
          {activeTab === "members" && (() => {
            const individualMembers = members.filter((m: ProjectMember) => !m.team && Boolean(m.user) && !isOwnerMember(m));
            const teamMembers = members.filter((m: ProjectMember) => !!m.team);

            return (
              <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-base-content/8 pb-3">
                  <h3 className="text-sm font-bold text-base-content">
                    {t("Project Members & Teams (")}{formatUiNumber(individualMembers.length + teamMembers.length + 1)})
                  </h3>
                  {canManageProject && (
                    <button
                      type="button"
                      onClick={() => setIsAddMemberOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-content"
                    >
                      <Add size={14} />  {t("Add Member")}</button>
                  )}
                </div>

                {/* Members Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-base-content uppercase tracking-wider">
                    {t("Members (")}{formatUiNumber(individualMembers.length + 1)})
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Owner Card */}
                    <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProfileAvatar
                          src={project.owner?.avatar_url || project.owner?.avatar}
                          name={ownerName}
                          className="size-8 shrink-0 overflow-hidden rounded-lg"
                          fallbackClassName="flex size-full items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-content"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-base-content truncate">{ownerName}</p>
                          <p className="text-[13px] font-semibold text-primary">{t("Owner")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Assigned Users */}
                    {individualMembers.map((m: ProjectMember) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-xl border border-base-content/8 bg-base-200/40 p-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ProfileAvatar src={m.user?.avatar_url || m.user?.avatar} name={getUserDisplayName(m)} className="size-8 shrink-0 overflow-hidden rounded-lg" fallbackClassName="flex size-full items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-base-content truncate">
                              {getUserDisplayName(m)}
                            </p>
                            <p className="text-[13px] font-medium text-heledone-ink-muted truncate">
                              {m.specialty || t("Member")}
                            </p>
                          </div>
                        </div>
                        {canManageProject && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteModalState({
                                open: true,
                                memberId: m.id,
                                memberName: getUserDisplayName(m),
                              })
                            }
                            className="grid size-6 place-items-center rounded-lg text-error hover:bg-error/10 transition-all shrink-0"
                            aria-label={t("Remove member")}
                          >
                            <Trash size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Teams Section */}
                {teamMembers.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-base-content/8">
                    <h4 className="text-xs font-bold text-base-content uppercase tracking-wider">
                      {t("Teams (")}{formatUiNumber(teamMembers.length)})
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {teamMembers.map((m: ProjectMember) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between rounded-xl border border-base-content/8 bg-base-200/40 p-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
                              <People size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-base-content truncate">
                                {getUserDisplayName(m)}
                              </p>
                              <p className="text-[13px] font-medium text-heledone-ink-muted truncate">
                                {m.specialty || t("Team Squad")}
                              </p>
                            </div>
                          </div>
                          {canManageProject && (
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteModalState({
                                  open: true,
                                  memberId: m.id,
                                  memberName: getUserDisplayName(m),
                                })
                              }
                              className="grid size-6 place-items-center rounded-lg text-error hover:bg-error/10 transition-all shrink-0"
                              aria-label={t("Remove team")}
                            >
                              <Trash size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── MILESTONES TAB ── */}
          {activeTab === "milestones" && (
            <MilestonesTab
              milestones={milestones}
              projectId={id || ""}
              project={project}
              onCreateMilestone={() => setIsCreateMilestoneOpen(true)}
            />
          )}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === "activity" && (
            <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5 space-y-4">
              <h3 className="text-sm font-bold text-base-content border-b border-base-content/8 pb-3">
                {t("Activity Feed")}</h3>
              {activities.length === 0 ? (
                <p className="py-8 text-center text-xs text-heledone-ink-muted">
                  {t("No recent activity logged for this project.")}</p>
              ) : (
                <div className="space-y-2">
                  {activities.map((act: ProjectActivity) => {
                    const actorName =
                      act.actor?.full_name || act.actor?.username || t("System");
                    return (
                      <div
                        key={act.id}
                        className="flex items-center justify-between rounded-xl border border-base-content/5 bg-base-200/30 px-3.5 py-2.5 text-xs"
                      >
                        <p className="font-medium text-base-content/80 truncate">
                          <span className="font-bold text-primary">{actorName}</span>
                          {" "}
                          {act.event_type_display || act.event_type}
                        </p>
                        <span className="shrink-0 text-[13px] font-semibold text-heledone-ink-muted ms-2">
                          {formatDate(act.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* ── ANALYTICS TAB ── */}
          {activeTab === "analytics" && (
            <div className="space-y-5">
              <CumulativeFlowChart projectId={id || ""} />
              <CycleLeadTimeReport projectId={id || ""} />
            </div>
          )}
          {/* ── REPORTS TAB ── */}
          {activeTab === "reports" && (
            <ProjectReportView projectId={id || ""} />
          )}
          {/* ── SALARIES TAB ── */}
          {activeTab === "salaries" && (
            <ProjectMemberSalaryPanel projectId={id || ""} members={members} />
          )}
          {/* ── BILLING TAB ── */}
          {activeTab === "billing" && (
            <ProjectBillingTab projectId={id || ""} />
          )}
        </motion.div>
      </AnimatePresence>

      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        projectId={id || ""}
        orgId={
          project?.organization
            ? String(
              typeof project.organization === "object"
                ? project.organization.id
                : project.organization
            )
            : undefined
        }
      />
      <CreateMilestoneModal
        isOpen={isCreateMilestoneOpen}
        onClose={() => setIsCreateMilestoneOpen(false)}
        projectId={id || ""}
      />
      <DeleteConfirmModal
        isOpen={deleteModalState.open}
        onClose={() =>
          setDeleteModalState({ open: false, memberId: null, memberName: "" })
        }
        onConfirm={handleConfirmDeleteMember}
        isLoading={removeMemberMutation.isPending}
        title={deleteModalState.memberName}
      />

      <TaskSheet
        task={taskQuery.data ?? null}
        onClose={() => setSelectedTaskId(null)}
        onPatch={(taskId, patch) => {
          queryClient.setQueryData(["task", String(taskId)], (old: any) =>
            old ? { ...old, ...patch } : old
          );
          queryClient.invalidateQueries({ queryKey: ["unlinked-tasks", id] });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </div>
  );
}
