import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { useTranslation, formatNumber as formatUiNumber } from '../../../i18n/locale';
import type { Task } from '../types';

interface TaskCalendarViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
}

export const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({
  tasks,
  onSelectTask,
}) => {
  const t = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // First day of current month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    t('ژانویه'), t('فوریه'), t('مارس'), t('آوریل'),
    t('مه'), t('ژوئن'), t('ژوئیه'), t('اوت'),
    t('سپتامبر'), t('اکتبر'), t('نوامبر'), t('دسامبر'),
  ];

  const weekDayNames = [
    t('یکشنبه'), t('دوشنبه'), t('سه‌شنبه'), t('چهارشنبه'),
    t('پنجشنبه'), t('جمعه'), t('شنبه'),
  ];

  // Map tasks to dates: "YYYY-MM-DD" -> Task[]
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((task) => {
      if (task.due_date) {
        const dateKey = task.due_date.split('T')[0];
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(task);
      }
    });
    return map;
  }, [tasks]);

  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-600 border-red-500/30',
    high: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
    medium: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    low: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  };

  // Build grid calendar cells
  const calendarCells = useMemo(() => {
    const cells: { dateStr: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

    // Empty cells for previous month offset
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const d = new Date(currentYear, currentMonth - 1, dayNum);
      const dateStr = d.toISOString().split('T')[0];
      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month days
    const todayStr = new Date().toISOString().split('T')[0];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Remaining cells to fill row
    const totalCells = Math.ceil(cells.length / 7) * 7;
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(currentYear, currentMonth + 1, i);
      const dateStr = d.toISOString().split('T')[0];
      cells.push({
        dateStr,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return cells;
  }, [currentYear, currentMonth, firstDayOfMonth, daysInMonth]);

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden">
      {/* ─── Calendar Header ─── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-base-300/80 bg-base-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-primary" />
            <h2 className="font-extrabold text-base text-base-content">
              {monthNames[currentMonth]} {currentYear}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1 rounded-xl bg-base-200 hover:bg-base-300 text-xs font-bold text-base-content transition-colors"
          >
            {t('امروز')}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-xl border border-base-300 hover:bg-base-200 text-heledone-ink-muted transition-colors"
            title={t('ماه قبل')}
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-xl border border-base-300 hover:bg-base-200 text-heledone-ink-muted transition-colors"
            title={t('ماه بعد')}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* ─── Days of Week Row ─── */}
      <div className="grid grid-cols-7 border-b border-base-300/80 bg-base-200/40 text-center font-bold text-xs py-2 text-heledone-ink-muted shrink-0">
        {weekDayNames.map((name) => (
          <div key={name} className="truncate">
            {name}
          </div>
        ))}
      </div>

      {/* ─── Calendar Grid ─── */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto custom-scrollbar border-b border-base-300/40">
        {calendarCells.map((cell, idx) => {
          const dayTasks = tasksByDate[cell.dateStr] || [];

          return (
            <div
              key={`${cell.dateStr}_${idx}`}
              className={`min-h-[90px] p-2 border-b border-e border-base-300/60 flex flex-col transition-colors ${
                !cell.isCurrentMonth
                  ? 'bg-base-200/20 text-heledone-ink-muted/40'
                  : cell.isToday
                  ? 'bg-primary/5'
                  : 'bg-base-100 hover:bg-base-200/30'
              }`}
            >
              {/* Day Number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-black ${
                    cell.isToday
                      ? 'w-5 h-5 rounded-full bg-primary text-primary-content grid place-items-center'
                      : cell.isCurrentMonth
                      ? 'text-base-content'
                      : 'text-heledone-ink-muted/50'
                  }`}
                >
                  {formatUiNumber(cell.dayNumber)}
                </span>
                {dayTasks.length > 0 && (
                  <span className="text-[10px] font-bold text-primary">
                    {formatUiNumber(dayTasks.length)} {t('تسک')}
                  </span>
                )}
              </div>

              {/* Tasks List for this date */}
              <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                {dayTasks.map((task) => {
                  const pColor = priorityColors[task.priority] || priorityColors.medium;

                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold truncate cursor-pointer transition-all hover:scale-[1.02] shadow-2xs ${pColor}`}
                      title={`${task.title} - ${task.priority}`}
                    >
                      <span className="truncate">{task.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
