import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { formatDisplayDate } from "../../../utils/date";
import { useTranslation, getIntlLocale } from "../../../i18n/locale";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DoranDate } from '@doranjs/core';
import { toast } from 'sonner';
import {
  ArrowLeft2,
  ArrowRight2,
  Check,
  NoteText,
  Calendar,
  ArrowDown2,
  TickCircle,
  Folder,
} from 'iconsax-reactjs';
import { getStandupGrid, getMyStandupGrid, updateStandupHours } from '../api/tasksApi';
import { getProjects } from '../../projects/api/projectsApi';
import { useAuthStore } from '../../auth/store/authStore';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { STANDUP_STRINGS as S } from '../constants/standupStrings';
import { StandupModal } from './StandupModal';
import type { StandupGridData, StandupGridEntry, StandupGridMember } from '../types';

const PASTEL_COLORS = ['#EAF5F2', '#A7D4CD', '#C6E6E1', '#A7D4CD', '#D8E6D6', '#F7DFAD', '#F5D3C6', '#F5D3C6'];

const pad2 = (value: number): string => String(value).padStart(2, '0');

const SELECTED_PROJECT_STORAGE_KEY = 'madar:standups:selectedProjectId';
const MEMBER_COL_WIDTH_STORAGE_KEY = 'madar:standups:memberColWidth';
const MEMBER_COL_WIDTH_DEFAULT = 176;
const MEMBER_COL_WIDTH_MIN = 120;
const MEMBER_COL_WIDTH_MAX = 460;

