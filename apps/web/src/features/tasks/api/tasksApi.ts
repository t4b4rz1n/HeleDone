import ApiService from '../../../core/api/apiService';
import type {
  Task,
  Board,
  TaskChecklistItem,
  TaskComment,
  TaskActivityLog,
  AsyncStandup,
  StandupGridData,
  MyStandupGridData,
  User,
  PaginatedResponse,
} from '../types';

// Helper to extract data from various response shapes (DRF vs Custom ApiResponse)
const extractData = <T>(res: any): T[] => {
  const data = res?.results ?? res?.data?.results ?? res?.data ?? res;
  return Array.isArray(data) ? data : [];
};

export const getBoards = async (projectId: string): Promise<Board[]> => {
  const res = await ApiService.get<PaginatedResponse<Board> | Board[]>('/tasks/boards/', { params: { project: projectId } });
  return extractData<Board>(res);
};

export const createBoard = async (projectId: string, title: string, backgroundColor: string, createDefaultStatuses: boolean = true): Promise<Board> => {
  const data = await ApiService.post<Board>('/tasks/boards/', {
    project: projectId,
    title,
    background_color: backgroundColor,
    create_default_statuses: createDefaultStatuses,
  });
  return (data as any).data ?? data;
};

export const updateBoard = async (boardId: string, payload: { title?: string; background_color?: string; description?: string }): Promise<Board> => {
  const data = await ApiService.patch<Board>(`/tasks/boards/${boardId}/`, payload);
  return (data as any).data ?? data;
};

export const deleteBoard = async (boardId: string): Promise<void> => {
  await ApiService.delete(`/tasks/boards/${boardId}/`);
};

export const getProjectMembers = async (projectId: string): Promise<User[]> => {
  const res = await ApiService.get<PaginatedResponse<User> | User[]>(`/projects/${projectId}/members/`);
  return extractData<User>(res);
};

export const getTasks = async (projectId?: string, boardId?: string, pageSize = 100): Promise<Task[]> => {
  const params: Record<string, any> = { page_size: pageSize };
  if (projectId) params.project = projectId;
  if (boardId) {
    params.board = boardId;
  }
  const res = await ApiService.get<PaginatedResponse<Task> | Task[]>('/tasks/', { params });
  return extractData<Task>(res);
};

export const getUnlinkedTasks = async (projectId: string, pageSize = 1000): Promise<Task[]> => {
  const params: Record<string, any> = { project: projectId, no_milestone: "true", page_size: pageSize };
  const res = await ApiService.get<PaginatedResponse<Task> | Task[]>('/tasks/', { params });
  return extractData<Task>(res);
};

export const getMilestoneTasks = async (projectId: string, milestoneId: string | number, pageSize = 50): Promise<Task[]> => {
  const params: Record<string, any> = { project: projectId, milestone: milestoneId, page_size: pageSize };
  const res = await ApiService.get<PaginatedResponse<Task> | Task[]>('/tasks/', { params });
  return extractData<Task>(res);
};


 export const getTask = async (taskId: string | number): Promise<Task> => {
   const res = await ApiService.get<Task>(`/tasks/${taskId}/`);
   return (res as any).data ?? res;
 };


export const reorderTasks = async (orders: { id: string | number; order: number }[]): Promise<any> => {
  return await ApiService.post('/tasks/reorder/', { orders });
};

export const createTask = async (
  projectId: string,
  title: string,
  statusId: string | number,
  priority: string = 'low',
  milestone?: string | number,
  assignees?: (string | number)[]
): Promise<Task> => {
  const payload: any = {
    project: projectId,
    title,
    status: statusId,
    priority,
  };
  if (milestone) {
    payload.milestone = milestone;
  }
  if (assignees && assignees.length > 0) {
    payload.assignees = assignees;
  }
  const data = await ApiService.post<Task>('/tasks/', payload);
  return (data as any).data ?? data;
};


export const moveTask = async (taskId: number | string, statusId: number | string, order: number): Promise<Task> => {
  const data = await ApiService.post<Task>(`/tasks/${taskId}/move/`, {
    status_id: statusId,
    order: order,
  });
  return (data as any).data ?? data;
};

export const markTaskBlocked = async (taskId: number | string, isBlocked: boolean): Promise<Task> => {
  const data = await ApiService.patch<Task>(`/tasks/${taskId}/`, {
    is_blocked: isBlocked,
  });
  return (data as any).data ?? data;
};

export const deleteTask = async (taskId: string | number): Promise<void> => {
  await ApiService.delete(`/tasks/${taskId}/`);
};

export const updateTask = async (taskId: string | number, data: Partial<Task>): Promise<Task> => {
  const res = await ApiService.patch<Task>(`/tasks/${taskId}/`, data);
  return (res as any).data ?? res;
};

// Checklists
export const getTaskChecklists = async (taskId: string | number): Promise<TaskChecklistItem[]> => {
  const res = await ApiService.get<PaginatedResponse<TaskChecklistItem> | TaskChecklistItem[]>('/tasks/checklist-items/', { params: { task: taskId } });
  return extractData<TaskChecklistItem>(res);
};

export const addChecklistItem = async (taskId: string | number, description: string): Promise<TaskChecklistItem> => {
  const data = await ApiService.post<TaskChecklistItem>('/tasks/checklist-items/', {
    task: taskId,
    description,
    is_completed: false,
  });
  return (data as any).data ?? data;
};

export const toggleChecklistItem = async (itemId: string | number): Promise<TaskChecklistItem> => {
  const data = await ApiService.post<TaskChecklistItem>(`/tasks/checklist-items/${itemId}/toggle/`);
  return (data as any).data ?? data;
};

