import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { getIntlLocale, useTranslation, t } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import { AnimatePresence, motion } from "motion/react";
import {
  Add,
  ArrowLeft,
  Briefcase,
  FolderFavorite,
  People,
  Profile2User,
  Shield,
  User as UserIcon,
  Trash,
} from "iconsax-reactjs";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import {
  getOrganizationDetails,
  getMembers,
  removeMember,
} from "../api/organizationsApi";
import { CreateOrgMemberModal } from "../components/CreateOrgMemberModal";
import type { OrganizationMember } from "../types";
import { teamsApi } from "../../teams/api/teamsApi";
import * as projectsApi from "../../projects/api/projectsApi";
import { CreateEditTeamModal } from "../../teams/components/CreateEditTeamModal";
import { useProjectWizardStore } from "../../projects/store/useProjectWizardStore";
import { CreateEditUserModal } from "../../users/components/CreateEditUserModal";
import type { User } from "../../users/types";
import type { TeamWithDetails } from "../../teams/types";
import type { Project } from "../../projects/types";

const getUserDisplayName = (member: OrganizationMember): string => {
  const fullName = member.full_name?.trim();
  if (fullName) return fullName;
  return member.username || member.email || t("عضو");
};

const formatSalary = (amount?: string | null, type?: string | null) => {
  if (!amount || !type) return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;

  // Format number with commas (e.g. 100,000)
  const formatted = num.toLocaleString(getIntlLocale());
  const typeText = type.toLowerCase() === 'hourly' ? t('/ساعت') : t('/ماه');
  return `${formatted} ${typeText}`;
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
};

import { usePermissions } from "../../auth/hooks/usePermissions";

