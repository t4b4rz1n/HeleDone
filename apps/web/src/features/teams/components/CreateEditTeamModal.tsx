import { t as translate, useTranslation } from "../../../i18n/locale";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Add, Edit, CloseCircle } from "iconsax-reactjs";
import { createPortal } from "react-dom";
import { useCreateTeam, useUpdateTeam } from "../hooks/useTeams";
import { TeamForm } from "./TeamForm";
import type { TeamWithDetails } from "../types";
import * as z from "zod";

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 30, scale: 0.98 },
};

const teamSchema = z.object({
  name: z.string().min(3, translate("Team name must be at least 3 characters")),
  description: z.string().optional(),
  lead_id: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

interface CreateEditTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  team?: TeamWithDetails | null;
  organizationId: string;
}

export const CreateEditTeamModal = ({
  isOpen,
  onClose,
  team,
  organizationId,
}: CreateEditTeamModalProps) => {
  const t = useTranslation();
  const isEditMode = !!team;

  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      description: "",
      lead_id: null,
      is_active: true,
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (team) {
      reset({
        name: team.name,
        description: team.description || "",
        lead_id: team.lead_id,
        is_active: !!team.is_active,
      });
    } else {
      reset({ name: "", description: "", lead_id: null, is_active: true });
    }
  }, [isOpen, team, reset]);

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (isEditMode && team) {
        await updateTeam.mutateAsync({ id: team.id, data });
      } else {
        await createTeam.mutateAsync({ ...data, organization: organizationId });
      }
      onClose();
    } catch {
      // Error is handled by the mutation callbacks
    }
  });

  const isLoading = createTeam.isPending || updateTeam.isPending;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-md sm:p-4"

        >
          <motion.div
            variants={modalVariants}
            className="heledone-surface relative m-0 flex max-h-[min(90dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-base-content/10 bg-base-100/95 shadow-heledone-floating backdrop-blur-xl sm:m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 border-b border-base-content/10 bg-base-200/20 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                    {isEditMode ? <Edit size={28} /> : <Add size={28} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-2xl text-base-content">
                      {isEditMode ? t("Edit Team") : t("Create New Team")}
                    </h3>
                    <p className="text-base-content/70 text-sm">
                      {isEditMode
                        ? t("Update team details")
                        : t("Add a new team to Heledone")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="btn btn-ghost btn-square btn-sm rounded-xl text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
                >
                  <CloseCircle className="w-6 h-6 text-heledone-ink-muted" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pt-5 sm:px-6 sm:pt-6">
              <form id="team-form" onSubmit={onSubmit}>
                <TeamForm control={control} errors={errors} organizationId={organizationId} />
              </form>
            </div>

            <div className="flex-shrink-0 border-t border-base-content/10 bg-base-200/30 p-5 text-end sm:p-6">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost rounded-xl"
                >
                  {t("انصراف")}</button>
                <button
                  type="submit"
                  form="team-form"
                  disabled={isLoading}
                  className="btn btn-primary rounded-xl px-6"
                >
                  {isLoading ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : isEditMode ? (
                    t("Update Team")
                  ) : (
                    t("Create Team")
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
