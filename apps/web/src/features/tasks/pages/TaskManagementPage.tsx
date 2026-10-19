import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import React, { lazy, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Add } from 'iconsax-reactjs';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { GlobalProjectSelector } from '../components/GlobalProjectSelector';
import { WorkspaceView } from '../components/WorkspaceView';
import { KanbanBoard } from '../components/KanbanBoard';
import { CreateBoardModal } from '../components/CreateBoardModal';
import { useTaskStore } from '../store/useTaskStore';
import { getBoards, createBoard } from '../api/tasksApi';

const AttendancePage = lazy(() => import('../../attendance/pages/AttendancePage'));

export const TaskManagementPage: React.FC = () => {
  const t = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProjectId, activeBoardId, setActiveProject, setActiveBoard, setSelectedTaskId, viewMode, setViewMode } = useTaskStore();

  React.useEffect(() => {
    const project = searchParams.get('project');
    const board = searchParams.get('board');
    const task = searchParams.get('task');

    let shouldClear = false;

    if (project) {
      setActiveProject(project);
      shouldClear = true;
    }
    if (board) {
      setActiveBoard(board);
      setViewMode('kanban');
      shouldClear = true;
    }
    if (task) {
      setSelectedTaskId(task);
      shouldClear = true;
    }

    if (shouldClear) {
      setSearchParams({});
    }
  }, [searchParams, setActiveProject, setActiveBoard, setViewMode, setSelectedTaskId, setSearchParams]);
  const queryClient = useQueryClient();
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);

  const { data: boards } = useQuery({
    queryKey: ['boards', activeProjectId],
    queryFn: () => getBoards(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const createBoardMutation = useMutation({
    mutationFn: ({ title, backgroundColor }: { title: string; backgroundColor: string }) => {
      if (!activeProjectId) throw new Error(t("No active project"));
      return createBoard(activeProjectId, title, backgroundColor);
    },
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
      setActiveBoard(newBoard.id.toString());
      setViewMode('kanban');
      setIsCreateBoardOpen(false);
      toast.success(t("کانبان ساخته شد"));
    },
    onError: (error: any) => {
      toast.error(translateError(error?.response?.data?.detail || t("ساخت کانبان ممکن نشد")));
    },
  });

  return (
    <div className="heledone-task-workspace flex h-full w-full flex-col bg-base-200 overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="heledone-task-toolbar relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-heledone-border bg-base-100 px-5 py-2.5 shrink-0">
        {/* Left side: Project selector + Board tabs */}
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <GlobalProjectSelector />

          {/* Board tabs */}
          {activeProjectId && boards && boards.length > 0 && (
            <div className="flex items-center gap-4 overflow-x-auto px-1 custom-scrollbar self-stretch h-8">
              <div className="h-4 w-px bg-base-content/10 shrink-0" />
              {boards.map((board, idx) => {
                const pastelFallback = ['#EAF5F2', '#C6E6E1', '#A7D4CD', '#D8E6D6', '#F7DFAD', '#F5D3C6'][idx % 6];
                const isActive = activeBoardId === board.id.toString();
                return (
                  <button
                    key={board.id}
                    onClick={() => {
                      setActiveBoard(board.id.toString());
                      setViewMode('kanban');
                    }}
                    className={`flex items-center gap-1.5 py-1 text-xs font-semibold transition-all shrink-0 hover:text-base-content relative h-full ${isActive
                      ? 'text-base-content font-bold'
                      : 'text-heledone-ink-muted'
                      }`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: board.background_color || pastelFallback }}
                    />
                    <span>{board.title}</span>
                    {isActive && (
                      <span className="absolute bottom-0 start-0 end-0 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                );
              })}
              {/* Add Board Button */}
              <button
                onClick={() => setIsCreateBoardOpen(true)}
                className="flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-heledone-ink-muted transition-all hover:bg-base-200 hover:text-primary"
                title={t("ساخت کانبان تازه")}
              >
                <Add size={14} />
                <span>{t("افزودن")}</span>
              </button>
            </div>
          )}

          {/* Show add button even when no boards exist */}
          {activeProjectId && (!boards || boards.length === 0) && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-px bg-base-content/10 shrink-0" />
              <button
                onClick={() => setIsCreateBoardOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-all hover:bg-primary/20"
              >
                <Add size={14} />
                <span>{t("اولین کانبان را بسازید")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right side: View mode toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {activeBoardId && (
            <div className="flex items-center rounded-xl bg-base-200 p-0.5">
              {(['kanban', 'attendance'] as const).map((mode) => {
                const isActive = viewMode === mode;
                const labels: Record<string, string> = {
                  kanban: t("کانبان"),
                  attendance: t("حضور و کارکرد"),
                };
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-lg px-3 py-1 text-[13px] font-bold transition-all shrink-0 ${isActive
                      ? 'bg-base-100 text-primary shadow-xs'
                      : 'text-heledone-ink-muted hover:text-base-content'
                      }`}
                  >
                    <span>{labels[mode]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex-1 overflow-hidden bg-base-200 transition-colors duration-300">
        {!activeBoardId ? (
          <WorkspaceView />
        ) : viewMode === 'kanban' ? (
          <KanbanBoard />
        ) : (
          <div className="h-full overflow-hidden bg-base-100">
            <AttendancePage />
          </div>
        )}
      </div>

      {/* Create Board Modal */}
      <CreateBoardModal
        isOpen={isCreateBoardOpen}
        onClose={() => setIsCreateBoardOpen(false)}
        onSubmit={(title, backgroundColor) => {
          createBoardMutation.mutate({ title, backgroundColor });
        }}
        isPending={createBoardMutation.isPending}
      />
    </div>
  );
};
