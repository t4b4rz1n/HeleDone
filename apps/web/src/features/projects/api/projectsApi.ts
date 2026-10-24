import ApiService from "../../../core/api/apiService";
import { getOrganizations } from "../../organizations/api/organizationsApi";
import type { Organization } from "../../organizations/types";
import type {
  Project,
  ProjectListParams,
  ProjectPayload,
  ProjectMember,
  Milestone,
  ProjectActivity,
} from "../types";

// ==========================================
// 🛠️ API RESPONSE UNWRAPPING HELPERS
// ==========================================
const unwrap = <T>(response: unknown): T => {
  const value = response as { data?: unknown } | null;
  return (value?.data ?? response) as T;
};

const extractList = <T>(response: unknown): T[] => {
  const root = unwrap<unknown>(response);
  if (Array.isArray(root)) return root as T[];
  if (root && typeof root === "object") {
    const results = (root as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

// ==========================================
// 🚀 PROJECTS CORE API
// ==========================================
export const getProjects = async (
  params?: ProjectListParams
): Promise<Project[]> => {
  const normalizedParams =
    params instanceof URLSearchParams
      ? Object.fromEntries(params.entries())
      : params;
  const response = await ApiService.get("projects/", {
    params: normalizedParams,
  });
  return extractList<Project>(response);
};

export const getProjectById = async (id: string | number): Promise<Project> => {
  const response = await ApiService.get(`projects/${id}/`);
  return unwrap<Project>(response);
};

export const getOrganizationsForProjects = (): Promise<Organization[]> =>
  getOrganizations();

export const createProject = async (payload: ProjectPayload): Promise<Project> => {
  const response = await ApiService.post<Project>("projects/", payload);
  return unwrap<Project>(response);
};

export const updateProject = async (
  id: string | number,
  payload: Partial<ProjectPayload>
): Promise<Project> => {
  const response = await ApiService.patch<Project>(`projects/${id}/`, payload);
  return unwrap<Project>(response);
};

export const deleteProject = async (id: string | number): Promise<void> => {
  await ApiService.delete(`projects/${id}/`);
};

export const archiveProject = async (id: string | number): Promise<Project> => {
  const response = await ApiService.post<Project>(`projects/${id}/archive/`, {});
  return unwrap<Project>(response);
};

export const completeProject = async (id: string | number): Promise<Project> => {
  const response = await ApiService.post<Project>(`projects/${id}/complete/`, {});
  return unwrap<Project>(response);
};

// ==========================================
// 👥 PROJECT MEMBERS API
// ==========================================
export const getProjectMembers = async (
  projectId: string | number
): Promise<ProjectMember[]> => {
  const response = await ApiService.get(`projects/${projectId}/members/`);
  return extractList<ProjectMember>(response);
};

export const addProjectMember = async (
  projectId: string | number,
  data: {
    user_id?: string | number;
    team_id?: string | number;
    specialty?: string;
    allocation_percentage?: number;
  }
): Promise<ProjectMember> => {
  const response = await ApiService.post<ProjectMember>(
    `projects/${projectId}/members/`,
    data
  );
  return unwrap<ProjectMember>(response);
};

export const updateProjectMember = async (
  projectId: string | number,
  memberId: string | number,
  data: { specialty?: string; allocation_percentage?: number }
): Promise<ProjectMember> => {
  const response = await ApiService.patch<ProjectMember>(
    `projects/${projectId}/members/${memberId}/`,
    data
  );
  return unwrap<ProjectMember>(response);
};

export const removeProjectMember = async (
  projectId: string | number,
  memberId: string | number
): Promise<void> => {
  await ApiService.delete(`projects/${projectId}/members/${memberId}/`);
};

/** Update salary for a specific project member (sets salary_override=true). */
export const updateProjectMemberSalary = async (
  projectId: string | number,
  memberId: string | number,
  data: { salary_type?: "monthly" | "hourly" | null; salary_amount?: string | number | null }
): Promise<ProjectMember> => {
  const response = await ApiService.patch<ProjectMember>(
    `projects/${projectId}/members/${memberId}/salary/`,
    data
  );
  return unwrap<ProjectMember>(response);
};

/** Reset a project member's salary back to the org-level (clears salary_override). */
export const resetProjectMemberSalary = async (
  projectId: string | number,
  memberId: string | number
): Promise<ProjectMember> => {
  const response = await ApiService.post<ProjectMember>(
    `projects/${projectId}/members/${memberId}/salary/reset/`,
    {}
  );
  return unwrap<ProjectMember>(response);
};

// ==========================================
// 🚩 PROJECT MILESTONES API
// ==========================================
export const getProjectMilestones = async (
  projectId: string | number
): Promise<Milestone[]> => {
  const response = await ApiService.get(`projects/${projectId}/milestones/`);
  return extractList<Milestone>(response);
};

export const createMilestone = async (
  projectId: string | number,
  data: {
    title: string;
    description?: string;
    target_date: string;
    weight?: number;
  }
): Promise<Milestone> => {
  const response = await ApiService.post<Milestone>(
    `projects/${projectId}/milestones/`,
    data
  );
  return unwrap<Milestone>(response);
};

export const updateMilestone = async (
  projectId: string | number,
  milestoneId: string | number,
  data: {
    title?: string;
    description?: string;
    status?: string;
    target_date?: string | null;
    weight?: number;
  }
): Promise<Milestone> => {
  const response = await ApiService.patch<Milestone>(
    `/projects/${projectId}/milestones/${milestoneId}/`,
    data
  );
  return unwrap<Milestone>(response);
};

export const deleteMilestone = async (
  projectId: string | number,
  milestoneId: string | number
): Promise<void> => {
  await ApiService.delete(`/projects/${projectId}/milestones/${milestoneId}/`);
};

// ==========================================
// 📈 PROJECT ACTIVITIES API
// ==========================================
export const getProjectActivities = async (
  projectId: string | number
): Promise<ProjectActivity[]> => {
  const response = await ApiService.get(`projects/${projectId}/activities/`);
  return extractList<ProjectActivity>(response);
};

export interface MentionFileData {
  file_id: string;
  file_name: string;
  message: string;
  usernames?: string[];
}

export const mentionFile = async (
  projectId: string | number,
  data: MentionFileData
): Promise<{ status: string; message: string; mentioned_count: number }> => {
  const response = await ApiService.post<{ status: string; message: string; mentioned_count: number }>(
    `projects/${projectId}/mention-file/`,
    data
  );
  return unwrap<{ status: string; message: string; mentioned_count: number }>(response);
};

// ==========================================
// 📂 PROJECT FILES API (PostgreSQL + MinIO)
// ==========================================
export interface ProjectFileRecord {
  id: string;
  project: string;
  uploaded_by?: {
    id: string | number;
    username: string;
    full_name?: string;
    avatar?: string;
  };
  file: string;
  file_url: string;
  name: string;
  description?: string;
  file_size?: string;
  file_type: 'image' | 'pdf' | 'document' | 'archive' | 'other';
  created_at: string;
  updated_at: string;
}

export const getProjectFiles = async (
  projectId: string | number
): Promise<ProjectFileRecord[]> => {
  const response = await ApiService.get(`projects/${projectId}/files/`);
  return extractList<ProjectFileRecord>(response);
};

export const uploadProjectFile = async (
  projectId: string | number,
  formData: FormData
): Promise<ProjectFileRecord> => {
  const response = await ApiService.post<ProjectFileRecord>(
    `projects/${projectId}/files/`,
    formData
  );
  return unwrap<ProjectFileRecord>(response);
};

export const updateProjectFile = async (
  projectId: string | number,
  fileId: string,
  data: { description: string }
): Promise<ProjectFileRecord> => {
  const response = await ApiService.patch<ProjectFileRecord>(
    `projects/${projectId}/files/${fileId}/`,
    data
  );
  return unwrap<ProjectFileRecord>(response);
};

export const deleteProjectFile = async (
  projectId: string | number,
  fileId: string
): Promise<void> => {
  await ApiService.delete(`projects/${projectId}/files/${fileId}/`);
};
