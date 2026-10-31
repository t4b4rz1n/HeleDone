import { t as translate, useTranslation, getDirection, getIntlLocale, formatNumber } from "../i18n/locale";
import { formatDisplayDate } from "../utils/date";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { DoranDate } from "@doranjs/core";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft2,
  ArrowRight2,
  Calendar1,
  CloseCircle,
  TickCircle,
} from "iconsax-reactjs";
import { useEffect, useState } from "react";
import { useAuthStore } from "../features/auth/store/authStore";
import "@doranjs/react/styles.css";

// Use ReturnType to avoid the private constructor issue
type JDoranDate = ReturnType<typeof DoranDate.fromGregorian>;


interface JalaliDay {
  jDate: JDoranDate;
  isCurrentMonth: boolean;
}

function buildJalaliGrid(jMonth: JDoranDate): JalaliDay[] {
  const startOfM = jMonth.startOf("month");
  const daysInM = startOfM.daysInMonth;
  // leading cells (Sat=0 means no leading empty, Sun=1 means 1, etc.)
  const leadingEmpty = startOfM.dayOfWeek;

  const days: JalaliDay[] = [];

  // Leading days from previous month
  if (leadingEmpty > 0) {
    const prevM = startOfM.addMonths(-1);
    const prevDaysInM = prevM.daysInMonth;
    for (let i = leadingEmpty - 1; i >= 0; i--) {
      days.push({ jDate: prevM.withDay(prevDaysInM - i), isCurrentMonth: false });
    }
  }

  // Current month days
  for (let d = 1; d <= daysInM; d++) {
    days.push({ jDate: startOfM.withDay(d), isCurrentMonth: true });
  }

  // Trailing days to complete last row
  const remainder = days.length % 7;
  if (remainder !== 0) {
    const nextM = startOfM.addMonths(1);
    const toAdd = 7 - remainder;
    for (let d = 1; d <= toAdd; d++) {
      days.push({ jDate: nextM.withDay(d), isCurrentMonth: false });
    }
  }

  return days;
}

interface CustomDatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  error?: boolean;
}

