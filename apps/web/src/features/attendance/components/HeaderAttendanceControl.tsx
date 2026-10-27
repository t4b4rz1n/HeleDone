import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../../../i18n/locale';
import { getErrorMessage as translateError } from '../../../core/utils/errorHandler';
import { checkIn, checkOut, getOrganizations, getTodayAttendance } from '../api/attendanceApi';

export const HeaderAttendanceControl = () => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState(0);
  const { data: attendance, isLoading: isAttendanceLoading } = useQuery({
    queryKey: ['today-attendance'],
    queryFn: getTodayAttendance,
    refetchInterval: 30_000,
  });
  const { data: organizations = [] } = useQuery({
    queryKey: ['attendance-organizations'],
    queryFn: getOrganizations,
    staleTime: 5 * 60_000,
  });
  const isCheckedIn = Boolean(attendance?.check_in && !attendance?.check_out);

  useEffect(() => {
    if (!isCheckedIn || !attendance?.check_in) {
      setElapsed(0);
      return;
    }
    const startedAt = new Date(attendance.check_in).getTime();
    const updateElapsed = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [attendance?.check_in, isCheckedIn]);

  const checkInMutation = useMutation({
    mutationFn: () => {
      const organizationId = organizations[0]?.id;
      if (!organizationId) throw new Error('No organization');
      return checkIn(organizationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['employee-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['home-dashboard'] });
    },
    onError: (error: any) => toast.error(translateError(error.response?.data?.detail || t('ثبت ورود ممکن نشد'))),
  });
  const checkOutMutation = useMutation({
    mutationFn: checkOut,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
      toast.success(t('خروج شما با موفقیت ثبت شد'));
      queryClient.invalidateQueries({ queryKey: ['employee-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['home-dashboard'] });
    },
    onError: (error: any) => toast.error(translateError(error.response?.data?.detail || t('ثبت خروج ممکن نشد'))),
  });

  const duration = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}`;

  if (isCheckedIn) {
    return (
      <button
        type="button"
        onClick={() => checkOutMutation.mutate()}
        disabled={checkOutMutation.isPending}
        className="hidden items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-bold text-success transition hover:bg-success/20 sm:inline-flex"
        title={t('کلیک برای ثبت خروج')}
      >
        <Clock3 size={14} className="animate-pulse" />
        <span className="tabular-nums">{duration}</span>
        <LogOut size={13} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => checkInMutation.mutate()}
      disabled={isAttendanceLoading || checkInMutation.isPending || organizations.length === 0}
      className="hidden items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-45 sm:inline-flex"
      title={t('کلیک برای ثبت ورود')}
    >
      <LogIn size={14} />
      <span>{t('ثبت ورود')}</span>
    </button>
  );
};
