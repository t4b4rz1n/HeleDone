import { useTranslation } from "../../../i18n/locale";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Calendar,
  Eye,
  EyeSlash,
  Notification as NotificationIcon,
} from "iconsax-reactjs";
import { formatDate } from "../../../utils/formatDate";
import { useMarkNotificationSeen } from "../hooks/useNotifications";
import type { Notification as NotificationType } from "../types";
import { buildNotificationLink } from "../utils/routing";
import { formatNotificationMessage } from "../utils/messages";

interface NotificationHistoryListProps {
  notifications: NotificationType[];
  isLoading: boolean;
  isError: boolean;
  viewMode: "grid" | "table";
  setViewMode: (mode: "grid" | "table") => void;
}

export const NotificationHistoryList = ({
  notifications,
  isLoading,
  isError,
  viewMode,
}: NotificationHistoryListProps) => {
  const t = useTranslation();
  const { mutate: markSeen } = useMarkNotificationSeen();
  const navigate = useNavigate();

  const handleCardClick = (notification: NotificationType) => {
    if (!notification.seen) {
      markSeen(notification.id);
    }
    if (notification.link) {
      navigate(buildNotificationLink(notification.link));
    }
  };

  if (isLoading) {
    if (viewMode === "table") {
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
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-base-100 rounded-2xl border border-base-content/10 p-5 flex flex-col h-full animate-pulse"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-base-content/10 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-base-content/10 rounded w-24" />
                <div className="h-3 bg-base-content/10 rounded w-16" />
              </div>
            </div>
            <div className="space-y-2 mb-5 grow">
              <div className="h-3 bg-base-content/10 rounded w-full" />
              <div className="h-3 bg-base-content/10 rounded w-[90%]" />
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-base-content/5 mt-auto">
              <div className="h-3 bg-base-content/10 rounded w-16" />
              <div className="h-6 bg-base-content/10 rounded w-14" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-linear-to-br from-error/5 to-error/10 rounded-2xl border border-error/20 p-12 text-center">
        <div className="text-error mb-4">
          <NotificationIcon className="w-16 h-16 mx-auto" />
        </div>
        <h3 className="text-lg font-bold text-error mb-2">{t("Loading Error")}</h3>
        <p className="text-error">
          {t("There was a problem loading notifications")}</p>
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <CoastalEmptyState motif="music" title={t("No Notifications")} description={t("Your history is empty.")} />
    );
  }

  return (
    <div className="space-y-6">
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              onClick={() => handleCardClick(notification)}
              className="coastal-item group relative bg-base-100 rounded-lg border border-base-content/10 p-5 hover:shadow-heledone-raised transition-all duration-200 flex flex-col h-full cursor-pointer"
            >
              {!notification.seen && (
                <span className="absolute top-5 end-5 w-2.5 h-2.5 bg-warning rounded-full ring-4 ring-warning/20 animate-pulse" />
              )}

              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`p-2.5 rounded-xl ${notification.seen
                      ? "bg-success/10 text-success"
                      : "bg-primary/10 text-primary"
                    }`}
                >
                  <NotificationIcon variant="Bold" className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-base-content text-sm">
                    {t("System Message")}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-heledone-ink-muted mt-0.5">
                    <Calendar size={12} />
                    <span>{formatDate(notification.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-4 grow">
                <p className="text-base-content/80 text-sm leading-relaxed line-clamp-3">
                  {formatNotificationMessage(notification)}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-base-content/5 mt-auto">
                <span className="text-[13px] uppercase tracking-wider font-semibold text-heledone-ink-muted">
                  {t("ID: #")}{notification.id.substring(0, 6)}
                </span>
                <div
                  className={`text-xs px-2 py-1 rounded-md font-medium ${notification.seen
                      ? "text-success bg-success/10"
                      : "text-warning bg-warning/10"
                    }`}
                >
                  {notification.seen ? t("Read") : t("Unread")}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        // TABLE VIEW
        <div className="bg-base-100 rounded-2xl border border-base-content/10 overflow-hidden shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-linear-to-r from-primary/10 to-primary/5 border-b border-base-content/10">
                <tr>
                  <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                    {t("Type")}</th>
                  <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                    {t("Message")}</th>
                  <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                    {t("وضعیت")}</th>
                  <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                    {t("تاریخ")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-content/5">
                {notifications.map((notif, index) => (
                  <motion.tr
                    key={notif.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    onClick={() => handleCardClick(notif)}
                    className="hover:bg-base-200 transition-all duration-200 group cursor-pointer"
                  >
                    {/* Type Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg shrink-0 ${notif.seen
                              ? "bg-success/10 text-success"
                              : "bg-primary/10 text-primary"
                            }`}
                        >
                          <NotificationIcon size={20} variant="Bold" />
                        </div>
                        <span className="text-sm font-bold text-base-content">
                          {t("System")}</span>
                      </div>
                    </td>

                    {/* Message Column */}
                    <td className="px-6 py-4">
                      <div className="max-w-md">
                        <p className="text-sm text-base-content/80 line-clamp-1">
                          {formatNotificationMessage(notif)}
                        </p>
                      </div>
                    </td>

                    {/* Status Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${notif.seen
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-warning/10 text-warning border-warning/20"
                          }`}
                      >
                        {notif.seen ? (
                          <Eye size={14} className="me-1.5" />
                        ) : (
                          <EyeSlash size={14} className="me-1.5" />
                        )}
                        {notif.seen ? t("Read") : t("Unread")}
                      </span>
                    </td>

                    {/* Date Column */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-heledone-ink-muted" />
                        <span className="text-sm text-base-content/70">
                          {formatDate(notif.created_at)}
                        </span>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
