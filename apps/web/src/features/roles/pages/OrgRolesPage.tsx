import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { useTranslation } from "../../../i18n/locale";
import { CoastalArtwork } from "../../../components/CoastalEmptyState";
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield } from "iconsax-reactjs";
import { useQuery } from "@tanstack/react-query";
import { CreateRoleModal } from "../components/CreateRoleModal";
import { EditRoleModal } from "../components/EditRoleModal";
import { useRoles, useDeleteRole } from "../hooks/useRoles";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { getOrganizationDetails } from "../../organizations/api/organizationsApi";
import type { Role } from "../types";

const OrgRolesPage = () => {
  const t = useTranslation();
  const { hasAnyPermission } = usePermissions();
  const canManageRoles = hasAnyPermission(["org.manage_roles", "org.manage_settings"]);
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<Role | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Fetch organization details for name display and breadcrumb
  const { data: organization } = useQuery({
    queryKey: ["organizations", orgId],
    queryFn: () => getOrganizationDetails(orgId!),
    enabled: Boolean(orgId),
  });

  // Fetch roles scoped to this organization
  const { data, isLoading, isError } = useRoles(
    orgId ? { organization_id: orgId } : undefined,
  );
  const { mutate: deleteRole, isPending: isDeleting } = useDeleteRole();

  const roles: Role[] = data?.results ?? [];

  const deleteTitle = useMemo(() => {
    if (!roleToDelete) return t("Delete Role");
    return t("Delete role «{value0}»", { value0: roleToDelete.name });
  }, [roleToDelete, t]);

  const handleDeleteClick = (roleId: string) => {
    const found = roles.find((r) => r.id === roleId) ?? null;
    setRoleToDelete(found);
    setDeleteErrorMessage(null);
    setIsDeleteOpen(true);
  };

  const handleEditClick = (roleId: string) => {
    const found = roles.find((r) => r.id === roleId) ?? null;
    setRoleToEdit(found);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setRoleToEdit(null);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteOpen(false);
    setRoleToDelete(null);
    setDeleteErrorMessage(null);
  };

  const handleConfirmDelete = () => {
    if (!roleToDelete) return;
    setDeleteErrorMessage(null);
    deleteRole(roleToDelete.id, {
      onSuccess: () => closeDeleteModal(),
      onError: (error: any) => {
        const msg =
          error?.response?.data?.message ||
          error?.response?.data?.detail ||
          error?.message ||
          "Failed to delete role.";
        setDeleteErrorMessage(msg);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center p-4 sm:p-6">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <div className="alert alert-error shadow-md border border-error/20">
          <span>{t("Failed to load roles. Please try again.")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Breadcrumb / Back button */}
      <button
        type="button"
        onClick={() => navigate(`/organizations/${orgId}`)}
        className="btn btn-ghost btn-sm rounded-lg gap-2 ps-0 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
      >
        <ArrowLeft size={16} />
        {t("Back to")} {organization?.name ?? t("Organization")}
      </button>

      {/* Page header */}
      <div data-coastal-scene="roles" className="heledone-page-heading flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Shield size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("Roles Management")}</h1>
            {organization && (
              <p className="mt-0.5 text-sm text-heledone-ink-muted">
                {t("Managing roles for")}{" "}
                <span className="font-semibold text-base-content/75">
                  {organization.name}
                </span>
              </p>
            )}
          </div>
        </div>

        {canManageRoles && (
          <button
            type="button"
            className="btn btn-primary rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 w-full sm:w-auto font-medium"
            onClick={() => setIsCreateOpen(true)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5 me-1 inline"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            {t("Create Role")}</button>
        )}
      </div>

      {/* Modals */}
      <CreateRoleModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        organizationId={orgId}
        organizationName={organization?.name}
      />

      <EditRoleModal
        isOpen={isEditOpen}
        role={roleToEdit}
        onClose={closeEditModal}
      />

      {/* Roles table */}
      <div className="card border border-base-300 bg-base-100 shadow-sm overflow-hidden">
        <div className="card-body p-0">
          <div className="w-full overflow-x-auto">
            <table className="table table-zebra w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-base-300 bg-base-200/50 text-base-content/80">
                  <th className="py-4 ps-6 text-sm font-semibold">{t("Role Name")}</th>
                  <th className="hidden md:table-cell py-4 text-sm font-semibold">
                    {t("توضیح")}</th>
                  <th className="py-4 text-sm font-semibold text-center">
                    {t("Permissions")}</th>
                  <th className="py-4 text-sm font-semibold text-center">
                    {t("وضعیت")}</th>
                  {canManageRoles && (
                    <th className="py-4 pe-6 text-sm font-semibold text-end">
                      {t("Actions")}</th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-base-200">
                {roles.length > 0 ? (
                  roles.map((role) => {
                    const desc = role.description?.trim() ?? "";
                    const shouldTip = desc.length > 40;

                    return (
                      <tr
                        key={role.id}
                        className="hover:bg-base-200/30 transition-colors duration-150"
                      >
                        <td className="py-4 ps-6">
                          <div className="font-semibold text-base-content text-[15px]">
                            {role.name}
                          </div>
                        </td>

                        <td className="hidden md:table-cell py-4 max-w-xs">
                          {shouldTip ? (
                            <div
                              className="tooltip tooltip-top tooltip-primary block w-full"
                              data-tip={desc}
                            >
                              <span className="block truncate text-sm text-base-content/70">
                                {desc}
                              </span>
                            </div>
                          ) : (
                            <span className="block truncate text-sm text-base-content/70">
                              {desc || "—"}
                            </span>
                          )}
                        </td>

                        <td className="py-4 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            {formatUiNumber(role.permissions?.length ?? 0)}  {t("Keys")}</div>
                        </td>

                        <td className="py-4 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {role.is_protected ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                                {t("Protected")}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                                {t("فعال")}</span>
                            )}
                            {role.member_count !== undefined && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-base-300 bg-base-200 px-2.5 py-1 text-xs font-semibold text-heledone-ink-muted">
                                {formatUiNumber(role.member_count)}  {t("members")}</span>
                            )}
                          </div>
                        </td>

                        {canManageRoles && (
                          <td className="py-4 pe-6 text-end">
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost text-base-content/70 hover:bg-base-200 hover:text-base-content transition-all"
                                onClick={() => handleEditClick(role.id)}
                              >
                                {t("ویرایش")}</button>
                              <button
                                type="button"
                                className="btn btn-sm btn-ghost text-error/80 hover:bg-error/10 hover:text-error transition-all"
                                onClick={() => handleDeleteClick(role.id)}
                                disabled={role.is_protected}
                                title={role.is_protected ? t("Protected roles cannot be deleted") : undefined}
                              >
                                {t("حذف")}</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={canManageRoles ? 5 : 4} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <CoastalArtwork motif="coast" />
                        <p className="text-heledone-ink-muted font-medium">
                          {t("No roles found for this organization.")}</p>
                        {canManageRoles && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm rounded-xl"
                            onClick={() => setIsCreateOpen(true)}
                          >
                            {t("Create first role")}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {isDeleteOpen && (
        <dialog className="modal modal-open backdrop-blur-sm">
          <div className="modal-box w-full max-w-lg rounded-3xl border border-base-300/80 bg-base-100 shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-y-auto">
            <h3 className="text-xl font-bold text-base-content">
              {deleteTitle}
            </h3>

            <p className="py-4 text-base-content/70">
              {t("Are you sure? This action cannot be undone.")}</p>

            {roleToDelete && (
              <div className="alert alert-warning shadow-md border border-warning/20 rounded-2xl mt-2">
                <span>
                  {t("Role")}{" "}
                  <span className="font-semibold">{roleToDelete.name}</span>{" "}
                  {t("will be deleted.")}</span>
              </div>
            )}

            {deleteErrorMessage && (
              <div className="alert alert-error shadow-md border border-error/20 rounded-2xl mt-3">
                <span className="text-sm">{deleteErrorMessage}</span>
              </div>
            )}

            <div className="modal-action mt-8">
              <button
                type="button"
                className="btn btn-ghost rounded-2xl px-6"
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                {t("انصراف")}</button>

              <button
                type="button"
                className="btn btn-error rounded-2xl px-8 shadow-lg shadow-error/20"
                onClick={handleConfirmDelete}
                disabled={!roleToDelete || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    {t("Deleting...")}</>
                ) : (
                  t("حذف")
                )}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
};

export default OrgRolesPage;
