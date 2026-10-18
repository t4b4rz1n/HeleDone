import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { getWorkflowAppearance } from "../../../core/config/designTokens";
import { formatDisplayDate } from "../../../utils/date";
import { createPortal } from "react-dom";
import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar1, Flag,
  CloseCircle,
  More,
  Play,
  Profile2User,
  Stop,
  TaskSquare,
  TickCircle,
  Trash,
} from "iconsax-reactjs";
import { toast } from "sonner";
import { ConfirmationModal } from "../../../components/ConfirmationModal";
import { deleteTask, getProjectMembers, updateTask } from "../api/tasksApi";
import { useTaskStore } from "../store/useTaskStore";
import type { Task } from "../types";
import type { TimeLog } from "../../attendance/types";
import { LiveActivityIndicator } from "./LiveActivityIndicator";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onPlayTimer?: (taskId: string | number) => void;
  onStopTimer?: (taskId: string | number) => void;
  onMarkDone?: (taskId: string | number) => void;
  onToggleDone?: (taskId: string | number) => void;
  activeTimer?: TimeLog | null;
  onDueDateClick?: () => void;
}


const priorityLeftBorder: Record<Task["priority"], string> = {
  low:      "#DCE6E2",
  medium:   "#A7D4CD",
  high:     "#F2BA49",
  critical: "#EBC0AF",
};



