

export interface UserBasicInfo {
  first_name: string;
  last_name: string;
  username?: string;
  email?: string;
  avatar?: string | null;
  avatar_url?: string | null;
}

export interface Team {
 id: number;
 name: string;
 description?: string;
 lead_id: string | null;
 organization_id?: string;
 is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TeamFormData {
  name: string;
  description?: string;
  lead_id?: string | null;
  is_active: boolean;
  organization?: string;
}

export type TeamUpdateData = Partial<TeamFormData>;
export interface TeamMemberUser {
  id: number;
  first_name: string;
  last_name: string;
  username?: string;
  email: string;
  avatar: string | null;
  avatar_url?: string | null;
}

export interface TeamMember {
  id: number;
  team: number;
  user: number;
  user_details: TeamMemberUser | null;
  role: string;
  created_at?: string;
  updated_at?: string;
}

export interface AddTeamMemberPayload {
  teamId: number;
  user: string | number;
  role?: string;
}

export interface TeamWithDetails extends Team {
  leader_details?: UserBasicInfo | null;
}