export const CustomDatePicker = ({
  value,
  onChange,
  placeholder = translate("انتخاب تاریخ"),
  className = "",
  triggerClassName = "w-full p-3 bg-base-100 border rounded-xl flex items-center justify-between text-start hover:border-primary/50 transition-colors",
  error = false,
}: CustomDatePickerProps) => {
  const t = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // ── Gregorian state ───────────────────────────────────────────────────────
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  // ── Jalali state ──────────────────────────────────────────────────────────
  const [jalaliMonth, setJalaliMonth] = useState<JDoranDate>(
    () => DoranDate.fromGregorian(new Date()).startOf("month")
  );
  const [jalaliSelected, setJalaliSelected] = useState<JDoranDate | null>(null);
  const [jalaliPending, setJalaliPending] = useState<JDoranDate | null>(null);

  const preference = useAuthStore((state) => state.user?.calendar_preference) || "jalali";
  const isJalali = preference === "jalali";

  // Sync value → internal state
  useEffect(() => {
    if (value) {
      const parsed = parseISO(value);
      if (isValid(parsed)) {
        setSelectedDate(parsed);
        setPendingDate(parsed);
        setCurrentMonth(parsed);
        const jd = DoranDate.fromGregorian(parsed);
        setJalaliSelected(jd);
        setJalaliPending(jd);
        setJalaliMonth(jd.startOf("month"));
      }
    } else {
      setSelectedDate(null);
      setPendingDate(null);
      setJalaliSelected(null);
      setJalaliPending(null);
    }
  }, [value]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (isJalali) {
      if (jalaliPending) {
        setJalaliSelected(jalaliPending);
        onChange(format(jalaliPending.toDate(), "yyyy-MM-dd"));
      }
    } else {
      if (pendingDate) {
        setSelectedDate(pendingDate);
        onChange(format(pendingDate, "yyyy-MM-dd"));
      }
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    setPendingDate(selectedDate);
    setJalaliPending(jalaliSelected);
    setIsOpen(false);
  };

  const handleJumpToToday = () => {
    const today = new Date();
    if (isJalali) {
      const jToday = DoranDate.fromGregorian(today);
      setJalaliPending(jToday);
      setJalaliMonth(jToday.startOf("month"));
    } else {
      setPendingDate(today);
      setCurrentMonth(today);
    }
  };

  const handleClearDate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDate(null);
    setPendingDate(null);
    setJalaliSelected(null);
    setJalaliPending(null);
    onChange("");
  };

  // ── Display label ─────────────────────────────────────────────────────────
  const hasValue = isJalali ? !!jalaliSelected : !!selectedDate;
  const displayLabel = (() => {
    if (isJalali) {
      if (!jalaliSelected) return placeholder;
      return formatDisplayDate(jalaliSelected.toDate(), "MMMM d, yyyy", "jalali");
    }
    if (!selectedDate) return placeholder;
    return formatDisplayDate(selectedDate, "MMMM dd, yyyy");
  })();

  // ── Gregorian calendar grid ───────────────────────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(monthStart)),
  });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(getIntlLocale(), { weekday: "short" }).format(new Date(2024, 0, (isJalali ? 6 : 7) + index)),
  );

  // ── Jalali calendar grid ──────────────────────────────────────────────────
  const jalaliDays = buildJalaliGrid(jalaliMonth);

  return (
    <>
      <div className={`relative ${className}`}>
        <motion.button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`${triggerClassName} ${error ? "border-error" : "border-base-content/20"}`}
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-2 flex-1 overflow-hidden">
            <Calendar1
              size={20}
              className="text-heledone-ink-muted flex-shrink-0"
            />
            <span
              className={`text-sm truncate ${
                hasValue ? "font-medium text-base-content" : "text-heledone-ink-muted"
              }`}
            >
              {displayLabel}
            </span>
          </div>
          {hasValue && (
            <div
              role="button"
              onClick={handleClearDate}
              className="text-heledone-ink-muted hover:text-error transition-colors ms-2 p-1"
            >
              <CloseCircle size={16} />
            </div>
          )}
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={handleCancel}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="heledone-glass-dialog bg-base-100 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              dir={getDirection()}
            >
              {/* ── Header: month navigation ── */}
              <div className="flex items-center justify-between p-4 border-b border-base-content/10 bg-base-100/50">
                <button
                  type="button"
                  onClick={() =>
                    isJalali
                      ? setJalaliMonth((m: JDoranDate) => m.addMonths(-1))
                      : setCurrentMonth((m) => subMonths(m, 1))
                  }
                  className="btn btn-sm btn-ghost btn-circle"
                  aria-label={t("Previous month")}
                >
                  {getDirection() === "rtl" ? <ArrowRight2 size={18} /> : <ArrowLeft2 size={18} />}
                </button>
                <h4 className="font-bold text-lg text-base-content">
                  {isJalali
                    ? formatDisplayDate(jalaliMonth.toDate(), "MMMM yyyy", "jalali")
                    : formatDisplayDate(currentMonth, "MMMM yyyy", "gregorian")}
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    isJalali
                      ? setJalaliMonth((m: JDoranDate) => m.addMonths(1))
                      : setCurrentMonth((m) => addMonths(m, 1))
                  }
                  className="btn btn-sm btn-ghost btn-circle"
                  aria-label={t("Next month")}
                >
                  {getDirection() === "rtl" ? <ArrowLeft2 size={18} /> : <ArrowRight2 size={18} />}
                </button>
              </div>

              {/* ── Grid ── */}
              <div className="p-4">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekDays.map((d) => (
                    <div
                      key={d}
                      className="h-8 flex items-center justify-center text-xs font-bold text-heledone-ink-muted uppercase"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {isJalali
                    ? jalaliDays.map(({ jDate, isCurrentMonth }, idx) => {
                        const isSel =
                          jalaliPending !== null &&
                          jDate.year === jalaliPending.year &&
                          jDate.month === jalaliPending.month &&
                          jDate.day === jalaliPending.day;
                        const isTodayDate = jDate.isToday();
                        return (
                          <motion.button
                            key={idx}
                            type="button"
                            onClick={() => setJalaliPending(jDate)}
                            className={`
                              h-10 w-10 mx-auto rounded-xl text-sm font-medium transition-all flex items-center justify-center
                              ${!isCurrentMonth
                                ? "text-heledone-ink-muted"
                                : isSel
                                ? "bg-primary text-primary-content shadow-lg shadow-primary/30"
                                : isTodayDate
                                ? "bg-primary/10 text-primary font-bold border-2 border-primary/20"
                                : "text-base-content hover:bg-base-200"}
                            `}
                            whileTap={{ scale: 0.9 }}
                          >
                            {formatNumber(jDate.day)}
                          </motion.button>
                        );
                      })
                    : calendarDays.map((day: Date) => {
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isSel = pendingDate ? isSameDay(day, pendingDate) : false;
                        const isTodayDate = isToday(day);
                        return (
                          <motion.button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => setPendingDate(day)}
                            className={`
                              h-10 w-10 mx-auto rounded-xl text-sm font-medium transition-all flex items-center justify-center
                              ${!isCurrentMonth
                                ? "text-heledone-ink-muted"
                                : isSel
                                ? "bg-primary text-primary-content shadow-lg shadow-primary/30"
                                : isTodayDate
                                ? "bg-primary/10 text-primary font-bold border-2 border-primary/20"
                                : "text-base-content hover:bg-base-200"}
                            `}
                            whileTap={{ scale: 0.9 }}
                          >
                            {formatNumber(day.getDate())}
                          </motion.button>
                        );
                      })}
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="p-4 border-t border-base-content/10 bg-base-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  {t("Jump to Today")}</button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="btn btn-sm btn-ghost rounded-lg"
                  >
                    {t("انصراف")}</button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="btn btn-sm btn-primary rounded-lg"
                  >
                    <TickCircle size={16} />  {t("تأیید")}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
