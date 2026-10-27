import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AddSquare, Clock } from "iconsax-reactjs";
import { toast } from "sonner";
import { createManualLog } from "../api/attendanceApi";
import type { Task } from "../../tasks/types";

export const ManualTimeLogForm: React.FC<{ taskId?: string | number; tasks?: Task[]; onSuccess?: () => void }> = ({ taskId, tasks = [], onSuccess }) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({ task: taskId?.toString() || "", hours: "", minutes: "", description: "" });
  const mutation = useMutation({
    mutationFn: (data: { task: string | number; start_time: string; end_time: string; description?: string }) => createManualLog(data as any),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["myWeeklyTimesheet"] }); queryClient.invalidateQueries({ queryKey: ["tasks"] }); queryClient.invalidateQueries({ queryKey: ["attendanceTasks"] }); queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["home-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["executive-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["manager-dashboard"] }); queryClient.invalidateQueries({ queryKey: ["finance"] }); toast.success(t("Time logged successfully")); setFormData({ task: taskId?.toString() || "", hours: "", minutes: "", description: "" }); onSuccess?.(); },
    onError: (error: any) => toast.error(translateError(error.response?.data?.detail || error.response?.data?.error || "Could not log time.")),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const hours = Number(formData.hours) || 0;
    const minutes = Number(formData.minutes) || 0;
    if (!formData.task || hours < 0 || minutes < 0 || (hours === 0 && minutes === 0)) { toast.error(t("Choose a task and enter a duration.")); return; }
    const end = new Date();
    const start = new Date(end.getTime() - ((hours * 60 + minutes) * 60_000));
    mutation.mutate({ task: formData.task, start_time: start.toISOString(), end_time: end.toISOString(), description: formData.description.trim() });
  };
  return <form onSubmit={submit} className="heledone-surface rounded-[26px] border border-base-content/10 bg-base-100 p-5 sm:p-6"><div className="flex items-start gap-3"><div className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary"><AddSquare size={20} /></div><div><h2 className="text-base font-semibold">{t("ثبت دستی کارکرد")}</h2><p className="mt-1 text-xs text-heledone-ink-muted">{t("اگر زمان‌سنج را شروع نکرده‌اید، زمان کار را اینجا ثبت کنید.")}</p></div></div><div className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-heledone-ink-muted">{t("تسک")}</span><select required value={formData.task} onChange={(event) => setFormData({ ...formData, task: event.target.value })} disabled={Boolean(taskId) || tasks.length === 0} className="select select-bordered h-11 w-full rounded-xl bg-base-200/60 text-sm font-semibold"><option value="">{t("یک تسک انتخاب کنید…")}</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.key} · {task.title}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-heledone-ink-muted">{t("ساعت")}</span><input type="number" min="0" value={formData.hours} onChange={(event) => setFormData({ ...formData, hours: event.target.value })} className="input input-bordered h-11 w-full rounded-xl bg-base-200/60" placeholder="0" /></label><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-heledone-ink-muted">{t("دقیقه")}</span><input type="number" min="0" max="59" value={formData.minutes} onChange={(event) => setFormData({ ...formData, minutes: event.target.value })} className="input input-bordered h-11 w-full rounded-xl bg-base-200/60" placeholder="30" /></label></div><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-heledone-ink-muted">{t("یادداشت")} <span className="font-normal normal-case tracking-normal">{t("(optional)")}</span></span><textarea value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} className="textarea textarea-bordered min-h-20 w-full resize-y rounded-xl bg-base-200/60 text-sm" placeholder={t("What did you work on?")} /></label><button type="submit" disabled={mutation.isPending || !formData.task || tasks.length === 0} className="motion-interactive inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-bold text-secondary-content hover:bg-secondary/90 disabled:opacity-50"><Clock size={17} />{mutation.isPending ? t("در حال ذخیره…") : t("ثبت کارکرد")}</button>{tasks.length === 0 && <p className="text-xs text-warning">{t("Create or select a task before logging time.")}</p>}</div></form>;
};
