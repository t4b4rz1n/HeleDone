import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t } from "../../../i18n/locale";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createUser, deleteUser, getUsers, updateUser } from "../api/usersApi";
import { getUnassignedUsers } from "../api/usersApi";
import type { UserFormData, UserUpdateData } from "../types";

export const useUsers = (params: URLSearchParams) => {
  const serializedParams = params.toString();
  return useQuery({
    queryKey: ["users", serializedParams],
    queryFn: async () => {
      const response = await getUsers(params);
      return response.data;
    },
    placeholderData: keepPreviousData,
  });
};

export const useUnassignedUsers = () => {
  return useQuery({
    queryKey: ["users", "unassigned"],
    queryFn: () => getUnassignedUsers(),
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UserFormData) => createUser(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users-list"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast.success(t("User created successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to create user";
      toast.error(translateError(errorMessage));
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: UserUpdateData }) =>
      updateUser(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["users-list"] });
      await queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["current-user-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast.success(t("User updated successfully"));
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.message ||
        error.message ||
        "Failed to update user";
      toast.error(translateError(errorMessage));
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | number) => deleteUser(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["users-list"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-members"] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["roles"] }),
        queryClient.invalidateQueries({ queryKey: ["finance"] }),
      ]);
      toast.success(t("User deleted successfully"));
    },
    onError: (error: any) => {
      toast.error(translateError(error?.response?.data?.message || "Failed to delete user"));
    },
  });
};
