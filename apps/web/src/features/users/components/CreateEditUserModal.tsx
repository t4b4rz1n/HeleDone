import { useTranslation } from "../../../i18n/locale";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Add, Edit, CloseCircle } from "iconsax-reactjs";
import { createPortal } from "react-dom";
import { useOrganizations } from "../../organizations/hooks/useOrganizations";
import { useCreateUser, useUpdateUser } from "../hooks/useUsers";
import { UserForm } from "./UserForm";
import type { User, UserFormData, UserUpdateData } from "../types";
import { createUserSchema, updateUserSchema } from "../validation";

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 30, scale: 0.98 },
};

interface CreateEditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  organizationId?: string;
  onSuccess?: (newUserId?: string) => void;
}

export const CreateEditUserModal = ({
  isOpen,
  onClose,
  user,
  organizationId,
  onSuccess,
}: CreateEditUserModalProps) => {
  const t = useTranslation();
  const isEditMode = !!user;
  const schema = isEditMode ? updateUserSchema : createUserSchema;
  const { data: organizations = [] } = useOrganizations();
  const resolvedOrganizationId =
    organizationId ?? user?.organization?.id ?? organizations[0]?.id;

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      username: "",
      email: "",
      password: "",
      first_name: "",
      last_name: "",
      is_active: true,
      is_staff: false,
      role_id: null,
      salary_type: null,
      salary_amount: null,
    },
  });

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  useEffect(() => {
    if (!isOpen) return;

    if (user) {
      reset({
        username: user.username ?? "",
        email: user.email ?? "",
        first_name: user.first_name ?? "",
        last_name: user.last_name ?? "",
        is_active: !!user.is_active,
        is_staff: !!user.is_staff,
        role_id: user.role_id ?? null,
        salary_type: user.salary_type ?? null,
        salary_amount: user.salary_amount ?? null,
        password: "",
      });
    } else {
      reset({
        username: "",
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        is_active: true,
        is_staff: false,
        role_id: null,
        salary_type: null,
        salary_amount: null,
      });
    }
  }, [isOpen, user, reset]);

  const onSubmit = handleSubmit((data) => {
    if (isEditMode && user) {
      const updatePayload: UserUpdateData = {
        username: data.username,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        is_active: !!data.is_active,
        is_staff: !!data.is_staff,
        role_id: data.role_id ?? null,
        salary_type: data.salary_type ?? null,
        salary_amount: data.salary_amount ?? null,
        // Only send password if it was actually filled in
        ...(data.password ? { password: data.password } : {}),
      };

      updateMutation.mutate(
        { id: user.id, data: updatePayload },
        {
          onSuccess: () => {
            onClose();
            onSuccess?.();
          },
        },
      );

      return;
    }

    const createPayload: UserFormData = {
      username: data.username,
      email: data.email,
      password: data.password,
      first_name: data.first_name,
      last_name: data.last_name,
      is_active: !!data.is_active,
      is_staff: !!data.is_staff,
      role_id: data.role_id ?? null,
      salary_type: data.salary_type ?? null,
      salary_amount: data.salary_amount ?? null,
      organization_id: resolvedOrganizationId,
    };


    createMutation.mutate(createPayload, {
      onSuccess: (response: any) => {
        const newUserId = response?.data?.id ? String(response.data.id) : undefined;
        onClose();
        onSuccess?.(newUserId);
      },
    });
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"

        >
          <motion.div
            variants={modalVariants}
            className="relative w-full max-w-2xl bg-base-100 rounded-2xl shadow-xl m-4 max-h-[calc(100dvh-2rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 flex-shrink-0 border-b border-base-content/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                    {isEditMode ? <Edit size={28} /> : <Add size={28} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-2xl text-base-content">
                      {isEditMode ? t("Edit User") : t("Create New User")}
                    </h3>
                    <p className="text-base-content/70 text-sm">
                      {isEditMode
                        ? t("Update user details")
                        : t("Add a new user to the system")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-base-content/10 rounded-lg transition-colors"
                  disabled={isLoading}
                >
                  <CloseCircle className="w-6 h-6 text-heledone-ink-muted" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-6">
              <form onSubmit={onSubmit}>
                <UserForm
                  control={control}
                  errors={errors}
                  editMode={isEditMode}
                  setValue={setValue}
                  organizationId={resolvedOrganizationId}
                />
              </form>
            </div>

            <div className="p-6 flex-shrink-0 border-t border-base-content/10 bg-base-200/30 rounded-b-2xl">
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost rounded-xl"
                  disabled={isLoading}
                >
                  {t("انصراف")}</button>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="btn btn-primary rounded-xl px-6"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-sm"></span>
                      {t("در حال ذخیره…")}</span>
                  ) : isEditMode ? (
                    t("Update User")
                  ) : (
                    t("Create User")
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
};
