import { useTranslation } from "../../../i18n/locale";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";
import { motion } from "motion/react";
import { CloseCircle, MessageText1, ArrowRight } from "iconsax-reactjs";
import { useNavigate } from "react-router-dom";
import type { Ticket } from "../types";
import { formatDate } from "../../../utils/formatDate";

interface TicketsTableProps {
  tickets: Ticket[];
  isLoading: boolean;
  isError: boolean;
}

const getTicketTypeName = (ticketType: Ticket["ticket_type"]) =>
  typeof ticketType === "string" ? ticketType : ticketType?.name || "";

export const TicketsTable = ({
  tickets,
  isLoading,
  isError,
}: TicketsTableProps) => {
  const t = useTranslation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="bg-base-100 rounded-2xl border border-base-content/10 overflow-hidden">
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-base-content/10 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-linear-to-br from-error/5 to-error/10 rounded-2xl border border-error/20 p-12 text-center">
        <div className="text-error mb-4">
          <CloseCircle className="w-16 h-16 mx-auto" />
        </div>
        <h3 className="text-lg font-bold text-error mb-2">{t("Loading Error")}</h3>
        <p className="text-error">{t("There was a problem loading tickets")}</p>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <CoastalEmptyState motif="waves" title={t("No Tickets Found")} description={t("No tickets match your search criteria")} />
    );
  }

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  return (
    <div className="bg-base-100 rounded-2xl border border-base-content/10 overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[650px]">
          <thead className="bg-linear-to-r from-primary/10 to-primary/5 border-b border-base-content/10">
            <tr>
              <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                {t("Subject")}</th>
              <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                {t("Category")}</th>
              <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                {t("اولویت")}</th>
              <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                {t("وضعیت")}</th>
              <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                {t("User")}</th>
              <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                {t("Created At")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-content/5">
            {tickets.map((ticket, index) => (
              <motion.tr
                key={ticket.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className="hover:bg-base-200 transition-all duration-200 group cursor-pointer"
              >
                {/* Title */}
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 shrink-0 flex items-center justify-center border border-base-200 group-hover:bg-primary/20 group-hover:border-primary/30 transition-all">
                      <MessageText1 size={18} className="text-primary" />
                    </div>
                    <span className="text-sm font-bold text-base-content group-hover:text-primary transition-colors">
                      {ticket.title}
                    </span>
                  </div>
                </td>

                {/* Ticket Type */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs text-base-content/70 bg-base-200/50 border border-base-content/10 px-2.5 py-1 rounded-lg">
                    {t(getTicketTypeName(ticket.ticket_type)) || "—"}
                  </span>
                </td>

                {/* Priority */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${ticket.priority === "low"
                      ? "bg-success/10 text-success border-success/20"
                      : ticket.priority === "medium"
                        ? "bg-warning/10 text-warning border-warning/20"
                        : "bg-error/10 text-error border-error/20"
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${ticket.priority === "low" ? "bg-success" :
                      ticket.priority === "medium" ? "bg-warning" : "bg-error"
                      }`} />
                    {capitalize(ticket.priority)}
                  </span>
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${ticket.status === "open"
                      ? "bg-info/10 text-info border-info/20"
                      : ticket.status === "answered"
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-base-content/10 text-heledone-ink-muted border-base-content/10"
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${ticket.status === "open" ? "bg-info animate-pulse" :
                      ticket.status === "answered" ? "bg-success" : "bg-base-content/30"
                      }`} />
                    {capitalize(ticket.status)}
                  </span>
                </td>

                {/* Creator */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-base-content/80 font-medium">
                    {ticket.user?.username || "N/A"}
                  </span>
                </td>

                {/* Created At */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-heledone-ink-muted">
                      {formatDate(ticket.created_at)}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0">
                      <ArrowRight size={16} />
                    </span>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
