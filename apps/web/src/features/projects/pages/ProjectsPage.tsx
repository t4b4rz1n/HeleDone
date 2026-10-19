import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { t as translate, useTranslation, useLocale } from "../../../i18n/locale";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  SlidersHorizontal,
  Plus as Add,
  Archive,
  Pencil as Edit2,
  FolderKanban,
  Search as SearchNormal1,
  CircleCheck as TickCircle,
  Trash2 as Trash,
  X as CloseCircle,
  EllipsisVertical,
  Users,
  TriangleAlert,
  ArrowUpRight,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  archiveProject,
  completeProject,
  getProjects,
} from "../api/projectsApi";
import type { Project, ProjectStatus } from "../types";
import { CreateEditProjectModal } from "../components/CreateEditProjectModal";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { useProjectWizardStore } from "../store/useProjectWizardStore";
import { useDeleteProject } from "../hooks/useProjects";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { BrandBeats } from "../../../components/Brand";
import { CoastalArtwork, CoastalDivider } from "../../../components/CoastalEmptyState";
import "../projects.css";

const statusConfig: Record<
  ProjectStatus,
  { label: string; bgClass: string; textColor: string }
> = {
  active:    { get label() { return translate("فعال"); },     bgClass: "bg-success/20", textColor: "text-success" },
  draft:     { get label() { return translate("Draft"); },      bgClass: "bg-base-content/10", textColor: "text-base-content/70" },
  on_hold:   { get label() { return translate("On Hold"); },    bgClass: "bg-warning/20", textColor: "text-warning" },
  completed: { get label() { return translate("Completed"); },  bgClass: "bg-primary/20", textColor: "text-primary" },
  archived:  { get label() { return translate("Archived"); },   bgClass: "bg-error/20", textColor: "text-error" },
};


const statusFilterOptions = [
  { value: "all", get label() { return translate("همه پروژه‌ها"); } },
  { value: "active", get label() { return translate("فعال"); } },
  { value: "draft", get label() { return translate("Draft"); } },
  { value: "on_hold", get label() { return translate("On Hold"); } },
  { value: "completed", get label() { return translate("Completed"); } },
  { value: "archived", get label() { return translate("Archived"); } },
];

function StatusFilterDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <label className="projects-status-filter">
      <SlidersHorizontal size={16} aria-hidden="true" />
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={t("Project status")}>
        {statusFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

const ProgressRing = ({
  radius,
  stroke,
  progress,
  color,
}: {
  radius: number;
  stroke: number;
  progress: number;
  color: string;
}) => {
  useLocale();
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = Math.max(0, circumference - (progress / 100) * circumference);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        height={radius * 2}
        width={radius * 2}
        className="transform -rotate-90"
      >
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="opacity-10 text-base-content"
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="projects-progress-arc"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-black text-base-content">
          {formatUiNumber(Math.round(progress))}%
        </span>
      </div>
    </div>
  );
};


// Dropdown menu for project card actions
function ProjectActionMenu({
  project,
  onEdit,
  onDelete,
  onComplete,
  onArchive,
}: {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onArchive: () => void;
}) {
  const t = useTranslation();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative z-20" ref={ref} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 place-items-center rounded-lg text-heledone-ink-muted hover:bg-base-200 hover:text-base-content transition duration-150"
        aria-label={t("Actions for {value0}", { value0: project.name })}
        title={t("Actions for {value0}", { value0: project.name })}
        aria-expanded={open}
      >
        <EllipsisVertical size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.95, y: reducedMotion ? 0 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.95, y: reducedMotion ? 0 : -4 }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              className="projects-action-menu absolute end-0 top-11 z-50 min-w-[180px] rounded-lg border border-base-content/10 bg-base-100 p-1.5 text-xs font-semibold shadow-xl text-base-content"
            >
              <button
                type="button"
                onClick={() => { setOpen(false); onEdit(); }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start hover:bg-base-200"
              >
                <Edit2 size={14} />  {t("Edit project")}</button>
              {project.status !== "completed" && project.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onComplete(); }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-success hover:bg-success/10"
                >
                  <TickCircle size={14} />  {t("ثبت انجام‌شدن")}</button>
              )}
              {project.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onArchive(); }}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-heledone-ink-muted hover:bg-base-200"
                >
                  <Archive size={14} />  {t("Archive")}</button>
              )}
              <div className="my-1 h-px bg-base-content/8" />
              <button
                type="button"
                onClick={() => { setOpen(false); onDelete(); }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start text-error hover:bg-error/10"
              >
                <Trash size={14} />  {t("حذف")}</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}


