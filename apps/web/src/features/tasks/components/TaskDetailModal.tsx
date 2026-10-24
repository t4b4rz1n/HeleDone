import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { CustomDatePicker } from "../../../components/CustomDatePicker";
import { formatDisplayDate } from "../../../utils/date";
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Task } from '../types';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { updateTask, getTaskComments, addComment, updateComment, deleteComment, getTaskChecklists, addChecklistItem, toggleChecklistItem, deleteTask, getTaskActivities, getProjectMembers } from '../api/tasksApi';
import { CloseSquare, TextalignLeft, Activity, Tag, TaskSquare, Paperclip2 } from 'iconsax-reactjs';
import { getProjectMilestones } from '../../projects/api/projectsApi';

import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { ManualTimeLogForm } from '../../attendance/components/ManualTimeLogForm';
import { Timer1 } from 'iconsax-reactjs';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { MentionTextarea } from '../../../components/MentionTextarea';


interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  const t = useTranslation();
  const queryClient = useQueryClient();

  const formatSpentTime = (seconds: number | undefined) => {
    if (!seconds || seconds <= 0) return '00:00:00';
    const totalSeconds = Math.round(Number(seconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [isAddingChecklist, setIsAddingChecklist] = useState(false);
  const [showActivityDetails, setShowActivityDetails] = useState(true);
  const [isMembersMenuOpen, setIsMembersMenuOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const membersButtonRef = useRef<HTMLDivElement>(null);


  // Local state for optimistic UI updates
  const initialAssignees: any[] = (task.assignees_detail && task.assignees_detail.length > 0)
    ? task.assignees_detail
    : (task.assignee_detail ? [task.assignee_detail] : []);
  const [localAssignees, setLocalAssignees] = useState<any[]>(initialAssignees);

  const [localDueDate, setLocalDueDate] = useState<string | null | undefined>(task.due_date);

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [isCommentInputFocused, setIsCommentInputFocused] = useState(false);
  const [localPriority, setLocalPriority] = useState<string>(task.priority || 'low');

  // Queries
  const { data: comments = [] } = useQuery({
    queryKey: ['taskComments', task.id],
    queryFn: () => getTaskComments(task.id),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['taskChecklists', task.id],
    queryFn: () => getTaskChecklists(task.id),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['projects', 'detail', String(task.project), 'members'],
    queryFn: async () => {
      if (!task.project) return [];
      const members = await getProjectMembers(task.project.toString());
      // map { user: {...} } to just the user object
      return members.map((m: any) => m.user).filter(Boolean);
    },
    enabled: !!task.project,
  });

  useEffect(() => {
    if (task.assignees_detail && task.assignees_detail.length > 0) {
      setLocalAssignees(task.assignees_detail);
    } else if (task.assignees && task.assignees.length > 0 && users.length > 0) {
      const fromUsers = task.assignees
        .map((id: any) => users.find((u: any) => String(u.id) === String(id)))
        .filter(Boolean);
      if (fromUsers.length > 0) setLocalAssignees(fromUsers);
    }
  }, [task.assignees_detail, task.assignees, users]);

  const { data: projectMilestones = [] } = useQuery({
    queryKey: ['projects', 'detail', String(task.project), 'milestones'],
    queryFn: async () => {
      if (!task.project) return [];
      return await getProjectMilestones(task.project.toString());
    },
    enabled: !!task.project,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['taskActivities', task.id],
    queryFn: () => getTaskActivities(task.id),
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: Partial<Task>) => updateTask(task.id, data),
    onSuccess: (_res, variables) => {
      // Update local state so the UI reflects changes immediately
      if ('description' in variables) {
        setDescription(variables.description || '');
      }
      if ('title' in variables) {
        setTitle(variables.title || '');
      }

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Delay activity log refresh to ensure the backend signal + log write has completed
      // This is necessary because signals (e.g. Telegram notifications) may run synchronously
      // in EAGER mode and delay the DB commit of the activity log.
      queryClient.invalidateQueries({ queryKey: ['taskActivities', task.id] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['taskActivities', task.id] });
      }, 800);
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.due_date?.[0] || 'Failed to update task.'));
      // Revert local date if it was changed
      setLocalDueDate(task.due_date ? new Date(task.due_date).toISOString() : null);
    }
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ text, file }: { text: string; file?: File | null }) => addComment(task.id, text, file || undefined),
    onSuccess: () => {
      setCommentText('');
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['taskComments', task.id] });
      queryClient.invalidateQueries({ queryKey: ['taskActivities', task.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.detail || 'Failed to add comment.'));
    }
  });

  const addChecklistMutation = useMutation({
    mutationFn: (description: string) => addChecklistItem(task.id, description),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskChecklists', task.id] });
      queryClient.invalidateQueries({ queryKey: ['taskActivities', task.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNewChecklistText('');
      setIsAddingChecklist(false);
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.detail || 'Failed to add checklist item.'));
      setIsAddingChecklist(false);
    }
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: ({ id, completed: _completed }: { id: number; completed: boolean }) => toggleChecklistItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskChecklists', task.id] });
      queryClient.invalidateQueries({ queryKey: ['taskActivities', task.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.detail || 'Failed to toggle checklist item.'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.detail || 'Failed to delete task.'));
    }
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ id, text }: { id: number, text: string }) => updateComment(id, text),
    onSuccess: () => {
      setEditingCommentId(null);
      setEditingCommentText('');
      queryClient.invalidateQueries({ queryKey: ['taskComments', task.id] });
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.detail || 'Failed to update comment.'));
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id: number) => deleteComment(id),
    onSuccess: () => {
      setDeletingCommentId(null);
      queryClient.invalidateQueries({ queryKey: ['taskComments', task.id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error: any) => {
      toast.error(translateError(error.message || error.response?.data?.detail || 'Failed to delete comment.'));
      setDeletingCommentId(null);
    }
  });

  // Handlers
  const handleTitleBlur = () => {
    if (title.trim() !== task.title) {
      updateMutation.mutate({ title: title.trim() });
    }
  };

  const handleDescSave = () => {
    updateMutation.mutate({ description: description.trim() });
    setIsEditingDesc(false);
  };

  const confirmDelete = () => {
    setIsDeleteModalOpen(false);
    deleteMutation.mutate();
  };

  const timeline = [
    ...comments.map((c: any) => ({ ...c, type: 'comment' })),
    ...activities.filter((a: any) => a.metadata?.action !== 'Added a comment.').map((a: any) => ({ ...a, type: 'activity' }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const visibleTimeline = showActivityDetails ? timeline : timeline.filter(t => t.type === 'comment');

  const isLoading = updateMutation.isPending || addCommentMutation.isPending || addChecklistMutation.isPending || toggleChecklistMutation.isPending || deleteMutation.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-neutral/60 backdrop-blur-sm p-4 pt-12 overflow-y-auto" >
      <div className="flex flex-col items-center w-full max-w-[900px]">

        {/* Modal Container */}
        <div className="bg-base-100 w-full rounded-xl shadow-2xl flex flex-col relative" onClick={e => e.stopPropagation()}>

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] z-50 rounded-xl flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-base-content/20 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {/* Top Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base-content/10">
            <div className="bg-black/20 hover:bg-black/30 cursor-pointer text-base-content px-3 py-1.5 rounded flex items-center gap-1 text-sm font-medium transition-colors border border-base-content/10">
              {task.status_detail?.name || t("وضعیت")} <span className="text-xs ms-1">˅</span>
            </div>
            <button onClick={onClose} className="p-1 text-base-content hover:text-base-content hover:bg-white/10 rounded-lg transition-colors">
              <CloseSquare size={24} variant="Outline" />
            </button>
          </div>

          <div className="flex flex-col md:flex-row min-h-[450px] max-h-[calc(100dvh-2rem)]">
            {/* Left Column (Main Info) */}
            <div className="flex-[1.4] p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">

              {/* Title & Status */}
              <div className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full border-2 border-base-content/40 mt-1 shrink-0" />
                <div className="flex-1">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleBlur}
                    className="w-full bg-transparent text-xl font-bold text-base-content outline-none focus:bg-white/5 px-2 py-1 rounded -ms-2 transition-colors border border-transparent focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="ms-8 flex flex-wrap gap-2">
                <select
                  value={localPriority}
                  onChange={(e) => {
                    setLocalPriority(e.target.value);
                    updateMutation.mutate({ priority: e.target.value } as any);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors outline-none cursor-pointer"
                >
                  <option value="low" className="bg-base-100">{t("Priority: Low")}</option>
                  <option value="medium" className="bg-base-100">{t("Priority: Medium")}</option>
                  <option value="high" className="bg-base-100">{t("Priority: High")}</option>
                  <option value="critical" className="bg-base-100">{t("Priority: Critical")}</option>
                </select>

                <select
                  value={task.milestone?.toString() || ''}
                  onChange={(e) => {
                    const newId = e.target.value;

                    updateMutation.mutate({ milestone: newId ? newId : null } as any);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors outline-none cursor-pointer max-w-[150px]"
                >
                  <option value="" className="bg-base-100">{t("Milestone: None")}</option>
                  {projectMilestones.map((m: any) => (
                    <option key={m.id} value={m.id} className="bg-base-100 truncate">
                      {m.title}
                    </option>
                  ))}
                </select>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors">
                  <span className="text-lg leading-none mb-0.5">+</span>  {t("افزودن")}</button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors opacity-50 cursor-not-allowed">
                  <Tag size={14} className="text-base-content" />  {t("Labels")}</button>
                <button onClick={() => setIsAddingChecklist(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors">
                  <TaskSquare size={14} className="text-base-content" />  {t("Checklist")}</button>
                <div className="flex items-center">
                  <CustomDatePicker
                    value={localDueDate ? localDueDate.split('T')[0] : ''}
                    onChange={(v) => {
                      if (v) {
                        const iso = new Date(v).toISOString();
                        setLocalDueDate(iso);
                        updateMutation.mutate({ due_date: iso } as any);
                      } else {
                        setLocalDueDate(null);
                        updateMutation.mutate({ due_date: null } as any);
                      }
                    }}
                    placeholder={t("Dates")}
                    triggerClassName="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors cursor-pointer"
                  />
                  {localDueDate && (
                    <button
                      onClick={() => {
                        setLocalDueDate(null);
                        updateMutation.mutate({ due_date: null } as any);
                      }}
                      className="ms-1 p-1 text-base-content hover:text-base-content hover:bg-error/20 hover:text-error rounded transition-colors"
                      title={t("Clear date")}
                    >
                      <CloseSquare size={14} variant="Outline" />
                    </button>
                  )}
                </div>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors opacity-50 cursor-not-allowed">
                  <Paperclip2 size={14} className="text-base-content" />  {t("Attachment")}</button>
              </div>

              {/* Members */}
              <div className="ms-8">
                <h3 className="text-[13px] font-semibold text-base-content mb-2 uppercase tracking-wide">{t("اعضا")}</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {localAssignees.map((assigneeItem: any) => (
                    <div
                      key={assigneeItem.id}
                      className="group relative flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-base-content/10 rounded-full pe-2.5 ps-0.5 py-0.5 text-xs text-base-content transition-colors"
                    >
                      <div
                        className="w-6 h-6 rounded-full bg-error text-base-content flex items-center justify-center text-[11px] font-bold shrink-0"
                        title={assigneeItem.full_name || assigneeItem.username}
                      >
                        {assigneeItem.full_name?.[0] || assigneeItem.username?.[0] || 'U'}
                      </div>
                      <span className="truncate max-w-[100px] font-medium">{assigneeItem.first_name || assigneeItem.full_name || assigneeItem.username}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newAssignees = localAssignees.filter((a: any) => String(a.id) !== String(assigneeItem.id));
                          setLocalAssignees(newAssignees);
                          updateMutation.mutate({ assignees: newAssignees.map((u: any) => u.id) });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-error transition-opacity"
                        title={t("Remove")}
                      >
                        <CloseSquare size={12} />
                      </button>
                    </div>
                  ))}

                  <div className="relative" ref={membersButtonRef}>
                    <button
                      type="button"
                      onClick={() => setIsMembersMenuOpen(!isMembersMenuOpen)}
                      className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-dashed border-base-content/20 flex items-center justify-center text-base-content transition-colors"
                      title={t("Add Member")}
                    >
                      <span className="text-base leading-none mb-0.5">+</span>
                    </button>
                  </div>

                  {isMembersMenuOpen && membersButtonRef.current && createPortal(
                    <>
                      <div className="fixed inset-0 z-[110]" onClick={() => setIsMembersMenuOpen(false)} />
                      <div
                        className="fixed z-[120] bg-base-100 border border-base-content/10 rounded-lg shadow-2xl py-1.5 w-52 text-[13px] text-base-content flex flex-col max-h-64 overflow-y-auto custom-scrollbar"
                        style={{
                          top: membersButtonRef.current.getBoundingClientRect().bottom + 4,
                          left: membersButtonRef.current.getBoundingClientRect().left,
                        }}
                      >
                        <div className="px-3 py-1.5 text-xs text-base-content font-semibold mb-1">{t("Select Member")}</div>
                        {localAssignees.length > 0 && (
                          <button
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 transition-colors text-start text-error hover:text-error"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocalAssignees([]);
                              updateMutation.mutate({ assignees: [] });
                              setIsMembersMenuOpen(false);
                            }}
                          >
                            <div className="w-5 h-5 rounded-full border border-dashed border-error/40 flex items-center justify-center font-bold text-error">
                              ✕
                            </div>
                            <span className="truncate">{t("حذف همه")}</span>
                          </button>
                        )}
                        {users.map((user: any) => {
                          const isAssigned = localAssignees.some((a: any) => String(a.id) === String(user.id));
                          return (
                            <button
                              key={user.id}
                              className={`flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-white/10 transition-colors text-start ${
                                isAssigned ? "bg-primary/10 text-primary font-bold" : ""
                              }`}
                              onClick={() => {
                                const newAssignees = isAssigned
                                  ? localAssignees.filter((a: any) => String(a.id) !== String(user.id))
                                  : [...localAssignees, user];
                                setLocalAssignees(newAssignees);
                                updateMutation.mutate({ assignees: newAssignees.map((u: any) => u.id) });
                              }}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <div className="w-5 h-5 rounded-full bg-error text-[11px] flex items-center justify-center font-bold text-white shrink-0">
                                  {user.full_name?.[0] || user.username?.[0] || 'U'}
                                </div>
                                <span className="truncate">{user.full_name || user.username || user.email}</span>
                              </div>
                              {isAssigned && <span className="text-primary text-xs shrink-0">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              </div>


              {/* Description */}
              <div className="flex flex-col mt-2">
                <div className="flex items-center gap-3 mb-3">
                  <TextalignLeft size={20} className="text-base-content shrink-0" />
                  <h3 className="text-[15px] font-semibold text-base-content flex-1">{t("توضیح")}</h3>
                  {!isEditingDesc && (
                    <button
                      onClick={() => setIsEditingDesc(true)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[13px] text-base-content border border-base-content/5 transition-colors"
                    >
                      {t("ویرایش")}</button>
                  )}
                </div>
                <div className="ms-8">
                  {isEditingDesc ? (
                    <div className="bg-base-100 rounded-lg border border-primary p-0 focus-within:ring-2 ring-primary/30">
                      <textarea
                        autoFocus
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-transparent text-sm text-base-content outline-none resize-none min-h-[100px] p-3"
                        placeholder={t("Add a more detailed description...")}
                      />
                      <div className="flex gap-2 p-2 border-t border-base-content/5">
                        <button onClick={handleDescSave} className="bg-primary hover:bg-primary text-base-content px-4 py-1.5 rounded text-sm font-medium transition-colors">{t("ذخیره")}</button>
                        <button onClick={() => { setDescription(task.description || ''); setIsEditingDesc(false); }} className="px-4 py-1.5 rounded text-sm text-base-content hover:text-base-content hover:bg-white/5 transition-colors">{t("انصراف")}</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsEditingDesc(true)}
                      className="bg-base-100 hover:bg-white/10 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg hover:border-base-content/10 rounded-lg border border-base-content/5 p-4 text-sm text-base-content cursor-pointer min-h-[80px] break-words whitespace-pre-wrap"
                    >
                      {description || t("Add a more detailed description...")}
                    </div>
                  )}
                </div>
              </div>

              {/* Time Tracking Section */}
              <div className="flex gap-3 items-start mt-6 pt-6 border-t border-base-content/5">
                <Timer1 size={20} className="text-base-content mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[15px] font-semibold text-base-content">{t("Time Tracking")}</h3>
                    <div className="text-sm">
                      <span className="text-base-content">{t("Logged:")} </span>
                      <span className="text-success font-bold">{task.spent_seconds ? formatSpentTime(task.spent_seconds) : '00:00:00'}</span>
                    </div>
                  </div>
                  <ManualTimeLogForm taskId={task.id} />
                </div>
              </div>

              {/* Checklist Section (below Time Tracking) */}
              {(checklists.length > 0 || isAddingChecklist) && (
                <div className="flex gap-3 items-start mt-2">
                  <TaskSquare size={20} className="text-base-content mt-1 shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-[15px] font-semibold text-base-content mb-3">{t("Checklist")}</h3>

                    {checklists.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {checklists.map((item: any) => (
                          <div key={item.id} className="flex items-center gap-3 group">
                            <input
                              type="checkbox"
                              checked={item.is_completed}
                              onChange={(e) => toggleChecklistMutation.mutate({ id: item.id, completed: e.target.checked })}
                              className="w-4 h-4 rounded border-base-content/20 bg-white/5 checked:bg-primary cursor-pointer"
                            />
                            <span className={`text-sm flex-1 ${item.is_completed ? 'line-through text-base-content' : 'text-base-content'}`}>
                              {item.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isAddingChecklist ? (
                      <div className="bg-base-100 rounded-lg border border-primary p-0 focus-within:ring-2 ring-primary/30">
                        <input
                          autoFocus
                          value={newChecklistText}
                          onChange={(e) => setNewChecklistText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && newChecklistText.trim()) addChecklistMutation.mutate(newChecklistText); }}
                          className="w-full bg-transparent text-sm text-base-content outline-none p-3"
                          placeholder={t("Add an item")}
                        />
                        <div className="flex gap-2 p-2 border-t border-base-content/5">
                          <button onClick={() => newChecklistText.trim() && addChecklistMutation.mutate(newChecklistText)} className="bg-primary hover:bg-primary text-base-content px-4 py-1.5 rounded text-sm font-medium transition-colors">{t("افزودن")}</button>
                          <button onClick={() => setIsAddingChecklist(false)} className="px-4 py-1.5 rounded text-sm text-base-content hover:text-base-content hover:bg-white/5 transition-colors">{t("انصراف")}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setIsAddingChecklist(true)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-base-content transition-colors border border-base-content/5">
                        {t("Add an item")}</button>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Right Column (Comments & Activity) */}
            <div className="flex-[1] p-6 bg-white/[0.02] border-l border-base-content/5 rounded-br-xl flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-base-content" />
                  <h3 className="text-[14px] font-semibold text-base-content">{t("Comments and activity")}</h3>
                </div>
                <button onClick={() => setShowActivityDetails(!showActivityDetails)} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-base-content/5 text-[13px] text-base-content transition-colors">
                  {showActivityDetails ? t("Hide details") : t("Show details")}
                </button>
              </div>

              {/* Comment Input */}
              <div
                className={`backdrop-blur-md bg-white/5 rounded-xl border border-base-content/10 p-0 transition-all mb-1 shadow-inner ${isCommentInputFocused || commentText.trim() || selectedFile ? 'focus-within:border-primary/50 focus-within:bg-white/10' : ''}`}
                tabIndex={-1}
                onFocus={() => setIsCommentInputFocused(true)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsCommentInputFocused(false);
                  }
                }}
              >
                <MentionTextarea
                  value={commentText}
                  onChange={setCommentText}
                  members={users}
                  position="bottom"
                  className={`w-full bg-transparent text-[14px] text-base-content outline-none resize-none px-4 py-3 transition-all duration-200 custom-scrollbar ${isCommentInputFocused || commentText.trim() || selectedFile ? 'min-h-[80px]' : 'min-h-[44px] m-0 overflow-hidden'}`}
                  placeholder={t("دیدگاهی بنویسید… (از @ برای منشن کردن اعضای پروژه استفاده کنید)")}
                />

                {selectedFile && (
                  <div className="px-4 py-2 flex items-center justify-between bg-primary/10 border-t border-primary/20 rounded-b-xl mb-2 mx-2">
                    <span className="text-xs text-primary truncate flex-1">{selectedFile.name}</span>
                    <button onClick={() => setSelectedFile(null)} className="text-base-content hover:text-error p-1">
                      <CloseSquare size={14} />
                    </button>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error(t("File size must be less than 5MB"));
                        return;
                      }
                      setSelectedFile(file);
                    }
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />

                {(isCommentInputFocused || commentText.trim().length > 0 || selectedFile) && (
                  <div className="flex justify-between items-center px-3 pb-3">
                    <div className="flex gap-1">
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-base-content hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-center"
                        title={t("Attach file (Max 5MB)")}
                      >
                        <Paperclip2 size={18}/>
                      </button>
                    </div>
                    <button
                      onMouseDown={(e) => e.preventDefault()} // prevent blur
                      disabled={(!commentText.trim() && !selectedFile) || addCommentMutation.isPending}
                      onClick={() => {
                        addCommentMutation.mutate({ text: commentText, file: selectedFile });
                      }}
                      className="bg-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/80 text-base-content px-5 py-2 rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                      {addCommentMutation.isPending ? <span className="loading loading-spinner loading-xs"></span> : null}
                      {t("Post Comment")}</button>
                  </div>
                )}
              </div>

              {/* Activity List */}
              <div className="flex-1 overflow-y-auto pe-2 space-y-4 custom-scrollbar">
                {visibleTimeline.map((item: any) => {
                  const isComment = item.type === 'comment';
                  const name = item.author_detail?.full_name || item.author_detail?.username || item.actor_detail?.full_name || item.actor_detail?.username || t("System");
                  const avatar = item.author_detail?.avatar_url || item.actor_detail?.avatar_url;

                  return (
                    <div key={`${item.type}-${item.id}`} className={`flex gap-3 ${!isComment ? 'opacity-70' : 'mt-4'}`}>
                      {avatar ? (
                        <img src={avatar} alt={name} className="w-8 h-8 rounded-full shrink-0" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-base-content shrink-0 ${isComment ? 'bg-primary' : 'bg-white/10'}`}>
                          {name[0]?.toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1">
                        {isComment ? (
                          <>
                            <div className="flex items-baseline gap-2 mb-1.5">
                              <span className="font-bold text-[14px] text-base-content">{name}</span>
                              <span className="text-[13px] text-base-content">{formatDisplayDate(new Date(item.created_at || Date.now()), 'MMM d, HH:mm')}</span>
                            </div>

                            {editingCommentId === item.id ? (
                              <div className="bg-base-100 rounded-lg border border-base-content/10 p-0 focus-within:border-base-content/30 transition-all mb-2">
                                <MentionTextarea
                                  value={editingCommentText}
                                  onChange={setEditingCommentText}
                                  members={users}
                                  position="bottom"
                                  className="w-full bg-transparent text-[14px] text-base-content outline-none resize-none p-3 pb-1"
                                  rows={2}
                                />
                                <div className="flex justify-end gap-2 px-3 pb-2">
                                  <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 text-base-content hover:text-base-content text-xs">{t("انصراف")}</button>
                                  <button onClick={() => updateCommentMutation.mutate({ id: item.id, text: editingCommentText })} className="bg-primary hover:bg-primary/80 text-base-content px-3 py-1 rounded text-xs font-medium">{t("ذخیره")}</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="backdrop-blur-md bg-white/[0.03] p-4 rounded-xl text-[14px] text-base-content shadow-sm border border-base-content/5 prose  prose-p:leading-relaxed prose-pre:bg-base-100 prose-pre:border prose-pre:border-base-content/10 prose-pre:rounded-lg prose-a:text-primary max-w-none">
                                  <ReactMarkdown
                                    components={{
                                      p: ({ children }) => (
                                        <p className="leading-relaxed">
                                          {React.Children.map(children, (child) => {
                                            if (typeof child === 'string') {
                                              const parts = child.split(/(@[a-zA-Z0-9_\u0600-\u06FF.-]+)/g);
                                              return parts.map((part, pIdx) => {
                                                if (part.startsWith('@') && part.length > 1) {
                                                  return (
                                                    <span
                                                      key={pIdx}
                                                      className="inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary transition hover:bg-primary/25 cursor-default font-mono"
                                                    >
                                                      {part}
                                                    </span>
                                                  );
                                                }
                                                return part;
                                              });
                                            }
                                            return child;
                                          })}
                                        </p>
                                      ),
                                    }}
                                  >
                                    {typeof item.content === 'string' ? item.content : t("No content")}
                                  </ReactMarkdown>

                                  {typeof item.attached_file_url === 'string' && (
                                    <div className="mt-4 pt-3 border-t border-base-content/10">
                                      {item.attached_file_url.match(/\.(jpeg|jpg|gif|png)$/i) != null ? (
                                        <a href={item.attached_file_url} target="_blank" rel="noreferrer" className="block w-48 h-32 rounded-lg overflow-hidden border border-base-content/10 hover:border-primary/50 transition-colors">
                                          <img src={item.attached_file_url} alt={t("Attachment")} className="w-full h-full object-cover" />
                                        </a>
                                      ) : (
                                        <a href={item.attached_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-base-content/10 rounded-lg text-sm text-base-content transition-colors">
                                          <Paperclip2 size={16} />
                                          {t("Download Attachment")}</a>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="relative">
                                  <div className="flex items-center gap-3 mt-1.5 text-[13px] text-base-content font-medium ms-1">
                                    <button onClick={() => { setEditingCommentId(item.id); setEditingCommentText(item.content); }} className="hover:text-base-content transition-colors">{t("ویرایش")}</button>
                                    <span>•</span>
                                    <button onClick={() => setDeletingCommentId(item.id)} className="hover:text-base-content transition-colors">{t("حذف")}</button>
                                  </div>

                                  {deletingCommentId === item.id && (
                                    <div className="absolute top-7 start-[-10px] w-[260px] bg-base-100 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-base-content/10 z-[100] p-4 flex flex-col">
                                      <div className="flex items-center justify-between mb-3 border-b border-base-content/5 pb-2">
                                        <span className="text-[13px] font-bold text-base-content">{t("Delete Comment?")}</span>
                                        <button onClick={() => setDeletingCommentId(null)} className="text-base-content hover:text-base-content transition-colors">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <p className="text-[13px] text-base-content mb-4 leading-relaxed text-start">
                                        {t("Are you sure you want to delete this comment? This action cannot be undone.")}</p>
                                      <button
                                        onClick={() => deleteCommentMutation.mutate(item.id)}
                                        disabled={deleteCommentMutation.isPending}
                                        className="w-full bg-error hover:bg-error/90 text-base-content font-medium py-2 rounded-md text-[13px] transition-colors"
                                      >
                                        {deleteCommentMutation.isPending ? t("Deleting...") : t("Yes, Delete")}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="pt-1 text-[13px]">
                            <span className="font-bold text-base-content me-1.5">{name}</span>
                            <span className="text-base-content">{item.metadata?.action || item.event_type}</span>
                            <span className="text-base-content ms-2 text-[13px]">{formatDisplayDate(new Date(item.created_at || Date.now()), 'MMM d, HH:mm')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title={t("Delete Task")}
        message={t("Are you sure you want to delete \"{value0}\"? This action cannot be undone.", { value0: task.title })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
