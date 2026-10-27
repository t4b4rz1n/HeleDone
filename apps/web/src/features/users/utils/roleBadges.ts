import {
  Code1,
  Crown,
  Headphone,
  Hierarchy,
  User,
  Setting,
} from "iconsax-reactjs";

import type { Role } from "../../roles/types";

const roleBadgeClassMap: Record<string, string> = {
  "Super Admin":
    "bg-primary/10 text-primary border border-primary/20 ",

  Support:
    "bg-gradient-to-r from-primary/20 via-primary/20 to-primary/20 text-primary border border-primary/30 ",

  "Regular User":
    "bg-base-200 text-base-content/75 border border-base-content/10 shadow-sm",

  Frontend:
    "bg-gradient-to-r from-secondary/20 via-secondary/20 to-secondary/20 text-primary border border-primary/20 ",

  Backend:
    "bg-gradient-to-r from-success/20 via-primary/20 to-success/20 text-success border border-success/30 ",

};

const roleIconMap = {
  "Super Admin": Crown,
  Support: Headphone,
  "Regular User": User,
  Frontend: Code1,
  Backend: Hierarchy,
} as const;

const dynamicColorPalettes = [
  "bg-gradient-to-r from-success/10 to-primary/10 text-success border border-success/20",
  "bg-gradient-to-r from-secondary/10 to-secondary/10 text-secondary border border-secondary/20",
  "bg-gradient-to-r from-warning/10 to-warning/10 text-warning border border-warning/20",
  "bg-gradient-to-r from-secondary/10 to-error/10 text-secondary border border-secondary/20",
  "bg-gradient-to-r from-primary/10 to-primary/10 text-primary border border-primary/20",
];

const getHashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

export const getRoleBadgeClass = (roleName: string): string => {
  if (roleBadgeClassMap[roleName]) {
    return roleBadgeClassMap[roleName];
  }

  const hash = getHashCode(roleName);
  const index = hash % dynamicColorPalettes.length;
  return dynamicColorPalettes[index];
};

export const getRoleIcon = (roleName: string) => {
  if (roleName in roleIconMap) {
    return roleIconMap[roleName as keyof typeof roleIconMap];
  }
  return Setting;
};

export const getRoleName = (
  roleId: string | number | null | undefined,
  roles: Role[],
  directRoleName?: string | null,
): string | null => {
  if (directRoleName) return directRoleName;
  if (!roleId) return null;

  const match = roles.find(
    (role) =>
      String(role.id) === String(roleId) ||
      role.name.toLowerCase() === String(roleId).toLowerCase(),
  );
  if (match) return match.name;

  if (typeof roleId === "string" && !roleId.includes("-") && isNaN(Number(roleId))) {
    return roleId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return null;
};