export const deleteChecklistItem = async (itemId: string | number): Promise<void> => {
  await ApiService.delete(`/tasks/checklist-items/${itemId}/`);
};

// Comments
export const getTaskComments = async (taskId: string | number): Promise<TaskComment[]> => {
  const res = await ApiService.get<PaginatedResponse<TaskComment> | TaskComment[]>('/tasks/comments/', { params: { task: taskId } });
  return extractData<TaskComment>(res);
};

export const getTaskActivities = async (taskId: string | number): Promise<TaskActivityLog[]> => {
  const res = await ApiService.get<PaginatedResponse<TaskActivityLog> | TaskActivityLog[]>(`/tasks/${taskId}/activities/`);
  return extractData<TaskActivityLog>(res);
};

export const addComment = async (taskId: string | number, content: string, file?: File): Promise<TaskComment> => {
  let data;

  if (file) {
    const formData = new FormData();
    formData.append('task', taskId.toString());
    formData.append('content', content);
    formData.append('attached_file', file);

    // Axios handles FormData correctly and sets multipart/form-data
    data = await ApiService.post<TaskComment>('/tasks/comments/', formData);
  } else {
    data = await ApiService.post<TaskComment>('/tasks/comments/', {
      task: taskId,
      content,
    });
  }

  return (data as any).data ?? data;
};

export const updateComment = async (commentId: string | number, content: string): Promise<TaskComment> => {
  const data = await ApiService.patch<TaskComment>(`/tasks/comments/${commentId}/`, {
    content,
  });
  return (data as any).data ?? data;
};

export const deleteComment = async (commentId: string | number): Promise<void> => {
  await ApiService.delete(`/tasks/comments/${commentId}/`);
};

// Standups (project-based daily reports)
export interface StandupPayload {
  projectId: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  hoursWorked: number;
  todayWork: string;
  blockers?: string;
}

export const getStandups = async (projectId?: string): Promise<AsyncStandup[]> => {
  const params: Record<string, any> = {};
  if (projectId) {
    params.project = projectId;
  }
  const res = await ApiService.get<PaginatedResponse<AsyncStandup> | AsyncStandup[]>(
    '/tasks/standups/',
    { params },
  );
  return extractData<AsyncStandup>(res);
};

/**
 * Personal standup grid (project rows x day columns) for the signed-in user.
 * Regular members cannot see other members, so their matrix is grouped by
 * project instead of by teammate.
 */
export const getMyStandupGrid = async (
  params: { year?: number; month?: number; start_date?: string; end_date?: string },
): Promise<MyStandupGridData> => {
  const data = await ApiService.get<MyStandupGridData>('/tasks/standups/my-grid/', {
    params,
  });
  return (data as any).data ?? data;
};

export const createStandup = async (payload: StandupPayload): Promise<AsyncStandup> => {
  const data = await ApiService.post<AsyncStandup>('/tasks/standups/', {
    project: payload.projectId,
    date: payload.date,
    hours_worked: payload.hoursWorked,
    today_work: payload.todayWork,
    blockers: payload.blockers?.trim() ? payload.blockers.trim() : null,
  });
  return (data as any).data ?? data;
};

export const updateStandup = async (
  entryId: string,
  payload: StandupPayload,
): Promise<AsyncStandup> => {
  const data = await ApiService.patch<AsyncStandup>(`/tasks/standups/${entryId}/`, {
    date: payload.date,
    hours_worked: payload.hoursWorked,
    today_work: payload.todayWork,
    blockers: payload.blockers?.trim() ? payload.blockers.trim() : null,
  });
  return (data as any).data ?? data;
};

/** Quick-save from the grid cell: updates only the worked hours (Enter key). */
export const updateStandupHours = async (
  entryId: string,
  hoursWorked: number,
): Promise<AsyncStandup> => {
  const data = await ApiService.patch<AsyncStandup>(`/tasks/standups/${entryId}/`, {
    hours_worked: hoursWorked,
  });
  return (data as any).data ?? data;
};

/** Delete an entry; axios accepts 204 and rejects failed requests. */
export const deleteStandup = async (entryId: string): Promise<void> => {
  await ApiService.delete(`/tasks/standups/${entryId}/`);
};

/**
 * Monthly standup grid of a project (member rows × day columns).
 * Regular members receive themselves only; owners/admins the full list.
 */
export const getStandupGrid = async (
  projectId: string,
  params: { year?: number; month?: number; start_date?: string; end_date?: string }
): Promise<StandupGridData> => {
  const data = await ApiService.get<StandupGridData>('/tasks/standups/grid/', {
    params: { project: projectId, ...params },
  });
  return (data as any).data ?? data;
};

export const createStatus = async (boardId: string | number, name: string, code?: string, category?: string, order?: number): Promise<any> => {
  const statusCode = code || name.toLowerCase().replace(/\s+/g, '-');
  const data = await ApiService.post<any>('/tasks/statuses/', {
    board: boardId,
    name,
    code: statusCode,
    category: category || 'todo',
    order: order ?? 99,
  });
  return (data as any).data ?? data;
};

export const reorderStatuses = async (boardId: string | number, orders: { id: string | number; order: number }[]): Promise<any> => {
  return await ApiService.post('/tasks/statuses/reorder/', { board_id: boardId, orders });
};

export const deleteStatus = async (statusId: string | number): Promise<void> => {
  await ApiService.delete(`/tasks/statuses/${statusId}/`);
};
