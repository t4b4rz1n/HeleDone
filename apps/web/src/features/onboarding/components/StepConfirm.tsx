import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import React, { useState } from 'react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useAuthStore } from '../../auth/store/authStore';
import ApiService from '../../../core/api/apiService';
import { toast } from 'sonner';
import {
  Building2, Users, CheckCircle2, ArrowLeft, Loader2,
} from 'lucide-react';

export const StepConfirm: React.FC = () => {
  const t = useTranslation();
  const { orgData, pendingUsers, prevStep, setOrganizationId } = useOnboardingStore();
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState('');

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // 1) Create organization
      setProgress(t("Creating organization..."));
      const orgResponse = await ApiService.post('/organizations/', {
        name: orgData.name,
        description: orgData.description,
      });
      const orgId: string = orgResponse.data.id;
      setOrganizationId(orgId);

      // 2) Mark onboarding as done for this user in localStorage (permanent flag)
      if (user?.id) {
        localStorage.setItem(`onboarding_done_${user.id}`, 'true');
      }

      // 3) Create pending users
      const failedUsers: string[] = [];
      for (const u of pendingUsers) {
        setProgress(t("Adding user @{value0}...", { value0: u.username }));
        try {
          await ApiService.post(`/organizations/${orgId}/invite_member/`, {
            email: u.email,
            username: u.username,
            password: u.password,
            role_id: u.role,
          });
        } catch (err: any) {
          const detail = err.response?.data?.detail || t("Failed to add @{value0}", { value0: u.username });
          failedUsers.push(`@${u.username}: ${detail}`);
        }
      }

      if (failedUsers.length > 0) {
        failedUsers.forEach((msg) => toast.error(msg, { duration: 6000 }));
      }

      setProgress('');
      setDone(true);
      toast.success(t("Workspace created successfully!"));

      // Use hard navigation so the app fully re-initializes with the new org in context.
      setTimeout(() => {
        window.location.href = '/projects?wizard=1';
      }, 1200);
    } catch (err: any) {
      toast.error(translateError(err.response?.data?.detail || 'Failed to create organization'));
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <div className="bg-base-100 rounded-2xl border border-base-300 shadow-sm p-8 sm:p-12">
          <div className="w-16 h-16 rounded-2xl bg-success/15 text-success flex items-center justify-center mx-auto mb-5 shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-base-content mb-2">{t("All set!")}</h2>
          <p className="text-heledone-ink-muted text-sm mb-3">
            <strong className="text-base-content">{orgData.name}</strong> {t("has been created.")}
          </p>
          <p className="text-heledone-ink-muted text-xs flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>{t("Redirecting to Projects...")}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-base-100 rounded-2xl border border-base-300 shadow-xs overflow-hidden">
        {/* Header */}
        <div className="border-b border-base-200 px-6 sm:px-8 py-5">
          <h2 className="text-xl font-bold text-base-content">{t("Review & Confirm")}</h2>
          <p className="text-sm text-heledone-ink-muted mt-0.5">
            {t("Everything below will be created when you click Confirm.")}
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Org info */}
          <div className="rounded-xl bg-base-200/70 border border-base-300/50 p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </span>
              <span className="font-bold text-sm text-base-content">{t("Organization")}</span>
            </div>
            <p className="text-base font-extrabold text-base-content ps-10">{orgData.name}</p>
            {orgData.description && (
              <p className="text-xs text-heledone-ink-muted ps-10 mt-1">{orgData.description}</p>
            )}
          </div>

          {/* Users */}
          <div className="rounded-xl bg-base-200/70 border border-base-300/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </span>
                <span className="font-bold text-sm text-base-content">{t("Users to create")}</span>
              </div>
              <span className="badge badge-primary badge-sm font-bold">{formatUiNumber(pendingUsers.length)}</span>
            </div>

            {pendingUsers.length === 0 ? (
              <p className="text-xs text-heledone-ink-muted ps-10">
                {t("No users — you can add them later from Settings.")}
              </p>
            ) : (
              <div className="space-y-2 ps-10">
                {pendingUsers.map((u, i) => (
                  <div key={i} className="flex items-center gap-2.5 py-1">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-base-content">@{u.username}</span>
                      <span className="text-heledone-ink-muted">{u.email}</span>
                      <span className="badge badge-ghost badge-xs">{u.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-base-200 px-6 sm:px-8 py-4 flex justify-between items-center bg-base-200/30">
          <button
            onClick={prevStep}
            disabled={loading}
            className="btn btn-ghost rounded-xl gap-2 font-bold rtl:[&>svg]:rotate-180"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("بازگشت")}</span>
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="btn btn-primary rounded-xl px-6 gap-2 font-bold shadow-xs min-w-[160px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{progress || t("Creating...")}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t("Confirm & Create")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
