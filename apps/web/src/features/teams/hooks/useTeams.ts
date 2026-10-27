import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t } from "../../../i18n/locale";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { teamsApi } from "../api/teamsApi";
import type { AddTeamMemberPayload, TeamFormData } from "../types";

export const useTeams = (params: URLSearchParams) => {
  const serializedParams = params.toString();

  return useQuery({
    queryKey: ["teams", serializedParams],
    queryFn: async () => {
      const response = await teamsApi.getTeams(
        Object.fromEntries(params.entries()),
      );

      return response.data;
    },
    placeholderData: keepPreviousData,
  });
};

export const useCreateTeam = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TeamFormData) => teamsApi.createTeam(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["teams"],
      });
      await queryClient.invalidateQueries({ queryKey: ["teams-list"] });

      toast.success(t("Team created successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to create team";

      toast.error(translateError(errorMessage));
    },
  });
};

export const useUpdateTeam = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TeamFormData> }) =>
      teamsApi.updateTeam(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["teams"],
      });
      await queryClient.invalidateQueries({ queryKey: ["teams-list"] });

      toast.success(t("Team updated successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to update team";

      toast.error(translateError(errorMessage));
    },
  });
};

export const useDeleteTeam = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => teamsApi.deleteTeam(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["teams"],
      });
      await queryClient.invalidateQueries({ queryKey: ["teams-list"] });

      toast.success(t("Team deleted successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to delete team";

      toast.error(translateError(errorMessage));
    },
  });
};

export const useTeamMembers = (teamId?: number) => {
  return useQuery({
    queryKey: ["teams", teamId, "members"],
    queryFn: async () => {
      if (!teamId) return [];
      const response = await teamsApi.getTeamMembers(teamId);
      return response.data.results;
    },
    enabled: !!teamId,
  });
};

export const useAddTeamMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AddTeamMemberPayload) => teamsApi.addTeamMember(payload),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId, "members"] }),
        queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["teams-list"] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
      toast.success(t("Member added successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to add member";
      toast.error(translateError(errorMessage));
    },
  });
};

export const useRemoveTeamMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ membershipId }: { membershipId: number; teamId: number }) =>
      teamsApi.removeTeamMember(membershipId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId, "members"] }),
        queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["teams-list"] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
      toast.success(t("Member removed successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message || error?.response?.data?.detail || error?.message ||
        "Failed to remove member";
      toast.error(translateError(errorMessage));
    },
  });
};

export const useUpdateTeamMemberRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: number; role: string; teamId: number }) =>
      teamsApi.updateTeamMemberRole(membershipId, role),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId, "members"] }),
        queryClient.invalidateQueries({ queryKey: ["teams", variables.teamId] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["teams-list"] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
      toast.success(t("Member role updated successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to update member role";
      toast.error(translateError(errorMessage));
    },
  });
};
