import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { CoastalArtwork, CoastalEmptyState } from "../../../components/CoastalEmptyState";
import { projectPalette } from "../../../core/config/designTokens";
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { getBoards, createBoard, updateBoard, deleteBoard } from '../api/tasksApi';
import { useTaskStore } from '../store/useTaskStore';
import { CreateBoardModal } from './CreateBoardModal';
import {
  Add,
  Element3,
  SearchNormal1,
  Sort,
  More,
  Edit2,
  Trash,
} from 'iconsax-reactjs';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePermissions } from '../../auth/hooks/usePermissions';
import type { Board } from '../types';

import type { Variants } from 'motion/react';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, delay: i * 0.04, ease: "easeOut" },
  }),
};

export const WorkspaceView: React.FC = () => {
  const t = useTranslation();
  const { activeProjectId, setActiveBoard } = useTaskStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission, isStaff } = usePermissions();

  const canManageBoard =
    hasPermission('board.manage') ||
    hasPermission('project.manage') ||
    hasPermission('org.manage_settings') ||
    hasPermission('report.view_team_lead') ||
    isStaff;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<Board | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'tasks'>('recent');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const { data: boards } = useQuery({
    queryKey: ['boards', activeProjectId],
    queryFn: () => getBoards(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const presetColors = projectPalette;

  const filteredBoards = useMemo(() => {
    if (!boards) return [];
    const filtered = boards.filter(board =>
      board.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'recent':
        filtered.sort((a, b) => Number(b.id) - Number(a.id));
        break;
      case 'tasks':
        filtered.sort((a, b) => (b.task_count || 0) - (a.task_count || 0));
        break;
    }
    return filtered;
  }, [boards, searchQuery, sortBy]);

  const stats = useMemo(() => {
    if (!boards) return { total: 0, totalTasks: 0, doneTasks: 0 };
    return {
      total: boards.length,
      totalTasks: boards.reduce((sum, b) => sum + (b.task_count || 0), 0),
      doneTasks: boards.reduce((sum, b) => sum + (b.done_task_count || 0), 0),
    };
  }, [boards]);

  const createBoardMutation = useMutation({
    mutationFn: ({ title, color }: { title: string; color: string }) =>
      createBoard(activeProjectId!, title, color),
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
      setActiveBoard(newBoard.id.toString());
      setIsModalOpen(false);
      toast.success(t("Board created successfully"));
    },
    onError: (err: any) => toast.error(translateError(err, "ساخت کانبان ممکن نشد")),
  });

  const updateBoardMutation = useMutation({
    mutationFn: ({ title, color }: { title: string; color: string }) =>
      updateBoard(editingBoard!.id.toString(), {
        title,
        background_color: color,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
      setEditingBoard(null);
      toast.success(t("Board updated successfully"));
    },
    onError: (err: any) => toast.error(translateError(err, 'Failed to update board')),
  });

  const deleteBoardMutation = useMutation({
    mutationFn: () => deleteBoard(deletingBoard!.id.toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
      setDeletingBoard(null);
      toast.success(t("Board deleted"));
    },
    onError: (err: any) => toast.error(translateError(err, 'Failed to delete board')),
  });

  const openEditModal = (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBoard(board);
    setOpenMenuId(null);
  };

  const openDeleteConfirm = (board: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingBoard(board);
    setOpenMenuId(null);
  };

  if (!activeProjectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md p-6 text-center">
          <CoastalArtwork motif="coast" className="mx-auto mb-5" />
          <h2 className="text-lg font-bold text-base-content">{t("Choose a Project")}</h2>
          <p className="mt-2 text-xs leading-relaxed text-heledone-ink-muted">
            {t("Workspaces live inside projects. Select an active project from the top selector or manage your projects here.")}</p>
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-content transition hover:bg-primary/95 shadow-sm"
          >
            <Add size={16} />
            <span>{t("Manage Projects")}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-base-200/30" onClick={() => setOpenMenuId(null)}>
      <div className="border-b border-base-content/8 bg-base-100 px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Element3 size={20} variant="Bold" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-base-content">{t("Workspace Boards")}</h2>
              <p className="text-xs text-heledone-ink-muted">
                {formatUiNumber(stats.total)}  {t("boards ·")} {formatUiNumber(stats.doneTasks)}/{formatUiNumber(stats.totalTasks)}  {t("tasks done")}</p>
            </div>
          </div>
          {canManageBoard && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-content shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
            >
              <Add size={18} />
              <span>{t("New Board")}</span>
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchNormal1 size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted" />
            <input
              type="text"
              placeholder={t("Search boards...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-base-content/10 bg-base-200/50 py-2 ps-9 pe-4 text-sm transition-all focus:border-primary focus:bg-base-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Sort size={16} className="text-heledone-ink-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="rounded-xl border border-base-content/10 bg-base-200/50 px-3 py-2 text-sm font-medium transition-all focus:border-primary focus:bg-base-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="recent">{t("Recent")}</option>
              <option value="name">{t("نام")}</option>
              <option value="tasks">{t("تسک‌ها")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {filteredBoards.length === 0 && searchQuery ? (
          <CoastalEmptyState motif="waves" title={t("No boards found")} description={t("Try adjusting your search query")} />
        ) : filteredBoards.length === 0 ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="w-full max-w-md text-center">
              <CoastalArtwork motif="boat" className="mx-auto mb-5" />
              <h3 className="text-xl font-bold text-base-content">{t("اولین کانبان را بسازید")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-heledone-ink-muted">{t("Boards help you organize tasks into different workflows.")}</p>
              {canManageBoard && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-content shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                >
                  <Add size={18} />
                  <span>{t("ساخت کانبان")}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBoards.map((board, idx) => {
              const pastelFallback = presetColors[idx % presetColors.length].value;
              const statusCount = board.statuses?.length || 0;

              return (
                <motion.div
                  key={board.id}
                  custom={idx}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="group relative overflow-hidden rounded-2xl border border-base-content/8 bg-base-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 cursor-pointer min-h-[180px] flex flex-col"
                  onClick={() => setActiveBoard(board.id.toString())}
                >
                  <div
                    className="absolute start-0 top-0 h-1.5 w-full"
                    style={{ background: board.background_color || pastelFallback }}
                  />
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <div
                        className="flex size-11 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-110"
                        style={{ background: board.background_color || pastelFallback }}
                      >
                        <Element3 size={20} className="text-base-content rounded-lg bg-base-100 p-0.5" variant="Bold" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-base-200 px-2.5 py-1 text-xs font-bold text-heledone-ink-muted">
                          {formatUiNumber(statusCount)} {statusCount === 1 ? t("وضعیت") : t("وضعیت‌ها")}
                        </div>
                        {canManageBoard && (
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="flex size-7 items-center justify-center rounded-lg text-heledone-ink-muted transition-all hover:bg-base-200 hover:text-base-content"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === board.id ? null : board.id);
                              }}
                            >
                              <More size={16} />
                            </button>
                            <AnimatePresence>
                              {openMenuId === board.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                                  transition={{ duration: 0.12 }}
                                  className="absolute end-0 top-8 z-50 min-w-[140px] overflow-hidden rounded-xl border border-base-content/10 bg-base-100 shadow-xl"
                                >
                                  <button
                                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-base-content hover:bg-base-200 transition-colors"
                                    onClick={(e) => openEditModal(board, e)}
                                  >
                                    <Edit2 size={14} />
                                    {t("Edit Board")}</button>
                                  <button
                                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs font-medium text-error hover:bg-error/10 transition-colors"
                                    onClick={(e) => openDeleteConfirm(board, e)}
                                  >
                                    <Trash size={14} />
                                    {t("Delete Board")}</button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>

                    <h3

                      className="mb-3 text-base font-bold tracking-tight text-base-content line-clamp-2 group-hover:text-primary transition-colors"
                    >
                      {board.title}
                    </h3>


                  </div>
                  <div className="absolute bottom-0 start-0 end-0 h-0.5 bg-primary scale-x-0 transition-transform group-hover:scale-x-100" />
                </motion.div>
              );
            })}

            {canManageBoard && (
              <motion.button
                custom={filteredBoards.length}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                onClick={() => setIsModalOpen(true)}
                className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-base-content/15 bg-base-100/50 text-heledone-ink-muted transition-all hover:border-primary/40 hover:bg-base-100 hover:text-primary"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-base-200 transition-colors">
                  <Add size={24} />
                </div>
                <span className="text-sm font-bold">{t("ساخت کانبان")}</span>
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* Create Board Modal */}
      <CreateBoardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(title, backgroundColor) => {
          createBoardMutation.mutate({ title, color: backgroundColor });
        }}
        isPending={createBoardMutation.isPending}
      />

      {/* Edit Board Modal */}
      <CreateBoardModal
        isOpen={Boolean(editingBoard)}
        onClose={() => setEditingBoard(null)}
        initialData={
          editingBoard
            ? {
                title: editingBoard.title,
                backgroundColor: editingBoard.background_color,
              }
            : null
        }
        mode="edit"
        onSubmit={(title, backgroundColor) => {
          updateBoardMutation.mutate({ title, color: backgroundColor });
        }}
        isPending={updateBoardMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingBoard && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setDeletingBoard(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="w-full max-w-sm rounded-2xl border border-base-content/10 bg-base-100 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
                <Trash size={22} />
              </div>
              <h3 className="text-lg font-bold text-base-content">{t("Delete Board?")}</h3>
              <p className="mt-1 text-sm text-heledone-ink-muted">{t("Are you sure you want to delete")} <strong>"{deletingBoard.title}"</strong>{t("? This action cannot be undone.")}</p>
              <div className="mt-6 flex gap-3 justify-end">
                <button onClick={() => setDeletingBoard(null)} className="btn btn-ghost rounded-xl">{t("انصراف")}</button>
                <button onClick={() => deleteBoardMutation.mutate()} disabled={deleteBoardMutation.isPending} className="btn btn-error rounded-xl px-5 text-error-content disabled:opacity-50">
                  {deleteBoardMutation.isPending ? (<><span className="loading loading-spinner loading-sm" /><span>{t("Deleting...")}</span></>) : t("حذف")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
