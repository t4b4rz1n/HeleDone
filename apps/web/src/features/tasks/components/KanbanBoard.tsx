import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { getWorkflowAppearance } from "../../../core/config/designTokens";
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBoards, getTasks, moveTask, createTask, reorderTasks, createStatus, updateTask, reorderStatuses, deleteStatus } from '../api/tasksApi';
import { getActiveTimers, startTimer, stopTimer } from '../../attendance/api/attendanceApi';
import type { TimeLog } from '../../attendance/types';
import { useTaskStore } from '../store/useTaskStore';
import { useAuthStore } from '../../auth/store/authStore';
import { TaskCard } from './TaskCard';
import { TaskSheet } from './TaskSheet';
import { FocusModeView } from './FocusModeView';
import { DroppableColumn } from './DroppableColumn';
import type { Task, Board } from '../types';

import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { SortableTask } from './SortableTask';
import { ChevronDown, PanelLeftOpen } from 'lucide-react';
import { Add, More, SearchNormal1, TickCircle, Category, Activity, User, Danger, Flash, Trash, ArrowLeft2, ArrowRight2 } from 'iconsax-reactjs';
import { toast } from 'sonner';

import { usePermissions } from '../../auth/hooks/usePermissions';

interface KanbanBoardProps {
  onCreateBoard?: () => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ onCreateBoard }) => {
  const t = useTranslation();
  const { activeProjectId, activeBoardId, selectedTaskId, setSelectedTaskId, setActiveBoard, setWorkspaceSidebarOpen } = useTaskStore();
  const currentUser = useAuthStore((state) => state.user);
  const { hasPermission, isStaff } = usePermissions();

  const canCreateTask = hasPermission('task.create') || hasPermission('task.manage_all') || isStaff;
  const canManageBoard = hasPermission('board.manage') || hasPermission('project.manage') || hasPermission('org.manage_settings') || isStaff;
  const canEditTask = hasPermission('task.manage_all') || hasPermission('task.create') || isStaff;

  const queryClient = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<any | null>(null);

  const selectedTaskIdParam = selectedTaskId;
  const [focusDueDateOnOpen, setFocusDueDateOnOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'my-tasks' | 'blocked' | 'priority'>('all');
  const [focusMode, setFocusMode] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | number | null>(null);
  const [columnSorts, setColumnSorts] = useState<Record<string, 'priority' | 'due_date' | 'title' | null>>({});
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<{ id: string | number; rect: DOMRect } | null>(null);
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false);
  const [deleteColumnConfirmId, setDeleteColumnConfirmId] = useState<string | number | null>(null);


  const setSelectedTaskForSheet = (task: Task | null) => {
    setSelectedTaskId(task ? task.id.toString() : null);
  };

  const openTaskSheetWithDueDate = (task: Task) => {
    setSelectedTaskId(task.id.toString());
    setFocusDueDateOnOpen(true);
  };


  // Add task state

  const [addingTaskToStatusId, setAddingTaskToStatusId] = useState<string | number | null>(null);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('low');
  const sameId = (left: string | number | undefined, right: string | number | undefined) => left?.toString() === right?.toString();

  const { data: boards } = useQuery({
    queryKey: ['boards', activeProjectId],
    queryFn: () => getBoards(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const { data: serverTasks } = useQuery({
    queryKey: ['tasks', activeProjectId, activeBoardId],
    queryFn: () => getTasks(activeProjectId!, activeBoardId!),
    enabled: !!activeProjectId && !!activeBoardId,
  });

  const { data: activeTimers = [] } = useQuery<TimeLog[]>({
    queryKey: ['activeTimers'],
    queryFn: getActiveTimers,
    refetchInterval: 15000,
  });

  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const isDraggingRef = useRef(false);

  // Horizontal scroll & overflow indicators
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    if (maxScroll <= 8) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const isRtl = document.documentElement.dir === 'rtl' || getComputedStyle(el).direction === 'rtl';
    if (isRtl) {
      const currentScroll = Math.abs(scrollLeft);
      setCanScrollRight(currentScroll > 15);
      setCanScrollLeft(currentScroll < maxScroll - 15);
    } else {
      setCanScrollLeft(scrollLeft > 15);
      setCanScrollRight(scrollLeft < maxScroll - 15);
    }
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    updateScrollIndicators();
    const handleResize = () => updateScrollIndicators();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [boards, localTasks]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = 320;
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    el.scrollBy({ left: delta, behavior: 'smooth' });
    setTimeout(updateScrollIndicators, 350);
  };

  const scrollToStatus = (statusId: string | number) => {
    const target = document.getElementById(`col-${statusId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setTimeout(updateScrollIndicators, 350);
    }
  };

  useEffect(() => {
    if (serverTasks && !isDraggingRef.current) {
      setLocalTasks(serverTasks);
    }
  }, [serverTasks]);

  const moveTaskMutation = useMutation({
    mutationFn: ({ taskId, statusId, order }: { taskId: string | number, statusId: string | number, order: number }) => moveTask(taskId, statusId, order),
    onMutate: async ({ taskId, statusId }) => {
      const activeBoard = boards?.find(b => b.id.toString() === activeBoardId);
      const targetStatus = activeBoard?.statuses.find(s => sameId(s.id, statusId));
      const isDoing = targetStatus && (targetStatus.category === 'in_progress' || targetStatus.code === 'doing' || targetStatus.name.toLowerCase() === 'doing' || targetStatus.name.toLowerCase() === 'in progress');
      const isReviewOrDone = targetStatus && (targetStatus.category === 'review' || targetStatus.category === 'done' || targetStatus.code === 'review' || targetStatus.code === 'done' || targetStatus.name.toLowerCase() === 'review' || targetStatus.name.toLowerCase() === 'done');
      const isDone = targetStatus && (targetStatus.category === 'done' || targetStatus.code === 'done' || targetStatus.name.toLowerCase() === 'done');

      setLocalTasks(tasks => tasks.map(t => {
        if (sameId(t.id, taskId)) {
          return {
            ...t,
            is_finished: Boolean(isDone),
            status_detail: targetStatus ? (targetStatus as any) : t.status_detail,
            is_active_timer_running: isDoing ? true : (isReviewOrDone ? false : t.is_active_timer_running)
          };
        }
        if (isDoing) {
          return { ...t, is_active_timer_running: false };
        }
        return t;
      }));

      return { previousTasks: serverTasks };
    },
    onError: (err: any, _newMove, context: any) => {
      const errorData = err.response?.data;
      const errorMessage = errorData?.message || errorData?.detail || errorData?.error || err.message || 'Failed to move task';
      console.error('Move task error:', err.response?.status, errorData);
      toast.error(translateError(errorMessage));
      if (context?.previousTasks) {
        setLocalTasks(context.previousTasks);
        queryClient.setQueryData(['tasks', activeProjectId, activeBoardId], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['activeTimers'] });
      queryClient.invalidateQueries({ queryKey: ['employee-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['active-timer'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceTasks'] });
    },
  });

  const reorderTasksMutation = useMutation({
    mutationFn: (orders: { id: string | number; order: number }[]) => reorderTasks(orders as any),
    onMutate: async () => {
      return { previousTasks: serverTasks };
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previousTasks) {
        setLocalTasks(context.previousTasks);
        queryClient.setQueryData(['tasks', activeProjectId, activeBoardId], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ title, statusId, priority }: { title: string, statusId: string | number, priority: string }) => createTask(activeProjectId!, title, statusId, priority),
    onMutate: async ({ title, statusId, priority }) => {
      const queryKey = ['tasks', activeProjectId, activeBoardId];
      await queryClient.cancelQueries({ queryKey });
      const previousTasks = (queryClient.getQueryData<Task[]>(queryKey) || localTasks);
      const status = boards?.find(board => board.id.toString() === activeBoardId)?.statuses.find(item => item.id.toString() === statusId.toString());
      const optimisticTask: Task = {
        id: `optimistic-${Date.now()}`,
        key: 'NEW',
        title,
        priority: priority as Task['priority'],
        status_detail: status,
        is_finished: false,
        is_blocked: false,
        progress_percent: 0,
        subtasks_count: 0,
        order: previousTasks.filter(task => task.status_detail?.id?.toString() === statusId.toString()).length,
      };
      const nextTasks = [...previousTasks, optimisticTask];
      queryClient.setQueryData(queryKey, nextTasks);
      setLocalTasks(nextTasks);
      return { previousTasks };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setAddingTaskToStatusId(null);
      setNewTaskTitle('');
      setNewTaskPriority('low');
    },
    onError: (err: any, _variables, context: any) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', activeProjectId, activeBoardId], context.previousTasks);
        setLocalTasks(context.previousTasks);
      }
      toast.error(translateError(err.response?.data?.detail || err.message || 'Error creating task.'));
    }
  });

  const handleCreateTask = (statusId: string | number) => {
    if (!newTaskTitle.trim()) {
      setAddingTaskToStatusId(null);
      return;
    }
    createTaskMutation.mutate({ title: newTaskTitle, statusId, priority: newTaskPriority });
  };

  const startTimerMutation = useMutation({
    mutationFn: (taskId: string | number) => startTimer(taskId),
    onMutate: async (taskId) => {
      // Find "doing" or "in progress" status IN THE ACTIVE BOARD
      const activeBoard = boards?.find(b => b.id.toString() === activeBoardId);
      const doingStatus = activeBoard?.statuses.find(s => s.code === 'doing' || s.name.toLowerCase() === 'doing' || s.name.toLowerCase() === 'in progress');

      const previousTasks = [...localTasks];

      // Optimistically start the timer and move task to doing if needed
      setLocalTasks(tasks => tasks.map(t => {
        if (sameId(t.id, taskId)) {
          const updatedTask = { ...t, is_active_timer_running: true };
          const isTodo = t.status_detail?.code?.toLowerCase() === 'todo' || t.status_detail?.name?.toLowerCase() === 'to do';
          if (doingStatus && !sameId(t.status_detail?.id, doingStatus.id) && isTodo) {
            updatedTask.status_detail = doingStatus as any;
          }
          return updatedTask;
        }
        return t;
      }));

      return { previousTasks };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['activeTimers'] });
      queryClient.invalidateQueries({ queryKey: ['employee-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['active-timer'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceTasks'] });
      queryClient.invalidateQueries({ queryKey: ['live-activity'] });
    },
    onError: (err: any, taskId, context: any) => {
      const errorMessage = err.response?.data?.detail || err.response?.data?.error || err.message || 'Failed to start timer';
      toast.error(translateError(errorMessage));
      // Revert completely
      if (context?.previousTasks) {
        setLocalTasks(context.previousTasks);
      } else {
        setLocalTasks(tasks => tasks.map(t => sameId(t.id, taskId) ? { ...t, is_active_timer_running: false } : t));
      }
    }
  });

  const stopTimerMutation = useMutation({
    mutationFn: async (taskId: string | number) => {
      // Find the specific timer for this task
      const queryClientTasks = queryClient.getQueryData<TimeLog[]>(['activeTimers']) || [];
      const timer = queryClientTasks.find(t => sameId(t.task, taskId));
      if (!timer) throw new Error(t("Active timer not found for this task"));
      return stopTimer(timer.id);
    },
    onMutate: async (taskId) => {
      setLocalTasks(tasks => tasks.map(t => sameId(t.id, taskId) ? { ...t, is_active_timer_running: false } : t));
    },
    onSuccess: (data, taskId) => {
      if (data && data.duration_seconds !== undefined) {
        setLocalTasks(tasks => tasks.map(t => {
          if (sameId(t.id, taskId)) {
            const currentSpent = Number(t.spent_seconds || 0);
            const newSpent = currentSpent + data.duration_seconds;
            return { ...t, spent_seconds: newSpent };
          }
          return t;
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['activeTimers'] });
      queryClient.invalidateQueries({ queryKey: ['employee-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['active-timer'] });
      queryClient.invalidateQueries({ queryKey: ['standup-grid'] });
      queryClient.invalidateQueries({ queryKey: ['attendanceTasks'] });
      queryClient.invalidateQueries({ queryKey: ['live-activity'] });
    },
    onError: (err: any, taskId) => {
      const errorMessage = err.response?.data?.detail || err.response?.data?.error || err.message || 'Failed to stop timer';
      toast.error(translateError(errorMessage));
      // Revert
      setLocalTasks(tasks => tasks.map(t => sameId(t.id, taskId) ? { ...t, is_active_timer_running: true } : t));
    }
  });

  const handlePlayTimer = (taskId: string | number) => {
    const task = localTasks.find(t => sameId(t.id, taskId));
    if (!task) return;

    // Find "doing" or "in progress" status IN THE ACTIVE BOARD
    const activeBoard = boards?.find(b => b.id.toString() === activeBoardId);
    const doingStatus = activeBoard?.statuses.find(s => s.code === 'doing' || s.name.toLowerCase() === 'doing' || s.name.toLowerCase() === 'in progress');

    // If we have a doing status and the task is not already in it, move it optimistically
    if (doingStatus && !sameId(task.status_detail?.id, doingStatus.id)) {
      // Optimistic update (backend will auto-move it to doing when we start the timer)
      setLocalTasks(tasks => {
        const newTasks = [...tasks];
        const index = newTasks.findIndex(t => sameId(t.id, taskId));
        if (index !== -1) {
          newTasks[index] = { ...newTasks[index], status_detail: doingStatus as any };
        }
        return newTasks;
      });
    }

    startTimerMutation.mutate(taskId);
  };

  const handleStopTimer = (taskId: string | number) => {
    stopTimerMutation.mutate(taskId);
  };

  const patchLocalTask = (taskId: string | number, patch: Partial<Task>) => {
    setLocalTasks(tasks => tasks.map(task => sameId(task.id, taskId) ? { ...task, ...patch } : task));
    queryClient.setQueryData<Task[]>(['tasks', activeProjectId, activeBoardId], tasks => tasks?.map(task => sameId(task.id, taskId) ? { ...task, ...patch } : task));
    queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
  };

  const toggleFinishedMutation = useMutation({
    mutationFn: ({ taskId, isFinished }: { taskId: string | number; isFinished: boolean }) =>
      updateTask(taskId, { is_finished: isFinished }),
    onMutate: async ({ taskId, isFinished }) => {
      const queryKey = ['tasks', activeProjectId, activeBoardId];
      await queryClient.cancelQueries({ queryKey });
      const previousTasks = queryClient.getQueryData<Task[]>(queryKey) || localTasks;

      const nextTasks = localTasks.map(t =>
        sameId(t.id, taskId) ? { ...t, is_finished: isFinished } : t
      );
      setLocalTasks(nextTasks);
      queryClient.setQueryData(queryKey, nextTasks);

      return { previousTasks };
    },
    onSuccess: (_data, { isFinished }) => {
      toast.success(isFinished ? t("تسک انجام شد؛ خسته نباشید!") : t("تسک دوباره برای انجام آماده است."));
    },
    onError: (err: any, _vars, context: any) => {
      if (context?.previousTasks) {
        setLocalTasks(context.previousTasks);
        queryClient.setQueryData(['tasks', activeProjectId, activeBoardId], context.previousTasks);
      }
      toast.error(translateError(err?.response?.data?.detail || t("ثبت وضعیت انجام‌شدن تسک ممکن نشد")));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  const handleToggleDone = (taskId: string | number) => {
    const task = localTasks.find(t => sameId(t.id, taskId));
    if (!task) return;

    const newFinished = !task.is_finished;
    toggleFinishedMutation.mutate({ taskId, isFinished: newFinished });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Helper: find which status a task or column id belongs to
  const findStatusId = (id: string): string | null => {
    if (id.startsWith('col-')) {
      return id.replace('col-', '');
    }
    const task = localTasks.find(t => t.id.toString() === id);
    return task?.status_detail?.id?.toString() || null;
  };


  const createStatusMutation = useMutation({
    mutationFn: (name: string) => createStatus(activeBoardId!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      setIsAddingStatus(false);
      setNewStatusName('');
      toast.success(t("Status added successfully"));
    },
    onError: (err: any) => {
      const errorData = err.response?.data;
      const errorMessage =
        errorData?.detail ||
        errorData?.non_field_errors?.[0] ||
        errorData?.code?.[0] ||
        errorData?.name?.[0] ||
        err.message ||
        'Failed to add status';
      toast.error(translateError(errorMessage));
    }
  });

  const handleCreateStatus = () => {
    if (!newStatusName.trim() || createStatusMutation.isPending) return;
    createStatusMutation.mutate(newStatusName);
  };

  const reorderStatusesMutation = useMutation({
    mutationFn: ({ boardId, orders }: { boardId: string | number; orders: { id: string | number; order: number }[] }) =>
      reorderStatuses(boardId, orders),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
    },
    onError: (err: any) => {
      toast.error(translateError(err?.response?.data?.detail || err?.response?.data?.error || "Failed to reorder columns"));
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
    }
  });

  const deleteStatusMutation = useMutation({
    mutationFn: (statusId: string | number) => deleteStatus(statusId),
    onMutate: async (statusId) => {
      // Optimistically remove the status from boards cache
      const previousBoards = queryClient.getQueryData(['boards', activeProjectId]);
      queryClient.setQueryData(['boards', activeProjectId], (oldBoards: Board[] | undefined) => {
        if (!oldBoards) return oldBoards;
        return oldBoards.map(b => {
          if (b.id.toString() === activeBoardId) {
            return { ...b, statuses: b.statuses.filter(s => s.id.toString() !== statusId.toString()) };
          }
          return b;
        });
      });
      // Also remove tasks belonging to that status from localTasks
      setLocalTasks(tasks => tasks.filter(t => t.status_detail?.id?.toString() !== statusId.toString()));
      return { previousBoards };
    },
    onSuccess: () => {
      toast.success(t("ستون با موفقیت حذف شد"));
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', activeProjectId, activeBoardId] });
    },
    onError: (err: any, _statusId, context: any) => {
      toast.error(translateError(err?.response?.data?.detail || err?.response?.data?.error || "Failed to delete column"));
      if (context?.previousBoards) {
        queryClient.setQueryData(['boards', activeProjectId], context.previousBoards);
      }
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
    },
    onSettled: () => {
      setDeleteColumnConfirmId(null);
    },
  });

  const handleMoveStatus = (statusId: string | number, direction: 'left' | 'right') => {
    const board = boards?.find(b => b.id.toString() === activeBoardId);
    if (!board) return;
    const sortedStatuses = [...board.statuses].sort((a, b) => a.order - b.order);
    const idx = sortedStatuses.findIndex(s => s.id.toString() === statusId.toString());
    if (idx === -1) return;

    if (direction === 'left' && idx > 0) {
      const temp = sortedStatuses[idx];
      sortedStatuses[idx] = sortedStatuses[idx - 1];
      sortedStatuses[idx - 1] = temp;
    } else if (direction === 'right' && idx < sortedStatuses.length - 1) {
      const temp = sortedStatuses[idx];
      sortedStatuses[idx] = sortedStatuses[idx + 1];
      sortedStatuses[idx + 1] = temp;
    } else {
      return;
    }

    const newOrders = sortedStatuses.map((s, orderIdx) => ({ id: s.id, order: orderIdx }));

    queryClient.setQueryData(['boards', activeProjectId], (oldBoards: Board[] | undefined) => {
      if (!oldBoards) return oldBoards;
      return oldBoards.map(b => {
        if (b.id.toString() === activeBoardId) {
          const updatedStatuses = b.statuses.map((s: any) => {
            const match = newOrders.find(o => o.id.toString() === s.id.toString());
            return match ? { ...s, order: match.order } : s;
          });
          return { ...b, statuses: updatedStatuses.sort((a: any, b: any) => a.order - b.order) };
        }
        return b;
      });
    });

    reorderStatusesMutation.mutate({ boardId: activeBoardId!, orders: newOrders });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id.toString();

    if (activeId.startsWith('col-')) {
      if (!canManageBoard) return;
      isDraggingRef.current = true;
      const statusId = activeId.replace('col-', '');
      const status = boards?.flatMap(b => b.statuses).find(s => s.id.toString() === statusId);
      if (status) setActiveColumn(status);
    } else {
      isDraggingRef.current = true;
      const task = localTasks.find(t => t.id.toString() === activeId);
      if (task) setActiveTask(task);
    }
  };


  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    if (activeId === overId) return;

    // If dragging a column, we do not perform task transition logic
    if (activeId.startsWith('col-') || overId.startsWith('col-') && activeId.startsWith('col-')) return;

    const activeStatusId = findStatusId(activeId);
    const overStatusId = findStatusId(overId);

    if (!activeStatusId || !overStatusId || activeStatusId === overStatusId) return;

    // Cross-column move: update the task's status_detail locally
    const statusDetail = boards?.flatMap(b => b.statuses).find(s => sameId(s.id, overStatusId));
    if (!statusDetail) return;

    setLocalTasks((tasks) => {
      const activeIndex = tasks.findIndex(t => t.id.toString() === activeId);
      if (activeIndex === -1) return tasks;

      const newTasks = [...tasks];
      newTasks[activeIndex] = {
        ...newTasks[activeIndex],
        status_detail: statusDetail as any
      };

      // If dropping over a task, reorder near it
      if (!overId.startsWith('col-')) {
        const overIndex = newTasks.findIndex(t => t.id.toString() === overId);
        if (overIndex !== -1) {
          return arrayMove(newTasks, activeIndex, overIndex);
        }
      }

      return newTasks;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    isDraggingRef.current = false;
    const { active, over } = event;

    if (activeColumn) {
      setActiveColumn(null);
    }

    if (!over) {
      // Snap back
      setLocalTasks(serverTasks || []);
      setActiveTask(null);
      return;
    }

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // ─── Column Drag End Logic ───
    if (activeId.startsWith('col-')) {
      if (activeId !== overId) {
        const activeStatusId = activeId.replace('col-', '');
        const overStatusId = overId.replace('col-', '');

        const board = boards?.find(b => b.id.toString() === activeBoardId);
        if (board) {
          const sortedStatuses = [...board.statuses].sort((a, b) => a.order - b.order);
          const activeIndex = sortedStatuses.findIndex(s => s.id.toString() === activeStatusId);
          const overIndex = sortedStatuses.findIndex(s => s.id.toString() === overStatusId);

          if (activeIndex !== -1 && overIndex !== -1) {
            const reordered = arrayMove(sortedStatuses, activeIndex, overIndex);
            const newOrders = reordered.map((s, idx) => ({ id: s.id, order: idx }));

            // Optimistic update
            queryClient.setQueryData(['boards', activeProjectId], (oldBoards: Board[] | undefined) => {
              if (!oldBoards) return oldBoards;
              return oldBoards.map(b => {
                if (b.id.toString() === activeBoardId) {
                  const updatedStatuses = b.statuses.map(s => {
                    const match = newOrders.find(o => o.id.toString() === s.id.toString());
                    return match ? { ...s, order: match.order } : s;
                  });
                  return { ...b, statuses: updatedStatuses.sort((a, b) => a.order - b.order) };
                }
                return b;
              });
            });

            reorderStatusesMutation.mutate({ boardId: activeBoardId!, orders: newOrders });
          }
        }
      }
      return;
    }

    // ─── Task Drag End Logic ───
    const movedTask = localTasks.find(t => t.id.toString() === activeId) || activeTask;
    if (!movedTask) {
      setActiveTask(null);
      return;
    }

    // Use findStatusId to reliably get the target column, bypassing stale localTasks for the dragged item
    const overStatusId = findStatusId(overId);
    const newStatusId = overStatusId || movedTask.status_detail?.id;

    if (!newStatusId) {
      setActiveTask(null);
      return;
    }

    let finalTasks = [...localTasks];
    const activeIndex = finalTasks.findIndex(t => t.id.toString() === activeId);

    if (activeIndex !== -1) {
      // Ensure the dragged task has the correct target status (in case handleDragOver state update was batched/stale)
      const targetStatusDetail = boards?.flatMap(b => b.statuses).find(s => sameId(s.id, newStatusId));
      if (targetStatusDetail) {
        finalTasks[activeIndex] = { ...finalTasks[activeIndex], status_detail: targetStatusDetail as any };
      }

      // If dropped over a specific task (not just the column), reorder it relative to that task
      if (!overId.startsWith('col-') && activeId !== overId) {
        const overIndex = finalTasks.findIndex(t => t.id.toString() === overId);
        if (overIndex !== -1) {
          finalTasks = arrayMove(finalTasks, activeIndex, overIndex);
        }
      }
    }

    // Recalculate orders for the target column
    const columnTasks = finalTasks.filter(t => sameId(t.status_detail?.id, newStatusId));
    const newColumnOrders = columnTasks.map((t, idx) => ({ id: t.id, order: idx }));

    // Apply orders locally
    setLocalTasks(finalTasks.map(t => {
      const orderEntry = newColumnOrders.find(o => sameId(o.id, t.id));
      if (orderEntry) {
        return { ...t, order: orderEntry.order };
      }
      return t;
    }));

    // Use activeTask's original status to determine if it was a cross-column move
    // This avoids stale state bugs if handleDragOver mutated localTasks during hover
    const wasCrossColumn = activeTask && !sameId(activeTask.status_detail?.id, newStatusId);

    if (wasCrossColumn) {
      const newOrder = newColumnOrders.find(o => sameId(o.id, movedTask.id))?.order || 0;
      moveTaskMutation.mutate({
        taskId: movedTask.id,
        statusId: newStatusId,
        order: newOrder
      });
    } else {
      // Same column reorder
      if (activeId !== overId) {
        reorderTasksMutation.mutate(newColumnOrders);
      }
    }

    setActiveTask(null);
  };

  if (!activeProjectId || !activeBoardId) return null;
  if (!boards || boards.length === 0) return <div className="p-8 text-center text-heledone-ink-muted">{t("No boards found for this project.")}</div>;

  const board = boards.find(b => b.id.toString() === activeBoardId) || boards[0];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTasks = localTasks.filter(task => {
    const matchesSearch = !normalizedSearch || `${task.title} ${task.key}`.toLowerCase().includes(normalizedSearch);
    const matchesFilter = filter === 'all'
      || (filter === 'active' && !task.is_finished && task.status_detail?.code !== 'done')
      || (filter === 'my-tasks' && Boolean(currentUser?.id) && (
        task.assignees?.some(id => String(id) === String(currentUser?.id)) ||
        task.assignees_detail?.some(u => String(u.id) === String(currentUser?.id)) ||
        task.assignee_detail?.id === currentUser?.id ||
        task.assignee === currentUser?.id
      ))
      || (filter === 'blocked' && task.is_blocked)
      || (filter === 'priority' && ['high', 'critical'].includes(task.priority));
    return matchesSearch && matchesFilter;
  });
  const focusTask = filteredTasks.find(task => task.id === focusedTaskId) || filteredTasks[0];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-base-100">
      {/* ─── Top Header with Board Info ─── */}
      <div className="shrink-0 border-b border-base-300/60 bg-base-100 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          {/* Left: Board Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setWorkspaceSidebarOpen(true)}
                className="lg:hidden p-1.5 -ms-1 rounded-lg text-heledone-ink-muted hover:text-base-content hover:bg-base-200 transition-colors"
                title={t("Project menu")}
                aria-label={t("Project menu")}
              >
                <PanelLeftOpen size={18} />
              </button>
              <h1 className="text-base sm:text-lg font-extrabold text-base-content truncate">
                {board.title}
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-[11px] sm:text-xs font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                {t("فعال")}
              </span>
            </div>
            <p className="text-xs text-heledone-ink-muted font-medium mt-0.5">
              {t("مدیریت پروژه و ردیابی تسک‌ها")}
            </p>
          </div>

          {/* Right: Board controls and quick actions */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsBoardMenuOpen((open) => !open)}
                className="inline-flex max-w-[9rem] sm:max-w-[13rem] items-center gap-1.5 sm:gap-2 rounded-lg border border-base-300 bg-base-100 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-base-content shadow-xs transition hover:border-primary/40 hover:bg-primary/5"
                aria-haspopup="menu"
                aria-expanded={isBoardMenuOpen}
              >
                <Category size={14} className="shrink-0 text-primary" />
                <span className="truncate">{board.title}</span>
                <ChevronDown size={14} className="shrink-0 text-heledone-ink-muted" />
              </button>

              {isBoardMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    aria-label={t("بستن منو")}
                    onClick={() => setIsBoardMenuOpen(false)}
                  />
                  <div className="absolute end-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl" role="menu">
                    <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-heledone-ink-muted">
                      {t("Select board")}
                    </div>
                    {boards.map((item) => {
                      const isSelected = item.id.toString() === activeBoardId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setActiveBoard(item.id.toString());
                            setIsBoardMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs font-bold transition-colors ${isSelected ? 'bg-primary/10 text-primary' : 'text-base-content hover:bg-base-200'}`}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.background_color || '#087F83' }} />
                          <span className="truncate">{item.title}</span>
                        </button>
                      );
                    })}
                    {canManageBoard && onCreateBoard && (
                      <>
                        <div className="my-1 border-t border-base-200" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsBoardMenuOpen(false);
                            onCreateBoard();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs font-bold text-primary hover:bg-primary/10"
                        >
                          <Add size={14} />
                          {t("New Board")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {canManageBoard && onCreateBoard && (
              <button
                type="button"
                onClick={onCreateBoard}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 sm:px-3 py-1.5 text-xs font-bold text-primary-content shadow-sm transition hover:bg-[#006D73]"
                title={t("New Board")}
              >
                <Add size={14} />
                <span className="hidden sm:inline">{t("New Board")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const next = !focusMode;
                setFocusMode(next);
                if (next && !focusedTaskId) setFocusedTaskId(focusTask?.id || null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold transition-all ${focusMode
                ? 'bg-primary/10 text-primary'
                : 'bg-base-200 text-base-content hover:bg-base-300'
                }`}
              title={t("حالت تمرکز")}
            >
              <span className="text-sm">◉</span>
              <span className="hidden sm:inline">{focusMode ? t("خروج") : t("تمرکز")}</span>
            </button>

            {canCreateTask && (
              <button
                type="button"
                onClick={() => setAddingTaskToStatusId(board.statuses[0]?.id || null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content hover:bg-[#006D73] transition-all shadow-sm shrink-0"
              >
                <Add size={14} />
                <span className="whitespace-nowrap">{t("تسک جدید")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Filters and Search Bar ─── */}
      <div className="shrink-0 border-b border-base-300/60 bg-base-100 px-3 sm:px-6 py-2.5 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
          {/* Left: Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full -mx-1 px-1 sm:mx-0 sm:px-0">
            {(['all', 'active', 'my-tasks', 'blocked', 'priority'] as const).map((item) => {
              const labels: Record<string, string> = {
                all: t("همه"),
                active: t("فعال"),
                'my-tasks': t("تسک‌های من"),
                blocked: t("مسدود"),
                priority: t("اولویت بالا"),
              };
              const icons: Record<string, React.ReactNode> = {
                all: <Category size={13} className="text-primary" />,
                active: <Activity size={13} className="text-info" />,
                'my-tasks': <User size={13} className="text-heledone-ink-muted" />,
                blocked: <Danger size={13} className="text-error" />,
                priority: <Flash size={13} className="text-warning" />,
              };
              const counts: Record<string, number> = {
                all: localTasks.length,
                active: localTasks.filter(t => !t.is_finished && t.status_detail?.code !== 'done').length,
                'my-tasks': localTasks.filter(t => Boolean(currentUser?.id) && (t.assignee_detail?.id === currentUser?.id || t.assignee === currentUser?.id)).length,
                blocked: localTasks.filter(t => t.is_blocked).length,
                priority: localTasks.filter(t => ['high', 'critical'].includes(t.priority)).length,
              };
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${filter === item
                    ? 'border-primary/15 bg-primary/10 text-primary shadow-2xs'
                    : 'border-transparent text-heledone-ink-muted hover:border-base-300/70 hover:bg-base-200 hover:text-base-content'
                    }`}
                >
                  {icons[item]}
                  <span>{labels[item]}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${filter === item ? 'bg-primary/10 text-primary' : 'bg-base-300/60 text-heledone-ink-muted'}`}>
                    {formatUiNumber(counts[item])}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: Search */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <label className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 px-3 py-1.5 text-heledone-ink-muted focus-within:border-primary focus-within:bg-base-100 transition-all w-full sm:w-64">
              <SearchNormal1 size={14} />
              <input
                aria-label={t("جستجو در تسک‌ها")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("جستجو در تسک‌ها...")}
                className="flex-1 bg-transparent text-xs font-medium text-base-content outline-none placeholder:text-heledone-ink-muted"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-heledone-ink-muted hover:text-base-content"
                >
                  ✕
                </button>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* ─── Stage Breadcrumb / Flow Navigator (Concept 1) ─── */}
      {board?.statuses && board.statuses.length > 0 && !focusMode && (
        <div className="flex items-center gap-2 overflow-x-auto px-4 sm:px-6 py-2 border-b border-base-300/40 bg-base-100/80 backdrop-blur-xs custom-scrollbar shrink-0">
          <div className="flex items-center gap-1.5 min-w-max text-xs">
            {[...board.statuses].sort((a, b) => a.order - b.order).map((status, idx, arr) => {
              const count = filteredTasks.filter(t => t.status_detail?.id?.toString() === status.id.toString()).length;
              const appearance = getWorkflowAppearance(status);
              return (
                <React.Fragment key={status.id}>
                  <button
                    type="button"
                    onClick={() => scrollToStatus(status.id)}
                    className="group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-heledone-ink-muted hover:text-base-content hover:bg-base-200/70 transition-all cursor-pointer"
                  >
                    <span
                      className="size-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                      style={{ background: appearance.color }}
                    />
                    <span>{appearance.label}</span>
                    <span
                      className="rounded-full px-1.5 py-0.2 text-[10px] font-bold"
                      style={{ background: `color-mix(in srgb, ${appearance.color} 15%, transparent)`, color: appearance.color }}
                    >
                      {formatUiNumber(count)}
                    </span>
                  </button>
                  {idx < arr.length - 1 && (
                    <span className="text-heledone-ink-muted/40 rtl:rotate-180 select-none text-[11px]">
                      ›
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {focusMode ? (
        <FocusModeView
          tasks={filteredTasks.length > 0 ? filteredTasks : localTasks}
          focusedTaskId={focusedTaskId || focusTask?.id || null}
          onSelectTask={(id) => setFocusedTaskId(id)}
          onExit={() => setFocusMode(false)}
          onOpenSheet={(t) => setSelectedTaskForSheet(t)}
          onPlayTimer={handlePlayTimer}
          onStopTimer={handleStopTimer}
          onToggleDone={handleToggleDone}
          activeTimer={activeTimers?.[0]}
        />
      ) : (
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden bg-base-200/30">
          {/* Left Edge Gradient & Floating Back Navigation Button */}
          {canScrollLeft && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-20 bg-gradient-to-r from-base-200/95 via-base-200/60 to-transparent transition-opacity duration-300" />
              <button
                type="button"
                onClick={() => handleScroll('left')}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-30 grid size-10 place-items-center rounded-full bg-base-100/95 text-base-content shadow-xl backdrop-blur-md border border-base-300/80 hover:bg-primary hover:text-primary-content hover:scale-110 active:scale-95 transition-all cursor-pointer group"
                    aria-label={t("Scroll left")}
              >
                <ArrowLeft2 size={18} className="transition-transform group-hover:-translate-x-0.5" />
              </button>
            </>
          )}

          {/* Right Edge Gradient & Floating Forward Navigation Button */}
          {canScrollRight && (
            <>
              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-20 bg-gradient-to-l from-base-200/95 via-base-200/60 to-transparent transition-opacity duration-300" />
              <button
                type="button"
                onClick={() => handleScroll('right')}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-30 grid size-10 place-items-center rounded-full bg-base-100/95 text-base-content shadow-xl backdrop-blur-md border border-base-300/80 hover:bg-primary hover:text-primary-content hover:scale-110 active:scale-95 transition-all cursor-pointer group"
                    aria-label={t("Scroll right")}
              >
                <ArrowRight2 size={18} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </>
          )}

          <div
            ref={scrollContainerRef}
            onScroll={updateScrollIndicators}
            className="custom-scrollbar flex-1 overflow-x-auto overflow-y-visible snap-x snap-mandatory"
          >
            <div className="flex min-w-max items-start gap-3 p-4 pb-6 sm:gap-4 sm:p-6 sm:pb-8">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={board.statuses.map(s => `col-${s.id}`)} strategy={horizontalListSortingStrategy}>
                {[...board.statuses].sort((a, b) => a.order - b.order).map((status) => {
                  const columnTasks = filteredTasks.filter(t => t.status_detail?.id?.toString() === status.id.toString()) || [];
                  const isDoneColumn = status.code === 'done' || status.name.toLowerCase() === 'done' || status.name.toLowerCase() === 'completed';
                  const appearance = getWorkflowAppearance(status);
                  const statusColor = appearance.color;

                  const sortType = columnSorts[status.id.toString()];
                  const displayColumnTasks = [...columnTasks];
                  if (sortType === 'priority') {
                    const prioWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
                    displayColumnTasks.sort((a, b) => (prioWeight[b.priority] || 0) - (prioWeight[a.priority] || 0));
                  } else if (sortType === 'due_date') {
                    displayColumnTasks.sort((a, b) => {
                      if (!a.due_date) return 1;
                      if (!b.due_date) return -1;
                      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                    });
                  } else if (sortType === 'title') {
                    displayColumnTasks.sort((a, b) => a.title.localeCompare(b.title));
                  }

                  return (
                      <DroppableColumn
                        key={status.id}
                        id={`col-${status.id}`}
                        className={`heledone-kanban-column snap-center min-w-[85vw] sm:min-w-[280px] sm:w-[clamp(280px,20vw,320px)] flex flex-col rounded-2xl bg-base-100 transition-all ${isDoneColumn ? 'heledone-kanban-column-done opacity-90' : ''
                          }`}
                        header={
                          <div className="mb-3 flex shrink-0 items-center justify-between px-4 pt-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ background: statusColor }}
                              />
                              <h3 className="text-sm font-extrabold text-base-content tracking-tight">{appearance.label}</h3>
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-black"
                                style={{ background: `color-mix(in srgb, ${statusColor} 12%, transparent)`, color: statusColor }}
                              >
                                {formatUiNumber(columnTasks.length)}
                              </span>
                            </div>

                            {/* Interactive Column Actions Menu */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (columnMenuAnchor?.id === status.id) {
                                    setColumnMenuAnchor(null);
                                  } else {
                                    setColumnMenuAnchor({
                                      id: status.id,
                                      rect: e.currentTarget.getBoundingClientRect(),
                                    });
                                  }
                                }}
                                className="rounded-lg p-1 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content transition"
                                title={t("تنظیمات ستون")}
                              >
                                <More size={16} />
                              </button>

                              {columnMenuAnchor && columnMenuAnchor.id === status.id && createPortal(
                                <>
                                  <div className="fixed inset-0 z-45" onClick={() => { setColumnMenuAnchor(null); setDeleteColumnConfirmId(null); }} />
                                  <div
                                    className="fixed z-50 w-52 rounded-2xl border border-base-content/10 bg-base-100 p-1.5 text-xs font-semibold shadow-2xl animate-in fade-in zoom-in-95 duration-100"
                                    style={{
                                      top: columnMenuAnchor.rect.bottom + 4,
                                      left: Math.max(10, columnMenuAnchor.rect.right - 208),
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {canCreateTask && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setColumnMenuAnchor(null);
                                          setAddingTaskToStatusId(status.id);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-primary hover:bg-primary/10"
                                      >
                                        <Add size={14} />  {t("افزودن تسک به ستون")}</button>
                                    )}

                                    {canCreateTask && <div className="my-1 h-px bg-base-content/8" />}

                                    <div className="px-2.5 py-1 text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                                      {t("Sort Column")}</div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setColumnSorts((prev) => ({ ...prev, [status.id.toString()]: null }));
                                        setColumnMenuAnchor(null);
                                      }}
                                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-start ${!sortType ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-base-200 text-base-content/70'
                                        }`}
                                    >
                                      {t("Default Order")}</button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setColumnSorts((prev) => ({ ...prev, [status.id.toString()]: 'priority' }));
                                        setColumnMenuAnchor(null);
                                      }}
                                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-start ${sortType === 'priority' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-base-200 text-base-content/70'
                                        }`}
                                    >
                                      {t("By Priority (High → Low)")}</button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setColumnSorts((prev) => ({ ...prev, [status.id.toString()]: 'due_date' }));
                                        setColumnMenuAnchor(null);
                                      }}
                                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-start ${sortType === 'due_date' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-base-200 text-base-content/70'
                                        }`}
                                    >
                                      {t("By Due Date")}</button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setColumnSorts((prev) => ({ ...prev, [status.id.toString()]: 'title' }));
                                        setColumnMenuAnchor(null);
                                      }}
                                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-start ${sortType === 'title' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-base-200 text-base-content/70'
                                        }`}
                                    >
                                      {t("By Title (A - Z)")}</button>

                                    {canManageBoard && (
                                      <>
                                        <div className="my-1 h-px bg-base-content/8" />

                                        <div className="px-2.5 py-1 text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                                          {t("Move Column")}</div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setColumnMenuAnchor(null);
                                            handleMoveStatus(status.id, 'left');
                                          }}
                                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-base-content/70 hover:bg-base-200"
                                        >
                                          {t("Move Left")}</button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setColumnMenuAnchor(null);
                                            handleMoveStatus(status.id, 'right');
                                          }}
                                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-base-content/70 hover:bg-base-200"
                                        >
                                          {t("Move Right")}</button>
                                      </>
                                    )}

                                    {canEditTask && columnTasks.length > 0 && (
                                      <>
                                        <div className="my-1 h-px bg-base-content/8" />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setColumnMenuAnchor(null);
                                            columnTasks.forEach((t) => {
                                              if (!t.is_finished) handleToggleDone(t.id);
                                            });
                                          }}
                                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-success hover:bg-success/10"
                                        >
                                          <TickCircle size={14} />  {t("Mark all as done")}</button>
                                      </>
                                    )}

                                    {canManageBoard && (
                                      <>
                                        <div className="my-1 h-px bg-base-content/8" />
                                        {deleteColumnConfirmId === status.id ? (
                                          <div className="rounded-xl bg-error/8 p-2.5">
                                            <p className="mb-2 text-[12px] font-semibold text-error leading-snug">
                                              {t("این ستون و تمام تسک‌هایش حذف می‌شوند. مطمئنی؟")}
                                            </p>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => setDeleteColumnConfirmId(null)}
                                                className="flex-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-base-content/60 hover:bg-base-200 transition"
                                              >
                                                {t("انصراف")}
                                              </button>
                                              <button
                                                type="button"
                                                disabled={deleteStatusMutation.isPending}
                                                onClick={() => {
                                                  deleteStatusMutation.mutate(status.id);
                                                  setColumnMenuAnchor(null);
                                                }}
                                                className="flex-1 rounded-lg bg-error px-2 py-1 text-[12px] font-bold text-white hover:bg-error/90 transition disabled:opacity-50"
                                              >
                                                {deleteStatusMutation.isPending ? '...' : t("بله، حذف کن")}
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setDeleteColumnConfirmId(status.id)}
                                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-error hover:bg-error/10"
                                          >
                                            <Trash size={14} /> {t("حذف ستون")}
                                          </button>
                                        )}
                                      </>
                                    )}

                                  </div>
                                </>,
                                document.body
                              )}
                            </div>
                          </div>
                        }
                      >
                        <div className="custom-scrollbar flex min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden px-4 pb-3" style={{ maxHeight: 'calc(100dvh - 280px)' }}>
                          <SortableContext items={displayColumnTasks.map(t => t.id.toString())} strategy={verticalListSortingStrategy}>
                            {displayColumnTasks.map(task => (
                              <SortableTask
                                key={task.id}
                                task={task}
                                onClick={() => { setSelectedTaskForSheet(task); if (focusMode) setFocusedTaskId(task.id); }}
                                onPatch={patchLocalTask}
                                onPlayTimer={handlePlayTimer}
                                onStopTimer={handleStopTimer}
                                onToggleDone={handleToggleDone}
                                activeTimer={activeTimers.find(t => t.task?.toString() === task.id?.toString()) || null}
                                onDueDateClick={() => openTaskSheetWithDueDate(task)}
                              />
                            ))}
                          </SortableContext>


                          {addingTaskToStatusId === status.id && (
                            <div
                              className="mt-2 box-border w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-primary/25 bg-base-100 p-2.5 shadow-md animate-in fade-in slide-in-from-top-2 duration-150"
                              tabIndex={-1}
                              onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                  setAddingTaskToStatusId(null);
                                  setNewTaskTitle('');
                                  setNewTaskPriority('low');
                                }
                              }}
                            >
                              <textarea
                                autoFocus
                                rows={2}
                                value={newTaskTitle}
                                onChange={e => setNewTaskTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleCreateTask(status.id);
                                  }
                                  if (e.key === 'Escape') {
                                    setAddingTaskToStatusId(null);
                                    setNewTaskTitle('');
                                    setNewTaskPriority('low');
                                  }
                                }}

                                placeholder={t("What needs to be done?")}
                                className="block w-full min-w-0 resize-none bg-transparent text-[13px] font-semibold leading-snug text-base-content outline-none placeholder:text-heledone-ink-muted"
                              />

                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-base-content/8 pt-2">
                                {/* Custom Priority Dot Buttons */}
                                <div className="flex items-center gap-1.5">
                                  {(['low', 'medium', 'high', 'critical'] as const).map((p) => {
                                    const pColors: Record<string, string> = {
                                      low: 'bg-base-content/20 hover:bg-base-content/40 active:ring-base-content/10',
                                      medium: 'bg-primary hover:bg-primary active:ring-primary/20',
                                      high: 'bg-warning hover:bg-warning active:ring-warning/20',
                                      critical: 'bg-error hover:bg-error active:ring-error/20',
                                    };
                                    const isSelected = newTaskPriority === p;
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => setNewTaskPriority(p)}
                                        className={`size-3.5 rounded-full transition-all active:ring-4 ${pColors[p]} ${isSelected ? 'ring-2 ring-primary scale-125' : 'opacity-60 hover:opacity-100'
                                          }`}
                                        title={t("{value0} priority", { value0: p.toUpperCase() })}
                                      />
                                    );
                                  })}
                                  <span className="text-[13px] font-bold text-heledone-ink-muted capitalize ms-1">
                                    {newTaskPriority}
                                  </span>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => { setAddingTaskToStatusId(null); setNewTaskTitle(''); setNewTaskPriority('low'); }}
                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-heledone-ink-muted hover:bg-base-200 transition"
                                  >
                                    {t("انصراف")}</button>
                                  <button
                                    type="button"
                                    onClick={() => handleCreateTask(status.id)}
                                    disabled={!newTaskTitle.trim() || createTaskMutation.isPending}
                                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-content shadow-xs transition hover:bg-primary/95 disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {createTaskMutation.isPending ? '...' : t("افزودن")}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {canCreateTask && addingTaskToStatusId !== status.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingTaskToStatusId(status.id);
                              setNewTaskTitle('');
                              setNewTaskPriority('low');
                            }}
                            className="mx-4 mb-3 flex shrink-0 w-[calc(100%-2rem)] items-center justify-center gap-1 rounded-xl border border-dashed border-base-300 py-2 text-xs font-bold text-heledone-ink-muted transition hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                          >
                            <span className="text-sm leading-none">+</span>
                            <span>{t("افزودن تسک")}</span>
                          </button>
                        )}
                      </DroppableColumn>
                    );
                  })}
              </SortableContext>

              {canManageBoard && (
                isAddingStatus ? (
                  <div className="snap-center min-w-[85vw] sm:min-w-[260px] sm:w-[clamp(260px,18vw,285px)] rounded-2xl border border-primary/35 bg-base-100 p-3.5 flex flex-col h-fit shadow-lg animate-in fade-in slide-in-from-right-2 duration-200 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="size-2 rounded-full bg-primary" />
                      <span className="text-xs font-bold text-base-content">{t("Create a new status")}</span>
                    </div>
                    <input
                      autoFocus
                      value={newStatusName}
                      onChange={e => setNewStatusName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateStatus();
                        if (e.key === 'Escape') {
                          setIsAddingStatus(false);
                          setNewStatusName('');
                        }
                      }}
                      placeholder={t("نام ستون جدید...")}
                      className="w-full rounded-xl bg-base-200/60 px-3 py-2 text-xs font-bold text-base-content outline-none focus:ring-1 focus:ring-primary mb-2.5 transition"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => { setIsAddingStatus(false); setNewStatusName(''); }}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-heledone-ink-muted hover:bg-base-200 transition"
                      >
                        {t("انصراف")}
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateStatus}
                        disabled={!newStatusName.trim() || createStatusMutation.isPending}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-content shadow-xs transition hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {createStatusMutation.isPending ? '...' : t("ایجاد ستون")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingStatus(true)}
                    aria-label={t("افزودن ستون")}
                    className="group snap-center min-w-[200px] sm:min-w-[220px] h-[52px] rounded-2xl border border-dashed border-primary/35 bg-base-100/60 px-4 py-2.5 text-heledone-ink-muted transition-all hover:border-primary hover:bg-base-100 hover:text-primary hover:shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                  >
                    <div className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
                      <Add size={16} />
                    </div>
                    <span className="text-xs font-extrabold text-base-content group-hover:text-primary transition-colors">
                      {t("افزودن ستون")}
                    </span>
                  </button>
                )
              )}

              <DragOverlay>
                {activeColumn ? (
                  <div className="min-w-[282px] w-[282px] rounded-2xl border border-primary/20 bg-base-100 p-4 shadow-xl opacity-85">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-primary" />
                      <h3 className="text-sm font-semibold text-base-content">{activeColumn.name}</h3>
                    </div>
                  </div>
                ) : activeTask ? (
                  <TaskCard task={activeTask} onClick={() => { }} activeTimer={activeTimers.find(t => t.task?.toString() === activeTask.id?.toString()) || null} onToggleDone={handleToggleDone} />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>
      )}

      <TaskSheet
        task={selectedTaskIdParam ? localTasks.find(t => String(t.id) === selectedTaskIdParam) || null : null}
        onClose={() => setSelectedTaskForSheet(null)}
        onPatch={patchLocalTask}
        onPlayTimer={handlePlayTimer}
        onStopTimer={handleStopTimer}
        activeTimer={activeTimers.find(t => String(t.task) === selectedTaskIdParam) || null}
        focusMode={focusMode}
        focusDueDate={focusDueDateOnOpen}
        onFocusDueDateHandled={() => setFocusDueDateOnOpen(false)}
      />
    </div>
  );
};
