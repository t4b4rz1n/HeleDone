import { useEffect, type ComponentType } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { Brand } from "../../../components/Brand";
import ThemeToggle from "../../../components/ThemeToggle";
import { useTranslation } from "../../../i18n/locale";
import { useLayoutStore } from "../../layout/store/layoutStore";
import { NotificationCenter } from "../../layout/NotificationCenter";
import { UserMenu } from "../../layout/UserMenu";
import { useAuthStore } from "../../auth/store/authStore";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { useProjectWizardStore } from "../../projects/store/useProjectWizardStore";
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
    hasAnyPermission(["user.view", "org.manage_members"]) || isStaff;
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
    {
      label: "مدیریت",
      path: managerDefaultPath,
      Icon: Briefcase,
      active: managerActive,
      unavailable: !canAccessManager,
    },
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
          <Link to="/profile" className="home-user" aria-label={t("حساب من")}>
            <img
              src={user?.profile_image_url || user?.avatar_url || assets + "avatar-04.png"}
              alt=""
              className="home-user-avatar"
            />
            <div className="home-user-info">
              <strong>
                {[user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
                  user?.username ||
                  "Admin User"}
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
  const navigate = useNavigate();
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);
  const openProjectWizard = useProjectWizardStore((s) => s.open);
  const user = useAuthStore((s) => s.user);
  const { hasAnyPermission } = usePermissions();

  const isStaff = user?.is_staff === true;
  const canCreateProject =
    hasAnyPermission(["project.create", "org.manage_settings"]) || isStaff;
  const canCreateTask =
    hasAnyPermission(["task.create", "task.manage_all", "org.manage_settings"]) || isStaff;

  const topNavItems = [
    {
      label: "زمان و درخواست‌ها",
      path: "/attendance",
      active: location.pathname.startsWith("/attendance"),
    },
    {
      label: "حقوق و هزینه‌ها",
      path: "/finance/my-reports",
      active: location.pathname.startsWith("/finance"),
    },
  ];

  return (
    <header className="home-topbar">
      {/* Mobile Toggle */}
      <button
        type="button"
        className="home-menu lg:hidden"
        aria-label={t("باز کردن منو")}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu size={22} />
      </button>

      {/* Top Navigation: Dedicated Quick Links */}
      <nav aria-label={t("منوی اصلی")} className="home-top-nav hidden md:flex items-center gap-1 xl:gap-2">
        {topNavItems.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className={`home-top-nav-item relative text-xs xl:text-sm font-bold px-3 py-2 transition-colors ${
              item.active
                ? "text-primary active"
                : "text-slate-600 dark:text-slate-300 hover:text-primary"
            }`}
          >
            {t(item.label)}
            {item.active && <span className="home-top-nav-indicator" />}
          </Link>
        ))}
      </nav>

      {/* Action Buttons: New Project & New Task */}
      <div className="home-quick-actions flex items-center gap-2 shrink-0">
        {canCreateProject && (
          <button
            type="button"
            onClick={() => openProjectWizard()}
            className="home-btn-new-project flex items-center gap-1.5 bg-primary hover:bg-[#006D73] text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
          >
            <Plus size={16} />
            <span>{t("پروژه جدید")}</span>
          </button>
        )}
        {canCreateTask && (
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="home-btn-new-task hidden sm:flex items-center gap-1.5 bg-base-100 hover:bg-base-200 border border-base-300 text-base-content text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
          >
            <Plus size={16} />
            <span>{t("تسک جدید")}</span>
          </button>
        )}
      </div>

      {/* Search Input Box */}
      <button
        type="button"
        className="home-search"
        onClick={onSearch}
        aria-label={t("جستجو...")}
      >
        <span>{t("جستجو...")}</span>
        <Search size={18} className="shrink-0 text-slate-400" />
      </button>

      {/* Header End Actions (Notifications, Theme Toggle, User Profile) */}
      <div className="home-header-actions">
        <div className="home-notifications">
          <NotificationCenter />
        </div>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
