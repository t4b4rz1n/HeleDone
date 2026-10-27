import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { CustomDatePicker } from "../../../components/CustomDatePicker";
import React, { useState, useEffect } from "react";
import { CloseCircle, Calendar1, Edit2 } from "iconsax-reactjs";
import { useUpdateMilestone } from "../hooks/useProjects";
import { toast } from "sonner";
import type { Milestone } from "../types";

interface EditMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | number;
  milestone: Milestone | null;
}

export const EditMilestoneModal: React.FC<EditMilestoneModalProps> = ({
  isOpen,
  onClose,
  projectId,
  milestone,
}) => {
  const t = useTranslation();
  const updateMilestoneMutation = useUpdateMilestone(projectId, milestone?.id || "");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [weight, setWeight] = useState(1);

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title || "");
      setDescription(milestone.description || "");
      setTargetDate(milestone.target_date || "");
      setWeight(milestone.weight || 1);
    }
  }, [milestone]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error(t("Please enter a title for the milestone."));
      return;
    }

    if (weight > 100) {
      toast.error(t("Weight cannot exceed 100."));
      return;
    }

    if (!targetDate) {
      toast.error(t("Please select a target completion date."));
      return;
    }

    updateMilestoneMutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate,
        weight: Number(weight),
      },
      {
        onSuccess: () => {
          toast.success(t("Milestone updated successfully!"));
          onClose();
        },
        onError: (error: unknown) => toast.error(translateError(error, "Could not update milestone.")),
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"

    >
      <div
        className="heledone-surface w-full max-w-lg rounded-[28px] border border-base-content/10 bg-base-100 p-6 shadow-2xl animate-in fade-in zoom-in duration-200 sm:p-7"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-content/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Edit2 size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-base-content">
                {t("Edit Milestone")}</h3>
              <p className="mt-0.5 text-xs text-heledone-ink-muted">
                {t("Update milestone details.")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
          >
            <CloseCircle size={22} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-2 block text-xs font-medium text-base-content">
              {t("Milestone Title")} <span className="text-error">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={t("e.g. Beta Release, Design Sign-off")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input input-bordered w-full rounded-xl bg-base-200/60"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-base-content">
              {t("توضیح")}</label>
            <textarea
              rows={3}
              placeholder={t("Provide context or key deliverables for this milestone...")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea textarea-bordered w-full rounded-xl bg-base-200/60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
             <label className="mb-2 flex items-center gap-1 text-xs font-medium text-base-content">
                <Calendar1 size={14} />  {t("Target Date")} <span className="text-error">*</span>
              </label>
              <CustomDatePicker
                value={targetDate}
                onChange={setTargetDate}
                triggerClassName="w-full p-3 bg-base-200/60 border border-base-content/20 rounded-xl text-start hover:border-primary/50 transition-colors"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-base-content">
                {t("Weight / Progress Impact")}</label>
              <input
                type="number"
                min="1"
                max="100"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="input input-bordered w-full rounded-xl bg-base-200/60"
              />
              <p className="text-[13px] text-heledone-ink-muted mt-1.5">
                {t("(e.g., The weight is calculated relative to the total weight of all defined milestones.)")}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-heledone-ink-muted hover:bg-base-200"
            >
              {t("انصراف")}</button>
            <button
              type="submit"
              disabled={updateMilestoneMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-content transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {updateMilestoneMutation.isPending ? t("Updating...") : t("Update Milestone")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
