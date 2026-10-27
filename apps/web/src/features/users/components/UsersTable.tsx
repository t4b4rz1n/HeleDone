import { useTranslation } from "../../../i18n/locale";
import ProfileAvatar from "../../../components/ProfileAvatar";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";
import { motion } from "motion/react";
import {
  Building3,
  CloseCircle,
  Edit,
  Message,
  TickCircle,
  Trash,
  Verify,
} from "iconsax-reactjs";
import { useState } from "react";
import { ConfirmationModal } from "../../../components/ConfirmationModal";
import { useRoles } from "../../roles/hooks/useRoles";
import { useDeleteUser } from "../hooks/useUsers";
import type { User } from "../types";
import {
  getRoleBadgeClass,
  getRoleIcon,
  getRoleName,
} from "../utils/roleBadges";

interface UsersTableProps {
  users: User[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (user: User) => void;
  canManage?: boolean;
}

export const UsersTable = ({
  users,
  isLoading,
  isError,
  onEdit,
  canManage = false,
}: UsersTableProps) => {
  const t = useTranslation();
  const [deleteModalState, setDeleteModalState] = useState<{
    open: boolean;
    user: User | null;
  }>({ open: false, user: null });

  const deleteMutation = useDeleteUser();
  const { data: rolesData } = useRoles();
  const roles = rolesData?.results || [];

  const handleDelete = async () => {
    if (deleteModalState.user) {
      try {
        await deleteMutation.mutateAsync(deleteModalState.user.id);
        setDeleteModalState({ open: false, user: null });
      } catch {
        // Handled in mutation onError
      }
    }
  };

  if (isLoading) {
    return (
      <div className="bg-base-100/70 backdrop-blur-xl rounded-2xl border border-base-content/8 overflow-hidden shadow-sm">
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-base-content/5 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-linear-to-br from-error/5 to-error/10 rounded-2xl border border-error/20 p-12 text-center backdrop-blur-sm">
        <div className="text-error mb-4">
          <CloseCircle className="w-16 h-16 mx-auto" />
        </div>
        <h3 className="text-lg font-bold text-error mb-2">{t("Loading Error")}</h3>
        <p className="text-error">{t("There was a problem loading users")}</p>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <CoastalEmptyState motif="coast" title={t("No Users Found")} description={t("No users match your search criteria")} />
    );
  }

  return (
    <>
      <div className="bg-base-100/70 backdrop-blur-xl rounded-2xl border border-base-content/8 overflow-hidden shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="border-b border-base-content/8">
              <tr>
                <th className="px-6 py-4 text-start text-xs font-semibold tracking-wider text-heledone-ink-muted uppercase whitespace-nowrap">
                  {t("User")}</th>
                <th className="px-6 py-4 text-start text-xs font-semibold tracking-wider text-heledone-ink-muted uppercase whitespace-nowrap">
                  {t("Contact")}</th>
                <th className="px-6 py-4 text-start text-xs font-semibold tracking-wider text-heledone-ink-muted uppercase whitespace-nowrap">
                  {t("Full Name")}</th>
                <th className="px-6 py-4 text-start text-xs font-semibold tracking-wider text-heledone-ink-muted uppercase whitespace-nowrap">
                  {t("Organization")}</th>
                <th className="px-6 py-4 text-start text-xs font-semibold tracking-wider text-heledone-ink-muted uppercase whitespace-nowrap">
                  {t("وضعیت")}</th>
                {canManage && (
                  <th className="px-6 py-4 text-start text-xs font-semibold tracking-wider text-heledone-ink-muted uppercase whitespace-nowrap">
                    {t("Actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-base-content/5">
              {users.map((user, index) => {
                const roleName = getRoleName(user.role_id, roles, user.role_name);

                return (

                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="hover:bg-base-200/40 transition-all duration-200 group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/5 shrink-0 flex items-center justify-center border border-base-content/10">
                          <ProfileAvatar
                            src={user.avatar_url || user.avatar}
                            name={[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}
                            className="size-full overflow-hidden rounded-full"
                          />
                        </div>
                        <div>
                          <div>
                            <span className="text-sm font-semibold text-base-content">
                              {user.username}
                            </span>
                          </div>
                          <div className="text-xs text-heledone-ink-muted mt-0.5">
                            {t("ID: #")}{user.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Message className="w-3.5 h-3.5 text-heledone-ink-muted" />
                        <span className="text-sm text-base-content/70">
                          {user.email}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-base-content/70 font-medium">
                        {user.first_name} {user.last_name}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.organization?.name ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary/5 text-primary border border-primary/15">
                          <Building3 size={12} />
                          {user.organization.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-heledone-ink-muted border border-dashed border-base-content/10">
                          <Building3 size={12} />
                          {t("No org")}</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                            user.is_active
                              ? "bg-success/5 text-success border-success/15"
                              : "bg-error/5 text-error border-error/15"
                          }`}
                        >
                          {user.is_active ? (
                            <TickCircle size={12} variant="Bold" />
                          ) : (
                            <CloseCircle size={12} variant="Bold" />
                          )}
                          {user.is_active ? t("فعال") : t("Inactive")}
                        </span>

                        {user.is_staff && (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/5 text-primary border border-primary/15"
                            title={t("Staff Member")}
                          >
                            <Verify size={12} variant="Bold" />
                            <span>{t("Staff")}</span>
                          </span>
                        )}

                        {roleName
                          ? (() => {
                              const RoleIcon = getRoleIcon(roleName);

                              return (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] ${getRoleBadgeClass(roleName)}`}
                                  title={t("Role: {value0}", { value0: roleName })}
                                >
                                  {RoleIcon ? (
                                    <RoleIcon size={14} variant="Bold" />
                                  ) : null}
                                  <span>{roleName}</span>
                                </span>
                              );
                            })()
                          : null}
                      </div>
                    </td>

                    {canManage && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onEdit(user)}
                            className="p-2 hover:bg-primary/5 text-heledone-ink-muted hover:text-primary rounded-lg transition-colors"
                            title={t("ویرایش")}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteModalState({ open: true, user })
                            }
                            className="p-2 hover:bg-error/5 text-heledone-ink-muted hover:text-error rounded-lg transition-colors"
                            title={t("حذف")}
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmationModal
        isOpen={deleteModalState.open}
        onClose={() => setDeleteModalState({ open: false, user: null })}
        onConfirm={handleDelete}
        title={t("Delete User")}
        message={t("Are you sure you want to delete the user \"{value0}\"? This action cannot be undone.", { value0: deleteModalState.user?.username })}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
};
