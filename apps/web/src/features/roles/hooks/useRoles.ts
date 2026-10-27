import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t } from "../../../i18n/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createRole,
  deleteRole,
  getPermissions,
  getRoles,
  updateRole,
} from "../api/rolesApi";
import type { ApiResponseList } from "../../../core/api/apiService";
import type { PermissionsResponse, Role, RoleFormData, RoleUpdateData } from "../types";
import type { GetRolesParams } from "../api/rolesApi";

const ROLES_QUERY_KEY = ["roles"] as const;
const PERMISSIONS_QUERY_KEY = ["roles", "permissions"] as const;

export const useRoles = (params?: GetRolesParams) => {
  return useQuery<ApiResponseList<Role>>({
    queryKey: params ? [...ROLES_QUERY_KEY, params] : ROLES_QUERY_KEY,
    queryFn: () => getRoles(params),
  });
};

/** Fetches all system permissions + default role→permissions mapping from the backend. */
export const usePermissions = (organizationId?: string) => {
  return useQuery<PermissionsResponse>({
    queryKey: [...PERMISSIONS_QUERY_KEY, organizationId],
    queryFn: () => getPermissions(organizationId),
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes — permissions rarely change
  });
};

export const useCreateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RoleFormData) => createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("Role created successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to create role";
      toast.error(translateError(errorMessage));
    },
  });
};

export const useUpdateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoleUpdateData }) =>
      updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: PERMISSIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      toast.success(t("Role updated successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to update role";
      toast.error(translateError(errorMessage));
    },
  });
};

export const useDeleteRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(t("Role deleted successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to delete role";
      toast.error(translateError(errorMessage));
    },
  });
};
