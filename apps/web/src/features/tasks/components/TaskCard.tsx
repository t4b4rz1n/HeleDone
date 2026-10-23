import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { createPortal } from "react-dom";
import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar1, Flag,
  CloseCircle,
  More,
  Profile2User,
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
import { MessageSquare, CheckSquare } from "lucide-react";
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
      String(task.assignee_detail?.id) === String(currentUserId))
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
  const timerBelongsToTask = Boolean(
    activeTimer &&
    String(activeTimer.task ?? (activeTimer as { task_id?: string | number }).task_id ?? "") === String(task.id)
  );
  const handleTimerToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (timerBelongsToTask) {
      onStopTimer?.(task.id);
      return;
    }
    onPlayTimer?.(task.id);
  };
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
      toast.error(translateError(error.response?.data?.detail || t("خطا در حذف تسک"))),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Task>) => updateTask(task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["taskActivities", task.id] });
    },
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || t("خطا در به‌روزرسانی تسک"))),
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
  const hasBadges = Boolean(task.milestone_detail || task.is_blocked || task.priority === 'critical' || task.priority === 'high');
  const hasMeta = Boolean(
    task.due_date ||
    (task.checklist_stats && task.checklist_stats.total > 0) ||
    task.subtasks_count > 0 ||
    (task.comments_count && task.comments_count > 0) ||
    (task.comments && task.comments.length > 0)
  );

  return (
    <>
      <article
        onClick={onClick}
        className={`group relative cursor-pointer rounded-lg border bg-base-100 p-2.5 shadow-xs transition-all duration-150 hover:shadow-md ${isOverdue
          ? "border-error/20 bg-error/[0.02]"
          : task.is_blocked
            ? "border-error/20 bg-error/[0.02]"
            : "border-base-300/60 hover:border-base-300"
          } ${isActuallyDone ? "opacity-70" : ""}`}
        aria-label={t("Open task {value0}: {value1}", { value0: task.key, value1: task.title })}
      >
        {/* Loading overlay */}
        {(updateMutation.isPending || deleteMutation.isPending) && (
          <div className="absolute inset-0 z-20 grid place-items-center rounded-2xl bg-base-100/75 backdrop-blur-[2px]">
            <span className="loading loading-spinner loading-sm text-primary" />
          </div>
        )}

        {/* ─── Top Header: Task Key & Options Menu ─── */}
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-extrabold text-heledone-ink-muted/80 tracking-tight">
              {task.key || `#${task.id}`}
            </span>
            {timerBelongsToTask ? (
              <button
                type="button"
                onClick={handleTimerToggle}
                className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-bold text-success transition hover:bg-success/15"
                aria-label={t("Stop timer")}
              >
                <span className="size-1.5 rounded-full bg-success animate-pulse" />
                {t("Timer running")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTimerToggle}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary transition hover:bg-primary/15"
                aria-label={t("Start timer")}
              >
                <span className="size-1.5 rounded-full bg-primary" />
                {t("Start timer")}
              </button>
            )}
          </div>

          <button
            ref={menuTriggerRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(true);
            }}
            className="grid size-5 place-items-center rounded-md text-heledone-ink-muted/60 opacity-0 group-hover:opacity-100 hover:bg-base-200 hover:text-base-content transition shrink-0"
            aria-label={t("Actions for {value0}", { value0: task.title })}
          >
            <More size={13} />
          </button>
        </div>

        {/* ─── Title & Checkbox ─── */}
        <div className="mb-2 flex items-start gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              (onToggleDone || onMarkDone)?.(task.id);
            }}
            className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded transition ${isActuallyDone
              ? "bg-success text-white"
              : "border border-base-300 hover:border-base-400"
              }`}
            title={isActuallyDone ? t("بازگشت به انجام") : t("ثبت انجام‌شدن")}
          >
            {isActuallyDone && <TickCircle size={11} variant="Bold" />}
          </button>

          <div className="min-w-0 flex-1">
            <h3
              className={`text-xs font-semibold leading-snug ${isActuallyDone
                ? "text-heledone-ink-muted/60 line-through"
                : "text-base-content"
                }`}
            >
              {task.title}
            </h3>
          </div>
        </div>

        {/* ─── Properties / Badges Row ─── */}
        {hasBadges && <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {/* Tags/Labels */}
          {task.milestone_detail && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-primary bg-primary/8 border border-primary/15">
              <Flag size={9} variant="Bold" />
              <span>{task.milestone_detail.title}</span>
            </span>
          )}

          {/* Priority Badge - Only show high/critical */}
          {(task.priority === 'critical' || task.priority === 'high') && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-600 bg-rose-500/8 border border-rose-500/15">
              <Flag size={9} variant="Bold" />
              <span>
                {task.priority === 'critical' ? t('بحرانی') : t('بالا')}
              </span>
            </span>
          )}

          {/* Blocked Badge */}
          {task.is_blocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-error bg-error/8 border border-error/15">
              {t("مسدود")}
            </span>
          )}
        </div>}

        {/* ─── Meta Info Row ─── */}
        {hasMeta && <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Due date */}
          {task.due_date && (
            <span
              onClick={(e) => {
                if (onDueDateClick) {
                  e.stopPropagation();
                  onDueDateClick();
                }
              }}
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${isOverdue && !isActuallyDone
                ? 'text-error font-bold'
                : 'text-heledone-ink-muted'
                }`}
              title={t("سررسید")}
            >
              <Calendar1 size={11} variant={isOverdue && !isActuallyDone ? "Bold" : "Linear"} />
              <span>{formatDisplayDate(task.due_date, "MMM d")}</span>
            </span>
          )}

          {/* Checklist stats */}
          {task.checklist_stats && task.checklist_stats.total > 0 && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${task.checklist_stats.done === task.checklist_stats.total && !isActuallyDone
                ? 'text-success font-bold'
                : 'text-heledone-ink-muted'
                }`}
              title={t("Checklist items")}
            >
              <CheckSquare size={11} />
              <span>{formatUiNumber(task.checklist_stats.done)}/{formatUiNumber(task.checklist_stats.total)}</span>
            </span>
          )}

          {/* Subtasks Count */}
          {task.subtasks_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-heledone-ink-muted bg-base-200/80 border border-base-300/50" title={t("زیرتسک‌ها")}>
              <TaskSquare size={10} />
              <span>{formatUiNumber(task.subtasks_count)} {t("زیرتسک")}</span>
            </span>
          )}

          {/* Comments count */}
          {Boolean((task.comments_count && task.comments_count > 0) || (task.comments && task.comments.length > 0)) && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-heledone-ink-muted">
              <MessageSquare size={11} />
              <span>{formatUiNumber(task.comments_count || task.comments?.length || 0)}</span>
            </span>
          )}
        </div>}

        {/* ─── Footer: Assignee ─── */}
        <div className="mt-2 flex items-center justify-between border-t border-base-200/60 pt-1.5">
          <div className="flex items-center gap-2">
            {/* Assignee Interactive Trigger */}
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
              className={`flex items-center gap-1.5 py-0.5 transition ${canEditTask ? "hover:opacity-80 cursor-pointer" : "cursor-default"
                }`}
              title={
                task.assignee_detail
                  ? t("Assigned to {value0}", { value0: task.assignee_detail.first_name || task.assignee_detail.username })
                  : canEditTask
                    ? t("Assign member")
                    : t("بدون مسئول")
              }
            >
              <div className="relative shrink-0">
                <span className="grid size-5 place-items-center rounded-full bg-base-200 text-[10px] font-bold text-base-content">
                  {task.assignee_detail?.avatar_url || task.assignee_detail?.avatar ? (
                    <img
                      src={
                        task.assignee_detail.avatar_url ||
                        task.assignee_detail.avatar
                      }
                      alt=""
                      className="size-5 rounded-full object-cover"
                    />
                  ) : (
                    initials || <Profile2User size={11} className="text-heledone-ink-muted" />
                  )}
                </span>
                {task.project && (
                  <div className="absolute -bottom-0.5 -end-0.5 z-10">
                    <LiveActivityIndicator
                      projectId={task.project.toString()}
                      taskId={task.id}
                    />
                  </div>
                )}
              </div>
              <span className="text-[11px] font-medium text-heledone-ink-muted truncate max-w-[110px]">
                {task.assignee_detail
                  ? (task.assignee_detail.first_name || task.assignee_detail.username)
                  : t("بدون مسئول")}
              </span>
            </button>
          </div>

          {/* Timer controls - hidden for cleaner card design */}
          <div className="hidden">
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
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start transition ${!task.assignee ? "bg-primary/10 text-primary font-bold" : "hover:bg-base-200"
                  }`}
                onClick={() => {
                  updateMutation.mutate({ assignee: undefined });
                  closeMenu();
                }}
              >
                <Profile2User size={14} className="text-heledone-ink-muted" />
                <span>{t("بدون مسئول")}</span>
              </button>

              {/* Users List */}
              {users.map((user: any) => {
                const isSelected = String(task.assignee) === String(user.id);
                return (
                  <button
                    type="button"
                    key={user.id}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start transition ${isSelected
                      ? "bg-primary/10 text-primary font-bold"
                      : "hover:bg-base-200"
                      }`}
                    onClick={() => {
                      updateMutation.mutate({ assignee: user.id });
                      closeMenu();
                    }}
                  >
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
                  </button>
                );
              })}

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
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-base-200"
                    onClick={() => {
                      updateMutation.mutate({ assignee: undefined });
                      closeMenu();
                    }}
                  >
                    <Profile2User size={15} />  {t("بدون مسئول")}</button>
                  {users.map((user: any) => (
                    <button
                      type="button"
                      key={user.id}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start hover:bg-base-200"
                      onClick={() => {
                        updateMutation.mutate({ assignee: user.id });
                        closeMenu();
                      }}
                    >
                      <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-[13px] text-primary">
                        {(user.first_name?.[0] || user.full_name?.[0] || user.username?.[0] || user.email?.[0] || "?").toUpperCase()}
                      </span>
                      <span className="truncate">
                        {user.first_name || user.last_name
                          ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                          : user.full_name || user.username || user.email || t("Unknown Member")}
                      </span>
                    </button>
                  ))}
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
