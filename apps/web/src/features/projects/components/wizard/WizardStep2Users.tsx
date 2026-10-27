import ProfileAvatar from "../../../../components/ProfileAvatar";
import { formatNumber as formatUiNumber } from "../../../../i18n/locale";
import { useTranslation } from "../../../../i18n/locale";
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectWizardStore } from '../../store/useProjectWizardStore';
import { useAuthStore } from '../../../auth/store/authStore';
import { getMembers, getOrganizationDetails } from '../../../organizations/api/organizationsApi';
import type { OrganizationMember } from '../../../organizations/types';
import { Lock, Search, Check } from 'lucide-react';


export const WizardStep2Users: React.FC = () => {
  const t = useTranslation();
  const { selectedUserIds, toggleUser, nextStep, prevStep, selectedOrgId } = useProjectWizardStore();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');

  const orgId = selectedOrgId as string | undefined;


  const { data: members = [], isLoading } = useQuery({
    queryKey: ['org-members-wizard', orgId],
    queryFn: () => getMembers(orgId!),
    enabled: !!orgId,
  });
  const { data: organization, isLoading: isOrgLoading } = useQuery({
    queryKey: ['organizations', orgId],
    queryFn: () => getOrganizationDetails(orgId!),
    enabled: !!orgId,
  });

  const filtered = members.filter((m: OrganizationMember) => {
    const q = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    );
  });

  const isOwner = (m: OrganizationMember) =>
    !!organization?.owner && String(m.user_id) === String(organization.owner.id);
  const isCreator = (m: OrganizationMember) =>
    !!user && String(m.user_id) === String(user.id);
  const autoMemberIds = [organization?.owner?.id, user?.id]
    .filter((id) => id != null)
    .map(String);
  const totalSelected = new Set([...selectedUserIds.map(String), ...autoMemberIds]).size;


  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-heledone-ink-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input input-bordered input-sm w-full ps-9 bg-base-200/50"
            placeholder={t("Search members...")}
          />
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pe-1 min-h-0 max-h-72">
          {isLoading || isOrgLoading ? (
            <div className="flex items-center justify-center py-10 text-heledone-ink-muted">
              <span className="loading loading-spinner loading-sm me-2" />
              {t("Loading members...")}</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-heledone-ink-muted py-8">{t("No members found")}</p>
          ) : (
            filtered.map((m: OrganizationMember) => {
              const owner = isOwner(m);
              const locked = owner || isCreator(m);
              const checked = locked || selectedUserIds.includes(m.user_id);

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (!locked) toggleUser(m.user_id);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    checked
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-base-200/40 border border-transparent hover:bg-base-200'
                  } ${locked ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <ProfileAvatar
                    src={m.avatar_url || m.avatar}
                    name={m.full_name || m.email}
                    className="size-9 shrink-0 overflow-hidden rounded-full"
                    fallbackClassName={`flex size-full items-center justify-center rounded-full text-xs font-bold text-white ${locked ? "bg-[#087F83]" : "bg-[#52666C]"}`}
                  />

                  {/* Info */}
                  <div className="flex-1 text-start min-w-0">
                    <p className="text-sm font-medium text-base-content truncate">
                      {m.full_name || m.email}
                    </p>
                    <p className="text-xs text-heledone-ink-muted truncate">
                      {m.role_display || m.email}
                    </p>
                  </div>

                  {/* Status indicator */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {locked && (
                      <span className="badge badge-primary badge-xs">
                        {owner ? t("Owner") : t("Project creator")}
                      </span>
                    )}
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        checked
                          ? 'bg-primary'
                          : 'border-2 border-base-content/20'
                      }`}
                    >
                      {locked ? (
                        <Lock className="w-3 h-3 text-primary-content" />
                      ) : checked ? (
                        <Check className="w-3 h-3 text-primary-content" />
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <p className="text-xs text-heledone-ink-muted mt-3">
          {formatUiNumber(totalSelected)}  {t("member(s) will be added to this project")}</p>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-6 mt-4 border-t border-base-300">
        <button onClick={prevStep} className="btn btn-ghost btn-sm gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("بازگشت")}</button>
        <button onClick={nextStep} className="btn btn-primary btn-sm gap-2 px-6">
          {t("Next: Choose Board")}<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