function ProjectCard({
  project,
  onEdit,
  onDelete,
  onComplete,
  onArchive,
  canManage,
}: {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  onArchive: () => void;
  canManage: boolean;
}) {
  const t = useTranslation();
  const reducedMotion = useReducedMotion();
  const cfg = statusConfig[project.status];
  const memberCount = project.member_count ?? project.members_count ?? 0;
  const progress = Math.max(0, Math.min(100, project.progress_percentage || 0));
  const projectColor = project.color || "#087F83";

  // Progress display: strictly respect progress_mode — no fallback
  const progressMode = project.progress_mode || "task_based";
  const completedMilestones = project.completed_milestone_count || 0;
  const totalMilestones = project.milestone_count || 0;
  const completedTasks = project.completed_task_count || 0;
  const totalTasks = project.task_count || 0;
  const useMilestoneDisplay = progressMode === "milestone_based";

  return (
    <motion.article
      layout={!reducedMotion}
      initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, type: "spring", bounce: 0 }}
      className="heledone-project-card projects-card group relative rounded-lg border border-heledone-border p-5"
    >
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="projects-folder" style={{ color: projectColor }}><FolderKanban size={23} aria-hidden="true" /></span>
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${cfg.bgClass} ${cfg.textColor}`}>{cfg.label}</span>
            {canManage && <ProjectActionMenu project={project} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} onArchive={onArchive} />}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 break-words text-lg font-bold text-base-content">
            <Link to={`/projects/${project.id}`} className="projects-card-link">{project.name}</Link>
          </h2>
        </div>
        <p className="projects-card-description mt-1 text-sm text-heledone-ink-muted">{project.description || t("No description added yet.")}</p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-heledone-border pt-4">
          <div>
            <p className="text-xs font-medium text-heledone-ink-muted">
              {useMilestoneDisplay ? t("Milestone Progress") : t("Task Progress")}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-base-content">
                {useMilestoneDisplay ? formatUiNumber(completedMilestones) : formatUiNumber(completedTasks)}
              </span>
              <span className="text-sm font-medium text-heledone-ink-muted">
                / {useMilestoneDisplay ? formatUiNumber(totalMilestones) : formatUiNumber(totalTasks)}  {t("Done")}
              </span>
            </div>
          </div>

          <div className="relative shrink-0">
            <ProgressRing radius={30} stroke={4} progress={progress} color={projectColor} />
          </div>
        </div>

        {/* Unlinked tasks warning badge — only relevant in milestone_based mode */}
        {useMilestoneDisplay && (project.unlinked_task_count || 0) > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-warning">
            <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
            <span>{(project.unlinked_task_count || 0) === 1 ? t("{count} unlinked task", { count: 1 }) : t("{count} unlinked tasks", { count: project.unlinked_task_count || 0 })}</span>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs text-heledone-ink-muted">
          <Users size={15} aria-hidden="true" />
          <span className="font-medium">{formatUiNumber(memberCount)}  {t("members")}</span>
          <ArrowUpRight size={17} className="ms-auto text-primary rtl:-rotate-90" aria-hidden="true" />
        </div>
      </div>
    </motion.article>
  );
}

export default function ProjectsPage() {
  const t = useTranslation();
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const deleteProjectMutation = useDeleteProject();
  const { hasAnyPermission } = usePermissions();
  const canCreateProject = hasAnyPermission(["project.create", "project.manage"]);
  const canManageProject = hasAnyPermission(["project.manage"]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [deleteModalState, setDeleteModalState] = useState<{
    open: boolean;
    projectId: string | number | null;
    projectTitle: string;
  }>({ open: false, projectId: null, projectTitle: "" });

  const projectsQuery = useQuery({
    queryKey: ["projects", search],
    queryFn: () =>
      getProjects({ search: search || undefined }),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string | number;
      action: "archive" | "complete";
    }) => (action === "archive" ? archiveProject(id) : completeProject(id)),
    onSuccess: (_project, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        variables.action === "archive"
          ? t("Project archived")
          : t("Project marked complete"),
      );
    },
    onError: () => toast.error(t("Could not update project status.")),
  });

  const projects = useMemo(() => {
    let list = projectsQuery.data || [];
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    return list;
  }, [projectsQuery.data, statusFilter]);

  const openWizard = useProjectWizardStore((s) => s.open);

  // Auto-open wizard when redirected from org onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === '1') {
      openWizard();
      // Clean URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('wizard');
      window.history.replaceState({}, '', url.toString());
    }
  }, [openWizard]);

  const handleCreateProject = () => {
    openWizard();
  };

  const handleEditProject = (project: Project) => {
    setSelectedProject(project);
    setIsProjectModalOpen(true);
  };

  const handleDeleteClick = (project: Project) => {
    setDeleteModalState({
      open: true,
      projectId: project.id,
      projectTitle: project.name,
    });
  };

  const handleConfirmDelete = () => {
    if (deleteModalState.projectId !== null) {
      deleteProjectMutation.mutate(deleteModalState.projectId, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["projects"] });
          toast.success(t("Project deleted successfully"));
          setDeleteModalState({ open: false, projectId: null, projectTitle: "" });
        },
        onError: () => toast.error(t("Could not delete project.")),
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="projects-page min-h-[calc(100vh-121px)] space-y-5 pb-10"
    >
      <header className="projects-coastal-heading">
        <img src="/images/heledone-assets/projects-coastal-v1.png" alt="" aria-hidden="true" className="projects-coastal-art" />
        <div className="projects-coastal-overlay" />
        <div className="projects-heading-copy">
          <BrandBeats className="mb-3" />
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-base-content">
              {t("پروژه‌ها")}</h1>
          </div>
          <p className="mt-1 text-sm text-heledone-ink-muted">{t("The work we move forward together.")}</p>
        </div>
      </header>

        <div className="projects-toolbar flex flex-wrap items-center gap-3 border-b border-heledone-border pb-4">
          {canCreateProject && <button type="button" onClick={handleCreateProject} className="projects-create-button inline-flex items-center gap-2 bg-primary px-4 font-bold text-primary-content"><Add size={18} /><span>{t("پروژه تازه")}</span></button>}
          <label className="relative block w-full sm:w-72">
            <SearchNormal1
              size={15}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("جست‌وجوی پروژه‌ها…")}
              className="projects-search h-11 w-full rounded-lg border border-base-content/15 bg-base-100 ps-9 pe-10 text-sm text-base-content outline-none placeholder:text-heledone-ink-muted"
              aria-label={t("Search projects")}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-heledone-ink-muted hover:text-base-content"
                aria-label={t("Clear search")}
                title={t("Clear search")}
              >
                <CloseCircle size={15} />
              </button>
            )}
          </label>
          <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />
          <span className="text-xs text-heledone-ink-muted sm:ms-auto" aria-live="polite">{projectsQuery.isSuccess && t("{count} projects", { count: projects.length })}</span>
        </div>

      {/* Grid of Simple Project Cards */}
      {projectsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="projects-skeleton h-72 animate-pulse rounded-lg bg-base-100" />
          ))}
        </div>
      ) : projectsQuery.isError ? (
        <div className="border-y border-error/25 bg-error/5 p-8 text-center">
          <p className="font-semibold text-error">{t("Projects could not be loaded.")}</p>
          <button
            type="button"
            onClick={() => projectsQuery.refetch()}
            className="btn btn-sm btn-ghost mt-3 rounded-lg"
          >
            {t("Try again")}</button>
        </div>
      ) : projects.length === 0 ? (
        <div className="projects-empty px-4 py-8 text-center">
          <CoastalArtwork motif="palm" className="mx-auto mb-5" />
          <h2 className="text-xl font-semibold">{t("No projects found")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-heledone-ink-muted">
            {search || statusFilter !== "all"
              ? t("No projects matching your filters")
              : t("Create your first project to get started.")}
          </p>
          {!search && statusFilter === "all" && canCreateProject && (
            <button
              type="button"
              onClick={handleCreateProject}
              className="projects-create-button mx-auto mt-5 inline-flex items-center gap-2 bg-primary px-4 font-bold text-primary-content"
            >
              <Add size={18} />  {t("Create your first project")}</button>
          )}
          {(search || statusFilter !== "all") && <button type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-primary hover:bg-primary/10"><CloseCircle size={16} />{t("Clear filters")}</button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence>
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={() => handleEditProject(project)}
                onDelete={() => handleDeleteClick(project)}
                onComplete={() =>
                  lifecycleMutation.mutate({ id: project.id, action: "complete" })
                }
                onArchive={() =>
                  lifecycleMutation.mutate({ id: project.id, action: "archive" })
                }
                canManage={canManageProject}
              />
            ))}
          </AnimatePresence>

          {/* Add New Project Card */}
          {canCreateProject && (
            <motion.button
              layout={!reducedMotion}
              type="button"
              onClick={handleCreateProject}
              className="projects-add-card flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-primary/30 text-primary hover:bg-primary/5"
            >
              <Add size={28} />
              <span className="text-sm font-bold">{t("پروژه تازه")}</span>
            </motion.button>
          )}
        </div>
      )}

      <CoastalDivider />

      <CreateEditProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        project={selectedProject}
      />

      <DeleteConfirmModal
        isOpen={deleteModalState.open}
        onClose={() =>
          setDeleteModalState({ open: false, projectId: null, projectTitle: "" })
        }
        onConfirm={handleConfirmDelete}
        isLoading={deleteProjectMutation.isPending}
        title={deleteModalState.projectTitle}
      />
    </motion.div>
  );
}