export default function OrganizationDetailPage() {
  const t = useTranslation();
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [isCreateMemberOpen, setIsCreateMemberOpen] = useState(false);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const openWizard = useProjectWizardStore((s) => s.open);
  const setSelectedOrgId = useProjectWizardStore((s) => s.setSelectedOrgId);
  const resetWizard = useProjectWizardStore((s) => s.reset);
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<User | null>(null);

  const { data: organization, isLoading: isOrgLoading } = useQuery({
    queryKey: ["organizations", orgId],
    queryFn: () => getOrganizationDetails(orgId!),
    enabled: Boolean(orgId),
  });

  const { data: members = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ["organization-members", orgId],
    queryFn: () => getMembers(orgId!),
    enabled: Boolean(orgId),
  });

  const { data: teams = [], isLoading: isTeamsLoading } = useQuery<TeamWithDetails[]>({
    queryKey: ["teams", { organization_id: orgId }],
    queryFn: async () => {
      const response = await teamsApi.getTeams({ organization_id: orgId });
      return response.data?.results ?? [];
    },
    enabled: Boolean(orgId),
  });

  const { data: projects = [], isLoading: isProjectsLoading } = useQuery<Project[]>({
    queryKey: ["projects", { organization: orgId }],
    queryFn: () =>
      projectsApi.getProjects({ organization: orgId } as Parameters<
        typeof projectsApi.getProjects
      >[0]),
    enabled: Boolean(orgId),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(orgId!, userId),
    onSuccess: () => {
      toast.success(t("Member removed successfully"));
    },
    onError: (error: any) => {
      toast.error(translateError(error?.response?.data?.message || t("خطا در حذف عضو")));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      setMemberToRemove(null);
    },
  });

  if (isOrgLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-base-200/70" />
        <div className="h-6 w-48 animate-pulse rounded-lg bg-base-200/70" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl bg-base-200/70"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="heledone-surface mx-6 mt-6 rounded-2xl border border-error/20 bg-error/5 p-8 text-center">
        <p className="font-semibold text-error">
          {t("Organization could not be loaded.")}</p>
        <button
          type="button"
          onClick={() => navigate("/organizations")}
          className="btn btn-ghost btn-sm mt-3 rounded-lg"
        >
          {t("Back to organizations")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-1 pb-10 sm:px-0">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate("/organizations")}
        className="btn btn-ghost btn-sm rounded-lg gap-2 ps-0 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
      >
        <ArrowLeft size={16} />
        {t("Back to organizations")}</button>

      {/* Organization header */}
      <div className="heledone-page-heading">
        <div className="flex min-w-0 items-center gap-4 flex-1">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <People size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {organization.name}
            </h1>
            <p className="mt-1 truncate text-sm text-heledone-ink-muted">
              /{organization.slug}
            </p>
            {organization.description && (
              <p className="mt-2 text-sm text-heledone-ink-muted">
                {organization.description}
              </p>
            )}
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:w-auto">
          {hasPermission("org.manage_members") && (
            <button
              type="button"
              onClick={() => setIsCreateMemberOpen(true)}
              className="btn btn-primary btn-sm rounded-xl gap-2 shadow-sm shadow-primary/15"
            >
              <Add size={16} />
              {t("Create member")}</button>
          )}
          {hasPermission("org.manage_settings") && (
            <button
              type="button"
              onClick={() => setIsCreateTeamOpen(true)}
              className="btn btn-outline btn-sm rounded-xl gap-2"
            >
              <Profile2User size={16} />
              {t("Create team")}</button>
          )}
          {hasPermission("project.create") && (
            <button
              type="button"
              onClick={() => {
                resetWizard();
                if (orgId) setSelectedOrgId(orgId);
                openWizard();
              }}
              className="btn btn-outline btn-sm rounded-xl gap-2"
            >
              <FolderFavorite size={16} />
              {t("ساخت پروژه")}</button>
          )}
          {hasPermission("org.manage_roles") && (
            <button
              type="button"
              onClick={() => navigate(`/organizations/${orgId}/roles`)}
              className="btn btn-outline btn-sm rounded-xl gap-2"
            >
              <Shield size={16} />
              {t("Roles Management")}</button>
          )}
        </div>
      </div>

      {/* Members section */}
      <div className="heledone-surface rounded-[24px] border border-base-content/10 bg-base-100/90 shadow-heledone-card">
        <div className="flex items-center justify-between border-b border-base-content/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <UserIcon size={18} className="text-heledone-ink-muted" />
            <h2 className="text-lg font-semibold">{t("اعضا")}</h2>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium text-heledone-ink-muted">
              {formatUiNumber(members.length)}
            </span>
          </div>
        </div>

        {isMembersLoading ? (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl bg-base-200/70"
              />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-base-200 text-heledone-ink-muted">
              <UserIcon size={24} />
            </div>
            <p className="text-sm text-heledone-ink-muted">
              {t("No members yet. Create the first member for this organization.")}</p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {members.map((member) => (
                <motion.div
                  layout
                  key={member.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  onClick={() => {
                    if (!hasPermission("org.manage_members")) return;
                    const nameParts = (member.full_name || "").trim().split(/\s+/);
                    setSelectedUserToEdit({
                      id: member.user_id,
                      username: member.username,
                      email: member.email,
                      first_name: nameParts[0] || "",
                      last_name: nameParts.slice(1).join(" ") || "",
                      is_active: true,
                      is_staff: false,
                      role_id: member.role || null,
                      avatar: member.avatar,
                      salary_type: member.salary_type || null,
                      salary_amount: member.salary_amount || null
                    });
                  }}
                  className={`heledone-surface group relative flex items-center gap-4 rounded-2xl border border-base-content/10 bg-base-200/25 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-base-100 hover:shadow-heledone-raised ${hasPermission("org.manage_members") ? "cursor-pointer" : ""}`}
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {getInitials(getUserDisplayName(member))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {getUserDisplayName(member)}
                    </p>
                    <p className="truncate text-xs text-heledone-ink-muted">
                      {member.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {member.role_display && (
                        <span className="inline-block rounded-full bg-base-200 px-2 py-0.5 text-[13px] font-medium text-heledone-ink-muted">
                          {member.role_display}
                        </span>
                      )}
                      {formatSalary(member.salary_amount, member.salary_type) && (
                        <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[13px] font-bold text-primary">
                          {formatSalary(member.salary_amount, member.salary_type)}
                        </span>
                      )}
                    </div>
                  </div>
                  {hasPermission("org.manage_members") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMemberToRemove(member);
                      }}
                      className="btn btn-ghost btn-square btn-sm rounded-xl text-error opacity-0 transition-opacity group-hover:opacity-100 hover:bg-error/10 hover:text-error"
                      title={t("Remove from organization")}
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Teams section */}
      <div className="heledone-surface rounded-[24px] border border-base-content/10 bg-base-100/90 shadow-heledone-card">
        <div className="flex items-center justify-between border-b border-base-content/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Profile2User size={18} className="text-heledone-ink-muted" />
            <h2 className="text-lg font-semibold">{t("تیم‌ها")}</h2>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium text-heledone-ink-muted">
              {formatUiNumber(teams.length)}
            </span>
          </div>
        </div>
        {isTeamsLoading ? (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-xl bg-base-200/70" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-base-200 text-heledone-ink-muted">
              <Profile2User size={24} />
            </div>
            <p className="text-sm text-heledone-ink-muted">{t("No teams found in this organization")}</p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {teams.map((team) => {
                const leader = team.leader_details;
                const memberCount = (team as TeamWithDetails & { member_count?: number; members_count?: number }).member_count
                  ?? (team as TeamWithDetails & { members_count?: number }).members_count;
                return (
                  <motion.div
                    layout
                    key={team.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="heledone-surface rounded-2xl border border-base-content/10 bg-base-200/25 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-base-100 hover:shadow-heledone-raised"
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{team.name}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-heledone-ink-muted">
                          {team.description || t("No description provided")}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium ${team.is_active ? "bg-success/10 text-success" : "bg-base-200 text-heledone-ink-muted"
                        }`}>
                        {team.is_active ? t("فعال") : t("Inactive")}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-heledone-ink-muted min-w-0">
                      <span className="truncate min-w-0 flex-1 me-2">
                        {t("Leader:")} {leader ? `${leader.first_name} ${leader.last_name}`.trim() : t("بدون مسئول")}
                      </span>
                      {memberCount !== undefined && <span>{formatUiNumber(memberCount)}  {t("members")}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Projects section */}
      <div className="heledone-surface rounded-[24px] border border-base-content/10 bg-base-100/90 shadow-heledone-card">
        <div className="flex items-center justify-between border-b border-base-content/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-heledone-ink-muted" />
            <h2 className="text-lg font-semibold">{t("پروژه‌ها")}</h2>
            <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium text-heledone-ink-muted">
              {formatUiNumber(projects.length)}
            </span>
          </div>
        </div>
        {isProjectsLoading ? (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-xl bg-base-200/70" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-base-200 text-heledone-ink-muted">
              <FolderFavorite size={24} />
            </div>
            <p className="text-sm text-heledone-ink-muted">{t("No projects found in this organization")}</p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {projects.map((project) => (
                <motion.div
                  layout
                  key={project.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="heledone-surface rounded-xl border border-base-content/10 bg-base-100 p-4 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-xl hover:shadow-primary/5"
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <p className="truncate text-sm font-semibold min-w-0 flex-1">{project.name}</p>
                    <span className="badge badge-sm shrink-0 capitalize">{project.status_display || project.status}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-heledone-ink-muted">
                    {project.description || t("No description provided")}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-heledone-ink-muted">
                    <span>{project.deadline ? t("Due {value0}", { value0: formatDisplayDate(project.deadline, "yyyy-MM-dd") }) : t("No deadline")}</span>
                    {project.progress_percentage !== undefined && <span>{formatUiNumber(project.progress_percentage)}{t("% complete")}</span>}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {isCreateMemberOpen && (
        <CreateOrgMemberModal
          orgId={orgId!}
          isOpen={isCreateMemberOpen}
          onClose={() => setIsCreateMemberOpen(false)}
        />
      )}
      <CreateEditTeamModal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
        organizationId={orgId!}
      />
      {selectedUserToEdit && (
        <CreateEditUserModal
          isOpen={!!selectedUserToEdit}
          onClose={() => setSelectedUserToEdit(null)}
          user={selectedUserToEdit}
          organizationId={orgId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["organization-members", orgId] });
            queryClient.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      )}

      {/* Remove Confirmation Dialog */}
      <AnimatePresence>
        {memberToRemove && (
          <motion.div
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1 },
            }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-md sm:p-4"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 30, scale: 0.98 },
                visible: { opacity: 1, y: 0, scale: 1 },
                exit: { opacity: 0, y: 30, scale: 0.98 },
              }}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="heledone-surface w-full max-w-md rounded-[24px] border border-base-content/10 bg-base-100/95 p-5 shadow-heledone-floating backdrop-blur-xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-error/10 text-error">
                  <Trash size={28} />
                </div>
                <h3 className="text-lg font-bold text-base-content">
                  {t("Remove Member")}</h3>
                <p className="mt-2 text-sm text-heledone-ink-muted">
                  {t("Are you sure you want to remove")}{" "}
                  <span className="font-semibold">
                    {getUserDisplayName(memberToRemove)}
                  </span>{" "}
                  {t("from this organization? This action cannot be undone.")}</p>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setMemberToRemove(null)}
                  className="btn btn-ghost rounded-xl"
                  disabled={removeMutation.isPending}
                >
                  {t("انصراف")}</button>
                <button
                  type="button"
                  onClick={() =>
                    removeMutation.mutate(String(memberToRemove.user_id))
                  }
                  disabled={removeMutation.isPending}
                  className="btn btn-error rounded-xl px-6"
                >
                  {removeMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-sm"></span>
                      {t("Removing...")}</span>
                  ) : (
                    t("Remove")
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
