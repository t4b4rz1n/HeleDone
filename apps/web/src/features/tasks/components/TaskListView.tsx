import ProfileAvatar from "../../../components/ProfileAvatar";
import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Clock,
  Flag,
  Trash2,
  Search,
  Plus,
  Check,
  X,
  Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, formatNumber as formatUiNumber } from '../../../i18n/locale';
import { updateTask, deleteTask, createTask } from '../api/tasksApi';
import { usePermissions } from '../../auth/hooks/usePermissions';
import type { Task, TaskStatus, User as TaskUser } from '../types';

interface TaskListViewProps {
  tasks: Task[];
  statuses: TaskStatus[];
  activeProjectId: string | null;
  activeBoardId: string | null;
  members: TaskUser[];
  onSelectTask: (task: Task) => void;
}

const priorityOrder: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  statuses,
  activeProjectId,
  members,
  onSelectTask,
}) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const { hasAnyPermission, isStaff } = usePermissions();
  const canDeleteTasks = hasAnyPermission(["task.manage_all", "project.manage"]) || isStaff;

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string | number>>(new Set());
  const [sortBy, setSortBy] = useState<'default' | 'due_date' | 'priority'>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | number | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [quickAddStatusId, setQuickAddStatusId] = useState<string | number | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');

  // Update Task Mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string | number; payload: Partial<Task> }) =>
      updateTask(taskId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(t('تسک به‌روزرسانی شد'));
    },
    onError: () => {
      toast.error(t('خطا در به‌روزرسانی تسک'));
    },
  });

  // Create Task Mutation
  const createTaskMutation = useMutation({
    mutationFn: ({ statusId, title }: { statusId: string | number; title: string }) => {
      if (!activeProjectId) throw new Error('Missing project');
      return createTask(activeProjectId, title, statusId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setQuickAddStatusId(null);
      setQuickAddTitle('');
      toast.success(t('تسک اضافه شد'));
    },
    onError: () => {
      toast.error(t('خطا در ثبت تسک'));
    },
  });

  // Batch Delete Mutation
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      for (const id of ids) {
        await deleteTask(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTaskIds(new Set());
      toast.success(t('تسک‌های انتخاب‌شده حذف شدند'));
    },
    onError: () => {
      toast.error(t('خطا در حذف گروهی تسک‌ها'));
    },
  });

  const toggleSection = (statusId: string | number) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [statusId]: !prev[statusId],
    }));
  };

  const toggleSelectTask = (taskId: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.key?.toLowerCase().includes(query)
      );
    }

    if (sortBy === 'priority') {
      result = [...result].sort(
        (a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
      );
    } else if (sortBy === 'due_date') {
      result = [...result].sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    }

    return result;
  }, [tasks, searchQuery, sortBy]);

  const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
    critical: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-600 dark:text-red-400', label: t('بحرانی') },
    high: { bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-600 dark:text-rose-400', label: t('بالا') },
    medium: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', label: t('متوسط') },
    low: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', label: t('پایین') },
  };

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    statuses.forEach((s) => {
      map[s.id] = [];
    });
    filteredTasks.forEach((task) => {
      const statusId = task.status_detail?.id || task.order;
      if (statusId && map[statusId]) {
        map[statusId].push(task);
      } else {
        const firstStatus = statuses[0]?.id;
        if (firstStatus && map[firstStatus]) map[firstStatus].push(task);
      }
    });
    return map;
  }, [filteredTasks, statuses]);

  const handleSaveInlineTitle = (task: Task) => {
    if (editTitleValue.trim() && editTitleValue !== task.title) {
      updateTaskMutation.mutate({ taskId: task.id, payload: { title: editTitleValue.trim() } });
    }
    setEditingTaskId(null);
  };

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden">
      {/* ─── List View Toolbar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-base-300/80 bg-base-100 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted" />
            <input
              type="text"
              placeholder={t('جستجو در لیست تسک‌ها...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 ps-8 pe-3 py-1.5 rounded-xl border border-base-300 bg-base-200/50 text-xs focus:bg-base-100 focus:outline-none focus:border-primary transition-all"
            />
          </div>

          {/* Sort Menu */}
          <div className="flex items-center gap-1 rounded-xl bg-base-200/70 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSortBy('default')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${sortBy === 'default' ? 'bg-base-100 text-primary shadow-2xs' : 'text-heledone-ink-muted hover:text-base-content'
                }`}
            >
              {t('پیش‌فرض')}
            </button>
            <button
              type="button"
              onClick={() => setSortBy('due_date')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${sortBy === 'due_date' ? 'bg-base-100 text-primary shadow-2xs' : 'text-heledone-ink-muted hover:text-base-content'
                }`}
            >
              <Clock size={12} />
              <span>{t('نزدیک‌ترین ددلاین')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSortBy('priority')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 ${sortBy === 'priority' ? 'bg-base-100 text-primary shadow-2xs' : 'text-heledone-ink-muted hover:text-base-content'
                }`}
            >
              <Flag size={12} />
              <span>{t('اولویت')}</span>
            </button>
          </div>
        </div>

        {/* Batch Actions Floating / Inline Bar */}
        {selectedTaskIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-xs font-bold text-primary animate-in fade-in">
            <span>{t('{count} تسک انتخاب‌شده', { count: formatUiNumber(selectedTaskIds.size) })}</span>
            {canDeleteTasks && (
              <>
                <div className="h-3 w-px bg-primary/20 mx-1" />
                <button
                  type="button"
                  onClick={() => batchDeleteMutation.mutate(Array.from(selectedTaskIds))}
                  className="flex items-center gap-1 text-error hover:underline"
                  disabled={batchDeleteMutation.isPending}
                >
                  <Trash2 size={13} />
                  <span>{t('حذف')}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSelectedTaskIds(new Set())}
              className="text-heledone-ink-muted hover:text-base-content ms-2"
            >
              {t('لغو')}
            </button>
          </div>
        )}
      </div>

      {/* ─── Table Content ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-6">
        {statuses.map((status) => {
          const statusTasks = tasksByStatus[status.id] || [];
          const isCollapsed = collapsedSections[status.id];

          return (
            <div key={status.id} className="rounded-2xl border border-base-300/80 bg-base-100 overflow-hidden shadow-2xs">
              {/* Section Header */}
              <div
                onClick={() => toggleSection(status.id)}
                className="flex items-center justify-between px-4 py-2.5 bg-base-200/50 hover:bg-base-200/80 cursor-pointer select-none border-b border-base-300/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <span className="font-extrabold text-xs text-base-content uppercase tracking-wider">
                    {status.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-base-300/60 text-[11px] font-black text-heledone-ink-muted">
                    {formatUiNumber(statusTasks.length)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickAddStatusId(status.id);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors"
                >
                  <Plus size={14} />
                  <span>{t('تسک تازه')}</span>
                </button>
              </div>

              {/* Table Body */}
              {!isCollapsed && (
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[700px] text-start border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-base-300/60 bg-base-100/50 text-heledone-ink-muted font-bold text-[11px]">
                        <th className="py-2.5 px-3 w-10 text-center">
                          <span className="sr-only">{t('انتخاب')}</span>
                        </th>
                        <th className="py-2.5 px-3 text-start min-w-[220px]">{t('عنوان تسک')}</th>
                        <th className="py-2.5 px-3 text-start w-40">{t('مسئول')}</th>
                        <th className="py-2.5 px-3 text-start w-32">{t('اولویت')}</th>
                        <th className="py-2.5 px-3 text-start w-36">{t('تاریخ سررسید')}</th>
                        <th className="py-2.5 px-3 text-start w-32">{t('پیشرفت / چک‌لیست')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-200">
                      {statusTasks.map((task) => {
                        const isSelected = selectedTaskIds.has(task.id);
                        const isOverdue =
                          task.due_date &&
                          !task.is_finished &&
                          new Date(task.due_date).getTime() < Date.now();
                        const priorityInfo = priorityColors[task.priority] || priorityColors.medium;

                        const checklistStats = task.checklist_stats;
                        const checklistText = checklistStats && checklistStats.total > 0
                          ? `${formatUiNumber(checklistStats.done)}/${formatUiNumber(checklistStats.total)}`
                          : null;

                        return (
                          <tr
                            key={task.id}
                            onClick={() => onSelectTask(task)}
                            className={`group hover:bg-base-200/50 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : ''
                              }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-3 text-center" onClick={(e) => toggleSelectTask(task.id, e)}>
                              <button type="button" className="text-heledone-ink-muted hover:text-primary">
                                {isSelected ? (
                                  <CheckSquare size={16} className="text-primary" />
                                ) : (
                                  <Square size={16} />
                                )}
                              </button>
                            </td>

                            {/* Title with Inline Edit */}
                            <td className="py-2.5 px-3 font-semibold text-base-content min-w-[220px]">
                              {editingTaskId === task.id ? (
                                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={editTitleValue}
                                    onChange={(e) => setEditTitleValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveInlineTitle(task);
                                      if (e.key === 'Escape') setEditingTaskId(null);
                                    }}
                                    autoFocus
                                    className="flex-1 px-2 py-1 rounded-lg border border-primary bg-base-100 text-xs focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineTitle(task)}
                                    className="p-1 rounded-lg text-success hover:bg-success/10"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaskId(null)}
                                    className="p-1 rounded-lg text-error hover:bg-error/10"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate hover:text-primary transition-colors">
                                    {task.title}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingTaskId(task.id);
                                      setEditTitleValue(task.title);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-base-200 text-heledone-ink-muted hover:text-base-content transition-all"
                                    title={t('ویرایش عنوان')}
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Assignee Cell with Multi-Assignee Avatars */}
                            <td
                              className="py-2.5 px-3"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTask(task);
                              }}
                            >
                              {(() => {
                                const assignees: any[] = (task.assignees_detail && task.assignees_detail.length > 0)
                                  ? task.assignees_detail
                                  : (task.assignees && task.assignees.length > 0)
                                  ? task.assignees.map((id) => members.find((m) => String(m.id) === String(id))).filter(Boolean)
                                  : task.assignee_detail
                                  ? [task.assignee_detail]
                                  : task.assignee
                                  ? members.filter((m) => String(m.id) === String(task.assignee))
                                  : [];

                                if (assignees.length === 0) {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 text-heledone-ink-muted hover:text-primary transition-colors text-xs font-medium cursor-pointer">
                                      <span className="size-5 rounded-full border border-dashed border-base-content/20 grid place-items-center text-[10px]">+</span>
                                      <span>{t('بدون مسئول')}</span>
                                    </span>
                                  );
                                }

                                return (
                                  <div className="flex items-center gap-2 cursor-pointer group/asgn" title={assignees.map((a: any) => a.first_name || a.username).join(', ')}>
                                    <div className="flex -space-x-1.5 rtl:space-x-reverse shrink-0">
                                      {assignees.slice(0, 3).map((u: any) => (
                                        <ProfileAvatar
                                          key={u.id}
                                          src={u.avatar_url || u.avatar}
                                          name={`${u.first_name || ""} ${u.last_name || u.username || ""}`}
                                          className="size-5.5 shrink-0 overflow-hidden rounded-full ring-1 ring-base-100 shadow-2xs"
                                          fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary"
                                        />
                                      ))}
                                      {assignees.length > 3 && (
                                        <span className="grid size-5.5 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary ring-1 ring-base-100">
                                          +{assignees.length - 3}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-xs font-semibold text-base-content truncate max-w-[100px] group-hover/asgn:text-primary transition-colors">
                                      {assignees.length === 1
                                        ? (assignees[0].first_name || assignees[0].last_name
                                            ? `${assignees[0].first_name || ''} ${assignees[0].last_name || ''}`.trim()
                                            : assignees[0].username)
                                        : `${formatUiNumber(assignees.length)} ${t('نفر')}`}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Priority Dropdown */}
                            <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={task.priority}
                                onChange={(e) => {
                                  updateTaskMutation.mutate({
                                    taskId: task.id,
                                    payload: { priority: e.target.value as any },
                                  });
                                }}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-extrabold cursor-pointer focus:outline-none ${priorityInfo.bg} ${priorityInfo.text}`}
                              >
                                <option value="low">{t('پایین')}</option>
                                <option value="medium">{t('متوسط')}</option>
                                <option value="high">{t('بالا')}</option>
                                <option value="critical">{t('بحرانی')}</option>
                              </select>
                            </td>

                            {/* Due Date */}
                            <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="date"
                                value={task.due_date ? task.due_date.split('T')[0] : ''}
                                onChange={(e) => {
                                  const dateVal = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                                  updateTaskMutation.mutate({ taskId: task.id, payload: { due_date: dateVal } });
                                }}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer focus:outline-none ${isOverdue
                                    ? 'border-error/50 bg-error/10 text-error font-bold'
                                    : 'border-transparent hover:border-base-300 bg-transparent text-heledone-ink-muted'
                                  }`}
                              />
                            </td>

                            {/* Progress / Checklist */}
                            <td className="py-2.5 px-3">
                              {checklistText ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-base-200 overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded-full"
                                      style={{ width: `${task.checklist_stats?.percent || 0}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-heledone-ink-muted">
                                    {checklistText}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-heledone-ink-muted/50">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Quick Add Row */}
                      {quickAddStatusId === status.id && (
                        <tr className="bg-primary/5">
                          <td className="py-2 px-3 text-center">
                            <Plus size={14} className="text-primary mx-auto" />
                          </td>
                          <td colSpan={5} className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder={t('نام تسک جدید را وارد کرده و Enter بزنید...')}
                                value={quickAddTitle}
                                onChange={(e) => setQuickAddTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && quickAddTitle.trim()) {
                                    createTaskMutation.mutate({
                                      statusId: status.id,
                                      title: quickAddTitle.trim(),
                                    });
                                  }
                                  if (e.key === 'Escape') {
                                    setQuickAddStatusId(null);
                                    setQuickAddTitle('');
                                  }
                                }}
                                autoFocus
                                className="flex-1 px-3 py-1.5 rounded-xl border border-primary bg-base-100 text-xs focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (quickAddTitle.trim()) {
                                    createTaskMutation.mutate({
                                      statusId: status.id,
                                      title: quickAddTitle.trim(),
                                    });
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-primary text-primary-content text-xs font-bold"
                              >
                                {t('افزودن')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickAddStatusId(null);
                                  setQuickAddTitle('');
                                }}
                                className="p-1.5 rounded-xl hover:bg-base-200 text-heledone-ink-muted"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
