import { getIntlLocale, t as translate, useTranslation } from "../../../i18n/locale";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wallet,
  Coin,
  Card,
  Receipt21,
  Clock,
  FolderOpen,
  Briefcase,
  Moneys,
} from "iconsax-reactjs";
import { useMyFinanceDashboard } from "../api/financeApi";
import PageLoader from "../../../components/PageLoader";
import { PageHeading } from "../../../components/PageHeading";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";

const formatCurrency = (value: number, currency = "IRR") => {
  return `${value.toLocaleString(getIntlLocale())} ${currency === "IRR" ? translate("ریال") : currency}`;
};

const PaymentTypeBadge = ({ type }: { type: string | null }) => {
  const t = useTranslation();
  if (!type) return <span className="text-heledone-ink-muted text-xs">—</span>;
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[13px] font-bold uppercase tracking-wider ${
        type === "hourly"
          ? "bg-primary/12 text-primary dark:text-primary"
          : "bg-secondary/12 text-secondary dark:text-secondary"
      }`}
    >
      {type === "hourly" ? t("ساعتی") : t("ماهانه")}
    </span>
  );
};

export const UserFinanceDashboard = () => {
  const t = useTranslation();
  const { data: dashboard, isLoading, error } = useMyFinanceDashboard();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  if (isLoading) return <PageLoader />;

  if (error || !dashboard) {
    return (
      <div className="flex h-[50dvh] flex-col items-center justify-center gap-3 text-heledone-ink-muted">
        <Receipt21 size={48} className="opacity-20" />
        <p className="font-medium">{t("دریافت اطلاعات مالی ممکن نشد.")}</p>
        {error && (
          <p className="text-xs text-error bg-error/10 px-3 py-1.5 rounded-lg">
            {String(error)}
          </p>
        )}
      </div>
    );
  }

  // Set initial selected project if none selected
  const activeProjectId = selectedProjectId || (dashboard.projects.length > 0 ? dashboard.projects[0].project_id : null);
  const selectedProject = dashboard.projects.find((p) => p.project_id === activeProjectId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-12"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeading title={t("حقوق و گزارش مالی")} description={t("نمای درآمد، پرداخت‌ها و کارکرد شما.")} />

      {/* ── Summary Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="heledone-surface relative overflow-hidden rounded-2xl border border-base-content/10 bg-base-100/90 p-5 shadow-heledone-card"
        >
          <div className="absolute -end-4 -top-4 rounded-full bg-primary/5 p-8 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between text-heledone-ink-muted">
              <span className="text-[13px] font-bold uppercase tracking-wider">
                {t("مجموع درآمد")}</span>
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <Wallet size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-black text-base-content">
              {formatCurrency(dashboard.total_income, dashboard.currency)}
            </p>
            <p className="mt-1 text-[13px] text-heledone-ink-muted">
              {t("Projects: {count}", { count: dashboard.projects.length })}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="heledone-surface relative overflow-hidden rounded-2xl border border-base-content/10 bg-base-100/90 p-5 shadow-heledone-card"
        >
           <div className="absolute -end-4 -top-4 rounded-full bg-success/5 p-8 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between text-heledone-ink-muted">
              <span className="text-[13px] font-bold uppercase tracking-wider">
                {t("پرداخت‌های دریافت‌شده")}</span>
              <div className="rounded-lg bg-success/10 p-1.5 text-success">
                <Card size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-black text-success dark:text-success">
              {formatCurrency(dashboard.total_paid, dashboard.currency)}
            </p>
            <p className="mt-1 text-[13px] text-heledone-ink-muted">
              {t("مجموع پرداختی تا امروز")}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="heledone-surface relative overflow-hidden rounded-2xl border border-base-content/10 bg-base-100/90 p-5 shadow-heledone-card"
        >
          <div className="absolute -end-4 -top-4 rounded-full bg-warning/5 p-8 blur-2xl" />
          <div className="relative">
            <div className="flex items-center justify-between text-heledone-ink-muted">
              <span className="text-[13px] font-bold uppercase tracking-wider">
                {t("مانده پرداخت‌نشده")}</span>
              <div className="rounded-lg bg-warning/10 p-1.5 text-warning">
                <Coin size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-black text-warning">
              {formatCurrency(dashboard.current_balance, dashboard.currency)}
            </p>
            <p className="mt-1 text-[13px] text-heledone-ink-muted">
              {t("در انتظار پرداخت")}</p>
          </div>
        </motion.div>
      </div>

      {/* ── Project Selection & Details ──────────────────────────── */}
      {dashboard.projects.length === 0 ? (
        <CoastalEmptyState motif="boat" title={t("No project earnings found.")} description={t("Ask your manager to set your salary in each project.")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[350px_1fr]">
          {/* Projects List sidebar */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-2 px-1 text-heledone-ink-muted">
              <FolderOpen size={18} />
              <h3 className="text-sm font-semibold tracking-wide">{t("پروژه‌های شما")}</h3>
            </div>

            <div className="flex flex-row overflow-x-auto pb-2 space-x-3 lg:flex-col lg:space-x-0 lg:space-y-3 lg:pb-0 scrollbar-thin scrollbar-thumb-base-300">
              {dashboard.projects.map((project) => (
                <button
                  key={project.project_id}
                  onClick={() => setSelectedProjectId(project.project_id)}
                  className={`flex shrink-0 w-64 lg:w-full items-center justify-between rounded-2xl p-4 transition-all duration-200 border ${
                    activeProjectId === project.project_id
                      ? "border-primary/30 bg-primary/5 shadow-sm"
                      : "border-base-content/10 bg-base-100 hover:border-primary/30 hover:bg-base-200/50 hover:shadow-heledone-raised"
                  }`}
                >
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="w-full truncate text-start text-sm font-semibold text-base-content">
                      {project.project_name}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <PaymentTypeBadge type={project.payment_type} />
                      {project.salary_override && (
                        <span className="rounded bg-warning/12 px-1.5 py-0.5 text-[13px] font-bold text-warning">
                          {t("Override")}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected Project Details */}
          <div className="min-w-0">
             <AnimatePresence mode="wait">
               {selectedProject ? (
                 <motion.div
                   key={selectedProject.project_id}
                   initial={{ opacity: 0, x: 10 }}
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -10 }}
                   transition={{ duration: 0.2 }}
                   className="heledone-surface relative overflow-hidden rounded-[24px] border border-base-content/10 bg-base-100/90 shadow-heledone-card"
                 >
                    {/* Decorative Header Background */}
                    <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent" />

                    <div className="relative p-6 sm:p-8">
                      <div className="flex items-center gap-3">
                        <div className="grid size-12 place-items-center rounded-xl bg-primary/20 text-primary">
                          <Briefcase size={24} variant="Bulk" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-base-content">
                            {selectedProject.project_name}
                          </h2>
                          <div className="mt-1 flex items-center gap-2 text-sm text-heledone-ink-muted">
                             {t("جزئیات درآمد")}</div>
                        </div>
                      </div>

                      {/* Main Rate Card */}
                      <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">
                              {t("نرخ حقوق شما")}</span>
                            <div className="mt-2 flex flex-wrap items-baseline gap-2 text-2xl sm:text-3xl font-black text-primary">
                              {selectedProject.rate > 0 ? formatCurrency(selectedProject.rate, selectedProject.currency) : "—"}
                              {selectedProject.rate > 0 && (
                                <span className="text-sm font-medium text-primary">
                                  / {selectedProject.payment_type === "hourly" ? t("hour") : t("ماه")}
                                </span>
                              )}
                            </div>
                          </div>
                          {selectedProject.salary_override && (
                            <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-warning/20 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning sm:mt-0">
                              <Moneys size={14} />
                              {t("نرخ اختصاصی این پروژه")}</div>
                          )}
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                         <div className="rounded-xl border border-base-content/5 bg-base-200/50 p-4">
                            <div className="flex items-center gap-2 text-heledone-ink-muted">
                              <Clock size={16} />
                              <span className="text-xs font-semibold">{t("کارکرد ثبت‌شده")}</span>
                            </div>
                            <p className="mt-2 text-lg font-bold">
                              {selectedProject.total_worked_hours !== null
                                ? t("{value0} ساعت", { value0: selectedProject.total_worked_hours.toLocaleString(getIntlLocale(), { maximumFractionDigits: 1 }) })
                                : "—"}
                            </p>
                         </div>
                         <div className="rounded-xl border border-base-content/5 bg-base-200/50 p-4">
                            <div className="flex items-center gap-2 text-primary">
                              <Wallet size={16} />
                              <span className="text-xs font-semibold">{t("درآمد")}</span>
                            </div>
                            <p className="mt-2 text-lg font-bold text-primary">
                              {formatCurrency(selectedProject.total_earned, selectedProject.currency)}
                            </p>
                         </div>
                         <div className="rounded-xl border border-base-content/5 bg-base-200/50 p-4">
                            <div className="flex items-center gap-2 text-success">
                              <Card size={16} />
                              <span className="text-xs font-semibold">{t("پرداختی")}</span>
                            </div>
                            <p className="mt-2 text-lg font-bold text-success">
                              {formatCurrency(selectedProject.total_paid, selectedProject.currency)}
                            </p>
                         </div>
                         <div className="rounded-xl border border-base-content/5 bg-base-200/50 p-4">
                            <div className="flex items-center gap-2 text-warning">
                              <Coin size={16} />
                              <span className="text-xs font-semibold">{t("مانده")}</span>
                            </div>
                            <p className="mt-2 text-lg font-bold text-warning">
                              {formatCurrency(selectedProject.current_balance, selectedProject.currency)}
                            </p>
                         </div>
                      </div>
                    </div>
                 </motion.div>
               ) : (
                 <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-base-content/10 bg-base-100/50 text-heledone-ink-muted">
                    <FolderOpen size={48} className="mb-4 opacity-20" />
                    <p>{t("Select a project to view details")}</p>
                 </div>
               )}
             </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default UserFinanceDashboard;
