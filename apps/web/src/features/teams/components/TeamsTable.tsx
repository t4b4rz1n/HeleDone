import ProfileAvatar from "../../../components/ProfileAvatar";
import { useTranslation } from "../../../i18n/locale";
import { CoastalEmptyState } from "../../../components/CoastalEmptyState";
import { formatDisplayDate } from "../../../utils/date";
import { Edit2, Profile2User, Trash, User } from "iconsax-reactjs";
import type { TeamWithDetails } from "../types";

interface TeamsTableProps {
  teams: TeamWithDetails[];
  isLoading: boolean;
  isError: boolean;
  onEdit: (team: TeamWithDetails) => void;
  onManageMembers?: (team: TeamWithDetails) => void;
  onDelete: (team: TeamWithDetails) => void;
  canManage: boolean;
  canDelete?: boolean;
}

export const TeamsTable = ({
  teams,
  isLoading,
  isError,
  onEdit,
  onManageMembers,
  onDelete,
  canManage,
  canDelete = true,
}: TeamsTableProps) => {
  const t = useTranslation();
  if (isLoading) {
    return (
      <div className="heledone-surface overflow-x-auto rounded-2xl border border-base-content/10 bg-base-100/80 shadow-heledone-card">
        <table className="table w-full">
          <thead>
            <tr>
              <th>{t("Team Name")}</th>
              <th>{t("Leader")}</th>
              <th>{t("وضعیت")}</th>
              <th>{t("Created At")}</th>
              {(canManage || onManageMembers) && <th className="text-end">{t("Actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td>
                  <div className="h-4 bg-base-content/10 rounded-sm w-32"></div>
                </td>
                <td>
                  <div className="h-4 bg-base-content/10 rounded-sm w-28"></div>
                </td>
                <td>
                  <div className="h-5 bg-base-content/10 rounded-xl w-16"></div>
                </td>
                <td>
                  <div className="h-4 bg-base-content/10 rounded-sm w-24"></div>
                </td>
                {(canManage || onManageMembers) && (
                  <td className="text-end">
                    <div className="h-6 bg-base-content/10 rounded-lg w-12 ms-auto"></div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
    <div className="heledone-surface overflow-x-auto rounded-2xl border border-base-content/10 bg-base-100/90 shadow-heledone-card">
      <table className="table w-full">
          <thead>
            <tr className="border-b border-base-content/10 bg-base-200/35 text-xs uppercase tracking-wider text-heledone-ink-muted">
              <th>{t("Team Name")}</th>
              <th>{t("Leader")}</th>
              <th>{t("وضعیت")}</th>
              <th>{t("Created At")}</th>
              {(canManage || onManageMembers) && <th className="text-end">{t("Actions")}</th>}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr
              key={team.id}
              className="border-base-content/5 transition-colors hover:bg-base-200/45"
            >
              <td className="font-semibold text-base-content">
                <div>
                  <div className="font-bold">{team.name}</div>
                  {team.description && (
                    <div className="text-xs text-heledone-ink-muted line-clamp-1 max-w-xs">
                      {team.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="text-base-content/80">
                <div className="flex items-center gap-2">
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
                  <span>
                    {team.leader_details
                      ? team.leader_details.username || `${team.leader_details.first_name || ""} ${team.leader_details.last_name || ""}`.trim() || team.leader_details.email || t("Unknown User")
                      : "\u2014"}
                  </span>
                </div>
              </td>
              <td>
                <span
                  className={`badge badge-sm rounded-lg ${
                    team.is_active
                      ? "badge-success bg-success/10 text-success border-none"
                      : "badge-ghost bg-base-200 text-heledone-ink-muted border-none"
                  }`}
                >
                  {team.is_active ? t("فعال") : t("Inactive")}
                </span>
              </td>
              <td className="text-xs text-heledone-ink-muted">
                {formatDisplayDate(team.created_at ?? "", "yyyy-MM-dd")}
              </td>
              {(canManage || onManageMembers) && (
                <td className="text-end">
                  <div className="flex items-center justify-end gap-1">
                    {onManageMembers && (
                      <button
                        type="button"
                        onClick={() => onManageMembers(team)}
                        className="btn btn-ghost btn-xs gap-1 rounded-lg text-heledone-ink-muted hover:bg-primary/10 hover:text-primary"
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
                          className="btn btn-ghost btn-xs gap-1 rounded-lg text-heledone-ink-muted hover:text-primary hover:bg-primary/10"
                          title={t("Edit Team")}
                        >
                          <Edit2 size={14} />
                          <span className="hidden sm:inline">{t("ویرایش")}</span>
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => onDelete(team)}
                            className="btn btn-ghost btn-xs gap-1 rounded-lg text-heledone-ink-muted hover:text-error hover:bg-error/10"
                            title={t("Delete Team")}
                          >
                            <Trash size={14} />
                            <span className="hidden sm:inline">{t("حذف")}</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
