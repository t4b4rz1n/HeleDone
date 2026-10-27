import React, { lazy, useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from '../../../i18n/locale';
import { getErrorMessage as translateError } from '../../../core/utils/errorHandler';
import { ProjectWorkspaceSidebar } from '../components/ProjectWorkspaceSidebar';
import { WorkspaceView } from '../components/WorkspaceView';
import { KanbanBoard } from '../components/KanbanBoard';
import { TaskListView } from '../components/TaskListView';
import { TaskCalendarView } from '../components/TaskCalendarView';
import { ProjectFilesView } from '../components/ProjectFilesView';
import { CreateBoardModal } from '../components/CreateBoardModal';
import { TaskSheet } from '../components/TaskSheet';
import { useTaskStore } from '../store/useTaskStore';
import { getBoards, createBoard, getTasks, updateTask } from '../api/tasksApi';
import { useProjectMembers, useProjects } from '../../projects/hooks/useProjects';
import { projectMemberUsers } from '../utils/projectMemberUsers';

const AttendancePage = lazy(() => import('../../attendance/pages/AttendancePage'));

export const TaskManagementPage: React.FC = () => {
  const t = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const {
    activeProjectId,
    activeBoardId,
    setActiveProject,
    setActiveBoard,
    selectedTaskId,
    setSelectedTaskId,
    viewMode,
    setViewMode,
  } = useTaskStore();

  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [targetFileId, setTargetFileId] = useState<string | null>(null);

  // URL search params sync
  useEffect(() => {
    const project = searchParams.get('project');
    const board = searchParams.get('board');
    const task = searchParams.get('task');
    const view = searchParams.get('view');
    const file = searchParams.get('file');

    let shouldClear = false;
    if (project) {
      setActiveProject(project);
      shouldClear = true;
    }
    if (board) {
      setActiveBoard(board);
      shouldClear = true;
    }
    if (task) {
      setSelectedTaskId(task);
      shouldClear = true;
    }
    if (view === 'files' || file) {
      setViewMode('files');
      if (file) {
        setTargetFileId(file);
      }
      shouldClear = true;
    }
    if (shouldClear) {
      setSearchParams({});
    }
  }, [searchParams, setActiveProject, setActiveBoard, setSelectedTaskId, setViewMode, setSearchParams]);

  // Queries
  const { data: projects = [] } = useProjects();

  // Auto-select first project if none selected
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProject(String(projects[0].id));
    }
  }, [activeProjectId, projects, setActiveProject]);

  const { data: boards = [] } = useQuery({
    queryKey: ['boards', activeProjectId],
    queryFn: () => getBoards(activeProjectId!),
    enabled: Boolean(activeProjectId),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', activeProjectId, activeBoardId],
    queryFn: () => getTasks(activeProjectId || undefined, activeBoardId || undefined),
    enabled: Boolean(activeProjectId),
  });


  const { data: projectMembers = [] } = useProjectMembers(activeProjectId || '');
  const members = useMemo(() => projectMemberUsers(projectMembers), [projectMembers]);

  // Auto-select board
  useEffect(() => {
    if (!boards || boards.length === 0) {
      if (activeBoardId) setActiveBoard(null);
      return;
    }
    const exists = boards.some((b) => b.id.toString() === activeBoardId);
    if (!exists) {
      setActiveBoard(boards[0].id.toString());
    }
  }, [boards, activeBoardId, setActiveBoard]);

  const activeBoard = boards.find((b) => b.id.toString() === activeBoardId);
  const statuses = activeBoard?.statuses || [];

  const createBoardMutation = useMutation({
    mutationFn: ({ title, backgroundColor }: { title: string; backgroundColor: string }) => {
      if (!activeProjectId) throw new Error(t('No active project'));
      return createBoard(activeProjectId, title, backgroundColor);
    },
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: ['boards', activeProjectId] });
      setActiveBoard(newBoard.id.toString());
      setIsCreateBoardOpen(false);
      toast.success(t('کانبان ساخته شد'));
    },
    onError: (error: any) => {
      toast.error(translateError(error?.response?.data?.detail || t('ساخت کانبان ممکن نشد')));
    },
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-base-100">
      {/* ─── 1. Left Workspace Sidebar ─── */}
      <ProjectWorkspaceSidebar
        activeProjectId={activeProjectId}
        onSelectProject={(projId) => {
          setActiveProject(projId);
          // Navigate to tasks view when a project is selected
          if (window.location.pathname !== '/tasks') {
            window.location.href = '/tasks';
          }
        }}
        activeView={viewMode}
        onSelectView={(v) => setViewMode(v)}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* ─── 2. Main Workspace Canvas ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-base-100">
        {/* Workspace View Area */}
        <div className="flex-1 overflow-hidden relative bg-base-200/50">
          {!activeBoardId && boards.length === 0 ? (
            <WorkspaceView />
          ) : viewMode === 'kanban' ? (
            <KanbanBoard onCreateBoard={() => setIsCreateBoardOpen(true)} />
          ) : viewMode === 'list' ? (
            <TaskListView
              tasks={tasks}
              statuses={statuses}
              activeProjectId={activeProjectId}
              activeBoardId={activeBoardId}
              members={members}
              onSelectTask={(task) => setSelectedTaskId(String(task.id))}
            />
          ) : viewMode === 'calendar' ? (
            <TaskCalendarView
              tasks={tasks}
              onSelectTask={(task) => setSelectedTaskId(String(task.id))}
            />
          ) : viewMode === 'files' ? (
            <ProjectFilesView
              tasks={tasks}
              activeProjectId={activeProjectId}
              members={members}
              targetFileId={targetFileId}
              onSelectTask={(task) => setSelectedTaskId(String(task.id))}
            />
          ) : (
            <div className="h-full overflow-hidden bg-base-100">
              <AttendancePage />
            </div>
          )}
        </div>
      </div>

      {/* TaskSheet for non-kanban views */}
      {viewMode !== 'kanban' && selectedTaskId && (
        <TaskSheet
          task={tasks.find((t) => String(t.id) === String(selectedTaskId)) || null}
          onClose={() => setSelectedTaskId(null)}
          onPatch={async (taskId, patch) => {
            await updateTask(taskId, patch);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}

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
