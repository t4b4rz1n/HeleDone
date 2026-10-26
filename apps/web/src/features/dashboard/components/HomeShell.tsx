import { useEffect, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  FolderOpen,
  Clock3,
  Briefcase,
  ChartNoAxesColumnIncreasing,
  Wallet,
  BookOpen,
  Settings,
  Menu,
  Search,
  X,
  Plus,
} from "lucide-react";
import ProfileAvatar from "../../../components/ProfileAvatar";
import { Brand, BrandBeats } from "../../../components/Brand";
import ThemeToggle from "../../../components/ThemeToggle";
import { useTranslation } from "../../../i18n/locale";
import { useLayoutStore } from "../../layout/store/layoutStore";
import { NotificationCenter } from "../../layout/NotificationCenter";
import { UserMenu } from "../../layout/UserMenu";
import { useAuthStore } from "../../auth/store/authStore";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { useProjectWizardStore } from "../../projects/store/useProjectWizardStore";
import { HeaderAttendanceControl } from "../../attendance/components/HeaderAttendanceControl";
import { useTaskStore } from "../../tasks/store/useTaskStore";
import "../home.css";

const assets = "/images/heledone-assets/";

export function HomeSidebar() {
  const t = useTranslation();
  const location = useLocation();
  const { isSidebarOpen, setSidebarOpen } = useLayoutStore();
  const user = useAuthStore((s) => s.user);
  const { hasAnyPermission } = usePermissions();

  const isStaff = user?.is_staff === true;
  const canViewManagerOverview =
    hasAnyPermission([
      "report.view",
      "attendance.view_all",
      "org.manage_members",
      "finance.view_reports",
      "org.manage_settings",
    ]) || isStaff;
  const canViewTeamOverview =
    hasAnyPermission([
      "report.view_team_lead",
      "report.view",
      "attendance.view_all",
      "org.manage_members",
    ]) || isStaff;
  const canViewTeamManagement =
    hasAnyPermission(["org.manage_members", "org.manage_settings"]) || isStaff;
  const canViewStandups =
    hasAnyPermission(["org.manage_settings", "report.view"]) || isStaff;

  const canAccessManager =
    canViewManagerOverview ||
    canViewTeamOverview ||
    canViewTeamManagement ||
    canViewStandups;

  const projectsActive =
    location.pathname.startsWith("/projects") || location.pathname.startsWith("/tasks");

  const managerActive =
    location.pathname.startsWith("/manager") ||
    location.pathname.startsWith("/team-lead") ||
    location.pathname.startsWith("/teams") ||
    location.pathname.startsWith("/standups");

  const managerDefaultPath = canViewManagerOverview
    ? "/manager"
    : canViewTeamOverview
      ? "/team-lead"
      : canViewTeamManagement
        ? "/teams"
        : "/standups";

  const items: {
    label: string;
    path?: string;
    Icon: ComponentType<{ size?: number; fill?: string; className?: string }>;
    active?: boolean;
    unavailable?: boolean;
  }[] = [
    { label: "خانه", path: "/dashboard", Icon: Home, active: location.pathname === "/dashboard" },
    { label: "کار و پروژه", path: "/projects", Icon: FolderOpen, active: projectsActive },
    ...(canAccessManager
      ? [
          {
            label: "مدیریت",
            path: managerDefaultPath,
            Icon: Briefcase,
            active: managerActive,
          },
        ]
      : []),
    { label: "رشد و قدردانی", Icon: ChartNoAxesColumnIncreasing, unavailable: true },
    {
      label: "زمان و درخواست‌ها",
      path: "/attendance",
      Icon: Clock3,
      active: location.pathname.startsWith("/attendance"),
    },
    {
      label: "حقوق و هزینه‌ها",
      path: "/finance/my-reports",
      Icon: Wallet,
      active: location.pathname.startsWith("/finance"),
    },
    { label: "دانشنامه", Icon: BookOpen, unavailable: true },
  ] as const;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, setSidebarOpen]);

  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          className="home-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label={t("بستن منو")}
        />
      )}
      <aside aria-label={t("منوی اصلی")} className={`home-sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        <div className="home-sidebar-top">
          <Link to="/dashboard" className="home-logo">
            <Brand />
          </Link>
          <button
            type="button"
            className="home-mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label={t("بستن منو")}
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label={t("منوی اصلی")} className="home-sidebar-nav">
          {items.map(({ label, path, Icon, active, unavailable }) =>
            unavailable ? (
              <span
                key={label}
                className="home-nav-unavailable"
                aria-disabled="true"
                title={t(label === "مدیریت" ? "دسترسی ندارید" : "به‌زودی")}
              >
                <Icon size={21} className="shrink-0" />
                <span>{t(label)}</span>
                <small>{t(label === "مدیریت" ? "دسترسی ندارید" : "به‌زودی")}</small>
              </span>
            ) : (
              <div key={label} className="home-nav-group">
                <Link
                  to={path!}
                  className={`home-nav-link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon
                    size={21}
                    className="shrink-0"
                    fill={label === "خانه" && active ? "currentColor" : "none"}
                  />
                  <span>{t(label)}</span>
                </Link>

                {/* Subnav for Work & Projects */}
                {label === "کار و پروژه" && projectsActive && (
                  <div className="home-subnav">
                    <Link
                      to="/projects"
                      aria-current={location.pathname.startsWith("/projects") ? "page" : undefined}
                    >
                      {t("پروژه‌ها")}
                    </Link>
                    <Link
                      to="/tasks"
                      aria-current={location.pathname.startsWith("/tasks") ? "page" : undefined}
                    >
                      {t("تسک‌ها و کانبان")}
                    </Link>
                  </div>
                )}

                {/* Subnav for Manager */}
                {label === "مدیریت" && managerActive && (
                  <div className="home-subnav">
                    {canViewManagerOverview && (
                      <Link
                        to="/manager"
                        aria-current={location.pathname === "/manager" ? "page" : undefined}
                      >
                        {t("نمای مدیریت")}
                      </Link>
                    )}
                    {canViewTeamOverview && (
                      <Link
                        to="/team-lead"
                        aria-current={location.pathname === "/team-lead" ? "page" : undefined}
                      >
                        {t("نمای تیم")}
                      </Link>
                    )}
                    {canViewTeamManagement && (
                      <Link
                        to="/teams"
                        aria-current={location.pathname.startsWith("/teams") ? "page" : undefined}
                      >
                        {t("مدیریت تیم‌ها")}
                      </Link>
                    )}
                    {canViewStandups && (
                      <Link
                        to="/standups"
                        aria-current={location.pathname.startsWith("/standups") ? "page" : undefined}
                      >
                        {t("گزارش روزانه")}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </nav>

        <div className="home-sidebar-bottom">
          <div className="home-seascape" aria-hidden="true">
            <img
              className="home-coast-art"
              src={assets + "home-sidebar-coast.png"}
              alt=""
            />
          </div>

          <Link to="/profile" className="home-user" aria-label={t("حساب من")}>
            <ProfileAvatar
              src={user?.profile_image_url || user?.avatar_url}
              name={`${user?.first_name || ""} ${user?.last_name || user?.username || ""}`}
              className="home-user-avatar overflow-hidden"
              fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
            />
            <div className="home-user-info">
              <strong>
                {[user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
                  user?.username ||
                  t("کاربر مدیر")}
              </strong>
              <small>{t("حساب من")}</small>
            </div>
          </Link>

          <Link
            className={`home-settings ${location.pathname === "/settings" ? "active" : ""}`}
            to="/settings"
          >
            <Settings size={20} className="shrink-0" />
            <span>{t("تنظیمات")}</span>
          </Link>

          <p className="home-motto">{t("ریتم مشترک تیم")}</p>
        </div>
      </aside>
    </>
  );
}

export function HomeHeader({ onSearch }: { onSearch: () => void }) {
  const t = useTranslation();
  const location = useLocation();
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);
  const setWorkspaceSidebarOpen = useTaskStore((s) => s.setWorkspaceSidebarOpen);
  const openProjectWizard = useProjectWizardStore((s) => s.open);
  const user = useAuthStore((s) => s.user);
  const { hasAnyPermission } = usePermissions();

  const isStaff = user?.is_staff === true;
  const canCreateProject =
    hasAnyPermission(["project.create", "org.manage_settings"]) || isStaff;
  const canViewManagerOverview =
    hasAnyPermission([
      "report.view",
      "attendance.view_all",
      "org.manage_members",
      "finance.view_reports",
      "org.manage_settings",
    ]) || isStaff;
  const canViewTeamOverview =
    hasAnyPermission([
      "report.view_team_lead",
      "report.view",
      "attendance.view_all",
      "org.manage_members",
    ]) || isStaff;

  const topNavItems: { label: string; path: string; active: boolean }[] = [];
  if (canViewManagerOverview) {
    topNavItems.push({
      label: "دید کلی سرپرست",
      path: "/manager",
      active: location.pathname === "/manager",
    });
  }
  if (canViewTeamOverview) {
    topNavItems.push({
      label: "دید کلی تیم",
      path: "/team-lead",
      active: location.pathname === "/team-lead",
    });
  }
  if (topNavItems.length === 0) {
    topNavItems.push({
      label: "کار و پروژه",
      path: "/projects",
      active: location.pathname.startsWith("/projects"),
    });
    topNavItems.push({
      label: "زمان و درخواست‌ها",
      path: "/attendance",
      active: location.pathname.startsWith("/attendance"),
    });
  }
  // Kanban board always visible in top nav
  topNavItems.push({
    label: "برد کانبان",
    path: "/tasks",
    active: location.pathname.startsWith("/tasks"),
  });

  const isTasksPage = location.pathname.startsWith("/tasks");

  return (
    <header className="home-topbar">
      {/* Start Group: Mobile menu toggle + quick links + primary actions */}
      <div className="home-topbar-start">
        {isTasksPage ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="home-menu lg:hidden"
              aria-label={t("Open project menu")}
              onClick={() => setWorkspaceSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <Link to="/tasks" className="flex items-center gap-2 text-decoration-none hover:opacity-90 transition-opacity">
              <BrandBeats />
            </Link>
            <div className="h-4 w-px bg-base-300" />
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all border border-primary/20 shadow-xs"
              title={t("بازگشت به پیشخوان و سایدبار اصلی")}
            >
              <Home size={15} />
              <span className="hidden sm:inline">{t("پیشخوان")}</span>
            </Link>
            <HeaderAttendanceControl />
          </div>
        ) : (
          <>
            <button
              type="button"
              className="home-menu lg:hidden"
              aria-label={t("باز کردن منو")}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>

            {/* Dedicated Quick Links */}
            <nav aria-label={t("منوی سریع")} className="home-top-nav hidden md:flex items-center gap-1.5">
              {topNavItems.map((item) => (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`home-top-nav-item ${item.active ? "active" : ""}`}
                >
                  {t(item.label)}
                </Link>
              ))}
            </nav>
          </>
        )}

        {/* Action Buttons: New Project only */}
        {!isTasksPage && canCreateProject && (
          <div className="home-quick-actions flex items-center gap-2">
            <button
              type="button"
              onClick={() => openProjectWizard()}
              className="home-btn-new-project flex items-center gap-1.5 bg-primary hover:bg-[#006D73] text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-xs"
            >
              <Plus size={15} />
              <span>{t("ایجاد پروژه")}</span>
            </button>
          </div>
        )}
      </div>

      {/* End Group: Search Box + Divider + Notifications + Theme Toggle + Settings + User Menu */}
      <div className="home-topbar-end">
        <button
          type="button"
          className="home-search"
          onClick={onSearch}
          aria-label={t("جستجو...")}
        >
          <Search size={16} className="shrink-0 text-heledone-ink-muted" />
          <span>{t("جستجو...")}</span>
          <kbd className="home-search-kbd">⌘K</kbd>
        </button>

        <div className="home-topbar-divider hidden sm:block" />

        <div className="home-header-actions flex items-center gap-1.5">
          <div className="home-notifications">
            <NotificationCenter />
          </div>
          <ThemeToggle />
          <Link
            to="/settings"
            className="flex items-center justify-center w-8 h-8 rounded-xl text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors"
            title={t("تنظیمات")}
            aria-label={t("تنظیمات")}
          >
            <Settings size={18} />
          </Link>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
