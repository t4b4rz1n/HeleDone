import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Stop, TaskSquare, Timer1, Trash } from "iconsax-reactjs";
import { toast } from "sonner";
import { cancelTimer, getActiveTimers, startTimer, stopTimer } from "../api/attendanceApi";
import type { TimeLog } from "../types";
import type { Task } from "../../tasks/types";

interface LiveTimerProps { tasks?: Task[]; }

const sameId = (left: string | number | undefined, right: string | number | undefined) => left?.toString() === right?.toString();
const formatTime = (totalSeconds: number) => [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60].map((part) => part.toString().padStart(2, "0")).join(":");

const ActiveTimerRow = ({ timer, tasks, invalidate }: { timer: TimeLog; tasks: Task[]; invalidate: () => void }) => {
  const t = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const activeTask = tasks.find((task) => sameId(task.id, timer.task));

  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [timer.start_time]);

  const stopMutation = useMutation({ mutationFn: () => stopTimer(timer.id), onSuccess: () => { invalidate(); toast.success(t("Time logged")); }, onError: (error: any) => toast.error(translateError(error.response?.data?.detail || "Could not stop the timer.")) });
  const cancelMutation = useMutation({ mutationFn: () => cancelTimer(timer.id), onSuccess: () => { invalidate(); toast.success(t("Timer cancelled")); }, onError: () => toast.error(t("Could not cancel the timer.")) });

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-primary/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p className="text-4xl font-semibold tabular-nums tracking-tight text-base-content sm:text-5xl">{formatTime(elapsed)}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-heledone-ink-muted"><TaskSquare size={14} /> {activeTask?.key || t("Task {value0}", { value0: timer.task })}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} className="motion-interactive inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-content shadow-lg shadow-primary/15 hover:bg-primary/90 disabled:opacity-50"><Stop size={17} variant="Bold" />  {t("Stop & save")}</button>
        <button type="button" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="motion-interactive grid size-11 place-items-center rounded-xl border border-base-content/10 bg-base-100 text-heledone-ink-muted hover:bg-error/10 hover:text-error" aria-label={t("Cancel timer")}><Trash size={17} /></button>
      </div>
    </div>
  );
};

export const LiveTimer: React.FC<LiveTimerProps> = ({ tasks = [] }) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const { data: activeTimers = [] } = useQuery<TimeLog[]>({ queryKey: ["activeTimers"], queryFn: getActiveTimers, refetchInterval: 15_000 });
  const hasActiveTimers = activeTimers.length > 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["activeTimers"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["attendanceTasks"] });
    queryClient.invalidateQueries({ queryKey: ["myWeeklyTimesheet"] });
    queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["executive-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["manager-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["finance"] });
  };
  const startMutation = useMutation({ mutationFn: () => startTimer(selectedTaskId), onSuccess: () => { invalidate(); toast.success(t("زمان‌سنج شروع شد")); }, onError: (error: any) => toast.error(translateError(error.response?.data?.detail || "Could not start the timer.")) });

  return <section className="heledone-surface overflow-hidden rounded-[26px] border border-base-content/10 bg-base-100"><div className="flex flex-col gap-5 p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={`grid size-12 place-items-center rounded-2xl ${hasActiveTimers ? "bg-primary text-primary-content shadow-lg shadow-primary/20" : "bg-primary/10 text-primary"}`}><Timer1 size={25} variant={hasActiveTimers ? "Bold" : "Outline"} /></div><div><p className="text-xs font-bold uppercase  text-primary">{t("زمان‌سنج تمرکز")}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-base-content">{hasActiveTimers ? t("زمان کار شما در حال ثبت است") : t("زمان کارتان را ثبت کنید")}</h2><p className="mt-1 text-sm text-heledone-ink-muted">{hasActiveTimers ? t("زمان‌سنج فعال دارید.") : t("تسک را انتخاب و زمان‌سنج را شروع کنید؛ پس از پایان کار، آن را متوقف کنید.")}</p></div></div>{hasActiveTimers && <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[13px] font-bold text-success"><span className="size-1.5 animate-pulse rounded-full bg-success" />  {t("Live")}</span>}</div>
      {hasActiveTimers && (
        <div className="flex flex-col gap-4">
          {activeTimers.map((timer) => <ActiveTimerRow key={timer.id} timer={timer} tasks={tasks} invalidate={invalidate} />)}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row mt-2">
        <label className="flex-1"><span className="sr-only">{t("Choose a task")}</span><select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)} className="select select-bordered h-12 w-full rounded-xl bg-base-200/60 text-sm font-semibold" disabled={tasks.length === 0}><option value="">{t("Choose a task to track...")}</option>{tasks.map((task) => {
          const isRunning = activeTimers.some(t => sameId(t.task, task.id));
          return <option key={task.id} value={task.id} disabled={isRunning}>{task.key} · {task.title}{isRunning ? ` (${t("Running")})` : ""}</option>;
        })}</select></label><button type="button" onClick={() => startMutation.mutate()} disabled={!selectedTaskId || startMutation.isPending || activeTimers.some(t => sameId(t.task, selectedTaskId))} className="motion-interactive inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-content shadow-lg shadow-primary/15 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"><Play size={17} variant="Bold" />  {t("Start new timer")}</button>
      </div>

      {!hasActiveTimers && tasks.length === 0 && <p className="flex items-center gap-2 text-xs font-medium text-warning"><Pause size={14} />  {t("No tasks are available on the selected board. Open a board or create a task first.")}</p>}
    </div></section>;
};
