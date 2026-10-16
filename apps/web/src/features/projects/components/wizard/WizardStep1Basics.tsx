import { useTranslation } from "../../../../i18n/locale";
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectWizardStore } from '../../store/useProjectWizardStore';
import { getOrganizations } from '../../../organizations/api/organizationsApi';
import { Building2, ChevronDown, CheckSquare, Flag, HelpCircle } from 'lucide-react';

const COLORS = [
  '#087F83', '#006D73', '#DF765B', '#F2BA49',
  '#A7D4CD', '#C6E6E1', '#D8E6D6', '#F7DFAD',
  '#F5D3C6', '#EBC0AF', '#D7C8B3', '#52666C',
];

export const WizardStep1Basics: React.FC = () => {
  const t = useTranslation();
  const {
    projectName, setProjectName,
    projectColor, setProjectColor,
    selectedOrgId, setSelectedOrgId,
    progressMode, setProgressMode,
    nextStep, close,
  } = useProjectWizardStore();

  const [showProgressHelp, setShowProgressHelp] = useState(false);

  const { data: orgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['organizations-list'],
    queryFn: getOrganizations,
    staleTime: 1000 * 60 * 5,
  });

  // Auto-select first org if none selected
  React.useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId, setSelectedOrgId]);

  const canProceed = projectName.trim() && selectedOrgId;

  const handleNext = () => {
    if (!canProceed) return;
    nextStep();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-5">

        {/* Organization Selector */}
        <div>
          <label className="block text-sm font-medium text-base-content/70 mb-1.5">
            {t("Organization")} <span className="text-error">*</span>
          </label>
          {orgsLoading ? (
            <div className="input input-bordered flex items-center gap-2 bg-base-200/50">
              <span className="loading loading-spinner loading-xs" />
              <span className="text-sm text-heledone-ink-muted">{t("Loading...")}</span>
            </div>
          ) : orgs.length === 0 ? (
            <div className="input input-bordered flex items-center gap-2 bg-base-200/50 text-error text-sm">
              {t("No organizations found")}</div>
          ) : (
            <div className="relative">
              <Building2 className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-heledone-ink-muted pointer-events-none" />
              <select
                value={selectedOrgId ?? ''}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="select select-bordered w-full ps-9 bg-base-200/50 focus:select-primary appearance-none"
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-heledone-ink-muted pointer-events-none" />
            </div>
          )}
        </div>

        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-base-content/70 mb-1.5">
            {t("نام پروژه")} <span className="text-error">*</span>
          </label>
          <input
            type="text"
            autoFocus
            required
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNext(); }}
            className="input input-bordered w-full bg-base-200/50 focus:input-primary"
            placeholder={t("e.g. Q4 Product Launch")}

          />
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-base-content/70 mb-2">
            {t("رنگ پروژه")}</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setProjectColor(c)}
                className="w-7 h-7 rounded-full transition-all duration-150"
                style={{
                  backgroundColor: c,
                  boxShadow: projectColor === c
                    ? `0 0 0 2px ${c}, 0 0 0 4px var(--fallback-b1,oklch(var(--b1)))`
                    : 'none',
                  transform: projectColor === c ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Progress Mode */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <label className="block text-sm font-medium text-base-content/70">
              {t("روش محاسبه پیشرفت")}
            </label>
            <button
              type="button"
              onClick={() => setShowProgressHelp((v) => !v)}
              className="flex items-center justify-center w-4 h-4 rounded-full text-base-content/40 hover:text-primary transition-colors"
              aria-label={t("راهنمای روش محاسبه پیشرفت")}
            >
              <HelpCircle size={14} />
            </button>
          </div>

          {/* Inline help — no absolute positioning, no overflow issues */}
          {showProgressHelp && (
            <div className="mb-3 relative rounded-xl border border-base-content/10 bg-base-200/50 p-3 text-xs space-y-2.5">
              <button
                type="button"
                onClick={() => setShowProgressHelp(false)}
                className="absolute top-2 end-2 flex items-center justify-center w-5 h-5 rounded-full text-base-content/40 hover:text-base-content hover:bg-base-300 transition-colors"
                aria-label={t("بستن")}
              >✕</button>
              <div className="flex gap-2">
                <span className="text-primary mt-0.5 shrink-0"><CheckSquare size={13} /></span>
                <div>
                  <p className="font-bold text-base-content">{t("بر اساس تسک")}</p>
                  <p className="text-base-content/60 leading-relaxed mt-0.5">{t("پیشرفت = تسک‌های انجام‌شده ÷ کل تسک‌ها × ۱۰۰")}</p>
                  <p className="text-base-content/50 mt-0.5">{t("مناسب وقتی milestone ندارید یا می‌خواهید نمای ساده داشته باشید.")}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="text-warning mt-0.5 shrink-0"><Flag size={13} /></span>
                <div>
                  <p className="font-bold text-base-content">{t("بر اساس مایل‌استون")}</p>
                  <p className="text-base-content/60 leading-relaxed mt-0.5">{t("پیشرفت = وزن milestone‌های تکمیل‌شده ÷ کل وزن × ۱۰۰")}</p>
                  <p className="text-base-content/50 mt-0.5">{t("اگر milestone نسازید، عدد پیشرفت صفر می‌ماند.")}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setProgressMode('task_based')}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all ${
                progressMode === 'task_based'
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-base-content/10 bg-base-200/50 text-base-content/70 hover:border-base-content/20'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <CheckSquare size={14} />
                <span className="text-xs font-bold">{t("بر اساس تسک")}</span>
              </div>
              <p className="text-[11px] leading-tight opacity-70">{t("درصد = تسک‌های انجام‌شده")}</p>
            </button>
            <button
              type="button"
              onClick={() => setProgressMode('milestone_based')}
              className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all ${
                progressMode === 'milestone_based'
                  ? 'border-primary bg-primary/8 text-primary'
                  : 'border-base-content/10 bg-base-200/50 text-base-content/70 hover:border-base-content/20'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Flag size={14} />
                <span className="text-xs font-bold">{t("بر اساس مایل‌استون")}</span>
              </div>
              <p className="text-[11px] leading-tight opacity-70">{t("درصد = مایل‌استون‌های تکمیل‌شده")}</p>
            </button>
          </div>
        </div>
      </div>


      {/* Footer */}
      <div className="flex justify-between items-center pt-6 mt-6 border-t border-base-300">
        <button type="button" onClick={close} className="btn btn-ghost btn-sm">
          {t("انصراف")}</button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed}
          className="btn btn-primary btn-sm gap-2 px-6"
        >
          {t("Next: Add Users")}<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
