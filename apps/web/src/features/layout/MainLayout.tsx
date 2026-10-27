import { useTranslation } from "../../i18n/locale";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "../../components/ErrorFallback";
import { useAuthStore } from "../auth/store/authStore";
import { usePermissions } from "../auth/hooks/usePermissions";
import { getProfileRequest } from "../auth/api/authApi";
import { CommandMenu } from "./CommandMenu";
import { getVisibleDrawerItems } from "./DrawerItems";
import { HomeHeader, HomeSidebar } from "../dashboard/components/HomeShell";
import { getOrganizations } from "../organizations/api/organizationsApi";
import { OnboardingWizard } from "../onboarding/components/OnboardingWizard";
import { ProjectWizard } from "../projects/components/wizard/ProjectWizard";
import PageLoader from "../../components/PageLoader";
import ContentLoader from "../../components/ContentLoader";
import TopProgressBar from "../../components/TopProgressBar";

export const MainLayout = () => {
  const t = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const { hasAllPermissions, hasAnyPermission } = usePermissions();
  const isStaff = user?.is_superuser === true;
  const { pathname } = useLocation();
  const [isCommandMenuOpen, setCommandMenuOpen] = useState(false);

  const { data: latestProfile } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: () => getProfileRequest(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
  });

  const { data: organizations, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ["organizations-list"],
    queryFn: () => getOrganizations(),
    enabled: isAuthenticated && isStaff,
    staleTime: 1000 * 60 * 5,
  });

  // Determine if this superuser needs to see the onboarding wizard.
  // The wizard is shown ONLY the very first time (no orgs + no localStorage flag).
  const onboardingDoneKey = user?.id ? `onboarding_done_${user.id}` : null;
  const onboardingAlreadyDone = onboardingDoneKey ? localStorage.getItem(onboardingDoneKey) === 'true' : false;

  useEffect(() => {
    if (latestProfile) {
      updateUser(latestProfile);
    }
  }, [latestProfile, updateUser]);

  const commandItems = useMemo(
    () => getVisibleDrawerItems(user, hasAllPermissions, hasAnyPermission),
    [hasAllPermissions, hasAnyPermission, user],
  );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Intercept for superuser onboarding
  const rawOnboardingDone = Object.keys(localStorage).some(
    (k) => k.startsWith('onboarding_done_') && localStorage.getItem(k) === 'true'
  );

  if (isStaff) {
    // 1. If backend definitively says 0 orgs, ALWAYS show wizard (handles DB resets)
    if (organizations && organizations.length === 0) {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('onboarding_done_')) localStorage.removeItem(k);
      });
      return <OnboardingWizard />;
    }

    // 2. If loading and NO local storage flag exists, show loader
    // (If a flag DOES exist, we skip the loader to prevent flashing on hard reload)
    if (isLoadingOrgs && !onboardingAlreadyDone && !rawOnboardingDone) {
      return <PageLoader fullScreen />;
    }

    // 3. Has orgs → mark as done so we never check again
    if (organizations && organizations.length > 0 && onboardingDoneKey) {
      localStorage.setItem(onboardingDoneKey, 'true');
    }
  }

  const isTasksView = pathname.startsWith("/tasks");

  return (
    <div className={`${pathname === "/dashboard" ? "home-reference-shell " : ""}heledone-workspace flex h-dvh overflow-hidden bg-base-200 font-sans text-base-content`}>
      <TopProgressBar />
      <a
        href="#main-content"
        className="fixed start-4 top-3 z-[200] -translate-y-24 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-content shadow-lg transition-transform focus:translate-y-0"
      >
        {t("رفتن به محتوای اصلی")}</a>
      {!isTasksView && <HomeSidebar />}

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <HomeHeader onSearch={() => setCommandMenuOpen(true)} />

        <main id="main-content" data-section={pathname.split('/')[1] || 'dashboard'} tabIndex={-1} className={`heledone-page flex-1 overflow-x-hidden ${isTasksView ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 py-5 sm:px-6 sm:py-5'} bg-base-200 outline-none`}>
          <ErrorBoundary FallbackComponent={ErrorFallback}>
            <Suspense fallback={<ContentLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <CommandMenu
        isOpen={isCommandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        items={commandItems}
        isStaff={isStaff}
      />
      <ProjectWizard />
    </div>
  );
};
