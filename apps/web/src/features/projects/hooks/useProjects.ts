import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  completeProject,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  getProjectMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getProjectActivities,
} from "../api/projectsApi";
import type {
  CreateProjectDTO,
  ProjectListParams,
  UpdateProjectDTO,
} from "../types";

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  list: (params?: ProjectListParams) =>
    [
      ...projectKeys.lists(),
      {
        params: params instanceof URLSearchParams ? params.toString() : params,
      },
    ] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string | number) =>
    [...projectKeys.details(), String(id)] as const,
  members: (id: string | number) =>
    [...projectKeys.detail(id), "members"] as const,
  milestones: (id: string | number) =>
    [...projectKeys.detail(id), "milestones"] as const,
  activities: (id: string | number) =>
    [...projectKeys.detail(id), "activities"] as const,
};

export const useProjects = (params?: ProjectListParams) => {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => getProjects(params),
  });
};

export const useProject = (id: string | number) => {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => getProjectById(id),
    enabled: Boolean(id),
    staleTime: 0,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectDTO) => createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string | number;
      data: UpdateProjectDTO;
    }) => updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | number) => deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
};

export const useArchiveProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | number) => archiveProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
};

export const useCompleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | number) => completeProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
};


export const useProjectMembers = (projectId: string | number) => {
  return useQuery({
    queryKey: projectKeys.members(projectId),
    queryFn: () => getProjectMembers(projectId),
    enabled: Boolean(projectId),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchOnWindowFocus: true, // Refresh when window gets focus
    staleTime: 0, // Consider data stale immediately
  });
};

export const useAddProjectMember = (projectId: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      user_id?: string | number;
      specialty?: string;
      allocation_percentage?: number;
    }) => addProjectMember(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["project-members", String(projectId)],
      });
      queryClient.invalidateQueries({
        queryKey: ["projectUsers"],
      });
    },
  });
};

export const useRemoveProjectMember = (projectId: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string | number) =>
      removeProjectMember(projectId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ["project-members", String(projectId)],
      });
      queryClient.invalidateQueries({
        queryKey: ["projectUsers"],
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
};

export const useProjectMilestones = (projectId: string | number) => {
  return useQuery({
    queryKey: projectKeys.milestones(projectId),
    queryFn: () => getProjectMilestones(projectId),
    enabled: Boolean(projectId),
  });
};

export const useCreateMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      target_date: string;
      weight?: number;
    }) => createMilestone(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.milestones(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
    },
  });
};

export const useUpdateMilestone = (projectId: string | number, milestoneId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof updateMilestone>[2]) =>
      updateMilestone(projectId, milestoneId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.milestones(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
    },
  });
};

export const useDeleteMilestone = (projectId: string | number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: string | number) => deleteMilestone(projectId, milestoneId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.milestones(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId),
      });
    },
  });
};


export const useProjectActivities = (projectId: string | number) => {
  return useQuery({
    queryKey: projectKeys.activities(projectId),
    queryFn: () => getProjectActivities(projectId),
    enabled: Boolean(projectId),
  });
};
