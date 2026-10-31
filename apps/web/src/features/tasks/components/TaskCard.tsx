import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { getWorkflowAppearance } from "../../../core/config/designTokens";
import { formatDisplayDate } from "../../../utils/date";
import { createPortal } from "react-dom";
import { useEffect, useState, useRef, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar1, Flag,
  CloseCircle,
  More,
  Play,
  Profile2User,
  SearchNormal1,
  Stop,
  TaskSquare,
  TickCircle,
  Trash,
} from "iconsax-reactjs";
import { toast } from "sonner";
import { ConfirmationModal } from "../../../components/ConfirmationModal";
import { deleteTask, updateTask } from "../api/tasksApi";
import { useProjectMembers } from "../../projects/hooks/useProjects";
import { projectMemberUsers } from "../utils/projectMemberUsers";
import { useTaskStore } from "../store/useTaskStore";
import type { Task, User } from "../types";
import type { TimeLog } from "../../attendance/types";
import { LiveActivityIndicator } from "./LiveActivityIndicator";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onPatch?: (taskId: string | number, patch: Partial<Task>) => void;
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
  onPatch,
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
  const isTeamLead = hasPermission("report.view_team_lead");
  const canManageAll = hasPermission("task.manage_all") || isStaff;
  const canEditTask = canManageAll || isTeamLead || isAssignee || isReporter || hasPermission("task.create");
  const canDeleteTask = canManageAll || isReporter;


  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showMembersMenu, setShowMembersMenu] = useState(false);
  const [isAssigneePopoverOpen, setIsAssigneePopoverOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
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
    onError: (error: any) => toast.error(translateError(error, "Could not delete task.")),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Task>) => updateTask(task.id, data),
    onMutate: async (data: Partial<Task>) => {
      onPatch?.(task.id, data);
      const queryFilter = { queryKey: ["tasks"] };
      await queryClient.cancelQueries(queryFilter);
      queryClient.setQueriesData<any>(queryFilter, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.map((t: any) => (String(t.id) === String(task.id) ? { ...t, ...data } : t));
        }
        if (old.results && Array.isArray(old.results)) {
          return {
            ...old,
            results: old.results.map((t: any) => (String(t.id) === String(task.id) ? { ...t, ...data } : t)),
          };
        }
        return old;
      });
    },
    onSuccess: (updatedTask: Task) => {
      if (updatedTask && updatedTask.id) {
        onPatch?.(updatedTask.id, updatedTask);
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["taskActivities", task.id] });
    },
    onError: (error: any) => toast.error(translateError(error, "Could not update task.")),
  });

  const storeProjectId = useTaskStore((state) => state.activeProjectId);
  const effectiveProjectId = task.project || storeProjectId;

  const { data: rawProjectMembers = [] } = useProjectMembers(effectiveProjectId || "");
  const users: User[] = useMemo(() => projectMemberUsers(rawProjectMembers), [rawProjectMembers]);
  const resolveCardAssignees = (t: Task, memberUsers: User[]): User[] => {
    if (t.assignees_detail && t.assignees_detail.length > 0) {
      return t.assignees_detail;
    }
    if (t.assignees && t.assignees.length > 0) {
      const fromUsers = t.assignees
        .map((id) => memberUsers.find((user) => String(user.id) === String(id)))
        .filter((user): user is User => Boolean(user));
      if (fromUsers.length > 0) return fromUsers;
    }
    if (t.assignee_detail) return [t.assignee_detail];
    if (t.assignee) {
      const user = memberUsers.find((member) => String(member.id) === String(t.assignee));
      if (user) return [user];
    }
    return [];
  };

  const [localAssignees, setLocalAssignees] = useState<any[] | null>(null);

  useEffect(() => {
    setLocalAssignees(null);
  }, [task.id]);

  const cardAssignees: any[] = useMemo(() => {
    if (localAssignees !== null) return localAssignees;
    return resolveCardAssignees(task, users);
  }, [localAssignees, task, users]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    setShowMembersMenu(false);
    setIsAssigneePopoverOpen(false);
    setAssigneeSearch("");
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
                      cardAssignees[0] ? (
                        <ProfileAvatar
                          src={cardAssignees[0].avatar_url || cardAssignees[0].avatar}
                          name={`${cardAssignees[0].first_name || ""} ${cardAssignees[0].last_name || cardAssignees[0].username || ""}`}
                          className="size-6 overflow-hidden rounded-full shadow-xs"
                          fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary"
                        />
                      ) : (
                        <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary shadow-xs">
                          {initials || <Profile2User size={12} className="text-heledone-ink-muted" />}
                        </span>
                      )
                    ) : (
                      <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
                        {cardAssignees.slice(0, 3).map((a) => (
                          <ProfileAvatar
                            key={a.id}
                            src={a.avatar_url || a.avatar}
                            name={`${a.first_name || ""} ${a.last_name || a.username || ""}`}
                            className="size-6 shrink-0 overflow-hidden rounded-full shadow-xs ring-1 ring-base-100"
                            fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
                          />
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
              className="fixed z-50 w-64 max-h-80 overflow-hidden flex flex-col rounded-2xl border border-base-content/10 bg-base-100 p-2 text-[13px] font-semibold text-base-content shadow-2xl animate-in fade-in zoom-in-95 duration-100"
              style={{
                top: assigneeTriggerRef.current.getBoundingClientRect().bottom + 290 > window.innerHeight
                  ? assigneeTriggerRef.current.getBoundingClientRect().top - 4
                  : assigneeTriggerRef.current.getBoundingClientRect().bottom + 4,
                transform: assigneeTriggerRef.current.getBoundingClientRect().bottom + 290 > window.innerHeight
                  ? 'translateY(-100%)'
                  : 'none',
                left: assigneeTriggerRef.current.getBoundingClientRect().left,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-2 py-1 border-b border-base-content/6 mb-1.5">
                <span className="text-xs font-bold text-heledone-ink-muted uppercase tracking-wider">
                  {t("مسئولین تسک")}
                </span>
                {cardAssignees.length > 0 && (
                  <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {formatUiNumber(cardAssignees.length)} {t("نفر")}
                  </span>
                )}
              </div>

              {/* Search Box */}
              <div className="relative mb-2 px-1">
                <div className="flex items-center gap-1.5 rounded-xl border border-base-content/10 bg-base-200/50 px-2.5 py-1.5 text-xs">
                  <SearchNormal1 size={13} className="text-heledone-ink-muted shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    placeholder={t("جستجو...")}
                    className="w-full bg-transparent outline-none placeholder:text-heledone-ink-muted text-xs font-medium"
                  />
                  {assigneeSearch && (
                    <button
                      type="button"
                      onClick={() => setAssigneeSearch("")}
                      className="text-xs text-heledone-ink-muted hover:text-base-content"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Actions & List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pe-0.5">
                {(() => {
                  const currentAssigneeIds: (string | number)[] = cardAssignees.map((a: any) => a.id);
                  const filteredUsers = users.filter((u: any) => {
                    if (!assigneeSearch.trim()) return true;
                    const q = assigneeSearch.toLowerCase();
                    const name = `${u.first_name || ""} ${u.last_name || ""} ${u.username || ""} ${u.email || ""}`.toLowerCase();
                    return name.includes(q);
                  });

                  return (
                    <>
                      {/* Unassigned / Clear All Option */}
                      <button
                        type="button"
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-start transition ${
                          currentAssigneeIds.length === 0 ? "bg-primary/10 text-primary font-bold" : "hover:bg-base-200"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const patch = {
                            assignees: [],
                            assignees_detail: [],
                            assignee: null,
                            assignee_detail: null,
                          };
                          setLocalAssignees([]);
                          onPatch?.(task.id, patch);
                          updateMutation.mutate(patch as any);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Profile2User size={14} className="text-heledone-ink-muted" />
                          <span>{t("بدون مسئول (حذف همه)")}</span>
                        </div>
                        {currentAssigneeIds.length === 0 && <span className="text-primary text-xs">✓</span>}
                      </button>

                      {/* Filtered Users List */}
                      {filteredUsers.map((item: any) => {
                        const user = item.user || item;
                        const isSelected = currentAssigneeIds.some((id: any) => String(id) === String(user.id));
                        const displayName = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || user.email || t("Unknown Member");
                        const avatarSrc = user.avatar_url || user.avatar;
                        return (
                          <button
                            type="button"
                            key={user.id}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-start transition ${
                              isSelected
                                ? "bg-primary/10 text-primary font-bold"
                                : "hover:bg-base-200"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const newAssignees = isSelected
                                ? cardAssignees.filter((a: any) => String(a.id) !== String(user.id))
                                : [...cardAssignees, user];
                              const newIds = newAssignees.map((a: any) => a.id);
                              const patch = {
                                assignees: newIds,
                                assignees_detail: newAssignees,
                                assignee: newIds[0] || null,
                                assignee_detail: newAssignees[0] || null,
                              };
                              setLocalAssignees(newAssignees);
                              onPatch?.(task.id, patch);
                              updateMutation.mutate(patch as any);
                            }}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <ProfileAvatar src={avatarSrc} name={displayName} className="size-5.5 shrink-0 overflow-hidden rounded-full ring-1 ring-base-content/5" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary" />
                              <span className="truncate flex items-center gap-1">
                                <span className="text-xs">
                                  {displayName}
                                </span>
                                {user.username && (
                                  <span className="text-[11px] text-heledone-ink-muted font-normal truncate">
                                    (@{user.username})
                                  </span>
                                )}
                              </span>
                            </div>
                            <span className={`size-4 rounded flex items-center justify-center text-xs shrink-0 transition ${
                              isSelected ? "bg-primary text-primary-content" : "border border-base-content/20"
                            }`}>
                              {isSelected ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}

                      {filteredUsers.length === 0 && (
                        <div className="px-2 py-4 text-center text-xs text-heledone-ink-muted">
                          {t("No members found")}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Done button */}
              <div className="pt-2 mt-1 border-t border-base-content/6 flex justify-end">
                <button
                  type="button"
                  onClick={closeMenu}
                  className="px-3 py-1 rounded-lg bg-primary text-primary-content text-xs font-bold shadow-xs hover:bg-primary/90 transition"
                >
                  {t("بستن")}
                </button>
              </div>
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
                    const currentAssigneeIds: (string | number)[] = cardAssignees.map((a: any) => a.id);

                    return (
                      <>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-base-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            const patch = {
                              assignees: [],
                              assignees_detail: [],
                              assignee: null,
                              assignee_detail: null,
                            };
                            setLocalAssignees([]);
                            onPatch?.(task.id, patch);
                            updateMutation.mutate(patch as any);
                            closeMenu();
                          }}
                        >
                          <Profile2User size={15} />  {t("بدون مسئول")}
                        </button>
                        {users.map((item: any) => {
                          const user = item.user || item;
                          const isSelected = currentAssigneeIds.some((id: any) => String(id) === String(user.id));
                          const displayName = user.full_name || `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || user.email || t("Unknown Member");
                          const avatarSrc = user.avatar_url || user.avatar;
                          return (
                            <button
                              type="button"
                              key={user.id}
                              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start hover:bg-base-200 ${
                                isSelected ? "bg-primary/10 text-primary font-bold" : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newAssignees = isSelected
                                  ? cardAssignees.filter((a: any) => String(a.id) !== String(user.id))
                                  : [...cardAssignees, user];
                                const newIds = newAssignees.map((a: any) => a.id);
                                const patch = {
                                  assignees: newIds,
                                  assignees_detail: newAssignees,
                                  assignee: newIds[0] || null,
                                  assignee_detail: newAssignees[0] || null,
                                };
                                setLocalAssignees(newAssignees);
                                onPatch?.(task.id, patch);
                                updateMutation.mutate(patch as any);
                              }}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <ProfileAvatar src={avatarSrc} name={displayName} className="size-5 shrink-0 overflow-hidden rounded-full" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary" />
                                <span className="truncate">
                                  {displayName}
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