import { useAuthStore } from "../../auth/store/authStore";
import { usePermissions } from "../../auth/hooks/usePermissions";

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onClick,
  onPlayTimer,
  onStopTimer,
  onMarkDone,
  onToggleDone,
  activeTimer,
  onDueDateClick,
}) => {
  const t = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const { hasPermission, isStaff } = usePermissions();

  const currentUserId = currentUser?.id;
  const isAssignee = Boolean(
    currentUserId &&
      (String(task.assignee) === String(currentUserId) ||
        String(task.assignee_detail?.id) === String(currentUserId) ||
        task.assignees?.some(id => String(id) === String(currentUserId)) ||
        task.assignees_detail?.some(u => String(u.id) === String(currentUserId)))
  );
  const isReporter = Boolean(
    currentUserId &&
      (String(task.reporter) === String(currentUserId) ||
        String((task as any).reporter_detail?.id) === String(currentUserId))
  );
  const canManageAll = hasPermission("task.manage_all") || isStaff;
  const canEditTask = canManageAll || isAssignee || isReporter || hasPermission("task.create");
  const canDeleteTask = canManageAll || isReporter;


  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showMembersMenu, setShowMembersMenu] = useState(false);
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const assigneeTriggerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();


  const isActuallyDone = Boolean(task.is_finished);
  const isOverdue = Boolean(
    task.due_date && new Date(task.due_date).getTime() < Date.now() && !isActuallyDone
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("تسک حذف شد"));
    },
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || "Could not delete task.")),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Task>) => updateTask(task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["taskActivities", task.id] });
    },
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || "Could not update task.")),
  });

  const storeProjectId = useTaskStore((state) => state.activeProjectId);
  const effectiveProjectId = task.project || storeProjectId;

  const { data: users = [] } = useQuery({
    queryKey: ["projectUsers", effectiveProjectId],
    queryFn: async () => {
      if (!effectiveProjectId) return [];
      const members = await getProjectMembers(effectiveProjectId.toString());
      return (members || [])
        .map((member: any) => member?.user)
        .filter((u: any) => Boolean(u && u.id));
    },
    enabled: Boolean(effectiveProjectId),
    staleTime: 30_000,
  });

  const closeMenu = () => {
    setIsMenuOpen(false);
    setShowMembersMenu(false);
    setIsAssigneePopoverOpen(false);
  };

  const initials = task.assignee_detail
    ? (task.assignee_detail.first_name || task.assignee_detail.last_name
        ? `${task.assignee_detail.first_name?.[0] || ""}${task.assignee_detail.last_name?.[0] || ""}`
        : task.assignee_detail.username?.[0] || "?").toUpperCase()
    : "";


  const timerBelongsToTask = Boolean(
    activeTimer && activeTimer.task.toString() === task.id.toString()
  );
  const timerIsRunning = Boolean(task.is_active_timer_running || timerBelongsToTask);
  const [now, setNow] = useState(Date.now());
  const [localStartedAt, setLocalStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!timerIsRunning) {
      setLocalStartedAt(null);
      return undefined;
    }
    setLocalStartedAt((prev) => prev || Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timerIsRunning]);

  const elapsedSeconds = timerBelongsToTask && activeTimer
    ? Math.max(
        0,
        Math.floor((now - new Date(activeTimer.start_time).getTime()) / 1000) +
          Number(activeTimer.duration_seconds || 0)
      )
    : timerIsRunning && localStartedAt
    ? Number(task.spent_seconds || 0) + Math.max(0, Math.floor((now - localStartedAt) / 1000))
    : Number(task.spent_seconds || 0);

  const formattedElapsed = [
    Math.floor(elapsedSeconds / 3600),
    Math.floor((elapsedSeconds % 3600) / 60),
    elapsedSeconds % 60,
  ]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");


  return (
    <>
      <article
        onClick={onClick}
        className={`group relative cursor-pointer rounded-2xl border bg-base-100 p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
          isOverdue
            ? "border-error/30"
            : task.is_blocked
            ? "border-error/30"
            : "border-base-content/8 hover:border-base-content/20"
        } ${isActuallyDone ? "border-success/20" : ""}`}
        style={{
          borderInlineStartWidth: "3px",
          borderInlineStartColor: priorityLeftBorder[task.priority],
        }}
        aria-label={t("Open task {value0}: {value1}", { value0: task.key, value1: task.title })}
      >
        {/* Loading overlay */}
        {(updateMutation.isPending || deleteMutation.isPending) && (
          <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-base-100/75 backdrop-blur-[2px]">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        )}

        {/* ─── Top Hover Options Menu ─── */}
        <button
          ref={menuTriggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen(true);
          }}
          className="absolute top-2 end-2 z-10 grid size-6 place-items-center rounded-lg text-heledone-ink-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-base-200 hover:text-base-content transition duration-150"
          aria-label={t("Actions for {value0}", { value0: task.title })}
        >
          <More size={14} />
        </button>

        {/* ─── Title & Checkbox (Inline with ) ─── */}
        <div className="flex items-start gap-2 pe-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              (onToggleDone || onMarkDone)?.(task.id);
            }}
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded transition ${
              isActuallyDone
                ? "bg-success text-success-content"
                : "border border-heledone-ink-muted hover:border-success hover:bg-success/10"
            }`}
            title={isActuallyDone ? t("بازگشت به انجام") : t("ثبت انجام‌شدن")}
          >
            {isActuallyDone && <TickCircle size={11} variant="Bold" />}
          </button>

          <div className="min-w-0 flex-1">
            <h3

              className={`text-sm font-semibold leading-relaxed tracking-tight ${
                isActuallyDone
                  ? "text-heledone-ink-muted line-through"
                  : "text-base-content"
              }`}
            >
              {task.title}
            </h3>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full px-2.5 py-0.5 font-medium" style={{ color: getWorkflowAppearance(task.status_detail).ink, background: `color-mix(in srgb, ${getWorkflowAppearance(task.status_detail).color} 10%, transparent)` }}>{getWorkflowAppearance(task.status_detail).label}</span>
          {task.is_blocked && <span className="rounded-full bg-error/10 px-2.5 py-0.5 font-semibold text-error">{t("مسدود · نیاز به رفع مانع")}</span>}
        </div>

        {/* ─── Footer: Assignee Avatar, Metadata & Timer ─── */}
        <div className="mt-3 flex items-center justify-between border-t border-base-content/6 pt-2">

          <div className="flex items-center gap-3">
            {/* Assignee Interactive Trigger */}
            {(() => {
              const cardAssignees: any[] = (task.assignees_detail && task.assignees_detail.length > 0)
                ? task.assignees_detail
                : (task.assignee_detail ? [task.assignee_detail] : []);
              const tooltip = cardAssignees.length > 0
                ? t("Assigned to {value0}", { value0: cardAssignees.map(a => a.first_name || a.username).join(", ") })
                : canEditTask ? t("Assign member") : t("بدون مسئول");

              return (
                <button
                  ref={assigneeTriggerRef}
                  type="button"
                  disabled={!canEditTask}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canEditTask) {
                      setIsAssigneePopoverOpen(!isAssigneePopoverOpen);
                    }
                  }}
                  className={`rounded-full p-0.5 transition ${
                    canEditTask ? "hover:ring-2 hover:ring-primary/30" : "cursor-default"
                  }`}
                  title={tooltip}
                >
                  <div className="relative shrink-0">
                    {cardAssignees.length <= 1 ? (
                      <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary shadow-xs">
                        {cardAssignees[0]?.avatar_url || cardAssignees[0]?.avatar ? (
                          <img
                            src={cardAssignees[0].avatar_url || cardAssignees[0].avatar}
                            alt=""
                            className="size-6 rounded-full object-cover"
                          />
                        ) : cardAssignees[0] ? (
                          (cardAssignees[0].first_name?.[0] || cardAssignees[0].username?.[0] || "U").toUpperCase()
                        ) : (
                          initials || <Profile2User size={12} className="text-heledone-ink-muted" />
                        )}
                      </span>
                    ) : (
                      <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
                        {cardAssignees.slice(0, 3).map((a) => (
                          <span
                            key={a.id}
                            className="grid size-6 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary shadow-xs ring-1 ring-base-100"
                          >
                            {a.avatar_url || a.avatar ? (
                              <img src={a.avatar_url || a.avatar} alt="" className="size-6 rounded-full object-cover" />
                            ) : (
                              (a.first_name?.[0] || a.username?.[0] || "U").toUpperCase()
                            )}
                          </span>
                        ))}
                        {cardAssignees.length > 3 && (
                          <span className="grid size-6 place-items-center rounded-full bg-base-200 text-[10px] font-bold text-heledone-ink-muted ring-1 ring-base-100">
                            +{cardAssignees.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {task.project && (
                      <div className="absolute -bottom-1 -end-1 z-10">
                        <LiveActivityIndicator
                          projectId={task.project.toString()}
                          taskId={task.id}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })()}


            {/* ─── Task Metadata (Due Date, Checklist & Milestone) ─── */}
            {(task.due_date || (task.checklist_stats && task.checklist_stats.total > 0) || task.milestone_detail) && (
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-medium text-heledone-ink-muted">
                {task.due_date && (
                  <div className={`flex items-center gap-1 ${isOverdue && !isActuallyDone ? 'text-error font-bold bg-error/10 px-1.5 py-0.5 rounded-md -ms-1' : ''}`} title={t("سررسید")}>
                    <Calendar1 size={13} variant={isOverdue && !isActuallyDone ? "Bold" : "Linear"} />
                    <span>{formatDisplayDate(task.due_date, "MMM d")}</span>
                  </div>
                )}
                {task.milestone_detail && (
                  <div className="flex items-center gap-1 max-w-[100px]" title={t("Milestone")}>
                    <Flag size={13} className="shrink-0" />
                    <span className="truncate">{task.milestone_detail.title}</span>
                  </div>
                )}
                {task.checklist_stats && task.checklist_stats.total > 0 && (
                  <div className={`flex items-center gap-1 ${task.checklist_stats.done === task.checklist_stats.total && !isActuallyDone ? 'text-success font-bold bg-success/10 px-1.5 py-0.5 rounded-md -ms-1' : ''}`} title={t("Checklist items")}>
                    <TaskSquare size={13} variant={task.checklist_stats.done === task.checklist_stats.total && !isActuallyDone ? "Bold" : "Linear"} />
                    <span>{formatUiNumber(task.checklist_stats.done)}/{formatUiNumber(task.checklist_stats.total)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timer controls (visible always if running, or on hover if not running) */}
          <div className={`flex items-center gap-1.5 shrink-0 transition-opacity duration-150 ${timerIsRunning ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100"}`}>
            {timerIsRunning && (
              <span className="font-mono text-[13px] font-bold tabular-nums text-success bg-success/10 px-1.5 py-0.5 rounded-md">
                {formattedElapsed}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (timerIsRunning) onStopTimer?.(task.id);
                else onPlayTimer?.(task.id);
              }}
              className={`grid size-6.5 place-items-center rounded-lg transition ${
                timerIsRunning
                  ? "bg-error/10 text-error hover:bg-error/20"
                  : "bg-base-200/80 text-heledone-ink-muted hover:bg-primary/10 hover:text-primary"
              }`}
              title={timerIsRunning ? t("توقف زمان‌سنج") : t("شروع زمان‌سنج")}
            >
              {timerIsRunning ? <Stop size={13} /> : <Play size={13} />}
            </button>
          </div>
        </div>
      </article>

      {/* ─── Direct Assignee Quick Select Popover Portal ─── */}
      {isAssigneePopoverOpen &&
        assigneeTriggerRef.current &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <div
              className="fixed z-50 w-48 max-h-60 overflow-y-auto rounded-2xl border border-base-content/10 bg-base-100 p-1.5 text-[13px] font-semibold text-base-content shadow-2xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                top: assigneeTriggerRef.current.getBoundingClientRect().bottom + 250 > window.innerHeight
                  ? assigneeTriggerRef.current.getBoundingClientRect().top - 4
                  : assigneeTriggerRef.current.getBoundingClientRect().bottom + 4,
                transform: assigneeTriggerRef.current.getBoundingClientRect().bottom + 250 > window.innerHeight
                  ? 'translateY(-100%)'
                  : 'none',
                left: assigneeTriggerRef.current.getBoundingClientRect().left,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1 text-[13px] font-bold text-heledone-ink-muted uppercase tracking-wider">
                {t("Assign to")}</div>

              {/* Unassigned Option */}
              {(() => {
                const currentAssigneeIds: (string | number)[] = (task.assignees && task.assignees.length > 0)
                  ? task.assignees
                  : (task.assignees_detail && task.assignees_detail.length > 0)
                  ? task.assignees_detail.map((a: any) => a.id)
                  : task.assignee ? [task.assignee] : [];

                return (
                  <>
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start transition ${
                        currentAssigneeIds.length === 0 ? "bg-primary/10 text-primary font-bold" : "hover:bg-base-200"
                      }`}
                      onClick={() => {
                        updateMutation.mutate({ assignees: [] });
                        closeMenu();
                      }}
                    >
                      <Profile2User size={14} className="text-heledone-ink-muted" />
                      <span>{t("بدون مسئول")}</span>
                    </button>

                    {/* Users List */}
                    {users.map((user: any) => {
                      const isSelected = currentAssigneeIds.some((id: any) => String(id) === String(user.id));
                      return (
                        <button
                          type="button"
                          key={user.id}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-start transition ${
                            isSelected
                              ? "bg-primary/10 text-primary font-bold"
                              : "hover:bg-base-200"
                          }`}
                          onClick={() => {
                            const newIds = isSelected
                              ? currentAssigneeIds.filter((id: any) => String(id) !== String(user.id))
                              : [...currentAssigneeIds, user.id];
                            updateMutation.mutate({ assignees: newIds });
                          }}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary shrink-0">
                              {(user.first_name?.[0] || user.full_name?.[0] || user.username?.[0] || user.email?.[0] || "?").toUpperCase()}
                            </span>
                            <span className="truncate flex items-center gap-1">
                              <span>
                                {user.first_name || user.last_name
                                  ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                                  : user.full_name || user.username || user.email || t("Unknown Member")}
                              </span>
                              {user.username && (
                                <span className="text-[13px] text-heledone-ink-muted font-normal">
                                  (@{user.username})
                                </span>
                              )}
                            </span>
                          </div>
                          {isSelected && <span className="text-primary text-xs shrink-0">✓</span>}
                        </button>
                      );
                    })}
                  </>
                );
              })()}


              {users.length === 0 && (
                <div className="px-2 py-2 text-[13px] text-heledone-ink-muted">
                  {t("No members found")}</div>
              )}
            </div>
          </>,
          document.body
        )}

      {/* Dropdown Menu Portal */}
      {isMenuOpen &&
        menuTriggerRef.current &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <div
              className="fixed z-50 w-52 rounded-2xl border border-base-content/10 bg-base-100 p-1.5 text-[13px] font-semibold text-base-content shadow-2xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                top: menuTriggerRef.current.getBoundingClientRect().bottom + 250 > window.innerHeight
                  ? menuTriggerRef.current.getBoundingClientRect().top - 4
                  : menuTriggerRef.current.getBoundingClientRect().bottom + 4,
                transform: menuTriggerRef.current.getBoundingClientRect().bottom + 250 > window.innerHeight
                  ? 'translateY(-100%)'
                  : 'none',
                left: menuTriggerRef.current.getBoundingClientRect().right - 208,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {showMembersMenu ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMembersMenu(false)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-heledone-ink-muted hover:bg-base-200"
                  >
                    <CloseCircle size={15} />  {t("بازگشت")}</button>
                  {(() => {
                    const currentAssigneeIds: (string | number)[] = (task.assignees && task.assignees.length > 0)
                      ? task.assignees
                      : (task.assignees_detail && task.assignees_detail.length > 0)
                      ? task.assignees_detail.map((a: any) => a.id)
                      : task.assignee ? [task.assignee] : [];

                    return (
                      <>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-base-200"
                          onClick={() => {
                            updateMutation.mutate({ assignees: [] });
                            closeMenu();
                          }}
                        >
                          <Profile2User size={15} />  {t("بدون مسئول")}
                        </button>
                        {users.map((user: any) => {
                          const isSelected = currentAssigneeIds.some((id: any) => String(id) === String(user.id));
                          return (
                            <button
                              type="button"
                              key={user.id}
                              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start hover:bg-base-200 ${
                                isSelected ? "bg-primary/10 text-primary font-bold" : ""
                              }`}
                              onClick={() => {
                                const newIds = isSelected
                                  ? currentAssigneeIds.filter((id: any) => String(id) !== String(user.id))
                                  : [...currentAssigneeIds, user.id];
                                updateMutation.mutate({ assignees: newIds });
                              }}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-[13px] text-primary shrink-0">
                                  {(user.first_name?.[0] || user.full_name?.[0] || user.username?.[0] || user.email?.[0] || "?").toUpperCase()}
                                </span>
                                <span className="truncate">
                                  {user.first_name || user.last_name
                                    ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                                    : user.full_name || user.username || user.email || t("Unknown Member")}
                                </span>
                              </div>
                              {isSelected && <span className="text-primary text-xs shrink-0">✓</span>}
                            </button>
                          );
                        })}
                      </>
                    );
                  })()}

                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start hover:bg-base-200"
                    onClick={() => {
                      closeMenu();
                      onClick();
                    }}
                  >
                    <TaskSquare size={15} className="text-primary" />  {t("Open task sheet")}</button>

                  {canEditTask && (
                    <>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start hover:bg-base-200"
                        onClick={() => setShowMembersMenu(true)}
                      >
                        <Profile2User size={15} className="text-heledone-ink-muted" />  {t("Change assignee")}</button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start hover:bg-base-200"
                        onClick={() => {
                          closeMenu();
                          onDueDateClick?.();
                        }}
                      >
                        <Calendar1 size={15} className="text-heledone-ink-muted" />
                        <span className="flex-1">{t("سررسید")}</span>
                      </button>
                    </>
                  )}

                  {canDeleteTask && (
                    <>
                      <div className="my-1 h-px bg-base-content/8" />
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-error hover:bg-error"
                        onClick={() => {
                          closeMenu();
                          setIsDeleteModalOpen(true);
                        }}
                      >
                        <Trash size={15} />  {t("Delete task")}</button>
                    </>
                  )}
                </>
              )}
            </div>
          </>,
          document.body
        )}


      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          setIsDeleteModalOpen(false);
          deleteMutation.mutate();
        }}
        title={t("Delete task?")}
        message={t("This will remove \"{value0}\" from the workspace.", { value0: task.title })}
      />
    </>
  );
};
