import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getIntlLocale, useTranslation } from "../../../i18n/locale";
import { useState } from "react";
import { motion } from "motion/react";
import {
  DollarCircle,
  People,
  Clock,
  InfoCircle,
  ReceiptEdit,
} from "iconsax-reactjs";
import { useProjectBilling } from "../../finance/api/financeApi";
import PageLoader from "../../../components/PageLoader";
import type { ProjectBillingMember } from "../../finance/types/financeTypes";

interface ProjectBillingTabProps {
  projectId: string;
}

const formatCurrency = (value: number, currency = "IRR") =>
  `${value.toLocaleString(getIntlLocale())} ${currency}`;

const PaymentBadge = ({ type }: { type: string | null }) => {
  const t = useTranslation();
  if (!type)
    return (
      <span className="text-[13px] text-heledone-ink-muted italic">{t("No salary set")}</span>
    );
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

const getInitial = (m: ProjectBillingMember) =>
  (m.first_name?.[0] || m.username?.[0] || "?").toUpperCase();

const getUserName = (m: ProjectBillingMember) => {
  const name = `${m.first_name} ${m.last_name}`.trim();
  return name || m.username;
};

export const ProjectBillingTab = ({ projectId }: ProjectBillingTabProps) => {
  const t = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useProjectBilling(projectId, page);

  if (isLoading) return <PageLoader />;

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-heledone-ink-muted">
        <ReceiptEdit size={40} className="opacity-20" />
        <p className="font-medium text-sm">{t("Could not load billing data.")}</p>
        <p className="text-xs text-heledone-ink-muted">
          {t("You may not have permission to view this project's billing details.")}</p>
      </div>
    );
  }

  const members = data.members;
  const totalCost = data.total_cost;
  const membersWithSalary = members.filter((m) => m.payment_type);
  const overrideCount = members.filter((m) => m.salary_override).length;
  const hourlyMembers = members.filter((m) => m.payment_type === "hourly");
  const totalHourlyRate = hourlyMembers.reduce((s, m) => s + m.rate, 0);

  return (
    <div className="space-y-6">
      {/* ── Overview Cards ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {/* Total Cost */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("Total Project Cost")}</span>
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
              <DollarCircle size={16} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-base-content">
            {formatCurrency(totalCost, data.currency)}
          </p>
          <p className="mt-1 text-[13px] text-heledone-ink-muted">
            {t("This billing period")}</p>
        </div>

        {/* Member Count */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("اعضا")}</span>
            <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
              <People size={16} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-base-content">
            {formatUiNumber(members.length)}
          </p>
          <p className="mt-1 text-[13px] text-heledone-ink-muted">
            {formatUiNumber(membersWithSalary.length)}  {t("with salary configured")}</p>
        </div>

        {/* Hourly Total Rate */}
        <div className="rounded-2xl border border-base-content/8 bg-base-100 p-5">
          <div className="flex items-center justify-between text-heledone-ink-muted">
            <span className="text-[13px] font-bold uppercase tracking-wider">
              {t("Total Hourly Rate")}</span>
            <div className="rounded-lg bg-success/10 p-1.5 text-success">
              <Clock size={16} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-success dark:text-success">
            {totalHourlyRate > 0 ? formatCurrency(totalHourlyRate, data.currency) : "—"}
          </p>
          <p className="mt-1 text-[13px] text-heledone-ink-muted">
            {formatUiNumber(hourlyMembers.length)}  {t("hourly member")}{hourlyMembers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </motion.div>

      {/* Override Notice */}
      {overrideCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 text-xs"
        >
          <InfoCircle size={15} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-warning dark:text-warning">
            {overrideCount === 1 ? t("One member has a project-specific salary rate.") : t("{count} members have a project-specific salary rate.", { count: overrideCount })}</p>
        </motion.div>
      )}

      {/* ── Members Breakdown Table ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-base-content/8 bg-base-100 p-5"
      >
        <div className="mb-5 flex items-center gap-2 border-b border-base-content/8 pb-4">
          <ReceiptEdit size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-base-content uppercase tracking-wider">
            {t("Cost per Member")}</h2>
        </div>

        {members.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-heledone-ink-muted">
            <People size={36} className="opacity-20" />
            <p className="text-sm">{t("No members in this project yet.")}</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[600px] text-start text-sm">
              <thead className="border-b border-base-content/10 text-xs font-semibold text-heledone-ink-muted">
                <tr>
                  <th className="pb-3 ps-2">{t("Member")}</th>
                  <th className="pb-3">{t("Specialty")}</th>
                  <th className="pb-3">{t("Type")}</th>
                  <th className="pb-3 text-end">{t("Rate")}</th>
                  <th className="pb-3 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Clock size={11} />
                      {t("Worked")}</div>
                  </th>
                  <th className="pb-3 pe-2 text-end">{t("Cost")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-content/5">
                {members.map((m: ProjectBillingMember, idx) => (
                  <motion.tr
                    key={m.user_id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="hover:bg-base-200/30 transition-colors"
                  >
                    <td className="py-3 ps-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {getInitial(m)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-bold text-base-content leading-tight text-sm truncate">
                              {getUserName(m)}
                            </p>
                            {m.salary_override && (
                              <span className="rounded bg-warning/12 px-1.5 py-0.5 text-[13px] font-bold text-warning">
                                {t("Override")}</span>
                            )}
                          </div>
                          <p className="text-[13px] text-heledone-ink-muted truncate">
                            @{m.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      {m.specialty ? (
                        <span className="rounded-md bg-base-200 px-2 py-0.5 text-xs font-medium">
                          {m.specialty}
                        </span>
                      ) : (
                        <span className="text-heledone-ink-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <PaymentBadge type={m.payment_type} />
                    </td>
                    <td className="py-3 text-end font-medium">
                      {m.rate > 0 ? formatCurrency(m.rate, m.currency) : "—"}
                    </td>
                    <td className="py-3 text-end text-heledone-ink-muted">
                      {m.total_worked_hours !== null
                        ? t("{hours} hours", { hours: m.total_worked_hours.toLocaleString(getIntlLocale(), { maximumFractionDigits: 1 }) })
                        : "—"}
                    </td>
                    <td className="py-3 pe-2 text-end">
                      <span
                        className={`font-bold ${
                          m.total_cost > 0 ? "text-primary" : "text-heledone-ink-muted"
                        }`}
                      >
                        {m.total_cost > 0
                          ? formatCurrency(m.total_cost, m.currency)
                          : "—"}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
              {/* Total row */}
              <tfoot className="border-t-2 border-base-content/10">
                <tr className="text-sm font-bold text-base-content">
                  <td colSpan={5} className="pb-2 ps-2 pt-3 text-heledone-ink-muted uppercase tracking-wider text-xs">
                    {t("Total Cost")}</td>
                  <td className="pb-2 pe-2 pt-3 text-end text-primary text-base">
                    {formatCurrency(totalCost, data.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {data.pagination && data.pagination.total_pages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-base-content/8 pt-4 text-sm">
            <span className="text-heledone-ink-muted">
              {t("Showing page")} {formatUiNumber(data.pagination.current_page)}  {t("of")}{" "}
              {formatUiNumber(data.pagination.total_pages)}  {t("(Total:")}{" "}
              {formatUiNumber(data.pagination.total_results)}  {t("members)")}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!data.pagination.has_previous}
                className="rounded-md border border-base-content/10 px-3 py-1 text-base-content hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("Previous")}</button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.pagination.has_next}
                className="rounded-md border border-base-content/10 px-3 py-1 text-base-content hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("ادامه")}</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ProjectBillingTab;
