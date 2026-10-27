// apps/web/src/features/roles/api/rolesApi.ts

import ApiService from "../../../core/api/apiService";
import type { ApiResponseList } from "../../../core/api/apiService";
import type { Permission, Role, RoleFormData, RoleUpdateData } from "../types";

const ROLES_ENDPOINT = "/panel/roles/";
const PERMISSIONS_ENDPOINT = "/panel/roles/permissions/";

export type GetRolesParams = {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  organization_id?: string;
  organization?: string;
};

export type PermissionsResponse = {
  permissions: Permission[];
  default_roles: Record<string, string[]>;
};

export const getRoles = async (
  params?: GetRolesParams,
): Promise<ApiResponseList<Role>> => {
  const response = await ApiService.getList<Role>(ROLES_ENDPOINT, {
    params: params,
  });
  return response.data;
};

export const createRole = async (payload: RoleFormData): Promise<Role> => {
  const response = await ApiService.post<Role>(ROLES_ENDPOINT, payload);
  return response.data;
};

export const updateRole = async (
  id: string,
  payload: RoleUpdateData,
): Promise<Role> => {
  const response = await ApiService.patch<Role>(
    `${ROLES_ENDPOINT}${id}/`,
    payload,
  );
  return response.data;
};

export const deleteRole = async (id: string): Promise<void> => {
  await ApiService.delete(`${ROLES_ENDPOINT}${id}/`);
};

export const getPermissions = async (organizationId?: string): Promise<PermissionsResponse> => {
  const response = await ApiService.get<PermissionsResponse>(PERMISSIONS_ENDPOINT, {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
  // Handle wrapped response: {status, data: {permissions, default_roles}}
  const data = (response.data as any)?.data ?? response.data;
  return data as PermissionsResponse;
};
