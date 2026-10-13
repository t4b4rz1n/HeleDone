import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { projectPalette } from "../../../core/config/designTokens";
import { CustomDatePicker } from "../../../components/CustomDatePicker";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CloseCircle, FolderAdd, TickCircle } from "iconsax-reactjs";
import { CheckSquare, Flag, HelpCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Project, CreateProjectDTO, ProjectStatus, ProjectProgressMode } from "../types";
import { useCreateProject, useUpdateProject } from "../hooks/useProjects";
import { getOrganizationsForProjects } from "../api/projectsApi";

interface CreateEditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

const PROJECT_COLORS = projectPalette.map(color => ({ label: color.name, value: color.value }));

const sanitizeColor = (colorStr?: string | null): string => {
  if (!colorStr) return PROJECT_COLORS[0].value;
  if (colorStr.length <= 20) return colorStr;
  const hexMatch = colorStr.match(/#[0-9a-fA-F]{3,8}/);
  if (hexMatch) return hexMatch[0];
  return PROJECT_COLORS[0].value;
};

export const CreateEditProjectModal: React.FC<CreateEditProjectModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const createProjectMutation = useCreateProject();
  const updateProjectMutation = useUpdateProject();

  const { data: organizations = [], isLoading: isLoadingOrgs } = useQuery({
    queryKey: ["project-organizations"],
    queryFn: getOrganizationsForProjects,
    enabled: isOpen,
  });

  const [showProgressHelp, setShowProgressHelp] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    organization_id: "",
    description: "",
    color: PROJECT_COLORS[0].value as string,
    budget: "",
    budget_currency: "IRR",
    start_date: "",
    deadline: "",
    status: "active" as ProjectStatus,
    progress_mode: "task_based" as ProjectProgressMode,
  });

  useEffect(() => {
    if (!isOpen) return;

    if (project) {
      setFormData({
        name: project.name || "",
        organization_id:
          typeof project.organization === "object"
            ? String(project.organization.id)
            : String(project.organization || ""),
        description: project.description || "",
        color: sanitizeColor(project.color),
        budget: project.budget ? String(project.budget) : "",
        budget_currency: project.budget_currency || "IRR",
        start_date: project.start_date ? project.start_date.split("T")[0] : "",
        deadline: project.deadline ? project.deadline.split("T")[0] : "",
        status: project.status || "active",
        progress_mode: project.progress_mode || "task_based",
      });
    } else {
      setFormData({
        name: "",
        organization_id: "",
        description: "",
        color: PROJECT_COLORS[0].value as string,
        budget: "",
        budget_currency: "IRR",
        start_date: new Date().toISOString().split("T")[0],
        deadline: "",
        status: "active",
        progress_mode: "task_based",
      });
    }
  }, [project, isOpen]);

  useEffect(() => {
    if (isOpen && !project && organizations.length > 0 && !formData.organization_id) {
      setFormData((prev) => ({
        ...prev,
        organization_id: String(organizations[0].id),
      }));
    }
  }, [isOpen, project, organizations, formData.organization_id]);


  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const selectedOrgId =
      formData.organization_id ||
      (organizations[0]?.id ? String(organizations[0].id) : "");

    if (!project && !selectedOrgId) {
      toast.error(t("Please select an organization first."));
      return;
    }

    const payload: CreateProjectDTO = {
      name: formData.name,
      organization_id: selectedOrgId,
      description: formData.description || undefined,
      color: sanitizeColor(formData.color),
      budget: formData.budget ? Number(formData.budget) : null,
      budget_currency: formData.budget_currency,
      start_date: formData.start_date || null,
      deadline: formData.deadline || null,
      progress_mode: formData.progress_mode,
    };

    const handleApiError = (err: any) => {
      console.error("Project action error:", err);

      if (err?.response?.status === 403 || err?.status_code === 403 || err?.status === 403) {
        toast.error(t("You do not have permission to perform this action."));
        return;
      }

      const errorData = err?.response?.data || err?.data || err;
      let msg = t("Could not save project.");
      if (errorData) {
        if (typeof errorData === "string") msg = errorData;
        else if (errorData.message) msg = errorData.message;
        else if (errorData.detail) msg = errorData.detail;
        else if (typeof errorData === "object") {
          const firstKey = Object.keys(errorData)[0];
          const firstVal = errorData[firstKey];
          msg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
        }
      }
      toast.error(translateError(msg));
    };

    if (project) {
      updateProjectMutation.mutate(
        {
          id: project.id,
          data: { ...payload, status: formData.status },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            toast.success(t("Project updated successfully"));
            onClose();
          },
          onError: handleApiError,
        },
      );
    } else {
      createProjectMutation.mutate(payload, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["projects"] });
          toast.success(t("Project created successfully"));
          onClose();
        },
        onError: handleApiError,
      });
    }
  };

  const isLoading =
    createProjectMutation.isPending || updateProjectMutation.isPending;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-base-content/10 bg-base-100 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header with live gradient preview */}
        <div
          className="relative flex items-center justify-between px-6 py-5 text-base-content bg-base-200 border-b border-heledone-border"
          style={{ borderInlineStart: `4px solid ${formData.color}` }}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-base-100 text-primary">
              <FolderAdd size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                {project ? t("ویرایش پروژه") : t("پروژه تازه")}
              </h3>
              <p className="text-xs text-heledone-ink-muted font-medium">
                {project ? t("مشخصات و تنظیمات پروژه را ویرایش کنید") : t("برای کارهای تیم یک پروژه بسازید")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-heledone-ink-muted hover:bg-base-100 hover:text-base-content transition duration-150"
          >
            <CloseCircle size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {!project && (
            <div>
              <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                {t("Organization")} <span className="text-error">*</span>
              </label>
              <select
                name="organization_id"
                required
                value={formData.organization_id}
                onChange={handleChange}
                disabled={isLoadingOrgs || organizations.length === 0}
                className="w-full h-9.5 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
              >
                {organizations.length === 0 ? (
                  <option value="">{t("No Organizations Found")}</option>
                ) : (
                  organizations.map((org) => (
                    <option key={org.id} value={String(org.id)}>
                      {org.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
              {t("نام پروژه")} <span className="text-error">*</span>
            </label>
            <input
              type="text"
              name="name"

              required
              placeholder={t("e.g. Heledone System")}
              value={formData.name}
              onChange={handleChange}
              className="w-full h-9.5 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
            />
          </div>

          <div>
            <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
              {t("توضیح")}</label>
            <textarea
              name="description"

              rows={2}
              placeholder={t("Brief project summary...")}
              value={formData.description}
              onChange={handleChange}
              className="w-full rounded-xl border border-base-content/10 bg-base-200/50 p-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                {t("Budget (IRR)")}</label>
              <div className="flex">
                <input
                  type="number"
                  name="budget"
                  min="0"
                  placeholder="0.00"
                  value={formData.budget}
                  onChange={handleChange}
                  className="w-full h-9.5 rounded-l-xl border border-e-0 border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                />
                <select
                  name="budget_currency"
                  value={formData.budget_currency}
                  onChange={handleChange}
                  className="h-9.5 rounded-r-xl border border-base-content/10 bg-base-200/50 px-2 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
                >
                  <option value="IRR">{t("IRR")}</option>
                  <option value="USD">{t("USD")}</option>
                  <option value="EUR">{t("EUR")}</option>
                </select>
              </div>
            </div>
            {project && (
              <div>
                <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                  {t("وضعیت")}</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full h-9.5 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
                >
                  <option value="draft">{t("Draft")}</option>
                  <option value="active">{t("فعال")}</option>
                  <option value="on_hold">{t("On Hold")}</option>
                  <option value="completed">{t("Completed")}</option>
                  <option value="archived">{t("Archived")}</option>
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                {t("Start Date")}</label>
              <CustomDatePicker
                value={formData.start_date}
                onChange={(v) => setFormData((prev) => ({ ...prev, start_date: v }))}
              />
            </div>
            <div>
              <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                {t("Deadline")}</label>
              <CustomDatePicker
                value={formData.deadline}
                onChange={(v) => setFormData((prev) => ({ ...prev, deadline: v }))}
              />
            </div>
          </div>

          {/* Color Theme Selector */}
          <div>
            <label className="block font-bold text-heledone-ink-muted mb-2 uppercase tracking-wider text-[13px]">
              {t("Theme Color")}</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setFormData((prev) => ({ ...prev, color: c.value }))}
                  className={`h-8 w-8 rounded-xl transition-all duration-150 relative flex items-center justify-center ${
                    formData.color === c.value
                      ? "ring-2 ring-primary ring-offset-2 scale-105"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ background: c.value }}
                >
                  {formData.color === c.value && (
                    <TickCircle size={14} className="rounded-full bg-neutral text-neutral-content" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Mode Selector */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <label className="block font-bold text-heledone-ink-muted uppercase tracking-wider text-[13px]">
                {t("روش محاسبه پیشرفت")}
              </label>
              <button
                type="button"
                onClick={() => setShowProgressHelp((v) => !v)}
                className="flex items-center justify-center w-4 h-4 rounded-full text-base-content/40 hover:text-primary transition-colors"
                aria-label={t("راهنمای روش محاسبه پیشرفت")}
              >
                <HelpCircle size={14} />
              </button>
            </div>

            {/* Inline help — no absolute positioning */}
            {showProgressHelp && (
              <div className="mb-3 rounded-xl border border-base-content/10 bg-base-200/50 p-3 text-xs space-y-2.5">
                <div className="flex gap-2">
                  <span className="text-primary mt-0.5 shrink-0"><CheckSquare size={13} /></span>
                  <div>
                    <p className="font-bold text-base-content">{t("بر اساس تسک")}</p>
                    <p className="text-base-content/60 leading-relaxed mt-0.5">{t("پیشرفت = تسک‌های انجام‌شده ÷ کل تسک‌ها × ۱۰۰")}</p>
                    <p className="text-base-content/50 mt-0.5">{t("مناسب وقتی milestone ندارید یا می‌خواهید نمای ساده داشته باشید.")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-warning mt-0.5 shrink-0"><Flag size={13} /></span>
                  <div>
                    <p className="font-bold text-base-content">{t("بر اساس مایل‌استون")}</p>
                    <p className="text-base-content/60 leading-relaxed mt-0.5">{t("پیشرفت = وزن milestone‌های تکمیل‌شده ÷ کل وزن × ۱۰۰")}</p>
                    <p className="text-base-content/50 mt-0.5">{t("اگر milestone نسازید، عدد پیشرفت صفر می‌ماند.")}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, progress_mode: 'task_based' }))}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition-all ${
                  formData.progress_mode === 'task_based'
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-base-content/10 bg-base-200/50 text-base-content/70 hover:border-base-content/20'
                }`}
              >
                <CheckSquare size={14} className="shrink-0" />
                <div>
                  <p className="text-[11px] font-bold leading-tight">{t("بر اساس تسک")}</p>
                  <p className="text-[10px] leading-tight opacity-60">{t("درصد = تسک‌های انجام‌شده")}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, progress_mode: 'milestone_based' }))}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition-all ${
                  formData.progress_mode === 'milestone_based'
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-base-content/10 bg-base-200/50 text-base-content/70 hover:border-base-content/20'
                }`}
              >
                <Flag size={14} className="shrink-0" />
                <div>
                  <p className="text-[11px] font-bold leading-tight">{t("بر اساس مایل‌استون")}</p>
                  <p className="text-[10px] leading-tight opacity-60">{t("درصد = مایل‌استون‌های تکمیل‌شده")}</p>
                </div>
              </button>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-base-content/8">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="h-9 px-4 rounded-xl border border-base-content/10 text-xs font-bold text-base-content/70 hover:bg-base-200 transition-all"
            >
              {t("انصراف")}</button>
            <button
              type="submit"
              disabled={isLoading || (!project && organizations.length === 0)}
              className="h-9 px-5 rounded-xl bg-primary text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/95 transition-all inline-flex items-center gap-1.5"
            >
              {isLoading ? (
                <span>{t("در حال ذخیره…")}</span>
              ) : project ? (
                <span>{t("Save Changes")}</span>
              ) : (
                <span>{t("ساخت پروژه")}</span>
              )}
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
