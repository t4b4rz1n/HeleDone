import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from 'date-fns';
import { Login, Logout, Timer1 } from "iconsax-reactjs";
import { toast } from "sonner";
import { checkIn, checkOut, getTodayAttendance, getOrganizations } from "../api/attendanceApi";
import { useAttendanceStore } from "../store/useAttendanceStore";
import type { Attendance } from "../types";

interface MutationError {
  detail?: string;
  message?: string;
  status?: boolean;
  [key: string]: unknown;
}

const formatSeconds = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const CheckInOut: React.FC = () => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useAttendanceStore();

  // Fallback: if the store has no activeOrganizationId (e.g. on fresh load),
  // resolve from the API — same strategy as UserDashboardPage.
  const orgsQuery = useQuery({
    queryKey: ["user-organizations"],
    queryFn: getOrganizations,
    enabled: !activeOrganizationId,
    staleTime: 60_000,
  });

  const resolvedOrgId: string | undefined =
    activeOrganizationId || orgsQuery.data?.[0]?.id;

  // Use retry: false for 404s (not checked in yet)
  const {
    data: todayAttendance,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["today-attendance"],
    queryFn: getTodayAttendance,
    retry: false,
  });

  const [timer, setTimer] = useState(0);

  // Safely extract data in case it's wrapped in an envelope
  const attendanceData = (todayAttendance as any)?.data ?? todayAttendance;

  const isActive = attendanceData?.is_active || false;

  useEffect(() => {
    // Initial sync
    setTimer(attendanceData?.total_seconds || 0);

    const interval = setInterval(() => {
      const now = Date.now();
      const todayStr = format(now, "yyyy-MM-dd");

      // If we crossed midnight and the active attendance is from yesterday
      if (attendanceData?.date && attendanceData.date !== todayStr) {
        queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
        clearInterval(interval);
        return;
      }

      if (isActive && attendanceData?.active_session_start) {
        // Calculate real time elapsed since the session actually started
        const startTime = new Date(
          attendanceData.active_session_start,
        ).getTime();
        const diffSeconds = Math.floor((now - startTime) / 1000);
        setTimer((attendanceData.base_total_seconds || 0) + diffSeconds);
      } else if (!isActive) {
        setTimer(attendanceData?.total_seconds || 0);
      }
    }, 1000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    isActive,
    attendanceData?.date,
    attendanceData?.total_seconds,
    attendanceData?.active_session_start,
    attendanceData?.base_total_seconds,
    dataUpdatedAt,
    queryClient,
  ]);

  const checkInMutation = useMutation<Attendance, MutationError, string>({
    mutationFn: (organizationId: string) => checkIn(organizationId),
    onSuccess: (data) => {
      queryClient.setQueryData(["today-attendance"], data);
      queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
      toast.success(t("Timer started (Checked in)"));
    },
    onError: (error: MutationError) =>
      toast.error(
        translateError(error?.detail || error?.message || "Could not complete action."),
      ),
  });

  const checkOutMutation = useMutation<Attendance, MutationError, void>({
    mutationFn: checkOut,
    onSuccess: (data) => {
      queryClient.setQueryData(["today-attendance"], data);
      queryClient.invalidateQueries({ queryKey: ["today-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["home-dashboard"] });
      toast.success(t("Timer stopped (Checked out)"));
    },
    onError: (error: MutationError) =>
      toast.error(
        translateError(error?.detail || error?.message || "Could not complete action."),
      ),
  });

  if (isLoading)
    return <div className="h-32 animate-pulse rounded-[26px] bg-base-100" />;

  return (
    <section className="heledone-surface rounded-[26px] border border-base-content/10 bg-base-100 p-5 sm:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success/10 text-success">
            <Timer1 size={23} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase  text-success">
              {t("حضور و کارکرد")}</p>
            <h2 className="mt-1 text-lg font-semibold">
              {formatDisplayDate(new Date(), "EEEE, d MMMM yyyy")}
            </h2>
            <p className="mt-1 text-xs text-heledone-ink-muted">
              {t("Record your working time. You can pause and resume.")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-start">
            <p className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
              {t("Total Time")}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-base-content">
              {formatSeconds(timer)}
            </p>
          </div>

          {!isActive ? (
            <button
              type="button"
              onClick={() =>
                resolvedOrgId
                  ? checkInMutation.mutate(resolvedOrgId)
                  : toast.warning(
                      t("Please select or join an active organization first"),
                    )
              }
              disabled={checkInMutation.isPending}
              className="btn btn-success text-success-content px-6 rounded-xl font-bold h-11 min-h-[44px] gap-2 shadow-sm shadow-success/20 hover:shadow-md hover:shadow-success/30 transition-all"
            >
              <Login size={16} />  {t("Check in")}</button>
          ) : (
            <button
              type="button"
              onClick={() => checkOutMutation.mutate()}
              disabled={checkOutMutation.isPending}
              className="btn btn-error text-error-content px-6 rounded-xl font-bold h-11 min-h-[44px] gap-2 shadow-sm shadow-error/20 hover:shadow-md hover:shadow-error/30 transition-all"
            >
              <Logout size={16} />  {t("Check out")}</button>
          )}
        </div>
      </div>
    </section>
  );
};
