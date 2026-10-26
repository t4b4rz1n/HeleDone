export interface UserRole {
  id: string | null;   // UUID from dynamic roles
  name: string | null;
  permissions: string[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_staff?: boolean;
  role_id?: string | null;
  role?: UserRole | null;
  profile_image_url?: string | null;
  avatar_url?: string | null;
  telegram_connected?: boolean;
  notify_via_email?: boolean;
  notify_via_telegram?: boolean;
  can_manage_automations?: boolean;
  calendar_preference?: "gregorian" | "jalali";
}

export interface AuthResponse {
  access?: string;
  refresh?: string;
  user: User;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  password: string;
  password_confirm: string;
}
