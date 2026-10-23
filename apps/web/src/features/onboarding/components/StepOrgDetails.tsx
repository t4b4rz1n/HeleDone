import { useTranslation } from "../../../i18n/locale";
import React, { useState } from 'react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { ArrowRight } from 'lucide-react';

export const StepOrgDetails: React.FC = () => {
  const t = useTranslation();
  const { nextStep, setOrgData, orgData } = useOnboardingStore();
  const [name, setName] = useState(orgData.name);

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setOrgData({ name: name.trim(), description: '' });
    nextStep();
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="bg-base-100 rounded-2xl border border-base-300 shadow-xs overflow-hidden">
        {/* Header */}
        <div className="border-b border-base-200 px-6 sm:px-8 py-5">
          <h2 className="text-xl font-bold text-base-content">{t("نام سازمان")}</h2>
          <p className="text-sm text-heledone-ink-muted mt-0.5">{t("What's the name of your workspace?")}</p>
        </div>

        {/* Body */}
        <form onSubmit={handleNext} className="p-6 sm:p-8 space-y-6">
          <div className="form-control">
            <label className="label pb-2">
              <span className="label-text font-semibold text-base-content text-sm">
                {t("نام سازمان")} <span className="text-error">*</span>
              </span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-bordered w-full rounded-xl bg-base-100 border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
              placeholder={t("e.g. Acme Corporation")}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={!name.trim()}
              className="btn btn-primary rounded-xl px-6 font-bold gap-2 shadow-xs rtl:[&>svg]:rotate-180"
            >
              <span>{t("Next: Add Users")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
