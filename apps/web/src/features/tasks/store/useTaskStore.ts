import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TaskViewMode = 'kanban' | 'list' | 'calendar' | 'files' | 'attendance';

interface TaskStore {
  activeProjectId: string | null;
  activeBoardId: string | null;
  selectedTaskId: string | null;
  viewMode: TaskViewMode;
  setActiveProject: (id: string | null) => void;
  setActiveBoard: (id: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  setViewMode: (mode: TaskViewMode) => void;
  reset: () => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeBoardId: null,
      selectedTaskId: null,
      viewMode: 'kanban',
      setActiveProject: (id) => set({ activeProjectId: id ? String(id) : null, activeBoardId: null, selectedTaskId: null }),
      setActiveBoard: (id) => set({ activeBoardId: id ? String(id) : null, selectedTaskId: null }),
      setSelectedTaskId: (id) => set({ selectedTaskId: id ? String(id) : null }),
      setViewMode: (mode) => set({ viewMode: mode }),
      reset: () => set({ activeProjectId: null, activeBoardId: null, selectedTaskId: null, viewMode: 'kanban' }),
    }),
    {
      name: 'task-store',
    }
  )
);
