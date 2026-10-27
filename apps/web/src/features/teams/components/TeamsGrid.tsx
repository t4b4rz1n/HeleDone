import ProfileAvatar from "../../../components/ProfileAvatar";
import { useTranslation } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { motion } from "motion/react";
import { Edit2, Profile2User, Trash, User } from "iconsax-reactjs";
import type { TeamWithDetails } from "../types";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";

interface TeamsGridProps {
  teams: TeamWithDetails[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (team: TeamWithDetails) => void;
  onManageMembers?: (team: TeamWithDetails) => void;
  onDelete: (team: TeamWithDetails) => void;
  canManage: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
};

export const TeamsGrid = ({
  teams,
  isLoading,
  isError,
  onEdit,
  onManageMembers,
  onDelete,
  canManage,
}: TeamsGridProps) => {
  const t = useTranslation();
  if (isLoading) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="heledone-surface space-y-4 rounded-2xl border border-base-content/10 bg-base-100/80 p-5 shadow-heledone-card animate-pulse"
          >
            <div className="h-6 bg-base-content/10 rounded-sm w-2/3"></div>
            <div className="h-4 bg-base-content/10 rounded-sm w-full"></div>
            <div className="h-4 bg-base-content/10 rounded-sm w-1/2"></div>
            <div className="flex gap-2 pt-4">
              <div className="h-8 bg-base-content/10 rounded-xl w-20"></div>
              <div className="h-8 bg-base-content/10 rounded-xl w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center border border-dashed border-error/30 rounded-2xl p-6 bg-error/5">
        <p className="text-error font-medium">{t("Failed to load teams data.")}</p>
        <p className="text-xs text-heledone-ink-muted mt-1">
          {t("Please check your network connection or try again later.")}</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <CoastalEmptyState motif="coast" title={t("No teams found")} description={t("Try adjusting your search query or filters.")} />
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {teams.map((team) => (
        <motion.div
          key={team.id}
          variants={cardVariants}
          className="coastal-item heledone-surface group flex flex-col justify-between rounded-lg border border-base-content/10 bg-base-100/90 transition-all duration-200 hover:border-primary/30 hover:shadow-heledone-raised"
        >
          <div className="p-5 sm:p-6">
            <div className="flex justify-between items-start gap-4 min-w-0">
              <h3 className="font-bold text-lg text-base-content group-hover:text-primary transition-colors duration-200 line-clamp-1 min-w-0 flex-1">
                {team.name}
              </h3>
              <div
                className={`badge badge-sm rounded-lg py-2.5 px-2 shrink-0 ${
                  team.is_active
                    ? "badge-success bg-success/10 text-success border-none"
                    : "badge-ghost bg-base-200 text-heledone-ink-muted border-none"
                }`}
              >
                {team.is_active ? t("فعال") : t("Inactive")}
              </div>
            </div>

            <p className="text-sm text-base-content/75 mt-2 line-clamp-2 min-h-[40px]">
              {team.description || t("No description provided.")}
            </p>

            <div className="divider my-4 opacity-50"></div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-base-content/80 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {team.leader_details ? (
                    <ProfileAvatar
                      src={team.leader_details.avatar_url || team.leader_details.avatar}
                      name={team.leader_details.username || `${team.leader_details.first_name} ${team.leader_details.last_name}`}
                      className="size-7 shrink-0 overflow-hidden rounded-full"
                      fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-base-200 text-heledone-ink-muted flex items-center justify-center shrink-0">
                      <Profile2User size={14} />
                    </div>
                  )}
                  <span className="font-medium text-heledone-ink-muted shrink-0">{t("Leader:")}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {team.leader_details
                      ? team.leader_details.username || `${team.leader_details.first_name || ""} ${team.leader_details.last_name || ""}`.trim() || team.leader_details.email || t("Unknown User")
                      : t("Not assigned")}
                  </span>
              </div>
            </div>

         </div>
         </div>

         <div className="flex items-end justify-between gap-3 rounded-b-2xl border-t border-base-content/5 bg-base-200/20 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
            <div className="text-xs text-heledone-ink-muted">
              {formatDisplayDate(team.created_at ?? "", "yyyy-MM-dd")}
            </div>
            {(canManage || onManageMembers) && (
              <div className="flex items-center gap-2">
                {onManageMembers && (
                  <button
                    type="button"
                    onClick={() => onManageMembers(team)}
                    className="btn btn-ghost btn-xs gap-1.5 rounded-xl text-heledone-ink-muted hover:text-primary hover:bg-primary/10 motion-interactive"
                    title={t("Manage Members")}
                  >
                    <User size={14} />
                    <span className="hidden sm:inline">{t("اعضا")}</span>
                  </button>
                )}
                {canManage && (
                  <>
                    <button
                      onClick={() => onEdit(team)}
                      className="btn btn-ghost btn-xs gap-1.5 rounded-xl text-heledone-ink-muted hover:text-primary hover:bg-primary/10 motion-interactive"
                      title={t("Edit Team")}
                    >
                      <Edit2 size={14} />
                      <span className="hidden sm:inline">{t("ویرایش")}</span>
                    </button>
                    <button
                      onClick={() => onDelete(team)}
                      className="btn btn-ghost btn-xs gap-1.5 rounded-xl text-heledone-ink-muted hover:text-error hover:bg-error/10 motion-interactive"
                      title={t("Delete Team")}
                    >
                      <Trash size={14} />
                      <span className="hidden sm:inline">{t("حذف")}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
};
