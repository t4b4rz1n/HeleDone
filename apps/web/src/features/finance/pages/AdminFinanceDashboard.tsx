import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getIntlLocale, useTranslation } from "../../../i18n/locale";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";
import { useState } from "react";
import { motion } from "motion/react";
import {
  SearchNormal1,
  People,
  DollarCircle,
  TrendUp,
  Briefcase,
  DocumentText,
} from "iconsax-reactjs";
import { useAdminFinanceReports } from "../api/financeApi";
import PageLoader from "../../../components/PageLoader";
import { Pagination } from "../../../components/Pagination";
import type { AdminFinanceReport } from "../types/financeTypes";

const formatCurrency = (value: number, currency = "IRR") =>
  `${value.toLocaleString(getIntlLocale())} ${currency}`;

const getUserDisplayName = (r: AdminFinanceReport) => {
  const name = `${r.first_name} ${r.last_name}`.trim();
  return name || r.username;
};

const getInitial = (r: AdminFinanceReport) =>
  (r.first_name?.[0] || r.username?.[0] || "?").toUpperCase();

export const AdminFinanceDashboard = () => {
  const t = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
    setSearchTimer(t);
  };

  const { data, isLoading, error } = useAdminFinanceReports({
    page,
    page_size: pageSize,
    search: debouncedSearch,
  });

  const results = data?.results ?? [];

  // Aggregate totals from current page
  const totalIncome = results.reduce((s, r) => s + (r.total_income ?? 0), 0);
  const totalPaid = results.reduce((s, r) => s + (r.total_paid ?? 0), 0);
  const totalBalance = results.reduce((s, r) => s + (r.current_balance ?? 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-12"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="heledone-page-heading flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-base-content sm:text-2xl">
            {t("Organization Finances")}</h1>
          <p className="mt-0.5 text-xs text-heledone-ink-muted">
            {t("Payroll overview for all members in your organization.")}</p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-heledone-ink-muted">
            <SearchNormal1 size={15} />
          </div>
          <input
            id="finance-search"
            type="text"
            className="block w-full rounded-xl border border-base-content/10 bg-base-100 py-2 ps-9 pe-3 text-sm text-base-content placeholder-base-content/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={t("Search members...")}
            value={search}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* ── Aggregate Summary Cards ──────────────────────────────── */}
      {!isLoading && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
            <div className="flex items-center justify-between text-heledone-ink-muted">
              <span className="text-[13px] font-bold uppercase tracking-wider">{t("Total Payroll")}</span>
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <DollarCircle size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-black text-base-content">
              {formatCurrency(totalIncome)}
            </p>
            <p className="mt-1 text-[13px] text-heledone-ink-muted">
              {formatUiNumber(data.total_results)}  {t("members")}</p>
          </div>

          <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
            <div className="flex items-center justify-between text-heledone-ink-muted">
              <span className="text-[13px] font-bold uppercase tracking-wider">{t("مجموع پرداختی")}</span>
              <div className="rounded-lg bg-success/10 p-1.5 text-success">
                <TrendUp size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-black text-success dark:text-success">
              {formatCurrency(totalPaid)}
            </p>
          </div>

          <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
            <div className="flex items-center justify-between text-heledone-ink-muted">
              <span className="text-[13px] font-bold uppercase tracking-wider">{t("Total Owed")}</span>
              <div className="rounded-lg bg-warning/10 p-1.5 text-warning">
                <People size={16} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-black text-warning">
              {formatCurrency(totalBalance)}
            </p>
          </div>
        </div>
      )}

      {/* ── Members Table ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
        <div className="mb-5 flex items-center gap-2 border-b border-base-content/8 pb-4">
          <Briefcase size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-base-content uppercase tracking-wider">
            {t("Member Finance Report")}</h2>
        </div>

        {isLoading ? (
          <div className="py-12">
            <PageLoader />
          </div>
        ) : error || !data ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-heledone-ink-muted">
            <DocumentText size={32} className="opacity-20" />
            <p className="text-sm">{t("Could not load reports.")}</p>
          </div>
        ) : results.length === 0 ? (
          <CoastalEmptyState motif="boat" title={debouncedSearch ? t("No members match your search.") : t("No financial records found.")} />
        ) : (
          <div className="space-y-4">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[600px] text-start text-sm">
                <thead className="border-b border-base-content/10 text-xs font-semibold text-heledone-ink-muted">
                  <tr>
                    <th className="pb-3 ps-2">{t("Member")}</th>
                    <th className="pb-3 text-center">{t("پروژه‌ها")}</th>
                    <th className="pb-3 text-end">{t("Total Income")}</th>
                    <th className="pb-3 text-end">{t("Paid")}</th>
                    <th className="pb-3 pe-2 text-end">{t("Balance Owed")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-content/5">
                  {results.map((r: AdminFinanceReport) => (
                    <tr
                      key={r.user_id}
                      className="hover:bg-base-200/30 transition-colors"
                    >
                      <td className="py-3 ps-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            {getInitial(r)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-base-content leading-tight truncate">
                              {getUserDisplayName(r)}
                            </p>
                            <p className="text-[13px] text-heledone-ink-muted truncate">
                              @{r.username}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-base-200 px-2 py-1 text-xs font-semibold">
                          <Briefcase size={11} />
                          {formatUiNumber(r.active_projects)}
                        </span>
                      </td>
                      <td className="py-3 text-end font-semibold text-primary">
                        {formatCurrency(r.total_income, r.currency)}
                      </td>
                      <td className="py-3 text-end text-success dark:text-success font-medium">
                        {formatCurrency(r.total_paid, r.currency)}
                      </td>
                      <td className="py-3 pe-2 text-end">
                        <span
                          className={`font-bold ${
                            r.current_balance > 0
                              ? "text-warning"
                              : "text-heledone-ink-muted"
                          }`}
                        >
                          {formatCurrency(r.current_balance, r.currency)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={data.total_pages}
                totalCount={data.total_results}
                pageSize={pageSize}
                onPageChange={(p: number) => setPage(p)}
                onPageSizeChange={() => {}}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AdminFinanceDashboard;
