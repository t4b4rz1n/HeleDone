import { useTranslation } from "../i18n/locale";
import React from "react";
import { Link } from "react-router-dom";
import { getAdminDrawerItems } from "../features/layout/DrawerItems";
import { useAuthStore } from "../features/auth/store/authStore";
import { usePermissions } from "../features/auth/hooks/usePermissions";
import { LanguagePicker } from "../components/LanguagePicker";
import { BackgroundThemePicker } from "../components/BackgroundThemePicker";
import { PageHeading } from "../components/PageHeading";
import { CoastalArtwork, CoastalDivider } from "../components/CoastalEmptyState";

const SettingsPage: React.FC = () => {
  const t = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { hasAllPermissions, hasAnyPermission } = usePermissions();
  const adminItems = getAdminDrawerItems(user, hasAllPermissions, hasAnyPermission);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 py-2">
      {/* Header */}
      <PageHeading title={t("Settings & Administration")} description={t("Manage organization settings, user roles, team structures, and system configurations.")} illustration="palm-sunset" />

      <LanguagePicker />

      <BackgroundThemePicker />

      <CoastalDivider />

      {/* Grid of Settings Modules */}
      {adminItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {adminItems.map((item) => (
            <Link
              key={item.link}
              to={`/${item.link}`}
              className="coastal-item group flex items-center gap-3.5 rounded-lg border border-base-content/8 bg-base-100 p-4 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-content">
                {item.icon}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-base-content group-hover:text-primary transition-colors">
                  {item.title}
                </h2>
                <p className="mt-0.5 text-xs text-heledone-ink-muted truncate">
                  {t("Open {section}", { section: item.title })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center">
          <CoastalArtwork motif="palm" className="mx-auto mb-5" />
          <p className="text-sm font-medium text-heledone-ink-muted">
            {t("You do not have administrative permissions configured for this workspace.")}</p>
        </div>
      )}

    </div>
  );
};

export default SettingsPage;
