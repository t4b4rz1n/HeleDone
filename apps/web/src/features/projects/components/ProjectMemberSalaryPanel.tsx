import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getIntlLocale, useTranslation } from "../../../i18n/locale";
import { useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarCircle, Edit2, RefreshCircle, TickCircle, CloseCircle } from "iconsax-reactjs";
import { updateProjectMemberSalary, resetProjectMemberSalary } from "../api/projectsApi";
import type { ProjectMember } from "../types";

interface ProjectMemberSalaryPanelProps {
  projectId: string | number;
  members: ProjectMember[];
}

interface EditState {
  memberId: string | number;
  salaryType: "monthly" | "hourly" | "";
  salaryAmount: string;
}

const formatSalary = (type?: string | null, amount?: string | null) => {
  if (!amount) return "—";
  const num = parseFloat(amount);
  if (isNaN(num)) return "—";
  const formatted = num.toLocaleString(getIntlLocale());
  return type === "hourly" ? `${formatted} / hr` : `${formatted} / mo`;
};

export const ProjectMemberSalaryPanel = ({
  projectId,
  members,
}: ProjectMemberSalaryPanelProps) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<EditState | null>(null);

  const updateSalaryMutation = useMutation({
    mutationFn: ({
      memberId,
      data,
    }: {
      memberId: string | number;
      data: { salary_type?: "monthly" | "hourly" | null; salary_amount?: string | null };
    }) => updateProjectMemberSalary(projectId, memberId, data),
    onSuccess: () => {
      toast.success(t("Project salary updated"));
      queryClient.invalidateQueries({ queryKey: ["project-members", String(projectId)] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      setEditState(null);
    },
    onError: () => toast.error(t("Failed to update salary")),
  });

  const resetSalaryMutation = useMutation({
    mutationFn: (memberId: string | number) =>
      resetProjectMemberSalary(projectId, memberId),
    onSuccess: () => {
      toast.success(t("Salary reset to organization level"));
      queryClient.invalidateQueries({ queryKey: ["project-members", String(projectId)] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: () => toast.error(t("Failed to reset salary")),
  });

  const userMembers = members.filter((m) => m.user);

  const handleEdit = (member: ProjectMember) => {
    setEditState({
      memberId: member.id,
      salaryType: (member.salary_type as "monthly" | "hourly") || "",
      salaryAmount: member.salary_amount ?? "",
    });
  };

  const handleSave = () => {
    if (!editState) return;
    updateSalaryMutation.mutate({
      memberId: editState.memberId,
      data: {
        salary_type: editState.salaryType || null,
        salary_amount: editState.salaryAmount || null,
      },
    });
  };

  const handleCancel = () => setEditState(null);

  if (userMembers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-xs text-heledone-ink-muted">
        <DollarCircle size={28} className="opacity-30" />
        <p>{t("No user members in this project")}</p>
      </div>
    );
  }

  const totalMonthly = userMembers
    .filter(m => m.salary_type === "monthly" && m.salary_amount)
    .reduce((sum, m) => sum + parseFloat(m.salary_amount!), 0);

  const totalHourly = userMembers
    .filter(m => m.salary_type === "hourly" && m.salary_amount)
    .reduce((sum, m) => sum + parseFloat(m.salary_amount!), 0);

  const overrideCount = userMembers.filter(m => m.salary_override).length;

  return (
    <div className="space-y-6">
      {/* Salary Overview Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-base-content/8 bg-base-100 p-6"
      >
        <div className="flex items-center gap-2 border-b border-base-content/8 pb-4 mb-5">
          <DollarCircle size={18} className="text-primary" variant="Bold" />
          <h2 className="text-lg font-bold text-base-content">{t("Salary Overview")}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-base-200/50 to-base-200/20 p-5 space-y-3 border border-base-content/5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-heledone-ink-muted">{t("Total Monthly")}</span>
              <div className="p-2 rounded-lg bg-base-content/5 text-base-content/70">
                <DollarCircle size={18} />
              </div>
            </div>
            <p className="text-2xl lg:text-3xl font-black text-base-content truncate" title={totalMonthly.toLocaleString(getIntlLocale())}>
              {totalMonthly > 0 ? totalMonthly.toLocaleString(getIntlLocale()) : "—"}
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-success/10 to-success/5 p-5 space-y-3 border border-success/10 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-success/80">{t("Total Hourly")}</span>
              <div className="p-2 rounded-lg bg-success/15 text-success">
                <DollarCircle size={18} variant="Bold" />
              </div>
            </div>
            <p className="text-2xl lg:text-3xl font-black text-success truncate" title={totalHourly.toLocaleString(getIntlLocale())}>
              {totalHourly > 0 ? totalHourly.toLocaleString(getIntlLocale()) : "—"}
            </p>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-warning/10 to-warning/5 p-5 space-y-3 border border-warning/10 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-warning/80">{t("Overrides")}</span>
              <div className="p-2 rounded-lg bg-warning/15 text-warning">
                <Edit2 size={18} variant="Bold" />
              </div>
            </div>
            <p className="text-2xl lg:text-3xl font-black text-warning">
              {formatUiNumber(overrideCount)}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-base-content/8 bg-base-100 p-6"
      >
        <div className="flex items-center gap-2 border-b border-base-content/8 pb-4 mb-5">
          <DollarCircle size={18} className="text-primary" variant="Bold" />
          <h2 className="text-lg font-bold text-base-content">{t("Member Salaries")}</h2>
          <span className="ms-auto text-xs font-bold text-heledone-ink-muted">
            {formatUiNumber(userMembers.length)}  {t("Members")}</span>
        </div>

        {userMembers.length === 0 ? (
          <p className="text-center text-sm text-heledone-ink-muted py-8">
            {t("No user members in this project.")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {userMembers.map((member, idx) => {
              const displayName =
                `${member.user?.first_name || ""} ${member.user?.last_name || ""}`.trim() ||
                member.user?.username ||
                member.user?.email ||
                t("User");
              const isEditing = editState?.memberId === member.id;
              const isOverride = member.salary_override === true;

              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-xl border border-base-content/6 bg-base-200/40 p-4 hover:bg-base-200/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ProfileAvatar
                        src={member.user?.avatar}
                        name={displayName}
                        className="size-10 shrink-0 overflow-hidden rounded-full ring-2 ring-base-content/10"
                        fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-base-content truncate">{displayName}</p>
                        {member.user?.email && (
                          <p className="text-xs text-heledone-ink-muted truncate">{member.user.email}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-base-content/5">
                    {/* Badge + action buttons */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5">
                        {isOverride ? (
                          <span className="rounded-md bg-warning/12 px-2 py-0.5 text-[13px] font-bold text-warning dark:text-warning">
                            {t("Project Override")}</span>
                        ) : (
                          <span className="rounded-md bg-base-300/60 px-2 py-0.5 text-[13px] font-medium text-heledone-ink-muted">
                            {t("From Org")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isEditing && (
                          <button
                            onClick={() => handleEdit(member)}
                            className="p-1.5 rounded-md text-heledone-ink-muted hover:text-primary hover:bg-base-200 transition-all"
                            title={t("Edit project salary")}
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {isOverride && !isEditing && (
                          <button
                            onClick={() => resetSalaryMutation.mutate(member.id)}
                            disabled={resetSalaryMutation.isPending}
                            className="p-1.5 rounded-md text-heledone-ink-muted hover:text-warning hover:bg-base-200 transition-all"
                            title={t("Reset to org salary")}
                          >
                            <RefreshCircle size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editState.salaryType}
                            onChange={(e) =>
                              setEditState((s) =>
                                s ? { ...s, salaryType: e.target.value as "monthly" | "hourly" | "" } : null
                              )
                            }
                            className="h-8 rounded-lg border border-base-content/10 bg-base-100 px-2 text-[13px] font-semibold text-base-content outline-none focus:border-primary/40 transition-all"
                          >
                            <option value="">{t("No salary")}</option>
                            <option value="monthly">{t("ماهانه")}</option>
                            <option value="hourly">{t("ساعتی")}</option>
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editState.salaryAmount}
                            onChange={(e) =>
                              setEditState((s) =>
                                s ? { ...s, salaryAmount: e.target.value } : null
                              )
                            }
                            placeholder={t("مبلغ")}
                            className="h-8 rounded-lg border border-base-content/10 bg-base-100 px-2 text-[13px] font-semibold text-base-content outline-none focus:border-primary/40 transition-all placeholder:text-heledone-ink-muted"
                          />
                        </div>
                        <p className="text-[13px] text-warning dark:text-warning font-medium leading-tight">
                          {t("⚠ This overrides org-level salary for this project only.")}</p>
                        <div className="flex items-center justify-end gap-1.5 mt-1">
                          <button
                            onClick={handleCancel}
                            className="h-7 px-3 rounded-lg border border-base-content/10 text-[13px] font-bold text-heledone-ink-muted hover:bg-base-200 transition-all inline-flex items-center gap-1"
                          >
                            <CloseCircle size={12} />
                            {t("انصراف")}</button>
                          <button
                            onClick={handleSave}
                            disabled={updateSalaryMutation.isPending}
                            className="h-7 px-3 rounded-lg bg-primary text-[13px] font-bold text-primary-content hover:bg-primary/90 transition-all inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <TickCircle size={12} />
                            {updateSalaryMutation.isPending ? t("در حال ذخیره…") : t("ذخیره")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
                        <div className="flex items-center gap-2 text-primary">
                          <DollarCircle size={16} variant="Bold" />
                          <span className="text-[13px] font-bold uppercase tracking-wider">{t("Salary")}</span>
                        </div>
                        <div className="text-end">
                          <span className="text-sm font-black text-primary">
                            {formatSalary(member.salary_type, member.salary_amount)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};
