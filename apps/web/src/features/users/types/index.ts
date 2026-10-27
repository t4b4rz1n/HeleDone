export type { Role, Permission } from "../../roles/types";


export interface User {
  id: string;  // UUID
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  is_staff: boolean;
  role_id: string | null;  // UUID
  role_name?: string | null;
  avatar: string | null;
  avatar_url?: string | null;
  organization?: { id: string; name: string } | null;
  salary_type?: 'monthly' | 'hourly' | null;
  salary_amount?: string | null;
}


export interface UserFormData {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  is_staff: boolean;
  role_id: string | null;  // UUID
  organization_id?: string;
  salary_type?: 'monthly' | 'hourly' | null;
  salary_amount?: string | null;
}

export interface UserUpdateData {
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  is_staff: boolean;
  role_id: string | null;  // UUID
  salary_type?: 'monthly' | 'hourly' | null;
  salary_amount?: string | null;
  password?: string | null;
}
