import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t as translate, useTranslation, formatRelativeTime } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { getWorkflowAppearance } from "../../../core/config/designTokens";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Clock3,
  FileText,
  MessageCircle,
  Activity,
  Copy,
  Sparkles,
  ChevronDown,
  Search,
  Check,
  Bold,
  Italic,
  List,
  Code,
  Link,
} from "lucide-react";
import { CustomDatePicker } from "../../../components/CustomDatePicker";
import { AnimatePresence, motion } from "motion/react";
import {
  Add,
  Calendar1,
  CloseCircle,
  CloseSquare,
  Danger,
  Paperclip2,
  Play,
  Profile2User,
  Send2,
  Stop,
  TaskSquare,
  Flag,
  TickCircle,
  Trash,
  Edit2,
} from "iconsax-reactjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TimeLog } from "../../attendance/types";
import type { Task } from "../types";
import { useTaskStore } from "../store/useTaskStore";
import { useAuthStore } from "../../auth/store/authStore";
import { getProjectMembers, getProjectMilestones } from "../../projects/api/projectsApi";
import { createManualLog } from "../../attendance/api/attendanceApi";
import {
  addChecklistItem,
  addComment,
  updateComment,
  deleteComment,
  deleteChecklistItem,
  getTaskActivities,
  getTaskChecklists,
  getTaskComments,
  markTaskBlocked,
  toggleChecklistItem,
  updateTask,
} from "../api/tasksApi";
import { MentionTextarea } from "../../../components/MentionTextarea";
import { MentionText } from "../../../components/MentionText";
import "./task-sheet.css";

interface TaskSheetProps {
  task: Task | null;
  onClose: () => void;
  onPatch: (taskId: string | number, patch: Partial<Task>) => void;
  onPlayTimer?: (taskId: string | number) => void;
  onStopTimer?: (taskId: string | number) => void;
  activeTimer?: TimeLog | null;
  focusMode?: boolean;
  focusDueDate?: boolean;
  onFocusDueDateHandled?: () => void;
}

const spring = { type: "spring" as const, stiffness: 420, damping: 38, bounce: 0 };

const formatTime = (seconds?: number) => {
  const value = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return [hours, minutes, secs]
    .map((part) => formatUiNumber(part, { minimumIntegerDigits: 2, useGrouping: false }))
    .join(":");
};

const formatRelativeDate = formatRelativeTime;


const getDueDateMeta = (isoString?: string | null) => {
  if (!isoString) return null;
  const target = new Date(isoString);
  if (isNaN(target.getTime())) return null;

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  const isToday =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();

  if (diffMs < 0) {
    return {
      status: "overdue" as const,
      isOverdue: true,
      label: translate("مهلت گذشته"),
      badgeClass: "bg-error/15 text-error border-error/25",
    };
  }
  if (isToday) {
    return {
      status: "today" as const,
      isOverdue: false,
      label: translate("امروز"),
      badgeClass: "bg-warning/15 text-warning border-warning/25",
    };
  }
  if (isTomorrow) {
    return {
      status: "tomorrow" as const,
      isOverdue: false,
      label: translate("فردا"),
      badgeClass: "bg-primary/10 text-primary border-primary/25",
    };
  }
  return {
    status: "upcoming" as const,
    isOverdue: false,
    label: formatRelativeTime(target),
    badgeClass: "bg-base-200 text-heledone-ink-muted border-base-content/10",
  };
};

const priorityConfig: Record<Task["priority"], { label: string; color: string }> = {
  low: { get label() { return translate("اولویت کم"); }, color: "var(--color-heledone-todo)" },
  medium: { get label() { return translate("اولویت متوسط"); }, color: "var(--color-primary)" },
  high: { get label() { return translate("اولویت بالا"); }, color: "var(--color-heledone-sun)" },
  critical: { get label() { return translate("اولویت فوری"); }, color: "var(--color-heledone-coral)" },
};

