import { t } from "../../i18n/locale";
import {
  DiscountShape,
  Notification,
  People,
  Ticket,
  User,
  ShieldSecurity,
  Flash,
  Briefcase,
  Profile2User,
  People as TeamsIcon,
  TaskSquare,
  NoteText,
  Chart21,
  ChartSquare,
  Calendar,
  Timer1,
  WalletMoney,
} from "iconsax-reactjs";
import type { ReactNode } from "react";
import type { User as AuthUser } from "../auth/types/authTypes";

export type DrawerItem = {
  title: string;
  headerTitle?: string;
  link: string;
  icon: ReactNode;
  section: "Workspace" | "AdminSettings" | "Support" | "Account";
  staffOnly?: boolean;
  /** Single permission required (AND) */
  permission?: string;
  /** Multiple permissions — user needs ANY ONE of these (OR check) */
  permissions?: string[];
  requiresOrgAdmin?: boolean;
  isPrimary?: boolean;
  /** If true, shown to all authenticated org members regardless of permissions */
  defaultForMembers?: boolean;
};

export const drawerItems: DrawerItem[] = [
  // Primary Workspace Navigation (Main Sidebar)
  {
    get title() { return t("امروز و تمرکز"); },
    link: "dashboard",
    section: "Workspace",
    icon: <Calendar variant="Outline" />,
    defaultForMembers: true,
    isPrimary: true,
  },
  {
    get title() { return t("تسک‌ها و کانبان"); },
    link: "tasks",
    section: "Workspace",
    icon: <TaskSquare variant="Outline" />,
    permissions: ["task.view", "board.view", "task.create", "task.manage_all"],
    isPrimary: true,
  },
  {
    get title() { return t("پروژه‌ها"); },
    link: "projects",
    section: "Workspace",
    icon: <Briefcase variant="Outline" />,
    permissions: ["project.view", "project.create", "project.manage"],
    isPrimary: true,
  },
  {
    get title() { return t("گزارش روزانه"); },
    link: "standups",
    section: "Workspace",
    icon: <NoteText variant="Outline" />,
    permissions: ["org.manage_settings", "report.view"],
    isPrimary: true,
  },
  {
    get title() { return t("کارکرد و حضور"); },
    link: "attendance",
    section: "Workspace",
    icon: <Timer1 variant="Outline" />,
    defaultForMembers: true,
    isPrimary: true,
  },
  {
    get title() { return t("نمای مدیریت"); },
    link: "manager",
    section: "Workspace",
    icon: <Chart21 variant="Outline" />,
    permissions: [
      "org.manage_settings",
      "report.view",
      "project.manage"
    ],
    isPrimary: true,
  },
  {
    get title() { return t("نمای تیم"); },
    link: "team-lead",
    section: "Workspace",
    icon: <ChartSquare variant="Outline" />,
    permissions: ["report.view_team_lead"],
    isPrimary: true,
  },
  {
    get title() { return t("حقوق و گزارش مالی"); },
    link: "/finance/my-reports",
    section: "Workspace",
    icon: <WalletMoney variant="Outline" />,
    defaultForMembers: true,
    isPrimary: true,
  },

  // Admin & Settings Navigation (Settings Modal & Command Menu)
  {
    get title() { return t("سازمان‌ها"); },
    link: "organizations",
    section: "AdminSettings",
    icon: <Profile2User variant="Outline" />,
    permissions: ["org.manage_settings", "org.manage_members", "org.manage_roles"],
  },
  {
    get title() { return t("مدیریت اعضا"); },
    link: "users",
    section: "AdminSettings",
    icon: <People variant="Outline" />,
    permissions: ["org.manage_members", "org.manage_roles"],
  },
  {
    get title() { return t("مدیریت تیم‌ها"); },
    link: "teams",
    section: "AdminSettings",
    icon: <TeamsIcon variant="Outline" />,
    permissions: ["org.manage_members", "org.manage_settings"],
  },
  {
    get title() { return t("نقش‌ها و دسترسی‌ها"); },
    link: "roles",
    section: "AdminSettings",
    icon: <ShieldSecurity size="20" />,
    permissions: ["org.manage_roles"],
  },
  {
    get title() { return t("خودکارسازی"); },
    link: "automations",
    section: "AdminSettings",
    icon: <Flash variant="Outline" />,
    permissions: ["org.manage_settings", "automation.manage"],
  },
  {
    get title() { return t("تخفیف‌ها"); },
    link: "discounts",
    section: "AdminSettings",
    icon: <DiscountShape variant="Outline" />,
    permissions: ["finance.manage", "finance.view_reports"],
  },


  // Support & System
  {
    get title() { return t("اعلان‌ها"); },
    link: "notifications",
    section: "AdminSettings",
    icon: <Notification variant="Outline" />,
    permissions: ["notification.view", "org.manage_settings"],
  },
  {
    get title() { return t("گزارش روزانه"); },
    link: "standups",
    section: "AdminSettings",
    icon: <NoteText variant="Outline" />,
    permissions: ["org.manage_settings", "report.view"],
  },
  {
    get title() { return t("درخواست‌های پشتیبانی"); },
    link: "tickets",
    section: "Support",
    icon: <Ticket variant="Outline" />,
    defaultForMembers: true,
  },


  // Account
  {
    get title() { return t("تنظیمات حساب"); },
    link: "profile",
    section: "Account",
    icon: <User variant="Outline" />,
  },
];

export const getVisibleDrawerItems = (
  user: AuthUser | null,
  hasAllPermissions: (permissions: string[]) => boolean,
  hasAnyPermission: (permissions: string[]) => boolean,
  primaryOnly = false
) =>
  drawerItems.filter((item) => {
    if (primaryOnly && !item.isPrimary) return false;
    if (item.staffOnly && !user?.is_staff) return false;
    if (
      item.requiresOrgAdmin &&
      !user?.can_manage_automations &&
      !user?.is_staff &&
      !hasAnyPermission(["org.manage_settings", "core.automations.manage"])
    ) {
      return false;
    }
    if (item.defaultForMembers) return !!user;
    // OR-check: any one of the permissions array is enough
    if (item.permissions?.length && !hasAnyPermission(item.permissions)) return false;
    // AND-check: single legacy permission
    if (item.permission && !hasAllPermissions([item.permission])) return false;
    return true;
  });

export const getAdminDrawerItems = (
  user: AuthUser | null,
  hasAllPermissions: (permissions: string[]) => boolean,
  hasAnyPermission: (permissions: string[]) => boolean
) =>
  drawerItems.filter((item) => {
    if (item.isPrimary) return false;
    if (item.staffOnly && !user?.is_staff) return false;
    if (
      item.requiresOrgAdmin &&
      !user?.can_manage_automations &&
      !user?.is_staff &&
      !hasAnyPermission(["org.manage_settings", "core.automations.manage"])
    ) {
      return false;
    }
    if (item.defaultForMembers) return !!user;
    // OR-check: any one of the permissions array is enough
    if (item.permissions?.length && !hasAnyPermission(item.permissions)) return false;
    // AND-check: single legacy permission
    if (item.permission && !hasAllPermissions([item.permission])) return false;
    return true;
  });
