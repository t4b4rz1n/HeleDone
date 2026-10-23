import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { t as translate, useTranslation } from "../../../i18n/locale";
import React, { useState } from 'react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { Eye, EyeOff, UserPlus, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';

const ROLES = [
  { value: 'admin', get label() { return translate("Admin"); } },
  { value: 'employee', get label() { return translate("Employee"); } },
  { value: 'hr', get label() { return translate("HR"); } },
  { value: 'accountant', get label() { return translate("Accountant"); } },
];

export const StepAddUsers: React.FC = () => {
  const t = useTranslation();
  const { prevStep, nextStep, addPendingUser, removePendingUser, pendingUsers, orgData } = useOnboardingStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pendingUsers.some((u) => u.email === email || u.username === username)) {
      setError(t("A user with this email or username is already in the list."));
      return;
    }

    addPendingUser({ email, username, password, role });
    setEmail('');
    setUsername('');
    setPassword('');
    setRole('admin');
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-base-100 rounded-2xl border border-base-300 shadow-xs overflow-hidden">
        {/* Header */}
        <div className="border-b border-base-200 px-6 sm:px-8 py-5">
          <h2 className="text-xl font-bold text-base-content">{t("Add Team Members")}</h2>
          <p className="text-sm text-heledone-ink-muted mt-0.5">
            {t("For")} <span className="font-semibold text-primary">{orgData.name}</span> {t("— you can skip this and add members later.")}
          </p>
        </div>

        <div className="p-6 sm:p-8 flex flex-col lg:flex-row gap-8">
          {/* Left: Form */}
          <div className="flex-1 space-y-4">
            <form onSubmit={handleAdd} className="space-y-4">
              {/* Email */}
              <div className="form-control">
                <label className="label pb-1.5">
                  <span className="label-text font-semibold text-sm text-base-content">{t("Email")}</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input input-bordered w-full rounded-xl bg-base-100 border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
                  placeholder={t("user@company.com")}
                />
              </div>

              {/* Username */}
              <div className="form-control">
                <label className="label pb-1.5">
                  <span className="label-text font-semibold text-sm text-base-content">{t("Username")}</span>
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input input-bordered w-full rounded-xl bg-base-100 border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
                  placeholder={t("e.g. johndoe")}
                />
              </div>

              {/* Password */}
              <div className="form-control">
                <label className="label pb-1.5">
                  <span className="label-text font-semibold text-sm text-base-content">{t("Password")}</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input input-bordered w-full pe-11 rounded-xl bg-base-100 border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
                    placeholder={t("Min. 8 characters")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted hover:text-base-content transition-colors z-10"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div className="form-control">
                <label className="label pb-1.5">
                  <span className="label-text font-semibold text-sm text-base-content">{t("Role")}</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="select select-bordered w-full rounded-xl bg-base-100 border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="alert alert-error rounded-xl py-2.5 text-sm">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={!email || !username || !password}
                className="btn btn-outline btn-primary rounded-xl w-full gap-2 font-bold mt-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t("Add to List")}</span>
              </button>
            </form>
          </div>

          {/* Divider */}
          <div className="divider lg:divider-horizontal my-0" />

          {/* Right: Pending users list */}
          <div className="w-full lg:w-72 flex flex-col">
            <h4 className="font-bold text-sm text-base-content mb-3 flex items-center justify-between">
              <span>{t("Users to be added")}</span>
              <span className="badge badge-primary badge-sm font-bold">{formatUiNumber(pendingUsers.length)}</span>
            </h4>

            {pendingUsers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10 text-heledone-ink-muted bg-base-200/50 rounded-2xl border border-dashed border-base-300 p-4">
                <UserPlus className="w-8 h-8 mb-2 opacity-35" />
                <p className="text-sm font-semibold">{t("No users added yet")}</p>
                <p className="text-xs mt-1">{t("They'll be created when you confirm")}</p>
              </div>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto max-h-72">
                {pendingUsers.map((u, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-base-200/70 border border-base-300/50 rounded-xl px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-base-content truncate">@{u.username}</p>
                        <p className="text-[11px] text-heledone-ink-muted truncate">{u.email}</p>
                        <span className="badge badge-ghost badge-xs mt-0.5">{u.role}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingUser(idx)}
                      className="btn btn-ghost btn-xs text-error ms-2 shrink-0 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-base-200 px-6 sm:px-8 py-4 flex justify-between items-center bg-base-200/30">
          <button onClick={prevStep} className="btn btn-ghost rounded-xl gap-2 font-bold rtl:[&>svg]:rotate-180">
            <ArrowLeft className="w-4 h-4" />
            <span>{t("بازگشت")}</span>
          </button>
          <button onClick={nextStep} className="btn btn-primary rounded-xl px-6 gap-2 font-bold shadow-xs rtl:[&>svg]:rotate-180">
            <span>{t("Review & Confirm")}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