export const TaskSheet: React.FC<TaskSheetProps> = ({
  task,
  onClose,
  onPatch,
  onPlayTimer,
  onStopTimer,
  activeTimer,
  focusMode = false,
  focusDueDate = false,
  onFocusDueDateHandled,
}) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const checklistInputRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const milestoneRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority || "low");
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);

  const toLocalDatetimeInput = (isoString?: string | null) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const [dueDate, setDueDate] = useState(task?.due_date ? toLocalDatetimeInput(task.due_date) : "");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const dueMeta = useMemo(() => getDueDateMeta(dueDate), [dueDate]);
  const [commentText, setCommentText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [checklistText, setChecklistText] = useState("");
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "comments" | "activity">("overview");
  const [isManualTimeOpen, setIsManualTimeOpen] = useState(false);
  const [manualHours, setManualHours] = useState("0");
  const [manualMinutes, setManualMinutes] = useState("0");
  const [now, setNow] = useState(Date.now());

  const taskId = task?.id;
  const timerBelongsToTask = Boolean(
    activeTimer &&
    task &&
    (activeTimer.task?.toString() ??
      (activeTimer as { task_id?: string | number }).task_id?.toString()) === task.id.toString()
  );
  const timerIsRunning = Boolean(task && (task.is_active_timer_running || timerBelongsToTask));

  const { data: checklists = [], isLoading: isChecklistLoading } = useQuery({
    queryKey: ["taskChecklists", taskId],
    queryFn: () => getTaskChecklists(taskId!),
    enabled: Boolean(taskId),
  });

  const { data: comments = [], isLoading: isCommentsLoading } = useQuery({
    queryKey: ["taskComments", taskId],
    queryFn: () => getTaskComments(taskId!),
    enabled: Boolean(taskId),
  });

  const { data: activities = [], isLoading: isActivitiesLoading } = useQuery({
    queryKey: ["taskActivities", taskId],
    queryFn: () => getTaskActivities(taskId!),
    enabled: Boolean(taskId),
  });

  const currentUser = useAuthStore((state) => state.user);
  const [editingCommentId, setEditingCommentId] = useState<string | number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const storeProjectId = useTaskStore((state) => state.activeProjectId);
  const rawProjectId = typeof task?.project === "object" ? (task?.project as any)?.id : task?.project;
  const effectiveProjectId = rawProjectId || storeProjectId;

  const { data: projectMembers = [] } = useQuery({
    queryKey: ["projects", "detail", String(effectiveProjectId), "members"],
    queryFn: () => getProjectMembers(effectiveProjectId!),
    enabled: Boolean(effectiveProjectId),
  });

  const allAvailableMembers = useMemo(() => {
    const list: any[] = [];
    if (Array.isArray(projectMembers)) {
      list.push(...projectMembers);
    }
    if (task?.assignees_detail && Array.isArray(task.assignees_detail)) {
      list.push(...task.assignees_detail);
    }
    if (task?.assignee_detail) {
      list.push(task.assignee_detail);
    }
    if (task?.reporter_detail) {
      list.push(task.reporter_detail);
    }
    return list;
  }, [projectMembers, task]);

  const { data: projectMilestones = [] } = useQuery({
    queryKey: ["projects", "detail", String(effectiveProjectId), "milestones"],
    queryFn: () => getProjectMilestones(effectiveProjectId!),
    enabled: Boolean(effectiveProjectId),
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ id, content }: { id: string | number; content: string }) =>
      updateComment(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["taskActivities", taskId] });
      setEditingCommentId(null);
      setEditingCommentText("");
      toast.success(t("دیدگاه با موفقیت ویرایش شد"));
    },
    onError: () => {
      toast.error(t("خطا در ویرایش دیدگاه"));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id: string | number) => deleteComment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["taskActivities", taskId] });
      toast.success(t("دیدگاه با موفقیت حذف شد"));
    },
    onError: () => {
      toast.error(t("خطا در حذف دیدگاه"));
    },
  });

  const manualTimeMutation = useMutation({
    mutationFn: (data: { hours: number; minutes: number }) => {
      const end_time = new Date().toISOString();
      const start_time = new Date(
        Date.now() - (data.hours * 3600 + data.minutes * 60) * 1000
      ).toISOString();
      return createManualLog({
        task: taskId!,
        project: task!.project,
        start_time,
        end_time,
      });
    },
    onSuccess: () => {
      toast.success(t("Manual time ثبت‌شده"));
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["standup-grid"] });
      queryClient.invalidateQueries({ queryKey: ["attendanceTasks"] });
      queryClient.invalidateQueries({ queryKey: ["myWeeklyTimesheet"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["executive-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      queryClient.invalidateQueries({ queryKey: ["manager-dashboard"] });
      setIsManualTimeOpen(false);
      setManualHours("0");
      setManualMinutes("0");
    },
    onError: (error: any) =>
      toast.error(
        translateError(
          error.response?.data?.detail ||
          error.response?.data?.error ||
          "Failed to log manual time"
        )
      ),
  });

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description || "");
    setIsEditingDescription(Boolean(task.description));
    setPriority(task.priority || "low");
    setDueDate(task.due_date ? toLocalDatetimeInput(task.due_date) : "");
  }, [task]);

  // Multi-assignee resolution & state
  const memberUsers = useMemo(() => {
    return (projectMembers || [])
      .map((m: any) => m.user)
      .filter((u: any) => Boolean(u && u.id));
  }, [projectMembers]);

  const taskAssignees = useMemo(() => {
    if (!task) return [];
    if (task.assignees_detail && task.assignees_detail.length > 0) {
      return task.assignees_detail;
    }
    if (task.assignees && task.assignees.length > 0) {
      const mapped = task.assignees
        .map((id: any) => memberUsers.find((u: any) => String(u.id) === String(id)))
        .filter(Boolean);
      if (mapped.length > 0) return mapped;
    }
    if (task.assignee_detail) return [task.assignee_detail];
    if (task.assignee) {
      const found = memberUsers.find((u: any) => String(u.id) === String(task.assignee));
      if (found) return [found];
    }
    return [];
  }, [task, memberUsers]);

  const [localAssignees, setLocalAssignees] = useState<any[]>(taskAssignees);

  useEffect(() => {
    setLocalAssignees(taskAssignees);
  }, [taskAssignees]);

  const filteredMembers = useMemo(() => {
    return (projectMembers || []).filter((m: any) => {
      if (!m.user) return false;
      if (!assigneeSearch.trim()) return true;
      const q = assigneeSearch.toLowerCase();
      const u = m.user;
      const name = `${u.first_name || ""} ${u.last_name || ""} ${u.username || ""} ${u.email || ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [projectMembers, assigneeSearch]);

  const handleToggleAssignee = (u: any) => {
    const isSelected = localAssignees.some((a) => String(a.id) === String(u.id));
    const newAssignees = isSelected
      ? localAssignees.filter((a) => String(a.id) !== String(u.id))
      : [...localAssignees, u];
    const newIds = newAssignees.map((a) => a.id);
    setLocalAssignees(newAssignees);
    save({
      assignees: newIds,
      assignees_detail: newAssignees,
      assignee: newIds[0] || null,
      assignee_detail: newAssignees[0] || null,
    } as any);
  };

  const handleClearAllAssignees = () => {
    setLocalAssignees([]);
    save({
      assignees: [],
      assignees_detail: [],
      assignee: null,
      assignee_detail: null,
    } as any);
  };

  const handleSelectAllAssignees = () => {
    const currentMap = new Map<string, any>(localAssignees.map((a) => [String(a.id), a]));
    memberUsers.forEach((u: any) => currentMap.set(String(u.id), u));
    const newAssignees = Array.from(currentMap.values());
    const newIds = newAssignees.map((a) => a.id);
    setLocalAssignees(newAssignees);
    save({
      assignees: newIds,
      assignees_detail: newAssignees,
      assignee: newIds[0] || null,
      assignee_detail: newAssignees[0] || null,
    } as any);
  };

  useEffect(() => {
    setActiveTab("overview");
    setIsManualTimeOpen(false);
  }, [taskId]);

  useEffect(() => {
    if (!titleRef.current) return;
    titleRef.current.style.height = "auto";
    titleRef.current.style.height = `${Math.min(titleRef.current.scrollHeight, 140)}px`;
  }, [title, taskId]);

  useEffect(() => {
    if (isManualTimeOpen && task) {
      const total = Number(task.spent_hours || 0);
      const h = Math.floor(total);
      const m = Math.round((total - h) * 60);
      setManualHours(String(h));
      setManualMinutes(String(m));
    }
  }, [isManualTimeOpen, task]);

  useEffect(() => {
    if (!timerIsRunning) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timerIsRunning]);

  useEffect(() => {
    if (!task) return;
    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector =
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href]";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const focusFrame = window.requestAnimationFrame(() => {
      sheetRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [task, onClose]);

  // Focus due date input when opened from card menu's due date action
  useEffect(() => {
    if (!focusDueDate || !task) return;
    setIsDatePickerOpen(true);
    const timer = window.setTimeout(() => {
      dueDateInputRef.current?.focus();
      dueDateInputRef.current?.showPicker?.();
      onFocusDueDateHandled?.();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusDueDate, task, onFocusDueDateHandled]);

  const invalidateTaskDetails = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["taskChecklists", taskId] });
    queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
    queryClient.invalidateQueries({ queryKey: ["taskActivities", taskId] });
    queryClient.invalidateQueries({ queryKey: ["notification-unread"] });
    queryClient.invalidateQueries({ queryKey: ["notification-history"] });
  };

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<Task>) => updateTask(task!.id, patch),
    onSuccess: invalidateTaskDetails,
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || error.message || "Could not update task.")),
  });

  const blockerMutation = useMutation({
    mutationFn: (blocked: boolean) => markTaskBlocked(task!.id, blocked),
    onMutate: (blocked) => onPatch(task!.id, { is_blocked: blocked }),
    onSuccess: invalidateTaskDetails,
    onError: (error: any, blocked) => {
      onPatch(task!.id, { is_blocked: !blocked });
      toast.error(translateError(error.response?.data?.detail || error.message || "Could not update blocker state."));
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => addComment(task!.id, commentText.trim(), selectedFile || undefined),
    onSuccess: () => {
      setCommentText("");
      setSelectedFile(null);
      invalidateTaskDetails();
      toast.success(t("Comment added"));
    },
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || error.message || "Could not add comment.")),
  });

  const checklistAddMutation = useMutation({
    mutationFn: (value: string) => addChecklistItem(task!.id, value),
    onSuccess: () => {
      setChecklistText("");
      invalidateTaskDetails();
    },
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || error.message || "Could not add checklist item.")),
  });

  const checklistToggleMutation = useMutation({
    mutationFn: ({ id }: { id: string | number; completed: boolean }) =>
      toggleChecklistItem(id),
    onSuccess: invalidateTaskDetails,
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || error.message || "Could not update checklist item.")),
  });

  const checklistDeleteMutation = useMutation({
    mutationFn: (id: string | number) => deleteChecklistItem(id),
    onSuccess: invalidateTaskDetails,
    onError: (error: any) =>
      toast.error(translateError(error.response?.data?.detail || error.message || "Could not delete checklist item.")),
  });

  const save = (patch: Partial<Task>) => {
    onPatch(task!.id, patch);
    updateMutation.mutate(patch);
  };

  const handleSetToday = () => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    const local = toLocalDatetimeInput(d.toISOString());
    setDueDate(local);
    save({ due_date: d.toISOString() });
  };

  const handleSetTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    const local = toLocalDatetimeInput(d.toISOString());
    setDueDate(local);
    save({ due_date: d.toISOString() });
  };

  const handleSetNextWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(18, 0, 0, 0);
    const local = toLocalDatetimeInput(d.toISOString());
    setDueDate(local);
    save({ due_date: d.toISOString() });
  };

  const handleClearDueDate = () => {
    setDueDate("");
    save({ due_date: null as any });
    setIsDatePickerOpen(false);
    toast.success(t("حذف سررسید"));
  };

  const handleTimePreset = (timeStr: string) => {
    const now = new Date();
    const localToday = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    const datePart = dueDate ? dueDate.split("T")[0] : localToday;
    const newVal = `${datePart}T${timeStr}`;
    setDueDate(newVal);
    save({ due_date: new Date(newVal).toISOString() });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) {
        setIsPriorityOpen(false);
      }
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setIsAssigneeOpen(false);
      }
      if (milestoneRef.current && !milestoneRef.current.contains(e.target as Node)) {
        setIsMilestoneOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInsertMarkdown = (prefix: string, suffix: string = "") => {
    const textarea = descTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = description.substring(start, end);
    const replacement = `${prefix}${selected || ""}${suffix}`;
    const newDesc = description.substring(0, start) + replacement + description.substring(end);
    setDescription(newDesc);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected ? selected.length : 0)
      );
    }, 0);
  };

  const handleAddQuickTime = (minutesToAdd: number) => {
    const currentTotalMinutes = Number(manualHours || 0) * 60 + Number(manualMinutes || 0);
    const newTotal = currentTotalMinutes + minutesToAdd;
    setManualHours(String(Math.floor(newTotal / 60)));
    setManualMinutes(String(newTotal % 60));
  };

  const elapsedSeconds = useMemo(() => {
    if (!task) return 0;
    if (timerBelongsToTask && activeTimer) {
      const startedAt = new Date(activeTimer.start_time).getTime();
      return Math.max(
        0,
        Math.floor((now - startedAt) / 1000) + Number(activeTimer.duration_seconds || 0)
      );
    }
    return Number(task.spent_seconds || 0);
  }, [activeTimer, now, task, timerBelongsToTask]);

  if (!task) return null;

  const checklistDone = checklists.filter((item) => item.is_completed).length;
  const checklistProgress = checklists.length
    ? Math.round((checklistDone / checklists.length) * 100)
    : 0;
  const isBusy = updateMutation.isPending || blockerMutation.isPending;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="task-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.aside
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("Task details: {value0}", { value0: task.title })}
          className="task-sheet"
          initial={{ y: 24, scale: 0.97, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 16, scale: 0.97, opacity: 0 }}
          transition={spring}
        >
          {/* ─── Top Bar: Coastal Ambience + Context + Brand Beats ─── */}
          <header className="task-sheet-header">
            {/* Coastal skyline artwork backdrop */}
            <img
              src="/images/heledone-assets/tasks-coastal-v1.png"
              alt=""
              aria-hidden="true"
              className="task-sheet-header-art"
            />

            <div className="task-sheet-header-content">
              {/* Task key pill with copy */}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(task.key);
                  toast.success(t("Copied {key}", { key: task.key }));
                }}
                className="task-sheet-key"
                aria-label={t("کپی شناسه تسک")}
                title={t("Click to copy key")}
              >
                <Copy size={13} />
                <bdi>{task.key}</bdi>
              </button>

              {/* Workflow status badge */}
              <span
                className="task-sheet-status-pill"
                style={{
                  color: getWorkflowAppearance(task.status_detail).ink,
                  background: `color-mix(in srgb, ${getWorkflowAppearance(task.status_detail).color} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${getWorkflowAppearance(task.status_detail).color} 26%, transparent)`,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: getWorkflowAppearance(task.status_detail).color }}
                />
                {task.status_detail ? getWorkflowAppearance(task.status_detail).label : t("بدون وضعیت")}
              </span>

              {/* Due date status badge in header if set */}
              {dueMeta && (
                <span
                  className={`task-sheet-status-pill border ${dueMeta.badgeClass}`}
                  title={t("زمان سررسید")}
                >
                  {dueMeta.isOverdue ? <Danger size={12} /> : <Calendar1 size={12} />}
                  <span>
                    {dueMeta.isOverdue ? t("مهلت گذشته") : t("سررسید")}: {formatDisplayDate(dueDate, "d MMMM")}
                  </span>
                </span>
              )}

              {/* Heledone syncopated brand beats */}
              <span className="task-sheet-brand-beats" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="task-sheet-close"
                aria-label={t("بستن جزئیات تسک")}
              >
                <CloseSquare size={20} />
              </button>
            </div>
          </header>

          {/* ─── Main Title Area ─── */}
          <div className="task-sheet-title">
            <span className="task-sheet-title-badge">
              <TaskSquare size={14} className="text-primary" />
              {t("جزئیات تسک")}
            </span>
            <textarea
              rows={1}
              aria-label={t("عنوان تسک")}
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() =>
                title.trim() && title.trim() !== task.title && save({ title: title.trim() })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="task-sheet-title-input"
              placeholder={t("عنوان تسک…")}
            />
          </div>

          {/* ─── Properties Sidebar (Heledone Styling) ─── */}
          <div className="task-sheet-properties">
            <div className="task-sheet-properties-title">
              <span>{t("اطلاعات تسک")}</span>
              <span className="text-[10px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                {t("هله‌دان")}
              </span>
            </div>

            {/* Priority Selector (Custom Dropdown) */}
            <div className="task-sheet-property" ref={priorityRef}>
              <label>{t("اولویت")}</label>
              <div className="task-sheet-dropdown">
                <button
                  type="button"
                  onClick={() => setIsPriorityOpen(!isPriorityOpen)}
                  className={`task-sheet-dropdown-trigger ${isPriorityOpen ? "is-open" : ""}`}
                  aria-expanded={isPriorityOpen}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-2.5 rounded-full shrink-0 shadow-2xs"
                      style={{ background: priorityConfig[priority]?.color }}
                    />
                    <span className="truncate">{priorityConfig[priority]?.label}</span>
                  </div>
                  <ChevronDown size={14} className="task-sheet-dropdown-chevron" />
                </button>

                <AnimatePresence>
                  {isPriorityOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="task-sheet-dropdown-panel"
                    >
                      {(
                        [
                          {
                            key: "critical",
                            label: t("فوری"),
                            desc: t("نیاز به بررسی سریع"),
                            color: "var(--color-heledone-coral)",
                          },
                          {
                            key: "high",
                            label: t("بالا"),
                            desc: t("اولویت زیاد"),
                            color: "var(--color-heledone-sun)",
                          },
                          {
                            key: "medium",
                            label: t("متوسط"),
                            desc: t("اولویت عادی"),
                            color: "var(--color-primary)",
                          },
                          {
                            key: "low",
                            label: t("کم"),
                            desc: t("اولویت پایین"),
                            color: "var(--color-heledone-todo)",
                          },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setPriority(item.key);
                            save({ priority: item.key });
                            setIsPriorityOpen(false);
                          }}
                          className={`task-sheet-dropdown-item ${priority === item.key ? "is-active" : ""
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ background: item.color }}
                            />
                            <div className="flex flex-col text-start min-w-0">
                              <span className="font-bold text-xs">{item.label}</span>
                              <span className="text-[10px] text-heledone-ink-muted">
                                {item.desc}
                              </span>
                            </div>
                          </div>
                          {priority === item.key && (
                            <Check size={14} className="text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Assignee Card with Multi-Assignee & Search (Custom Dropdown) */}
            <div className="task-sheet-property" ref={assigneeRef}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-heledone-ink-muted">{t("مسئولین تسک")}</label>
                {localAssignees.length > 0 && (
                  <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {formatUiNumber(localAssignees.length)} {t("نفر")}
                  </span>
                )}
              </div>
              <div className="task-sheet-dropdown">
                <button
                  type="button"
                  onClick={() => setIsAssigneeOpen(!isAssigneeOpen)}
                  className={`task-sheet-dropdown-trigger ${isAssigneeOpen ? "is-open" : ""}`}
                  aria-expanded={isAssigneeOpen}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {localAssignees.length === 0 ? (
                      <>
                        <span className="grid size-6 place-items-center rounded-full bg-base-200 text-heledone-ink-muted shrink-0">
                          <Profile2User size={13} />
                        </span>
                        <span className="text-heledone-ink-muted font-medium">{t("بدون مسئول — کلیک برای افزودن")}</span>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Avatar stack */}
                        <div className="flex -space-x-2 rtl:space-x-reverse shrink-0">
                          {localAssignees.slice(0, 4).map((assigneeItem: any) => (
                            <ProfileAvatar
                              key={assigneeItem.id}
                              src={assigneeItem.avatar || assigneeItem.avatar_url}
                              name={`${assigneeItem.first_name || ""} ${assigneeItem.last_name || assigneeItem.username || ""}`}
                              className="size-6.5 shrink-0 overflow-hidden rounded-full ring-2 ring-base-100 shadow-2xs"
                              fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
                            />
                          ))}
                          {localAssignees.length > 4 && (
                            <span className="grid size-6.5 place-items-center rounded-full bg-primary/15 text-[11px] font-extrabold text-primary ring-2 ring-base-100 shadow-2xs">
                              +{localAssignees.length - 4}
                            </span>
                          )}
                        </div>
                        {/* Names summary */}
                        <span className="truncate text-xs font-bold text-base-content">
                          {localAssignees.length === 1
                            ? (localAssignees[0].first_name || localAssignees[0].last_name
                                ? `${localAssignees[0].first_name || ""} ${localAssignees[0].last_name || ""}`.trim()
                                : localAssignees[0].username)
                            : localAssignees.slice(0, 2).map((a: any) => a.first_name || a.username).join("، ") +
                              (localAssignees.length > 2 ? ` +${formatUiNumber(localAssignees.length - 2)} ${t("نفر دیگر")}` : "")}
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronDown size={14} className="task-sheet-dropdown-chevron" />
                </button>

                {/* Assigned chips preview when multiple (quick remove) */}
                {localAssignees.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 px-0.5">
                    {localAssignees.map((u: any) => {
                      const name = u.first_name || u.last_name
                        ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
                        : u.username;
                      return (
                        <span
                          key={u.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-base-content/8 bg-base-200/60 pe-2 ps-1 py-0.5 text-[11px] font-bold text-base-content shadow-2xs group"
                        >
                          <ProfileAvatar src={u.avatar || u.avatar_url} name={name} className="size-4.5 shrink-0 overflow-hidden rounded-full" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary" />
                          <span className="truncate max-w-[110px]">{name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAssignee(u);
                            }}
                            className="size-3.5 rounded-full hover:bg-error/20 hover:text-error grid place-items-center transition-colors text-heledone-ink-muted"
                            title={t("حذف از تسک")}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                <AnimatePresence>
                  {isAssigneeOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="task-sheet-dropdown-panel"
                      style={{ maxHeight: "360px" }}
                    >
                      {/* Search box */}
                      <div className="task-sheet-dropdown-search">
                        <Search size={13} />
                        <input
                          autoFocus
                          type="text"
                          value={assigneeSearch}
                          onChange={(e) => setAssigneeSearch(e.target.value)}
                          placeholder={t("جستجوی نام، نام کاربری یا ایمیل...")}
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

                      {/* Header actions: counts, select all, clear all */}
                      <div className="flex items-center justify-between px-2 py-1.5 border-b border-base-content/6 text-[11px] font-bold text-heledone-ink-muted mb-1">
                        <span>
                          {t("اعضای پروژه")} ({formatUiNumber(filteredMembers.length)})
                        </span>
                        <div className="flex items-center gap-2">
                          {localAssignees.length > 0 && (
                            <button
                              type="button"
                              onClick={handleClearAllAssignees}
                              className="text-error hover:underline text-[11px]"
                            >
                              {t("حذف همه")}
                            </button>
                          )}
                          {filteredMembers.length > 0 && (
                            <button
                              type="button"
                              onClick={handleSelectAllAssignees}
                              className="text-primary hover:underline text-[11px]"
                            >
                              {t("انتخاب همه")}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Member list */}
                      <div className="space-y-0.5 overflow-y-auto max-h-[220px] custom-scrollbar">
                        {filteredMembers.length === 0 ? (
                          <div className="py-4 text-center text-xs text-heledone-ink-muted">
                            {t("عضوی با این مشخصات یافت نشد.")}
                          </div>
                        ) : (
                          filteredMembers.map((m: any) => {
                            const u = m.user;
                            if (!u) return null;
                            const isAssigned = localAssignees.some((a) => String(a.id) === String(u.id));
                            const displayName =
                              u.first_name || u.last_name
                                ? `${u.first_name || ""} ${u.last_name || ""}`.trim()
                                : u.username;

                            return (
                              <button
                                key={m.id || u.id}
                                type="button"
                                onClick={() => handleToggleAssignee(u)}
                                className={`task-sheet-dropdown-item flex items-center justify-between w-full px-2.5 py-2 rounded-xl transition-all ${
                                  isAssigned
                                    ? "bg-primary/10 text-primary font-extrabold"
                                    : "hover:bg-base-200 text-base-content"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <ProfileAvatar src={u.avatar || u.avatar_url} name={displayName} className="size-6.5 shrink-0 overflow-hidden rounded-full ring-1 ring-base-content/10" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary" />
                                  <div className="flex flex-col text-start min-w-0">
                                    <span className="text-xs truncate font-bold leading-tight">{displayName}</span>
                                    {u.username && (
                                      <span className="text-[10px] text-heledone-ink-muted truncate">
                                        @{u.username}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className={`size-4.5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                    isAssigned
                                      ? "bg-primary text-primary-content shadow-2xs"
                                      : "border border-base-content/20 bg-base-100"
                                  }`}
                                >
                                  {isAssigned && <Check size={12} strokeWidth={3} />}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Footer done button */}
                      <div className="pt-2 mt-1 border-t border-base-content/6 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAssigneeOpen(false);
                            setAssigneeSearch("");
                          }}
                          className="px-3 py-1 rounded-lg bg-primary text-primary-content text-xs font-bold shadow-xs hover:bg-primary/90 transition"
                        >
                          {t("تایید و بستن")}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>


            {/* Milestone Selector (Custom Dropdown) */}
            <div className="task-sheet-property" ref={milestoneRef}>
              <label>{t("نقطه عطف")}</label>
              <div className="task-sheet-dropdown">
                <button
                  type="button"
                  onClick={() => setIsMilestoneOpen(!isMilestoneOpen)}
                  className={`task-sheet-dropdown-trigger ${isMilestoneOpen ? "is-open" : ""}`}
                  aria-expanded={isMilestoneOpen}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Flag
                      size={14}
                      className={task.milestone ? "text-primary" : "text-heledone-ink-muted"}
                    />
                    <span className="truncate">
                      {projectMilestones.find((m) => String(m.id) === String(task.milestone))
                        ?.title ||
                        task.milestone_detail?.title ||
                        t("No Milestone")}
                    </span>
                  </div>
                  <ChevronDown size={14} className="task-sheet-dropdown-chevron" />
                </button>

                <AnimatePresence>
                  {isMilestoneOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="task-sheet-dropdown-panel"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          save({ milestone: null, milestone_detail: null } as any);
                          setIsMilestoneOpen(false);
                        }}
                        className={`task-sheet-dropdown-item ${!task.milestone ? "is-active" : ""}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Flag size={13} className="text-heledone-ink-muted shrink-0" />
                          <span className="truncate">{t("No Milestone")}</span>
                        </div>
                        {!task.milestone && <Check size={14} className="text-primary shrink-0" />}
                      </button>

                      {projectMilestones.map((m) => {
                        const isCurrent = String(task.milestone) === String(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              save({
                                milestone: String(m.id),
                                milestone_detail: m,
                              } as any);
                              setIsMilestoneOpen(false);
                            }}
                            className={`task-sheet-dropdown-item ${isCurrent ? "is-active" : ""}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Flag size={13} className="text-primary shrink-0" />
                              <span className="truncate">{m.title}</span>
                            </div>
                            {isCurrent && <Check size={14} className="text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Due Date & Time Section */}
            <div className="task-sheet-property">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-heledone-ink-muted">{t("سررسید")}</label>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    {isDatePickerOpen ? t("بستن") : t("تغییر سررسید")}
                  </button>
                )}
              </div>

              {dueDate ? (
                <div className="task-sheet-due-card">
                  <div className="task-sheet-due-header">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar1 size={15} className="text-primary shrink-0" />
                      <span className="font-bold text-xs text-base-content truncate">
                        {formatDisplayDate(dueDate, "d MMMM yyyy")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`task-sheet-due-badge border ${dueMeta?.badgeClass}`}>
                        {dueMeta?.isOverdue && <Danger size={11} />}
                        {dueMeta?.label}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearDueDate}
                        className="task-sheet-due-clear"
                        title={t("حذف سررسید")}
                        aria-label={t("حذف سررسید")}
                      >
                        <CloseCircle size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="task-sheet-due-time-row">
                    <div className="flex items-center gap-1.5 text-xs text-heledone-ink-muted font-medium">
                      <Clock3 size={13} className="text-primary" />
                      <span>{t("ساعت {time}", { time: dueDate.split("T")[1]?.slice(0, 5) || "18:00" })}</span>
                    </div>

                    <div className="text-[11px] font-semibold text-heledone-ink-muted">
                      {formatRelativeDate(dueDate)}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDatePickerOpen(true)}
                  className="task-sheet-due-empty-btn"
                >
                  <Calendar1 size={16} className="text-primary" />
                  <span>{t("تعیین سررسید و زمان")}</span>
                </button>
              )}

              {/* Quick Presets Bar */}
              <div className="task-sheet-due-presets">
                <button
                  type="button"
                  onClick={handleSetToday}
                  className="task-sheet-due-preset-btn"
                >
                  {t("امروز")}
                </button>
                <button
                  type="button"
                  onClick={handleSetTomorrow}
                  className="task-sheet-due-preset-btn"
                >
                  {t("فردا")}
                </button>
                <button
                  type="button"
                  onClick={handleSetNextWeek}
                  className="task-sheet-due-preset-btn"
                >
                  {t("هفته آینده")}
                </button>
              </div>

              {/* Expanded Date & Time Editor */}
              {isDatePickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="task-sheet-due-editor space-y-3"
                >
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-heledone-ink-muted">
                      {t("انتخاب تاریخ")}
                    </span>
                    <CustomDatePicker
                      value={dueDate ? dueDate.split("T")[0] : ""}
                      onChange={(date) => {
                        const time = dueDate ? dueDate.split("T")[1] || "18:00" : "18:00";
                        const newVal = `${date}T${time}`;
                        setDueDate(newVal);
                        save({ due_date: new Date(newVal).toISOString() });
                      }}
                      triggerClassName="w-full p-2.5 bg-base-100 border border-base-content/15 rounded-xl flex items-center justify-between text-xs font-bold text-base-content text-start hover:border-primary/50 transition-colors shadow-2xs"
                    />
                  </div>

                  <div className="space-y-1.5 border-t border-base-content/8 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-heledone-ink-muted">
                        {t("زمان و ساعت")}
                      </span>
                      <input
                        type="time"
                        ref={dueDateInputRef}
                        aria-label={t("زمان سررسید")}
                        value={dueDate ? dueDate.split("T")[1]?.slice(0, 5) : "18:00"}
                        onChange={(e) => {
                          const date = dueDate
                            ? dueDate.split("T")[0]
                            : new Date().toISOString().split("T")[0];
                          const newVal = `${date}T${e.target.value}`;
                          setDueDate(newVal);
                          save({ due_date: new Date(newVal).toISOString() });
                        }}
                        className="rounded-lg border border-base-content/15 bg-base-100 px-2 py-0.5 text-xs font-bold text-base-content outline-none focus:border-primary"
                      />
                    </div>

                    <div className="task-sheet-due-time-chips">
                      {[
                        { label: "۰۹:۰۰", val: "09:00" },
                        { label: "۱۲:۰۰", val: "12:00" },
                        { label: "۱۸:۰۰", val: "18:00" },
                        { label: "۲۳:۵۹", val: "23:59" },
                      ].map((chip) => {
                        const currentT = dueDate?.split("T")[1]?.slice(0, 5);
                        const isActive = currentT === chip.val;
                        return (
                          <button
                            key={chip.val}
                            type="button"
                            onClick={() => handleTimePreset(chip.val)}
                            className={`task-sheet-due-time-chip ${isActive ? "is-active" : ""}`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Marine Chronometer / Time Log Card */}
            <div className="task-sheet-time-card">
              <div className="task-sheet-time-heading">
                <Clock3 size={16} />
                <span>{t("زمان‌سنج هله‌دان")}</span>
                <i className={timerIsRunning ? "is-running" : ""} />
              </div>

              <strong className="task-sheet-clock">
                {formatTime(elapsedSeconds)}
              </strong>

              <button
                type="button"
                onClick={() =>
                  timerIsRunning ? onStopTimer?.(task.id) : onPlayTimer?.(task.id)
                }
                disabled={(!onPlayTimer && !timerIsRunning) || (!onStopTimer && timerIsRunning)}
                className={`task-sheet-timer-button ${timerIsRunning ? "is-running" : ""}`}
              >
                {timerIsRunning ? <Stop size={15} /> : <Play size={15} />}
                <span>{timerIsRunning ? t("توقف زمان‌سنج") : t("شروع زمان‌سنج")}</span>
              </button>

              {/* Manual Time Log Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsManualTimeOpen(!isManualTimeOpen)}
                  className="task-sheet-manual-toggle"
                  aria-expanded={isManualTimeOpen}
                >
                  <span>{t("ثبت دستی زمان کارکرد")}</span>
                </button>

                {isManualTimeOpen && (
                  <div className="task-sheet-manual-form space-y-2.5">
                    <p className="text-[11px] font-bold text-base-content">{t("Log Time")}</p>

                    {/* Quick Add Pills */}
                    <div className="task-sheet-quick-time-grid">
                      <button
                        type="button"
                        onClick={() => handleAddQuickTime(15)}
                        className="task-sheet-quick-time-chip"
                      >
                        {t("+۱۵ دقیقه")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQuickTime(30)}
                        className="task-sheet-quick-time-chip"
                      >
                        {t("+۳۰ دقیقه")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQuickTime(60)}
                        className="task-sheet-quick-time-chip"
                      >
                        {t("+۱ ساعت")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQuickTime(120)}
                        className="task-sheet-quick-time-chip"
                      >
                        {t("+۲ ساعت")}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="text-[11px] font-semibold text-heledone-ink-muted">
                          {t("ساعت")}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={manualHours}
                          onChange={(e) => setManualHours(e.target.value)}
                          className="w-full rounded-xl border border-base-content/10 bg-base-100 px-2.5 py-1 text-xs font-bold outline-none focus:border-primary"
                        />
                      </label>
                      <label className="flex-1">
                        <span className="text-[11px] font-semibold text-heledone-ink-muted">
                          {t("Mins")}
                        </span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={manualMinutes}
                          onChange={(e) => setManualMinutes(e.target.value)}
                          className="w-full rounded-xl border border-base-content/10 bg-base-100 px-2.5 py-1 text-xs font-bold outline-none focus:border-primary"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const newTotal = Number(manualHours) + Number(manualMinutes) / 60;
                        const oldTotal = Number(task.spent_hours || 0);
                        const delta = newTotal - oldTotal;

                        if (Math.abs(delta) < 0.01) {
                          setIsManualTimeOpen(false);
                          return;
                        }

                        if (delta > 0) {
                          const h = Math.floor(delta);
                          const m = Math.round((delta - h) * 60);
                          manualTimeMutation.mutate({ hours: h, minutes: m });
                        } else {
                          updateMutation.mutate(
                            { spent_hours: Number(newTotal.toFixed(2)) },
                            {
                              onSuccess: () => {
                                toast.success(t("Total time updated"));
                                setIsManualTimeOpen(false);
                              },
                            }
                          );
                        }
                      }}
                      disabled={manualTimeMutation.isPending || updateMutation.isPending}
                      className="w-full rounded-xl bg-primary py-1.5 text-xs font-bold text-primary-content transition hover:bg-[#006D73] disabled:opacity-50"
                    >
                      {t("ذخیره")}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Blocker Pill & Help */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => blockerMutation.mutate(!task.is_blocked)}
                className={`task-sheet-blocker-btn ${task.is_blocked
                  ? "bg-error/15 text-error border border-error/30 shadow-xs"
                  : "bg-base-200/80 text-heledone-ink-muted hover:text-error hover:bg-error/10 border border-base-content/10"
                  }`}
              >
                <Danger size={15} />
                <span>{task.is_blocked ? t("مسدود · رفع مانع") : t("ثبت مانع")}</span>
              </button>

              {task.is_blocked && (
                <p className="task-sheet-blocker-help">
                  {t(
                    "این تسک مانع دارد. علت و قدم بعدی را در توضیح یا دیدگاه ثبت کنید؛ پس از رفع مانع، «رفع مانع» را بزنید."
                  )}
                </p>
              )}
            </div>
          </div>

          {/* ─── Navigation Tabs ─── */}
          <div className="task-sheet-tabs" role="tablist" aria-label={t("بخش‌های تسک")}>
            {(
              [
                ["overview", t("نمای کلی")],
                [
                  "comments",
                  t("دیدگاه‌ها {value0}", {
                    value0: comments.length ? `(${comments.length})` : "",
                  }),
                ],
                ["activity", t("رویدادها")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`task-sheet-tab-${value}`}
                aria-selected={activeTab === value}
                aria-controls="task-sheet-content"
                onClick={() => setActiveTab(value)}
              >
                {value === "overview" ? (
                  <FileText size={16} />
                ) : value === "comments" ? (
                  <MessageCircle size={16} />
                ) : (
                  <Activity size={16} />
                )}
                <span>{label}</span>
                {activeTab === value && (
                  <motion.div
                    layoutId="sheet-tab-underline"
                    className="absolute bottom-0 start-0 end-0 h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            ))}
          </div>

          {/* ─── Tab Content Panels ─── */}
          <div
            id="task-sheet-content"
            role="tabpanel"
            aria-labelledby={`task-sheet-tab-${activeTab}`}
            className="task-sheet-content space-y-6"
          >
            {focusMode && (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/8 p-3.5 text-primary">
                <Sparkles size={18} className="shrink-0" />
                <div>
                  <p className="text-xs font-bold">{t("Focus mode")}</p>
                  <p className="text-[11px] font-semibold text-heledone-ink-muted">
                    {t("Keep one clear next step in view.")}
                  </p>
                </div>
              </div>
            )}

            {/* ─── TAB 1: OVERVIEW ─── */}
            {activeTab === "overview" && (
              <>
                {/* Description Card */}
                <div className="task-sheet-section space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h2 className="task-sheet-section-title">
                      <FileText size={17} />
                      <span>{t("توضیح")}</span>
                    </h2>
                    {!isEditingDescription && (
                      <button
                        type="button"
                        onClick={() => setIsEditingDescription(true)}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        {description ? t("ویرایش") : t("+ Add description")}
                      </button>
                    )}
                  </div>

                  {isEditingDescription ? (
                    <div className="task-sheet-editor-box">
                      {/* Markdown Toolbar */}
                      <div className="task-sheet-editor-toolbar">
                        <button
                          type="button"
                          onClick={() => handleInsertMarkdown("**", "**")}
                          className="task-sheet-toolbar-btn font-bold"
                          title={t("متن درشت")}
                        >
                          <Bold size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsertMarkdown("*", "*")}
                          className="task-sheet-toolbar-btn italic font-serif"
                          title={t("متن مورب")}
                        >
                          <Italic size={13} />
                        </button>
                        <span className="w-px h-3.5 bg-base-content/10 mx-1" />
                        <button
                          type="button"
                          onClick={() => handleInsertMarkdown("\n- ")}
                          className="task-sheet-toolbar-btn"
                          title={t("فهرست نشانه‌دار")}
                        >
                          <List size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsertMarkdown("`", "`")}
                          className="task-sheet-toolbar-btn"
                          title={t("کد یا دستور")}
                        >
                          <Code size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsertMarkdown("[", "](url)")}
                          className="task-sheet-toolbar-btn"
                          title={t("پیوند")}
                        >
                          <Link size={13} />
                        </button>
                      </div>

                      <MentionTextarea
                        ref={descTextareaRef}
                        ariaLabel={t("توضیح تسک")}
                        autoFocus
                        value={description}
                        onChange={setDescription}
                        members={allAvailableMembers}
                        position="bottom"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            save({ description });
                            setIsEditingDescription(false);
                          }
                        }}
                        placeholder={t("افزودن توضیح و مستندات… (از @ برای منشن کردن استفاده کنید)")}
                        className="task-sheet-editor-textarea min-h-28"
                      />

                      <div className="task-sheet-editor-footer">
                        <span className="text-[10px] text-heledone-ink-muted">
                          <kbd className="px-1 py-0.5 rounded border border-base-content/10 bg-base-100 font-mono text-[9px]">
                            {t("Ctrl+Enter")}
                          </kbd>{" "}
                          {t("Ctrl + Enter برای ذخیره")}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDescription(task.description || "");
                              setIsEditingDescription(false);
                            }}
                            className="rounded-xl px-3 py-1.5 text-xs text-heledone-ink-muted transition hover:bg-base-200"
                          >
                            {t("انصراف")}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              save({ description });
                              setIsEditingDescription(false);
                            }}
                            disabled={
                              description.trim() === (task.description || "").trim() ||
                              updateMutation.isPending
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-content transition hover:bg-[#006D73] disabled:opacity-40"
                          >
                            <Send2 size={13} />
                            <span>
                              {updateMutation.isPending ? t("در حال ذخیره…") : t("ذخیره")}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : description ? (
                    <div
                      onClick={() => setIsEditingDescription(true)}
                      className="cursor-pointer rounded-2xl border border-base-content/8 bg-base-200/20 p-4 text-xs leading-relaxed text-base-content hover:border-primary/40 transition"
                      title={t("ویرایش")}
                    >
                      <MentionText content={description} className="whitespace-pre-wrap" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingDescription(true)}
                      className="w-full cursor-pointer rounded-2xl border border-dashed border-base-content/15 p-5 text-center text-xs text-heledone-ink-muted transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                    >
                      {t("توضیحی اضافه نشده است. برای نوشتن کلیک کنید...")}
                    </button>
                  )}
                </div>

                {/* Checklist Section */}
                <div className="task-sheet-section space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TaskSquare size={17} className="text-primary" />
                      <h2 className="task-sheet-section-title">{t("فهرست گام‌ها و چک‌لیست")}</h2>
                      {checklists.length > 0 && (
                        <span className="rounded-full bg-base-200 px-2.5 py-0.5 text-xs font-bold text-heledone-ink-muted">
                          {formatUiNumber(checklistDone)}/{formatUiNumber(checklists.length)}
                        </span>
                      )}
                    </div>

                    {checklists.length > 0 && (
                      <span className="text-xs font-black text-primary">
                        {formatUiNumber(checklistProgress)}%
                      </span>
                    )}
                  </div>

                  {checklists.length > 0 && (
                    <div className="h-2 overflow-hidden rounded-full bg-base-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-[#F2BA49] transition-all duration-300"
                        style={{ width: `${checklistProgress}%` }}
                      />
                    </div>
                  )}

                  {/* Checklist Items */}
                  <div className="space-y-1 pt-1">
                    {isChecklistLoading && (
                      <p className="py-2 text-xs text-heledone-ink-muted">{t("Loading items...")}</p>
                    )}
                    {checklists.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between rounded-xl px-2.5 py-2 transition hover:bg-base-200/60"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={item.is_completed}
                            aria-label={item.description}
                            onClick={() =>
                              checklistToggleMutation.mutate({
                                id: item.id,
                                completed: !item.is_completed,
                              })
                            }
                            className={`grid size-5 shrink-0 place-items-center rounded-lg border transition ${item.is_completed
                              ? "border-success bg-success text-white shadow-2xs"
                              : "border-base-content/25 text-transparent hover:border-primary"
                              }`}
                          >
                            {item.is_completed && <TickCircle size={14} variant="Bold" />}
                          </button>
                          <span
                            className={`text-xs break-words font-medium ${item.is_completed
                              ? "text-heledone-ink-muted line-through"
                              : "text-base-content"
                              }`}
                          >
                            {item.description}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={t("حذف مورد چک‌لیست")}
                          onClick={() => checklistDeleteMutation.mutate(item.id)}
                          className="task-sheet-checklist-delete"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Quick Add Checklist Form */}
                  {showAddChecklist || checklists.length > 0 ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (checklistText.trim()) {
                          checklistAddMutation.mutate(checklistText.trim(), {
                            onSuccess: () => {
                              setChecklistText("");
                              checklistInputRef.current?.focus();
                            },
                          });
                        }
                      }}
                      className="flex gap-2 pt-1"
                    >
                      <div className="task-sheet-checklist-input-group flex-1">
                        <Add size={16} className="text-heledone-ink-muted shrink-0" />
                        <input
                          ref={checklistInputRef}
                          aria-label={t("گام جدید را وارد کنید… (Enter برای افزودن)")}
                          value={checklistText}
                          onChange={(e) => setChecklistText(e.target.value)}
                          placeholder={t("گام جدید را وارد کنید… (Enter برای افزودن)")}
                        />
                      </div>
                      <button
                        type="submit"
                        aria-label={t("Add checklist item")}
                        disabled={!checklistText.trim() || checklistAddMutation.isPending}
                        className="grid size-9 place-items-center rounded-2xl bg-primary text-primary-content shadow-xs transition hover:bg-[#006D73] disabled:opacity-40 shrink-0"
                      >
                        <Add size={17} />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddChecklist(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                    >
                      <Add size={15} />
                      <span>{t("Add checklist item")}</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ─── TAB 2: COMMENTS ─── */}
            {activeTab === "comments" && (
              <section className="space-y-5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (commentText.trim() || selectedFile) commentMutation.mutate();
                  }}
                  className="rounded-2xl border border-base-content/10 bg-base-200/30 p-4 space-y-3 transition focus-within:border-primary/40 focus-within:bg-base-100 shadow-2xs"
                >
                  <MentionTextarea
                    ariaLabel={t("Write a comment...")}
                    value={commentText}
                    onChange={setCommentText}
                    members={allAvailableMembers}
                    position="bottom"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        if (commentText.trim() || selectedFile) commentMutation.mutate();
                      }
                    }}
                    placeholder={t("دیدگاهی بنویسید… (از @ برای منشن کردن اعضای پروژه استفاده کنید)")}
                    className="min-h-20 w-full resize-none bg-transparent text-xs leading-relaxed text-base-content outline-none placeholder:text-heledone-ink-muted"
                  />

                  {selectedFile && (
                    <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-1.5 text-xs text-primary">
                      <span className="truncate">{selectedFile.name}</span>
                      <button
                        type="button"
                        aria-label={t("حذف پیوست انتخاب‌شده")}
                        onClick={() => setSelectedFile(null)}
                      >
                        <CloseSquare size={16} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-base-content/8 pt-2.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept=".pdf,.png,.jpg,.jpeg,.zip,.doc,.docx,.xls,.xlsx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && file.size <= 5 * 1024 * 1024) setSelectedFile(file);
                        else if (file) toast.error(t("File size must be less than 5MB."));
                        e.target.value = "";
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={t("افزودن پیوست")}
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl p-2 text-heledone-ink-muted hover:bg-base-200 hover:text-primary transition"
                      >
                        <Paperclip2 size={17} />
                      </button>
                      <span className="text-[10px] text-heledone-ink-muted hidden sm:inline">
                        <kbd className="px-1 py-0.5 rounded border border-base-content/10 bg-base-100 font-mono text-[9px]">
                          {t("Ctrl+Enter")}
                        </kbd>{" "}
                        {t("Ctrl + Enter برای ارسال")}
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={commentMutation.isPending || (!commentText.trim() && !selectedFile)}
                      className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-primary to-[#006D73] px-4 py-2 text-xs font-bold text-primary-content shadow-md shadow-primary/20 transition hover:from-[#006D73] hover:to-[#005B60] disabled:opacity-40"
                    >
                      <Send2 size={14} />
                      <span>{commentMutation.isPending ? t("Sending...") : t("Comment")}</span>
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  {isCommentsLoading && (
                    <p className="py-4 text-center text-xs text-heledone-ink-muted">{t("Loading comments...")}</p>
                  )}

                  {!isCommentsLoading && comments.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-base-content/15 p-8 text-center bg-base-100/50">
                      <img
                        src="/images/heledone-assets/boat-lenj.png"
                        alt=""
                        aria-hidden="true"
                        className="mx-auto h-20 w-auto object-contain opacity-35 mb-2 select-none"
                      />
                      <p className="text-xs font-bold text-base-content">
                        {t("هنوز دیدگاهی ثبت نشده است. اولین نظر یا یادداشت را بنویسید.")}
                      </p>
                    </div>
                  )}

                  {comments.map((comment) => {
                    const authorAvatar = comment.author_detail?.avatar || comment.author_detail?.avatar_url;
                    const isAuthor =
                      currentUser &&
                      (String(comment.author) === String(currentUser.id) ||
                        String(comment.author_detail?.id) === String(currentUser.id));
                    const isEditing = editingCommentId === comment.id;

                    return (
                      <article
                        key={comment.id}
                        className="rounded-2xl border border-base-content/8 bg-base-100 p-4 space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <ProfileAvatar src={authorAvatar} name={comment.author_detail?.first_name || comment.author_detail?.username || t("User")} className="size-7 shrink-0 overflow-hidden rounded-full border border-base-content/10 shadow-2xs" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary" />
                            <span className="text-xs font-bold text-base-content">
                              {comment.author_detail?.first_name ||
                                comment.author_detail?.username ||
                                t("User")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-heledone-ink-muted font-medium">
                              {formatRelativeDate(comment.created_at)}
                            </span>
                            {isAuthor && !isEditing && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentText(comment.content);
                                  }}
                                  className="size-6 grid place-items-center rounded-md text-heledone-ink-muted hover:text-primary hover:bg-base-200 transition"
                                  title={t("ویرایش دیدگاه")}
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(t("آیا از حذف این دیدگاه مطمئن هستید؟"))) {
                                      deleteCommentMutation.mutate(comment.id);
                                    }
                                  }}
                                  className="size-6 grid place-items-center rounded-md text-heledone-ink-muted hover:text-error hover:bg-error/10 transition"
                                  title={t("حذف دیدگاه")}
                                >
                                  <Trash size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <MentionTextarea
                              value={editingCommentText}
                              onChange={setEditingCommentText}
                              members={allAvailableMembers}
                              position="bottom"
                              className="min-h-16 w-full resize-none rounded-xl border border-base-content/10 bg-base-200/40 p-2.5 text-xs text-base-content outline-none focus:border-primary/50"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                  e.preventDefault();
                                  if (editingCommentText.trim()) {
                                    updateCommentMutation.mutate({
                                      id: comment.id,
                                      content: editingCommentText,
                                    });
                                  }
                                }
                              }}
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingCommentText("");
                                }}
                                className="px-2.5 py-1 text-xs text-heledone-ink-muted hover:text-base-content"
                              >
                                {t("انصراف")}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  updateCommentMutation.isPending || !editingCommentText.trim()
                                }
                                onClick={() =>
                                  updateCommentMutation.mutate({
                                    id: comment.id,
                                    content: editingCommentText,
                                  })
                                }
                                className="rounded-xl bg-primary px-3 py-1 text-xs font-bold text-primary-content hover:bg-primary/90 disabled:opacity-40"
                              >
                                {updateCommentMutation.isPending ? t("Saving...") : t("ذخیره")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <MentionText
                            content={comment.content}
                            className="text-xs leading-relaxed text-base-content/80 whitespace-pre-wrap"
                          />
                        )}

                        {comment.attached_file_url && (
                          <div className="mt-2 pt-2 border-t border-base-content/8">
                            {comment.attached_file_url.match(/\.(jpeg|jpg|gif|png)$/i) ? (
                              <a
                                href={comment.attached_file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block w-48 h-32 rounded-xl overflow-hidden border border-base-content/10 hover:border-primary/50 transition-colors shadow-2xs"
                              >
                                <img
                                  src={comment.attached_file_url}
                                  alt={t("Attachment")}
                                  className="w-full h-full object-cover"
                                />
                              </a>
                            ) : (
                              <a
                                href={comment.attached_file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-base-200/50 hover:bg-base-200 border border-base-content/10 rounded-xl text-xs text-base-content transition"
                              >
                                <Paperclip2 size={14} />
                                <span>{t("Download Attachment")}</span>
                              </a>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ─── TAB 3: ACTIVITY ─── */}
            {activeTab === "activity" && (
              <section className="space-y-4">
                {isActivitiesLoading && (
                  <p className="py-4 text-center text-xs text-heledone-ink-muted">{t("Loading activity...")}</p>
                )}

                {!isActivitiesLoading && activities.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-base-content/15 p-8 text-center bg-base-100/50">
                    <img
                      src="/images/heledone-assets/palm-corner.png"
                      alt=""
                      aria-hidden="true"
                      className="mx-auto h-20 w-auto object-contain opacity-35 mb-2 select-none"
                    />
                    <p className="text-xs font-bold text-base-content">
                      {t("هنوز فعالیتی برای این تسک ثبت نشده است.")}
                    </p>
                  </div>
                )}

                <div className="relative border-s-2 border-primary/20 ms-3 ps-5 space-y-4">
                  {activities.map((act) => (
                    <div key={act.id} className="relative">
                      <span className="absolute -start-[27px] top-1 size-2.5 rounded-full bg-primary shadow-xs ring-4 ring-base-100" />
                      <p className="text-xs font-bold text-base-content">
                        {act.metadata?.action || act.event_type}
                      </p>
                      <p className="text-[11px] text-heledone-ink-muted font-medium">
                        {act.actor_detail?.first_name || act.actor_detail?.username || t("System")} ·{" "}
                        {formatRelativeDate(act.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ─── Footer ─── */}
          <footer className="task-sheet-footer">
            <span role="status">
              <TickCircle size={16} variant="Bold" className="text-success" />
              <span>{isBusy ? t("در حال ذخیره…") : t("تغییرات خودکار ذخیره می‌شوند")}</span>
            </span>

            <span className="text-heledone-ink-muted flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded-md border border-base-content/15 bg-base-200/60 font-mono text-[10px] font-bold">
                {t("ESC")}
              </kbd>
              <span>{t("برای بستن، Esc را بزنید")}</span>
            </span>
          </footer>
        </motion.aside>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
