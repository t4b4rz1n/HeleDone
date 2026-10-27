import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { SYSTEM_PERMISSIONS } from "../constants/permissions";
import { useTranslation } from "../../../i18n/locale";
import React, { useEffect, useMemo, useRef } from "react";
import { useForm, useWatch, type SubmitHandler } from "react-hook-form";
import type { Permission, Role, RoleFormData, RoleUpdateData } from "../types";
import { usePermissions } from "../hooks/useRoles";
import { useOrganizations } from "../../organizations/hooks/useOrganizations";
import type { Organization } from "../../organizations/types";

// Permissions that are granted to all org members by default and should not appear in the role editor
const HIDDEN_PERMISSIONS = ["attendance.view"];
type RoleFormValues = {
  name: string;
  description: string;
  permissions: string[];
  organization_id: string;
};

type RoleFormModalProps = {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  initialRole?: Role | null;
  isPending?: boolean;
  onClose: () => void;
  onSubmit: (data: RoleFormData | RoleUpdateData) => void;
  /** If provided, locks the organization field to this org and hides the dropdown */
  lockedOrganizationId?: string;
  lockedOrganizationName?: string;
  /** If true, shows org selector (for superuser/owner use cases) */
  showOrgSelector?: boolean;
};

export const RoleFormModal: React.FC<RoleFormModalProps> = ({
  isOpen,
  title,
  submitLabel,
  initialRole,
  isPending = false,
  onClose,
  onSubmit,
  lockedOrganizationId,
  lockedOrganizationName,
  showOrgSelector = false,
}) => {
  const t = useTranslation();
  // Load permissions dynamically from the backend
  const { data: permissionsData, isLoading: isLoadingPerms } = usePermissions(lockedOrganizationId);

  // Load organizations for the selector (only when showOrgSelector is true)
  const { data: organizations = [] } = useOrganizations();

  const filteredPermissions = useMemo(
    () => (permissionsData?.permissions || []).filter((p: Permission) =>
      !HIDDEN_PERMISSIONS.includes(p.code)),
    [permissionsData],
  );

  const allPermissionIds = useMemo(
    () => filteredPermissions.map((p: Permission) => p.code),
    [filteredPermissions],
  );

  // Group permissions by module for display
  const permissionsByModule = useMemo(() => {
    return filteredPermissions.reduce(
      (acc: Record<string, Permission[]>, perm: Permission) => {
        if (!acc[perm.module]) acc[perm.module] = [];
        acc[perm.module].push(perm);
        return acc;
      },
      {} as Record<string, Permission[]>,
    );
  }, [filteredPermissions]);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<RoleFormValues>({
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
      organization_id: lockedOrganizationId ?? "",
    },
  });

  const watchedPermissions = useWatch({
    control,
    name: "permissions",
    defaultValue: [],
  });

  const isFirstRender = useRef(true);

  // Load initial data when modal opens
  useEffect(() => {
    if (!isOpen) {
      isFirstRender.current = true;
      return;
    }

    reset({
      name: initialRole?.name ?? "",
      description: initialRole?.description ?? "",
      permissions: initialRole?.permissions ?? [],
      organization_id: lockedOrganizationId ?? "",
    });

    setTimeout(() => {
      isFirstRender.current = false;
    }, 0);
  }, [initialRole, isOpen, reset, lockedOrganizationId]);

  const submitHandler: SubmitHandler<RoleFormValues> = (values) => {
    onSubmit({
      name: values.name,
      description: values.description,
      permissions: [...new Set([
        ...values.permissions,
        ...(initialRole?.permissions ?? []).filter((code) => !allPermissionIds.includes(code)),
      ])],
      organization_id: values.organization_id || lockedOrganizationId,
    });
  };

  const handleSelectAll = () => {
    const current = watchedPermissions || [];
    const allSelected = allPermissionIds.length > 0 &&
      allPermissionIds.every((id) => current.includes(id));
    setValue("permissions", allSelected
      ? current.filter((id) => !allPermissionIds.includes(id))
      : [...new Set([...current, ...allPermissionIds])], {
      shouldDirty: true,
      shouldValidate: true,
    });
  };


  if (!isOpen) return null;

  const selectedCount = allPermissionIds.filter((id) => watchedPermissions.includes(id)).length;
  const totalCount = allPermissionIds.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <dialog className="modal modal-open backdrop-blur-sm">
      <div className="modal-box w-full max-w-2xl rounded-3xl border border-base-300/80 bg-base-100 shadow-2xl">
        <div className="flex items-start justify-between border-b border-base-300/70 pb-4">
          <div>
            <h3 className="text-xl font-bold text-base-content">{title}</h3>
            <p className="mt-1 text-xs text-base-content/70 sm:text-sm">
              {t("Manage role details and permissions")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit(submitHandler)} className="mt-6 space-y-6">
          {/* Organization field */}
          {lockedOrganizationId ? (
            /* Locked: show read-only chip */
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium">{t("Organization")}</span>
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-base-300 bg-base-200/60 px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3">
                    <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                  </svg>
                  {lockedOrganizationName || lockedOrganizationId}
                </span>
                <span className="text-xs text-heledone-ink-muted">{t("Locked to this organization")}</span>
              </div>
            </div>
          ) : showOrgSelector ? (
            /* Selector: dropdown for superuser / owner */
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium">{t("Organization")}</span>
              </label>
              <select
                {...register("organization_id", { required: t("Please select an organization") })}
                className="select select-bordered w-full rounded-2xl"
              >
                <option value="">{t("Select organization…")}</option>
                {(organizations as Organization[]).map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              {errors.organization_id && (
                <span className="mt-1 text-xs text-error">
                  {errors.organization_id.message}
                </span>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="form-control w-full sm:col-span-2">
              <label className="label">
                <span className="label-text font-medium">{t("Role Name")}</span>
              </label>
              <input
                {...register("name", { required: t("Role name is required") })}
                className="input input-bordered w-full rounded-2xl"
                placeholder={t("e.g. Quality Reviewer")}
              />
              {errors.name && (
                <span className="mt-1 text-xs text-error">
                  {errors.name.message}
                </span>
              )}
            </div>
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text font-medium">{t("توضیح")}</span>
            </label>
            <textarea
              {...register("description")}
              className="textarea textarea-bordered h-20 rounded-2xl"
              placeholder={t("Short description...")}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="border-s-4 border-primary ps-2 text-sm font-bold text-base-content/80">
                {t("Permissions")}{totalCount > 0 && (
                  <span className="ms-2 text-xs font-normal text-heledone-ink-muted">
                    ({formatUiNumber(selectedCount)}/{formatUiNumber(totalCount)}  {t("selected)")}</span>
                )}
              </h4>
              {totalCount > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="btn btn-xs btn-ghost text-primary"
                >
                  {allSelected ? t("Deselect All") : t("Select All")}
                </button>
              )}
            </div>

            {isLoadingPerms ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner loading-sm text-primary" />
                <span className="ms-2 text-sm text-heledone-ink-muted">{t("Loading permissions...")}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 rounded-3xl border border-base-300 bg-base-200/30 p-4 md:grid-cols-2">
                {Object.entries(permissionsByModule).map(([module, perms]: [string, Permission[]]) => (
                  <div key={t(module.toUpperCase())} className="space-y-2">
                    <p className="mb-1 text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
                      {t(module.toUpperCase())}
                    </p>
                    <div className="flex flex-col gap-2">
                      {perms.map((p: Permission) => (
                        <label
                          key={p.code}
                          className="group flex cursor-pointer items-center gap-3"
                        >
                          <input
                            type="checkbox"
                            value={p.code}
                            {...register("permissions")}
                            className="checkbox checkbox-primary checkbox-xs"
                          />
                          <span className="text-sm text-base-content/70 transition-colors group-hover:text-primary">
                            {SYSTEM_PERMISSIONS.find((permission) => permission.id === p.code)?.label ?? t(p.name)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(permissionsByModule).length === 0 && (
                  <div className="col-span-2 py-6 text-center text-sm text-heledone-ink-muted">
                    {t("No permissions are configured. Contact your administrator.")}</div>
                )}
              </div>
            )}
          </div>

          <div className="modal-action mt-8">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost rounded-2xl px-6"
            >
              {t("انصراف")}</button>
            <button
              type="submit"
              className="btn btn-primary rounded-2xl px-8 shadow-lg shadow-primary/20"
              disabled={isPending}
            >
              {isPending ? t("در حال ذخیره…") : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
