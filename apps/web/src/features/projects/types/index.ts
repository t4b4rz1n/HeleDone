// 1. Status Types
export type ProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "archived";

export type ProjectProgressMode = "task_based" | "milestone_based";

export type ViewMode = "table" | "grid" | "orbit";

export type ProjectListParams =
  | URLSearchParams
  | {
      search?: string;
      status?: ProjectStatus;
    };

// 2. Auxiliary Nested Entities
export interface ProjectOrganization {
  id: string | number;
  name: string;
  slug?: string;
}

export interface ProjectOwner {
  id: string | number;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
}

// 3. Main Project Entity
export interface Project {
  id: string | number;
  organization: ProjectOrganization | string | number;
  owner?: ProjectOwner | null;
  name: string;
  description: string;
  prefix?: string;
  color?: string;
  status: ProjectStatus;
  status_display?: string;
  progress_mode?: ProjectProgressMode;
  progress_mode_display?: string;
  budget?: number | string | null;
  budget_currency?: string;
  start_date?: string | null;
  deadline?: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  progress_percentage?: number;
  member_count?: number;
  members_count?: number;
  teams_count?: number;
  task_count?: number;
  completed_task_count?: number;
  unlinked_task_count?: number;
  milestone_count?: number;
  completed_milestone_count?: number;
  created_at?: string;
  updated_at?: string;
}

// 4. Project Payload (DTO for Create / Update)
export interface ProjectPayload {
  name: string;
  description?: string;
  color?: string;
  organization_id?: string | number;
  prefix?: string;
  budget?: number | string | null;
  budget_currency?: string;
  start_date?: string | null;
  deadline?: string | null;
  status?: ProjectStatus;
  progress_mode?: ProjectProgressMode;
}

// 4. Project Members
export interface ProjectMember {
  id: string | number;
  project: string | number;
  user?: ProjectOwner | null;
  team?: {
    id: number;
    name: string;
  } | null;
  specialty?: string;
  allocation_percentage: number;
  allocation_start_date?: string;
  allocation_end_date?: string;
  is_active: boolean;
  salary_type?: "monthly" | "hourly" | null;
  salary_amount?: string | null;
  salary_override?: boolean;
  created_at: string;
  updated_at: string;
}

// 5. Milestones
export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Milestone {
  id: string | number;
  project: string | number;
  title: string;
  description?: string;
  status: MilestoneStatus;
  start_date?: string;
  target_date: string;
  completed_at?: string;
  sequence: number;
  weight: number;
  task_count?: number;
  completed_task_count?: number;
  progress_percentage?: number;
  created_at: string;
  updated_at: string;
}

// 6. Activities
export interface ProjectActivity {
  id: string | number;
  project: string | number;
  actor?: {
    id: string | number;
    username?: string;
    email?: string;
    full_name?: string;
    avatar?: string;
  };
  event_type: string;
  event_type_display?: string;
  entity_type: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// 7. Request DTOs
export interface CreateProjectDTO {
  name: string;
  description?: string;
  color?: string;
  organization_id?: string | number;
  prefix?: string;
  budget?: number | string | null;
  budget_currency?: string;
  start_date?: string | null;
  deadline?: string | null;
  status?: ProjectStatus;
  progress_mode?: ProjectProgressMode;
}

export type UpdateProjectDTO = Partial<CreateProjectDTO> & {
  status?: ProjectStatus;
  progress_mode?: ProjectProgressMode;
};
