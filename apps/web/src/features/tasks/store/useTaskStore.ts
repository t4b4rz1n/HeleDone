import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TaskViewMode = 'kanban' | 'list' | 'calendar' | 'files' | 'attendance';

interface TaskStore {
  activeProjectId: string | null;
  activeBoardId: string | null;
  selectedTaskId: string | null;
  viewMode: TaskViewMode;
  isWorkspaceSidebarOpen: boolean;
  setActiveProject: (id: string | null) => void;
  setActiveBoard: (id: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  setViewMode: (mode: TaskViewMode) => void;
  setWorkspaceSidebarOpen: (open: boolean) => void;
  reset: () => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeBoardId: null,
      selectedTaskId: null,
      viewMode: 'kanban',
      isWorkspaceSidebarOpen: false,
      setActiveProject: (id) => set({ activeProjectId: id ? String(id) : null, activeBoardId: null, selectedTaskId: null, isWorkspaceSidebarOpen: false }),
      setActiveBoard: (id) => set({ activeBoardId: id ? String(id) : null, selectedTaskId: null }),
      setSelectedTaskId: (id) => set({ selectedTaskId: id ? String(id) : null }),
      setViewMode: (mode) => set({ viewMode: mode, isWorkspaceSidebarOpen: false }),
      setWorkspaceSidebarOpen: (open) => set({ isWorkspaceSidebarOpen: open }),
      reset: () => set({ activeProjectId: null, activeBoardId: null, selectedTaskId: null, viewMode: 'kanban', isWorkspaceSidebarOpen: false }),
    }),
    {
      name: 'task-store',
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
        activeBoardId: state.activeBoardId,
        viewMode: state.viewMode,
      }),
    }
  )
);