function formatDecimalHours(decimalValue: number | string | null | undefined): string {
  const num = Number(decimalValue);
  if (!num || isNaN(num) || num <= 0) return '00:00';
  const h = Math.floor(num);
  const m = Math.round((num - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalised cell shape shared by both matrix variants. */
interface MatrixCell {
  id: string;
  hours: string;
  isComplete: boolean;
  todayWork: string;
  blockers: string;
}

/** Normalised row shape: a team member (team view) or a project (self view). */
interface MatrixRow {
  id: string;
  label: string;
  sublabel?: string;
  total: number;
  color?: string;
  projectId?: string;
  avatarUrl?: string | null;
}

interface CellModalState {
  rowId: string;
  rowName: string;
  projectId: string;
  isoDate: string;
}

interface HourDrafts {
  [key: string]: string;
}

interface StandupMatrixProps {
  title?: string;
  forceSelfView?: boolean;
}

const cellKey = (rowId: string, isoDate: string): string => `${rowId}:${isoDate}`;

/**
 * Standup matrix embedded in the Today & Focus page.
 *
 * Two variants are picked automatically from the backend response:
 * - Team — one row per team member (owners/admins).
 * - Self — one row per project for the signed-in user (regular members),
 *   because the backend only returns their own standups.
 */
export const StandupMatrix: React.FC<StandupMatrixProps> = ({
  title = S.gridTitle,
  forceSelfView = false,
}) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const calendarPref = useAuthStore((state) => state.user?.calendar_preference) || 'jalali';

  const now = new Date();
  const initialPref = useAuthStore.getState().user?.calendar_preference || 'jalali';
  const initialCursor = initialPref === 'jalali'
    ? { year: DoranDate.fromGregorian(now).year, month: DoranDate.fromGregorian(now).month }
    : { year: now.getFullYear(), month: now.getMonth() + 1 };

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) ?? '',
  );
  const [cursor, setCursor] = useState(initialCursor);
  const [prevPref, setPrevPref] = useState(initialPref);
  const [memberColWidth, setMemberColWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(MEMBER_COL_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MEMBER_COL_WIDTH_MIN && stored <= MEMBER_COL_WIDTH_MAX
      ? stored
      : MEMBER_COL_WIDTH_DEFAULT;
  });
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = { startX: event.clientX, startWidth: memberColWidth };

    const handleMove = (moveEvent: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const next = Math.min(
        MEMBER_COL_WIDTH_MAX,
        Math.max(MEMBER_COL_WIDTH_MIN, state.startWidth + (moveEvent.clientX - state.startX)),
      );
      setMemberColWidth(next);
    };

    const handleUp = () => {
      resizeStateRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      setMemberColWidth((width) => {
        localStorage.setItem(MEMBER_COL_WIDTH_STORAGE_KEY, String(width));
        return width;
      });
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [memberColWidth]);

  React.useEffect(() => {
    if (calendarPref !== prevPref) {
      if (calendarPref === 'jalali') {
        const jd = DoranDate.fromGregorian(new Date(cursor.year, cursor.month - 1, 1));
        setCursor({ year: jd.year, month: jd.month });
      } else {
        const gd = DoranDate.fromJalali(cursor.year, cursor.month, 1).toGregorian();
        setCursor({ year: gd.getFullYear(), month: gd.getMonth() + 1 });
      }
      setPrevPref(calendarPref);
    }
  }, [calendarPref, cursor, prevPref]);

  const [modalState, setModalState] = useState<CellModalState | null>(null);
  const [hourDrafts, setHourDrafts] = useState<HourDrafts>({});
  const [isProjDropdownOpen, setIsProjDropdownOpen] = useState(false);
  const [savingCellKeys, setSavingCellKeys] = useState<Set<string>>(() => new Set());
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const projDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projDropdownRef.current && !projDropdownRef.current.contains(e.target as Node)) {
        setIsProjDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: () => getProjects() });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === String(selectedProjectId)) || projects[0],
    [projects, selectedProjectId],
  );
  const selectedProjectIndex = useMemo(
    () => projects.findIndex((p) => String(p.id) === String(selectedProject?.id)),
    [projects, selectedProject],
  );
  const selectedProjectColor =
    selectedProject?.color || PASTEL_COLORS[selectedProjectIndex % PASTEL_COLORS.length];

  React.useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, selectedProjectId);
    }
  }, [selectedProjectId]);

  React.useEffect(() => {
    if (!projectsQuery.isSuccess || projects.length === 0) return;
    if (!projects.some((project) => String(project.id) === selectedProjectId)) {
      setSelectedProjectId(String(projects[0].id));
    }
  }, [projectsQuery.isSuccess, projects, selectedProjectId]);
  /** Gregorian year/month or Jalali ISO range for the current cursor. */
  const dateParams = useMemo(() => {
    if (calendarPref === 'jalali') {
      const startDoran = DoranDate.fromJalali(cursor.year, cursor.month, 1);
      const endDoran = DoranDate.fromJalali(cursor.year, cursor.month, startDoran.daysInMonth);
      return {
        start_date: format(startDoran.toGregorian(), 'yyyy-MM-dd'),
        end_date: format(endDoran.toGregorian(), 'yyyy-MM-dd'),
      };
    }
    return { year: cursor.year, month: cursor.month };
  }, [cursor, calendarPref]);

  const gridQuery = useQuery({
    queryKey: ['standup-grid', selectedProjectId, cursor.year, cursor.month, calendarPref],
    queryFn: () => getStandupGrid(selectedProjectId, dateParams),
    enabled: Boolean(selectedProjectId),
    // A 403 here (regular member, not a project member) flips us to the self
    // grid — retrying just delays that fallback.
    retry: false,
  });
  const grid: StandupGridData | undefined = gridQuery.data;

  /**
   * The backend returns every active member for owners/admins and a single
   * row (the caller) for regular members. That difference is the source of
   * truth for choosing the variant — it stays org-scoped on the server.
   *
   * Also fall back to the self view when the team grid is unavailable: no
   * project selected yet, the request failed (user is an org member but not
   * a project member), or the project only exposes the caller. Without this
   * a regular member can get stuck on an empty team view.
   */
  const { isStaff, hasPermission } = usePermissions();
  const canViewTeam = isStaff || hasPermission('org.manage_settings');
  const isSelfView = forceSelfView || !canViewTeam;

  const myGridQuery = useQuery({
    queryKey: ['my-standup-grid', currentUserId, cursor.year, cursor.month, calendarPref],
    queryFn: () => getMyStandupGrid(dateParams),
    enabled: isSelfView,
  });

  const days = useMemo(() => {
    if (!isSelfView && grid?.days_in_month) {
      return Array.from({ length: grid.days_in_month }, (_, i) => i + 1);
    }
    if (calendarPref === 'jalali') {
      const start = DoranDate.fromJalali(cursor.year, cursor.month, 1);
      return Array.from({ length: start.daysInMonth }, (_, i) => i + 1);
    }
    return Array.from(
      { length: new Date(cursor.year, cursor.month, 0).getDate() },
      (_, i) => i + 1,
    );
  }, [isSelfView, grid?.days_in_month, calendarPref, cursor.year, cursor.month]);

  const dayIso = useCallback(
    (day: number): string => {
      if (calendarPref === 'jalali') {
        return format(DoranDate.fromJalali(cursor.year, cursor.month, day).toGregorian(), 'yyyy-MM-dd');
      }
      return `${cursor.year}-${pad2(cursor.month)}-${pad2(day)}`;
    },
    [cursor.year, cursor.month, calendarPref],
  );

  const todayIso = useMemo(
    () => grid?.today ?? myGridQuery.data?.today ?? format(new Date(), 'yyyy-MM-dd'),
    [grid?.today, myGridQuery.data?.today],
  );

  /** Normalised rows + cell index for whichever variant is active. */
  const { rows, cellIndex } = useMemo(() => {
    const index = new Map<string, MatrixCell>();

    if (isSelfView) {
      const data = myGridQuery.data;

      (data?.entries ?? []).forEach((entry) => {
        const projectId = String(entry.project_id);
        index.set(cellKey(projectId, entry.date), {
          id: String(entry.id),
          hours: String(entry.hours_worked),
          isComplete: Boolean((entry.today_work ?? '').trim()),
          todayWork: entry.today_work ?? '',
          blockers: entry.blockers ?? '',
        });
      });

      // Rows = the user's own projects (one row per project they logged on).
      const matrixRows: MatrixRow[] = (data?.projects ?? []).map((p, i) => ({
        id: String(p.id),
        projectId: String(p.id),
        label: p.name,
        sublabel: p.prefix,
        total: Number(p.total_hours) || 0,
        color: p.color || PASTEL_COLORS[i % PASTEL_COLORS.length],
      }));

      return { rows: matrixRows, cellIndex: index };
    }

    (grid?.entries ?? []).forEach((entry: StandupGridEntry) => {
      index.set(cellKey(entry.user_id, entry.date), {
        id: entry.id,
        hours: entry.hours_worked,
        isComplete: entry.is_complete,
        todayWork: entry.today_work ?? '',
        blockers: entry.blockers ?? '',
      });
    });

    const matrixRows: MatrixRow[] = (grid?.members ?? []).map((member: StandupGridMember) => ({
      id: String(member.id),
      label: [member.first_name, member.last_name].filter(Boolean).join(' ') || member.username,
      sublabel: member.username ? `@${member.username}` : undefined,
      total: Number(member.total_hours) || 0,
      projectId: selectedProjectId,
      avatarUrl: member.avatar_url,
    }));

    return { rows: matrixRows, cellIndex: index };
  }, [isSelfView, myGridQuery.data, grid?.entries, grid?.members, selectedProjectId]);

  const isOwnRow = useCallback(
    (row: MatrixRow): boolean =>
      !isSelfView && currentUserId != null && String(row.id) === String(currentUserId),
    [isSelfView, currentUserId],
  );

  const canWrite = isSelfView ? true : Boolean(grid?.can_write);

  const canEditCell = useCallback(
    (row: MatrixRow, isoDate: string): boolean => {
      if (!canWrite) return false;
      if (isoDate > todayIso) return false;
      return isSelfView || isOwnRow(row);
    },
    [canWrite, todayIso, isSelfView, isOwnRow],
  );

  const savedHours = useCallback(
    (rowId: string, isoDate: string): string | null => {
      const entry = cellIndex.get(cellKey(rowId, isoDate));
      if (!entry) return null;
      const hours = Number(entry.hours);
      return Number.isFinite(hours)
        ? String(Number.isInteger(hours) ? hours : Number(hours.toFixed(2)))
        : null;
    },
    [cellIndex],
  );

  const shiftMonth = useCallback((delta: number) => {
    setCursor((prev) => {
      if (calendarPref === 'jalali') {
        let newMonth = prev.month + delta;
        let newYear = prev.year;
        while (newMonth > 12) { newMonth -= 12; newYear += 1; }
        while (newMonth < 1) { newMonth += 12; newYear -= 1; }
        return { year: newYear, month: newMonth };
      }
      const shifted = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
    });
  }, [calendarPref]);

  const handleOpenCell = useCallback(
    (row: MatrixRow, day: number) => {
      const isoDate = dayIso(day);
      const editable = canEditCell(row, isoDate);
      const entry = cellIndex.get(cellKey(row.id, isoDate));

      if (!editable && !entry) return;
      if (!row.projectId) return;

      setModalState({
        rowId: row.id,
        rowName: row.label,
        projectId: row.projectId,
        isoDate,
      });
    },
    [canEditCell, dayIso, cellIndex],
  );

  const activeCell = useMemo(() => {
    if (!modalState) return null;
    const entry = cellIndex.get(cellKey(modalState.rowId, modalState.isoDate));
    const draft = hourDrafts[cellKey(modalState.rowId, modalState.isoDate)];
    const row = rows.find((r) => r.id === modalState.rowId);
    const saved = savedHours(modalState.rowId, modalState.isoDate);
    const hasHours = Boolean((draft ?? '') !== '') || Boolean(saved && Number(saved) > 0);
    return {
      entryId: entry?.id,
      readOnly: row ? !canEditCell(row, modalState.isoDate) : true,
      hideHours: hasHours,
      initial: {
        hoursWorked: draft ?? saved ?? '',
        todayWork: entry?.todayWork ?? '',
        blockers: entry?.blockers ?? '',
      },
    };
  }, [modalState, cellIndex, hourDrafts, rows, canEditCell, savedHours]);

  const invalidateMatrix = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['standup-grid', selectedProjectId, cursor.year, cursor.month],
    });
    queryClient.invalidateQueries({
      queryKey: ['my-standup-grid', currentUserId, cursor.year, cursor.month],
    });
  }, [queryClient, selectedProjectId, cursor.year, cursor.month, currentUserId]);

  const handleSaved = useCallback(() => {
    if (modalState) {
      const key = cellKey(modalState.rowId, modalState.isoDate);
      setHourDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setModalState(null);
    invalidateMatrix();
  }, [modalState, invalidateMatrix]);

  const handleEnterOnCell = useCallback(
    async (row: MatrixRow, day: number) => {
      const isoDate = dayIso(day);
      const key = cellKey(row.id, isoDate);
      const entry = cellIndex.get(key);

      if (!entry) {
        handleOpenCell(row, day);
        return;
      }

      const draft = hourDrafts[key];
      const saved = savedHours(row.id, isoDate);
      if (savingCellKeys.has(key)) return;

      const parsedHours = Number((draft ?? '').trim());
      if ((draft ?? '') !== '' && !Number.isFinite(parsedHours)) return;
      if (parsedHours > 24) {
        toast.error(t("Hours worked cannot exceed 24 hours per day."));
        return;
      }
      if (parsedHours < 0) {
        toast.error(t("Hours worked cannot be negative."));
        return;
      }

      const hoursWorked = Math.max(
        0,
        Math.min(24, Number.isFinite(parsedHours) ? Math.round(parsedHours * 100) / 100 : 0),
      );
      if (Number(saved ?? 0) === hoursWorked) return;

      setSavingCellKeys((prev) => new Set(prev).add(key));
      try {
        await updateStandupHours(entry.id, hoursWorked);
        toast.success(S.toastSavedSuccess);
        setHourDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        invalidateMatrix();
      } catch (error) {
        console.error('Failed to quick-save standup hours', error);
        toast.error(translateError(S.toastSaveFailed));
      } finally {
        setSavingCellKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [dayIso, cellIndex, hourDrafts, savingCellKeys, savedHours, handleOpenCell, invalidateMatrix, t],
  );

  const intlLocale = getIntlLocale();
  const monthLabel = useMemo(() => {
    if (calendarPref === 'jalali') {
      return formatDisplayDate(DoranDate.fromJalali(cursor.year, cursor.month, 1).toDate(), "MMMM yyyy", "jalali", intlLocale);
    }
    return formatDisplayDate(new Date(cursor.year, cursor.month - 1, 1), "MMMM yyyy", "gregorian", intlLocale);
  }, [cursor.year, cursor.month, calendarPref, intlLocale]);

  const isLoading =
    projectsQuery.isLoading ||
    (!isSelfView && Boolean(selectedProjectId) && gridQuery.isLoading) ||
    (isSelfView && myGridQuery.isLoading);

  const renderCellContent = (row: MatrixRow, day: number, isoDate: string) => {
    const key = cellKey(row.id, isoDate);
    const editable = canEditCell(row, isoDate);
    const entry = cellIndex.get(key);
    const draft = hourDrafts[key];
    const saved = savedHours(row.id, isoDate);
    const value = editable ? draft ?? saved ?? '' : saved ?? '';
    const isDirty =
      editable && draft !== undefined && Number(draft) !== Number(saved ?? 0);
    const showGreenCheck = Boolean(entry?.isComplete);
    const showOrangeDot = isDirty || Boolean(entry && !entry.isComplete);

    return (
      <div className="relative flex h-8 w-full min-w-[28px] max-w-[36px] items-center justify-center mx-auto">
        {editable ? (
          focusedCellKey === key ? (
            <input
              autoFocus
              type="number"
              step="0.01"
              min="0"
              max="24"
              value={value}
              placeholder="-"
              aria-label={`${row.label} ${isoDate}`}
              onBlur={() => setFocusedCellKey(null)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || (Number(val) >= 0 && Number(val) <= 24)) {
                  setHourDrafts((prev) => ({ ...prev, [key]: val }));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleEnterOnCell(row, day);
                  setFocusedCellKey(null);
                }
              }}
              className="h-7 w-full rounded-lg bg-primary/10 text-center text-[13px] font-bold text-primary placeholder:text-heledone-ink-muted focus:border-primary/50 focus:bg-primary/15 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none p-0 transition-all"
            />
          ) : (
            <div
              tabIndex={0}
              onFocus={() => setFocusedCellKey(key)}
              onClick={() => setFocusedCellKey(key)}
              className="flex h-7 w-full cursor-text items-center justify-center rounded-lg bg-transparent text-center text-[13px] font-bold text-primary transition-all hover:bg-primary/10 focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {value ? formatDecimalHours(value) : '-'}
            </div>
          )
        ) : (
          <span
            title={value ? formatDecimalHours(value) : undefined}
            className={`text-[13px] font-bold ${value
                ? isSelfView || isOwnRow(row)
                  ? 'text-primary font-black'
                  : 'text-base-content/75'
                : 'text-heledone-ink-muted'
              }`}
          >
            {value ? formatDecimalHours(value) : '-'}
          </span>
        )}
        {showGreenCheck && (
          <span
            className="absolute -top-0.5 -end-0.5 z-10 flex h-3 w-3 items-center justify-center rounded-full bg-success text-success-content shadow-xs"
            title={S.legendCompleted}
          >
            <Check size={8} variant="Bold" />
          </span>
        )}
        {showOrangeDot && !showGreenCheck && (
          <span
            className="absolute -top-0.5 -end-0.5 z-10 h-2 w-2 rounded-full bg-warning shadow-xs"
            title={isDirty ? S.legendUnsaved : S.legendIncomplete}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : (!selectedProjectId && !isSelfView) || (isSelfView && rows.length === 0) ? (
        <div className="rounded-2xl border border-dashed border-base-content/15 bg-base-100 p-12 text-center">
          <NoteText size={40} className="mx-auto mb-3 text-heledone-ink-muted" />
          <h3 className="text-base font-bold text-base-content">{S.noProjectsTitle}</h3>
          <p className="mt-1 text-xs text-heledone-ink-muted">{S.noProjectsHint}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-base-content/8 bg-base-100 shadow-sm">
          {!canWrite && (
            <div className="border-b border-warning/20 bg-warning/10 px-4 py-2 text-xs font-medium text-warning dark:text-warning">
              {S.viewerNotice}
            </div>
          )}

          {/* Matrix Header — month stepper, title, and project picker */}
          <div className="relative z-[60] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-t-2xl border-b border-base-content/8 bg-base-200/30 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label={t("Previous month")}
                className="flex size-8 items-center justify-center rounded-xl border border-base-content/10 bg-base-100 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content transition-all"
              >
                <ArrowLeft2 className="rtl:rotate-180" size={16} />
              </button>

              <div className="flex items-center gap-2 px-1">
                <Calendar size={16} className="text-primary" />
                <span className="text-sm font-bold text-base-content">{monthLabel}</span>
              </div>

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label={t("Next month")}
                className="flex size-8 items-center justify-center rounded-xl border border-base-content/10 bg-base-100 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content transition-all"
              >
                <ArrowRight2 className="rtl:rotate-180" size={16} />
              </button>
            </div>

            <div className="flex min-w-0 items-center justify-center gap-2 text-center">
              <NoteText size={16} className="shrink-0 text-primary" />
              <h1 className="truncate text-sm font-bold tracking-tight text-base-content sm:text-base">
                {title}
              </h1>
            </div>

            {/* Project picker — only meaningful in team view */}
            {!isSelfView && projects.length > 0 && (
              <div className="relative z-[50] justify-self-end" ref={projDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsProjDropdownOpen((prev) => !prev)}
                  className="flex h-8.5 items-center gap-2.5 rounded-xl border border-base-content/10 bg-base-100 px-3.5 text-xs font-bold text-base-content shadow-xs transition-all hover:border-primary/40 hover:bg-base-200/50"
                >
                  <span
                    className="size-3.5 rounded-full shrink-0 shadow-xs"
                    style={{
                      background: selectedProjectColor,
                      boxShadow: `0 0 8px ${selectedProjectColor}60`,
                    }}
                  />
                  {selectedProject?.prefix && (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[13px] font-extrabold text-base-content bg-base-200 border border-heledone-border shrink-0"
                      style={{ borderInlineStart: `3px solid ${selectedProjectColor}` }}
                    >
                      {selectedProject.prefix}
                    </span>
                  )}
                  <span  className="truncate max-w-[150px] text-xs font-bold">
                    {selectedProject?.name || t("انتخاب پروژه")}
                  </span>
                  <ArrowDown2
                    size={14}
                    className={`shrink-0 text-heledone-ink-muted transition-transform duration-200 ${isProjDropdownOpen ? 'rotate-180 text-primary' : ''
                      }`}
                  />
                </button>

                {isProjDropdownOpen && (
                  <div className="absolute end-0 mt-1.5 w-64 rounded-2xl border border-base-content/10 bg-base-100 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in duration-100 z-[101]">
                    <div className="flex items-center gap-2 px-3 py-2 text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted border-b border-base-content/8 mb-1">
                      <Folder size={13} className="text-primary" />
                      <span>{t("انتخاب پروژه")}</span>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {projects.map((p, index) => {
                        const color = p.color || PASTEL_COLORS[index % PASTEL_COLORS.length];
                        const isSelected = String(p.id) === String(selectedProjectId);

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(String(p.id));
                              setIsProjDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-start transition-all ${isSelected
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'text-base-content/80 hover:bg-base-200/60 hover:text-base-content font-medium'
                              }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="size-3.5 rounded-full shrink-0 shadow-xs"
                                style={{ background: color }}
                              />
                              {p.prefix && (
                                <span
                                  className="rounded-md px-1.5 py-0.5 text-[13px] font-extrabold text-base-content bg-base-200 border border-heledone-border shrink-0"
                                  style={{ borderInlineStart: `3px solid ${color}` }}
                                >
                                  {p.prefix}
                                </span>
                              )}
                              <span  className="truncate text-xs">{p.name}</span>
                            </div>

                            {isSelected && <TickCircle size={15} className="shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Matrix Table — horizontal scroll stays, the scrollbar itself is hidden */}
          <div className={`overflow-x-auto ${rows.length > 5 ? 'overflow-y-auto max-h-[320px] [scrollbar-width:thin]' : 'overflow-y-visible'}`}>
            <table className="w-full min-w-max border-separate border-spacing-0 table-fixed">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th
                    style={{ width: memberColWidth, minWidth: memberColWidth, maxWidth: memberColWidth }}
                    className="relative sticky start-0 z-30 border-b border-base-content/8 bg-base-100 px-3 py-2.5 text-start text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted"
                  >
                    {isSelfView ? S.projectLabel : S.memberColumnLabel}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t("Resize column")}
                      onMouseDown={handleResizeStart}
                      className="absolute end-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 active:bg-primary/60"
                    />
                  </th>
                  {days.map((day) => {
                    const isToday = dayIso(day) === todayIso;
                    return (
                      <th
                        key={day}
                        className={`border-b border-base-content/8 px-1 py-2 text-center text-[13px] font-bold transition-all ${isToday
                            ? 'bg-primary/10 text-primary border-b-primary/40'
                            : 'bg-base-200/20 text-heledone-ink-muted'
                          }`}
                      >
                        {formatUiNumber(day)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isCurrent = isOwnRow(row);
                  const rowColor = row.color || '#087F83';

                  return (
                    <tr key={row.id} className="group">
                      <td
                        style={{ width: memberColWidth, minWidth: memberColWidth, maxWidth: memberColWidth }}
                        className="sticky start-0 z-20 border-b border-base-content/6 bg-base-100 px-3 py-2 backdrop-blur group-hover:bg-base-200/50 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          {isSelfView ? (
                            <span
                              className="size-3.5 rounded-full shrink-0 shadow-xs"
                              style={{ background: rowColor }}
                            />
                          ) : (
                            <ProfileAvatar
                              src={row.avatarUrl}
                              name={row.label}
                              className="size-7 shrink-0 overflow-hidden rounded-lg"
                              fallbackClassName={`grid size-full place-items-center rounded-lg text-[13px] font-bold ${isCurrent
                                ? 'bg-primary text-primary-content'
                                : 'bg-base-200 text-heledone-ink-muted'
                                }`}
                            />
                          )}
                          <div className="min-w-0">
                            <p

                              className={`truncate text-xs font-bold ${isCurrent ? 'text-primary' : 'text-base-content'
                                }`}
                              title={row.label}
                            >
                              {row.label}
                            </p>
                            <div className="flex items-center gap-1.5 text-[13px] text-heledone-ink-muted">
                              <span>{formatDecimalHours(row.total)}</span>
                              {row.sublabel && (
                                <>
                                  <span>•</span>
                                  <span className="truncate" title={row.sublabel}>
                                    {row.sublabel}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {days.map((day) => {
                        const isoDate = dayIso(day);
                        const editable = canEditCell(row, isoDate);
                        const isToday = isoDate === todayIso;
                        const isFuture = isoDate > todayIso;
                        const hasEntry = cellIndex.has(cellKey(row.id, isoDate));

                        return (
                          <td
                            key={day}
                            className={`border-b border-l border-base-content/5 p-1 text-center transition-all ${isToday ? 'bg-primary/5' : ''
                              }`}
                            onClick={editable ? undefined : () => handleOpenCell(row, day)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              handleOpenCell(row, day);
                            }}
                            title={
                              isFuture
                                ? S.lockedCellTitle
                                : editable && !hasEntry
                                  ? S.hintRightClickShort
                                  : undefined
                            }
                          >
                            <div
                              className={`mx-auto flex w-full items-center justify-center ${editable
                                  ? 'cursor-text'
                                  : isFuture
                                    ? 'cursor-not-allowed opacity-40'
                                    : hasEntry
                                      ? 'cursor-pointer'
                                      : 'cursor-default'
                                }`}
                            >
                              {renderCellContent(row, day, isoDate)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 1} className="py-12 text-center">
                      <h3 className="text-sm font-bold text-base-content">{S.emptyGridTitle}</h3>
                      <p className="mt-1 text-xs text-heledone-ink-muted">{S.emptyGridHint}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Legend */}
          <div className="flex flex-col justify-between gap-2 rounded-b-2xl border-t border-base-content/8 px-4 py-3 bg-base-200/20 md:flex-row md:items-center text-xs">
            <div className="flex flex-wrap items-center gap-4 text-heledone-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="flex size-3 items-center justify-center rounded-full bg-success text-success-content">
                  <Check size={8} variant="Bold" />
                </span>
                <span className="text-[13px] font-medium">{S.legendCompleted}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" />
                <span className="text-[13px] font-medium">{S.legendUnsaved}</span>
              </span>
            </div>
            <span className="text-[13px] text-heledone-ink-muted">{S.hintRightClick}</span>
          </div>
        </div>
      )}

      {/* Standup Modal */}
      {modalState && (
        <StandupModal
          key={`${modalState.rowId}:${modalState.isoDate}`}
          isOpen
          onClose={() => setModalState(null)}
          projectId={modalState.projectId}
          date={modalState.isoDate}
          memberName={modalState.rowName}
          entryId={activeCell?.entryId}
          readOnly={activeCell?.readOnly ?? true}
          hideHours={activeCell?.hideHours ?? false}
          initial={activeCell?.initial}
          onSaved={handleSaved}
          onDeleted={handleSaved}
        />
      )}
    </div>
  );
};

export default StandupMatrix;
