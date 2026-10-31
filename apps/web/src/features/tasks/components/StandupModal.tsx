import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import React, { useEffect, useMemo, useState } from "react";

import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar,
  CloseCircle,
  Trash,
  Clock,
  TaskSquare,
  Danger,
} from "iconsax-reactjs";
import { createStandup, updateStandup, deleteStandup } from "../api/tasksApi";
import { getProjects } from "../../projects/api/projectsApi";
import { STANDUP_STRINGS as S } from "../constants/standupStrings";

interface StandupModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  date?: string;
  memberName?: string;
  readOnly?: boolean;
  entryId?: string;
  hideHours?: boolean;
  initial?: {
    hoursWorked?: string;
    todayWork?: string;
    blockers?: string;
  };
  onSaved?: () => void;
  onDeleted?: () => void;
}

interface StandupFormData {
  projectId: string;
  hoursWorked: string;
  todayWork: string;
  blockers: string;
}

const todayIso = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export const StandupModal: React.FC<StandupModalProps> = ({
  isOpen,
  onClose,
  projectId,
  date,
  memberName,
  readOnly = false,
  entryId,
  hideHours = false,
  initial,
  onSaved,
  onDeleted,
}) => {
  const t = useTranslation();
  const targetDate = date ?? todayIso();
  const needsProjectPicker = !projectId;
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<StandupFormData>({
    defaultValues: {
      projectId: projectId ?? "",
      hoursWorked: initial?.hoursWorked ?? "",
      todayWork: initial?.todayWork ?? "",
      blockers: initial?.blockers ?? "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        projectId: projectId ?? "",
        hoursWorked: initial?.hoursWorked ?? "",
        todayWork: initial?.todayWork ?? "",
        blockers: initial?.blockers ?? "",
      });
      setConfirmDelete(false);
    }
  }, [isOpen, projectId, initial, reset]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll to prevent layout shift (scrollbar jump) when modal opens
  useEffect(() => {
    if (!isOpen) return undefined;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [isOpen]);

  const projectsQuery = useQuery({
    queryKey: ["projects-for-standup"],
    queryFn: () => getProjects(),
    enabled: isOpen && needsProjectPicker,
  });

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );

  const dateLabel = useMemo(() => {
    const parsed = new Date(`${targetDate}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? targetDate
      : formatDisplayDate(parsed, "EEEE, d MMMM yyyy");
  }, [targetDate]);


  const onSubmit = async (data: StandupFormData) => {
    const resolvedProjectId = projectId ?? data.projectId;
    try {
      const payload = {
        projectId: resolvedProjectId,
        date: targetDate,
        hoursWorked:
          Math.round(
            Number(hideHours ? (initial?.hoursWorked ?? 0) : data.hoursWorked) *
              100,
          ) / 100,
        todayWork: data.todayWork.trim(),
        blockers: data.blockers,
      };
      if (entryId) {
        await updateStandup(entryId, payload);
      } else {
        await createStandup(payload);
      }
      toast.success(S.toastSavedSuccess);
      if (onSaved) {
        onSaved();
      } else {
        onClose();
      }
    } catch (error) {
      console.error("Failed to save standup", error);
      toast.error(translateError(S.toastSaveFailed));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"

          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {/* Backdrop blur layer */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />

          {/* Modal Card */}
          <motion.div
            className="heledone-glass-dialog relative w-full max-w-md overflow-hidden rounded-3xl border border-base-content/10 bg-base-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 30,
              mass: 0.8,
            }}
          >
        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary/90 to-primary text-primary-content">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-2xl bg-white/20 backdrop-blur-xs">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {S.modalTitle}
              </h2>
              <p className="text-[13px] text-primary-content/80 font-medium">
                {memberName ? `${memberName} · ` : ""}
                {dateLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {readOnly && (
              <span className="rounded-md bg-white/20 px-2 py-0.5 text-[13px] font-bold uppercase text-white">
                {S.viewOnlyBadge}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1 text-primary-content/80 hover:bg-white/20 hover:text-primary-content transition"
            >
              <CloseCircle size={20} />
            </button>
          </div>
        </div>

        {/* Body Form */}
        <form
          id="standup-modal-form"
          onSubmit={handleSubmit(onSubmit)}
          className="p-6 space-y-4 text-xs"
        >
          {needsProjectPicker && (
            <div>
              <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                {S.projectLabel} <span className="text-error">*</span>
              </label>
              <select
                className={`w-full h-9.5 rounded-xl border bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 transition-all ${
                  errors.projectId ? "border-error" : "border-base-content/10"
                }`}
                disabled={readOnly || projectsQuery.isLoading}
                {...register("projectId", { required: S.projectRequired })}
              >
                <option value="" disabled hidden>
                  {S.selectProjectPlaceholder}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {errors.projectId && (
                <p className="mt-1 text-[13px] text-error font-medium">
                  {errors.projectId.message}
                </p>
              )}
            </div>
          )}

          {readOnly ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-base-content/8 bg-base-200/40 p-3">
                <div className="flex items-center gap-2 text-primary font-bold mb-1">
                  <Clock size={15} />
                  <span>{S.hoursWorkedToday.replace(" *", "")}</span>
                </div>
                <p className="text-sm font-extrabold text-base-content ms-6">
                  {initial?.hoursWorked || 0}  {t("Hours")}</p>
              </div>

              {initial?.todayWork && (
                <div className="rounded-xl border border-base-content/8 bg-base-200/40 p-3">
                  <div className="flex items-center gap-2 text-primary font-bold mb-1">
                    <TaskSquare size={15} />
                    <span>{S.whatDidYouDoToday.replace(" *", "")}</span>
                  </div>
                  <p

                    className="text-xs text-base-content/80 leading-relaxed whitespace-pre-wrap ms-6"
                  >
                    {initial.todayWork}
                  </p>
                </div>
              )}

              {initial?.blockers && (
                <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                  <div className="flex items-center gap-2 text-warning font-bold mb-1">
                    <Danger size={15} />
                    <span>{S.blockers}</span>
                  </div>
                  <p

                    className="text-xs text-base-content/80 leading-relaxed whitespace-pre-wrap ms-6"
                  >
                    {initial.blockers}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {!hideHours && (
                <div>
                  <div className="flex items-center justify-between font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                    <span>{S.hoursWorkedToday}</span>
                  </div>

                  {/* Preset hour buttons */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {[2, 4, 6, 8].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setValue("hoursWorked", String(h))}
                        className="flex-1 rounded-lg py-1 text-[13px] font-bold bg-base-200/50 text-heledone-ink-muted hover:bg-primary/15 hover:text-primary transition-all border border-transparent hover:border-primary/20"
                      >
                        {formatUiNumber(h)}  {t("Hours")}</button>
                    ))}
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="24"
                    inputMode="decimal"
                    placeholder={t("e.g. 8.0")}
                    disabled={readOnly}
                    autoFocus
                    className={`w-full h-9.5 rounded-xl border bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 transition-all ${
                      errors.hoursWorked
                        ? "border-error"
                        : "border-base-content/10"
                    }`}
                    {...register("hoursWorked", {
                      required: S.hoursRequired,
                      min: { value: 0, message: t("Hours cannot be negative") },
                      max: {
                        value: 24,
                        message: t("Hours cannot exceed 24 per day"),
                      },
                    })}
                  />
                  {errors.hoursWorked && (
                    <p className="mt-1 text-[13px] text-error font-medium">
                      {errors.hoursWorked.message}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                  {S.whatDidYouDoToday} <span className="text-error">*</span>
                </label>
                <textarea
                  rows={3}

                  placeholder={S.whatDidYouDoTodayPlaceholder}
                  disabled={readOnly}
                  className={`w-full rounded-xl border bg-base-200/50 p-3 font-medium text-base-content outline-none focus:border-primary/40 transition-all resize-none placeholder:text-heledone-ink-muted ${
                    errors.todayWork ? "border-error" : "border-base-content/10"
                  }`}
                  {...register("todayWork", { required: S.todayWorkRequired })}
                />
                {errors.todayWork && (
                  <p className="mt-1 text-[13px] text-error font-medium">
                    {errors.todayWork.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                  {S.blockers}
                </label>
                <textarea
                  rows={2}

                  placeholder={S.blockersPlaceholder}
                  disabled={readOnly}
                  className="w-full rounded-xl border border-base-content/10 bg-base-200/50 p-3 font-medium text-base-content outline-none focus:border-primary/40 transition-all resize-none placeholder:text-heledone-ink-muted"
                  {...register("blockers")}
                />
              </div>
            </>
          )}

          {/* Footer Controls */}
          {!readOnly && (
            <div className="pt-3 border-t border-base-content/8">
              {!confirmDelete ? (
                <div className="flex items-center justify-between">
                  {entryId ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      disabled={isDeleting || isSubmitting}
                      className="inline-flex items-center gap-1 text-xs font-bold text-error hover:text-error transition"
                    >
                      <Trash size={14} />
                      <span>{t("حذف")}</span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="h-9 px-4 rounded-xl border border-base-content/10 text-xs font-bold text-base-content/70 hover:bg-base-200 transition-all"
                    >
                      {S.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-9 px-5 rounded-xl bg-primary text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/95 transition-all inline-flex items-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <span>{t("در حال ذخیره…")}</span>
                      ) : (
                        <span>{S.save}</span>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 bg-error/10 border border-error/20 p-2.5 rounded-xl">
                  <span className="text-xs font-bold text-error dark:text-error">
                    {t("Delete this standup?")}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={async () => {
                        setIsDeleting(true);
                        try {
                          await deleteStandup(entryId!);
                          toast.success(S.toastDeleteSuccess);
                          onDeleted?.();
                          onClose();
                        } catch {
                          toast.error(translateError(S.toastDeleteFailed));
                          setConfirmDelete(false);
                        } finally {
                          setIsDeleting(false);
                        }
                      }}
                      className="h-7 px-3 rounded-lg bg-error text-xs font-bold text-error-content shadow-xs hover:bg-error transition-all"
                    >
                      {isDeleting ? t("Deleting...") : t("Yes, Delete")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-7 px-2.5 rounded-lg border border-base-content/10 text-xs font-bold text-base-content/70 hover:bg-base-200 transition-all"
                    >
                      {t("انصراف")}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StandupModal;
