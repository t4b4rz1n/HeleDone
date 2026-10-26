import ProfileAvatar from "../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { useTranslation } from "../../../i18n/locale";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  Add,
  People,
  Profile2User,
  UserMinus,
} from "iconsax-reactjs";
import {
  useTeamMembers,
  useAddTeamMember,
  useRemoveTeamMember,
} from "../hooks/useTeams";
import { useUsers } from "../../users/hooks/useUsers";
import { ConfirmationModal } from "../../../components/ConfirmationModal";
import { usePermissions } from "../../auth/hooks/usePermissions";
import type { Team, TeamMember } from "../types";
import type { User } from "../../users/types";

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 30, scale: 0.98 },
};

interface TeamMembersModalProps {
  team: Team | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TeamMembersModal = ({ team, isOpen, onClose }: TeamMembersModalProps) => {
  const t = useTranslation();
  const { hasAnyPermission, isStaff } = usePermissions();
  const canManageMembers = hasAnyPermission(["org.manage_members", "org.manage_settings"]) || isStaff;
  const { data: members, isLoading, isError } = useTeamMembers(team?.id);
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const organizationId = team?.organization_id;
  const { data: usersResponse } = useUsers(
    new URLSearchParams(
      organizationId
        ? { page_size: "1000", organization_id: String(organizationId) }
        : { page_size: "1000" },
    ),
  );
  const users: User[] = usersResponse?.results ?? [];

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedUserId("");
      setRemovingMember(null);
    }
  }, [isOpen]);

  const handleAddMember = async () => {
    if (team && selectedUserId) {
      try {
        await addMember.mutateAsync({
          teamId: team.id,
          user: selectedUserId,
        });
        setSelectedUserId("");
      } catch {
        // toast handled by hook
      }
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removingMember || !team) return;
    try {
      await removeMember.mutateAsync({
        membershipId: removingMember.id,
        teamId: team.id,
      });
      setRemovingMember(null);
    } catch {
      // toast handled by hook
    }
  };



  const availableUsers = users.filter(
    (u) => !members?.some((m) => String(m.user) === String(u.id))
  );

  const memberCount = members?.length ?? 0;

  const modalContent = (
    <AnimatePresence>
      {isOpen && team && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-md sm:p-4"

        >
          <motion.div
            variants={modalVariants}
            className="heledone-surface relative m-0 flex max-h-[min(90dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-base-content/10 bg-base-100/95 shadow-heledone-floating backdrop-blur-xl sm:m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-base-content/10 bg-base-200/30 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
                    <People size={28} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-base-content sm:text-2xl">
                      {t("Manage Members")}</h3>
                    <p className="truncate text-sm text-heledone-ink-muted">
                      {t("Members of")} <span className="font-semibold text-base-content/80">{team.name}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-square btn-sm shrink-0 rounded-xl text-heledone-ink-muted transition-colors hover:bg-base-content/10 hover:text-base-content"
                  aria-label={t("Close members modal")}
                >
                  <X size={20} strokeWidth={2.25} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="min-h-[200px] max-h-[500px] flex-1 overflow-y-auto p-4 sm:p-6">
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 rounded-xl bg-base-200/50 animate-pulse"
                    >
                      <div className="w-10 h-10 rounded-full bg-base-content/10 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-base-content/10 rounded-sm w-32" />
                        <div className="h-3 bg-base-content/10 rounded-sm w-24" />
                      </div>
                      <div className="h-6 bg-base-content/10 rounded-xl w-16" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center border border-dashed border-error/30 rounded-2xl p-6 bg-error/5">
                  <p className="text-error font-medium">{t("Failed to load members.")}</p>
                  <p className="text-xs text-heledone-ink-muted mt-1">
                    {t("Please check your network connection or try again later.")}</p>
                </div>
              ) : members && members.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-base-content/15 bg-base-200/20 p-6 text-center">
                  <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-base-content/5 text-heledone-ink-muted">
                    <People size={26} />
                  </div>
                  <p className="text-base font-semibold text-base-content/70">{t("No members found")}</p>
                  {canManageMembers && (
                    <p className="text-sm text-heledone-ink-muted mt-1">
                      {t("Add team members using the form below.")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {members?.map((member) => (
                    <div
                      key={member.id}
                      className="group flex items-center gap-3 rounded-2xl border border-base-content/10 bg-base-200/20 p-3.5 transition-colors duration-200 hover:border-base-content/15 hover:bg-base-200/60 sm:gap-4 sm:p-4"
                    >
                      <ProfileAvatar
                        src={member.user_details?.avatar}
                        name={member.user_details?.username || `${member.user_details?.first_name || ""} ${member.user_details?.last_name || ""}`.trim() || member.user_details?.email}
                        className="size-10 shrink-0 overflow-hidden rounded-full"
                        fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-base-content truncate">
                            {member.user_details
                              ? member.user_details.username || `${member.user_details.first_name || ""} ${member.user_details.last_name || ""}`.trim() || member.user_details.email || t("Unknown User")
                              : t("Unknown User")}
                          </p>
                          {String(member.user) === String(team?.lead_id) && (
                            <span className="badge badge-primary badge-sm badge-outline text-[13px] h-5 px-1.5 font-semibold">
                              {t("Leader")}</span>
                          )}
                        </div>
                        <p className="text-xs text-heledone-ink-muted truncate">
                          {member.user_details?.email || ""}
                        </p>
                      </div>

                      {canManageMembers && (
                        <button
                          type="button"
                          onClick={() => setRemovingMember(member)}
                          className="btn btn-ghost btn-sm min-h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-heledone-ink-muted transition-colors hover:border-error/15 hover:bg-error/10 hover:text-error sm:px-3"
                          title={t("Remove member")}
                        >
                          <UserMinus size={16} />
                          <span className="hidden sm:inline">{t("Remove")}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Member Section */}
              {canManageMembers && !isLoading && !isError && (
                <div className="mt-6 border-t border-base-content/10 pt-5 sm:pt-6">
                  <h4 className="font-semibold text-sm text-base-content mb-4 flex items-center gap-2">
                    <Add size={16} className="text-primary" />
                    {t("Add New Member")}</h4>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="select select-bordered w-full rounded-xl border-base-content/10 bg-base-200/30 ps-10 transition-colors hover:border-base-content/20"
                      >
                        <option value="">{t("Select a user...")}</option>
                        {availableUsers.map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.first_name} {user.last_name} ({user.username})
                          </option>
                        ))}
                        {availableUsers.length === 0 && users.length > 0 && (
                          <option value="" disabled>
                            {t("All users are already members")}</option>
                        )}
                      </select>
                      <div className="absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted pointer-events-none">
                        <Profile2User size={18} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddMember}
                      disabled={!selectedUserId || addMember.isPending}
                      className="btn btn-primary shrink-0 gap-1.5 rounded-xl px-5 font-semibold shadow-md shadow-primary/15 transition-all hover:shadow-lg hover:shadow-primary/20 motion-interactive"
                    >
                      {addMember.isPending ? (
                        <span className="loading loading-spinner loading-sm" />
                      ) : (
                        <>
                          <Add size={16} />
                          {t("Add Member")}</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-base-content/10 bg-base-200/30 p-5 sm:p-6">
              <span className="text-xs text-heledone-ink-muted">
                {formatUiNumber(memberCount)}  {t("member")}{memberCount !== 1 ? "s" : ""}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {typeof document !== "undefined" ? createPortal(modalContent, document.body) : null}
      <ConfirmationModal
        isOpen={removingMember !== null}
        onClose={() => setRemovingMember(null)}
        onConfirm={handleRemoveConfirm}
        title={t("Remove Member")}
        message={t("Are you sure you want to remove this member from the team?")}
        isLoading={removeMember.isPending}
      />
    </>
  );
};
