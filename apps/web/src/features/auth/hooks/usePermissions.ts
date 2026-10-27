import { useAuthStore } from "../store/authStore";

export const usePermissions = () => {
  const user = useAuthStore((state) => state.user);

  const hasPermission = (permission: string): boolean => {
    if (user?.is_superuser) {
      return true;
    }
    return user?.role?.permissions?.includes(permission) ?? false;
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    if (user?.is_superuser) {
      return true;
    }

    if (!permissions || permissions.length === 0) {
      return true;
    }

    return permissions.some((permission) => hasPermission(permission));
  };

  const hasAllPermissions = (permissions: string[]): boolean => {
    if (user?.is_superuser) {
      return true;
    }

    if (!permissions || permissions.length === 0) {
      return true;
    }

    return permissions.every((permission) => hasPermission(permission));
  };

  return {
    permissions: user?.role?.permissions ?? [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    // Kept for existing permission-gated UI callers; only superusers bypass the checks.
    isStaff: !!user?.is_superuser,
    isSuperuser: !!user?.is_superuser,
  };
};
