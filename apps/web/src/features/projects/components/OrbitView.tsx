import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { getIntlLocale, t as translate, useTranslation } from "../../../i18n/locale";
import {
  ArrowLeft2,
  ArrowRight2,
  Calendar1,
  CloseCircle,
  Pause,
  People,
  Play,
  Refresh2,
  SearchZoomIn,
  SearchZoomOut,
} from "iconsax-reactjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type SetStateAction,
} from "react";
import { TeamMembersModal } from "../../teams/components/TeamMembersModal";
import type { Team } from "../../teams/types";
import type { Milestone, Project, ProjectMember } from "../types";

interface OrbitViewProps {
  project: Project;
  members?: ProjectMember[];
  milestones?: Milestone[];
  isPlaying?: boolean;
  onPlayPauseChange?: (playing: boolean | ((prev: boolean) => boolean)) => void;
  zoom?: number;
  onZoomChange?: (zoom: number | ((prev: number) => number)) => void;
  rotation?: number;
  onRotationChange?: (rotation: number | ((prev: number) => number)) => void;
  filter?: string;
  onFilterChange?: (filter: string) => void;
}

interface RingDefinition {
  id: string | number;
  label: string;
  size: number;
  isOverflow?: boolean;
  status?: Milestone["status"];
  progress?: number;
}

interface RingLabel {
  id: string | number;
  label: string;
  status?: Milestone["status"];
  progress?: number;
}

interface MemberCluster {
  label: string;
  members: ProjectMember[];
}

interface OrbitControlsProps {
  isPlaying: boolean;
  showPlayLabel?: boolean;
  onTogglePlaying: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
}

const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.35;
const ZOOM_STEP = 0.12;
const MAX_RING_NODES = 8;
const VISIBLE_RING_MEMBERS = MAX_RING_NODES - 1;

const statusClasses: Record<Project["status"], string> = {
  active:
    "bg-success/20 text-success border border-success/30 backdrop-blur-sm",
  draft:
    "bg-base-300/40 text-base-content/70 border border-base-content/10 backdrop-blur-sm",
  on_hold:
    "bg-warning/20 text-warning border border-warning/30 backdrop-blur-sm",
  completed: "bg-info/20 text-info border border-info/30 backdrop-blur-sm",
  archived:
    "bg-base-content/10 text-heledone-ink-muted border border-base-content/15",
};

const overflowStatusClasses: Record<
  Project["status"],
  { ring: string; button: string; chip: string }
> = {
  draft: {
    ring: "border-secondary/55",
    button:
      "border-secondary/35 bg-secondary/10 text-secondary hover:border-secondary/60 hover:bg-secondary/20",
    chip: "border-secondary/50 bg-secondary/10 text-secondary",
  },
  active: {
    ring: "border-success/55",
    button:
      "border-success/35 bg-success/10 text-success hover:border-success/60 hover:bg-success/20",
    chip: "border-success/50 bg-success/10 text-success",
  },
  on_hold: {
    ring: "border-warning/55",
    button:
      "border-warning/35 bg-warning/10 text-warning hover:border-warning/60 hover:bg-warning/20",
    chip: "border-warning/50 bg-warning/10 text-warning",
  },
  completed: {
    ring: "border-info/55",
    button:
      "border-info/35 bg-info/10 text-info hover:border-info/60 hover:bg-info/20",
    chip: "border-info/50 bg-info/10 text-info",
  },
  archived: {
    ring: "border-base-content/35",
    button:
      "border-base-content/25 bg-base-content/8 text-heledone-ink-muted hover:border-base-content/45 hover:bg-base-content/12",
    chip:
      "border-base-content/30 bg-base-content/8 text-heledone-ink-muted",
  },
};

const sunStyles: Record<
  Project["status"],
  { surface: string; glow: string; inner: string }
> = {
  active: {
    surface:
      "border-success/30 bg-base-100/60 text-success backdrop-blur-xl shadow-lg",
    glow: "bg-success/15 shadow-[0_0_65px_color-mix(in_srgb,var(--color-success)_30%,transparent)]",
    inner: "border-success/20 bg-success/10 backdrop-blur-sm",
  },
  completed: {
    surface:
      "border-info/30 bg-base-100/60 text-info backdrop-blur-xl shadow-lg",
    glow: "bg-info/15 shadow-[0_0_65px_color-mix(in_srgb,var(--color-info)_30%,transparent)]",
    inner: "border-info/20 bg-info/10 backdrop-blur-sm",
  },
  on_hold: {
    surface:
      "border-warning/35 bg-base-100/60 text-warning backdrop-blur-xl shadow-lg",
    glow: "bg-warning/15 shadow-[0_0_65px_color-mix(in_srgb,var(--color-warning)_32%,transparent)]",
    inner: "border-warning/25 bg-warning/10 backdrop-blur-sm",
  },
  draft: {
    surface:
      "border-secondary/30 bg-base-100/60 text-secondary backdrop-blur-xl shadow-lg",
    glow: "bg-secondary/15 shadow-[0_0_50px_color-mix(in_srgb,var(--color-secondary)_25%,transparent)]",
    inner: "border-secondary/20 bg-secondary/10 backdrop-blur-sm",
  },
  archived: {
    surface:
      "border-base-content/15 bg-base-200/50 text-heledone-ink-muted backdrop-blur-md",
    glow: "bg-base-content/8 shadow-[0_0_35px_color-mix(in_srgb,var(--color-base-content)_12%,transparent)]",
    inner: "border-base-content/10 bg-base-100/30",
  },
};

const milestoneStatusClasses: Record<Milestone["status"], string> = {
  pending: "bg-base-300 text-heledone-ink-muted",
  in_progress: "bg-info/15 text-info",
  completed: "bg-success/15 text-success",
  cancelled: "bg-error/15 text-error",
};

const statusLegendItems: Array<{
  status: Project["status"];
  label: string;
}> = [
  { status: "draft", get label() { return translate("Draft"); } },
  { status: "active", get label() { return translate("فعال"); } },
  { status: "on_hold", get label() { return translate("On hold"); } },
  { status: "completed", get label() { return translate("Completed"); } },
  { status: "archived", get label() { return translate("Archived"); } },
];

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const getMemberName = (member: ProjectMember) => {
  if (!member.user) return member.team?.name || "Project member";

  const fullName =
    `${member.user.first_name ?? ""} ${member.user.last_name ?? ""}`.trim();
  return (
    fullName ||
    member.user.full_name ||
    member.user.username ||
    member.user.email ||
    "Project member"
  );
};

const getMemberRole = (member: ProjectMember) =>
  member.specialty?.trim() || "Team Member";

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "M";

const formatDeadline = (deadline?: string | null) => {
  if (!deadline) return translate("No deadline");
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return translate("No deadline");
  return new Intl.DateTimeFormat(getIntlLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

function OrbitControls({
  isPlaying,
  showPlayLabel = false,
  onTogglePlaying,
  onZoomOut,
  onZoomIn,
  onReset,
  onRotateLeft,
  onRotateRight,
}: OrbitControlsProps) {
  const t = useTranslation();
  const buttonClassName =
    "grid size-9 shrink-0 place-items-center rounded-lg text-base-content/70 transition duration-150 hover:bg-base-200 hover:text-base-content active:scale-95";

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-base-content/10 bg-base-100/80 p-1 shadow-lg backdrop-blur-xl supports-[backdrop-filter]:bg-base-100/70">
      <button
        type="button"
        onClick={onTogglePlaying}
        className={
          showPlayLabel
            ? "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold text-base-content/70 transition duration-150 hover:bg-base-200 hover:text-base-content active:scale-95"
            : buttonClassName
        }
        aria-label={
          isPlaying ? t("Pause orbit animation") : t("Play orbit animation")
        }
      >
        {isPlaying ? (
          <Pause size={15} variant="Bold" />
        ) : (
          <Play size={15} variant="Bold" />
        )}
        {showPlayLabel && <span>{isPlaying ? t("Pause") : t("Play")}</span>}
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className={buttonClassName}
        aria-label={t("Zoom out")}
      >
        <SearchZoomOut size={16} />
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className={buttonClassName}
        aria-label={t("Zoom in")}
      >
        <SearchZoomIn size={16} />
      </button>
      <button
        type="button"
        onClick={onReset}
        className={buttonClassName}
        aria-label={t("Reset orbit view")}
      >
        <Refresh2 size={16} />
      </button>
      <div className="flex border-s border-base-content/10 ps-0.5">
        <button
          type="button"
          onClick={onRotateLeft}
          className={buttonClassName}
          aria-label={t("Rotate orbit left")}
        >
          <ArrowLeft2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRotateRight}
          className={buttonClassName}
          aria-label={t("Rotate orbit right")}
        >
          <ArrowRight2 size={15} />
        </button>
      </div>
    </div>
  );
}

function MemberDetails({
  member,
  onClose,
}: {
  member: ProjectMember;
  onClose: () => void;
}) {
  const t = useTranslation();
  const name = getMemberName(member);
  const role =
    (member as ProjectMember & { role?: string }).role?.trim() || "Team Member";
  const memberWithMilestone = member as ProjectMember & {
    milestone?: Pick<Milestone, "title" | "status"> | null;
    current_milestone?: Pick<Milestone, "title" | "status"> | null;
  };
  const currentMilestone =
    memberWithMilestone.current_milestone ?? memberWithMilestone.milestone;
  const allocation = Math.min(
    100,
    Math.max(0, Number(member.allocation_percentage) || 0),
  );

  return (
    <div className="relative p-5" >
      <button
        type="button"
        onClick={onClose}
        className="absolute end-3 top-3 grid size-9 place-items-center rounded-xl text-heledone-ink-muted transition hover:bg-base-200 hover:text-base-content"
        aria-label={t("Close member details")}
      >
        <CloseCircle size={19} />
      </button>
      <div className="flex items-center gap-3 pe-9">
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-secondary text-sm font-black text-secondary-content shadow-lg shadow-secondary/20">
          {member.user?.avatar ? (
            <img
              src={member.user.avatar}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            getInitials(name)
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-base-content">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex rounded-full bg-secondary/12 px-2 py-0.5 text-[13px] font-bold text-secondary">
              {role}
            </span>
            {member.specialty?.trim() && (
              <span className="inline-flex rounded-full border border-base-content/10 bg-base-200/70 px-2 py-0.5 text-[13px] font-semibold text-heledone-ink-muted">
                {member.specialty}
              </span>
            )}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-base-200/65 p-3 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[13px] font-semibold text-heledone-ink-muted">
              {t("Allocation")}</dt>
            <dd className="font-bold text-base-content">{formatUiNumber(allocation)}%</dd>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-base-300">
            <div
              className="h-full rounded-full bg-secondary transition-[width] duration-300"
              style={{ width: `${allocation}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl bg-base-200/65 p-3">
          <dt className="text-[13px] font-semibold text-heledone-ink-muted">
            {t("تیم")}</dt>
          <dd className="mt-1 truncate font-bold text-base-content">
            {member.team?.name || t("Independent")}
          </dd>
        </div>
        <div className="rounded-xl bg-base-200/65 p-3">
          <dt className="text-[13px] font-semibold text-heledone-ink-muted">
            {t("وضعیت")}</dt>
          <dd className="mt-1 flex items-center gap-1.5 font-bold text-base-content">
            <span
              className={`size-2 rounded-full ${member.is_active ? "bg-success" : "bg-base-content/25"}`}
            />
            {member.is_active ? t("فعال") : t("Inactive")}
          </dd>
        </div>
        {currentMilestone?.title && (
          <div className="rounded-xl bg-base-200/65 p-3 sm:col-span-2">
            <dt className="text-[13px] font-semibold text-heledone-ink-muted">
              {t("Current milestone")}</dt>
            <dd className="mt-1 flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-bold text-base-content">
                {currentMilestone.title}
              </span>
              {currentMilestone.status && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-bold capitalize ${
                    milestoneStatusClasses[currentMilestone.status] ??
                    milestoneStatusClasses.pending
                  }`}
                >
                  {currentMilestone.status.replace("_", " ")}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function ClusterDetails({
  cluster,
  onClose,
  onSelectMember,
}: {
  cluster: MemberCluster;
  onClose: () => void;
  onSelectMember: (member: ProjectMember) => void;
}) {
  const t = useTranslation();
  return (
    <div className="relative p-5" >
      <button
        type="button"
        onClick={onClose}
        className="absolute end-3 top-3 grid size-9 place-items-center rounded-xl text-heledone-ink-muted transition hover:bg-base-200 hover:text-base-content"
        aria-label={t("Close remaining members")}
      >
        <CloseCircle size={19} />
      </button>
      <div className="pe-10">
        <p className="truncate text-sm font-bold text-base-content">
          {cluster.label}
        </p>
        <p className="mt-1 text-xs font-medium text-heledone-ink-muted">
          {formatUiNumber(cluster.members.length)}  {t("more")}{" "}
          {cluster.members.length === 1 ? t("member") : t("members")}
        </p>
      </div>
      <div className="mt-4 grid gap-2">
        {cluster.members.map((member) => {
          const name = getMemberName(member);
          const role = getMemberRole(member);

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelectMember(member)}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-base-content/8 bg-base-200/55 p-2.5 text-start transition hover:border-secondary/30 hover:bg-base-200 active:scale-[0.99]"
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary text-[13px] font-black text-secondary-content">
                {member.user?.avatar ? (
                  <img
                    src={member.user.avatar}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : member.team ? (
                  <People size={16} />
                ) : (
                  getInitials(name)
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-base-content">
                  {name}
                </span>
                <span className="mt-0.5 block truncate text-[13px] font-medium text-heledone-ink-muted">
                  {role}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverflowDetails({
  labels,
  mode,
  onClose,
}: {
  labels: RingLabel[];
  mode: "teams" | "milestones";
  onClose: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="relative p-5" >
      <button
        type="button"
        onClick={onClose}
        className="absolute end-3 top-3 grid size-9 place-items-center rounded-xl text-heledone-ink-muted transition hover:bg-base-200 hover:text-base-content"
        aria-label={t("Close overflow milestones")}
      >
        <CloseCircle size={19} />
      </button>
      <div className="pe-10">
        <p className="text-sm font-bold text-base-content">
          {t("Remaining")} {mode === "teams" ? t("teams") : t("milestones")}
        </p>
        <p className="mt-1 text-xs font-medium text-heledone-ink-muted">
          {t("These labels share the dashed overflow ring.")}</p>
      </div>
      <ul className="mt-4 grid gap-2">
        {labels.map((item) => (
          <li
            key={item.id}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-base-content/8 bg-base-200/55 px-3 py-2.5"
          >
            <span className="truncate text-xs font-bold text-base-content">
              {item.label}
            </span>
            {item.status && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-bold capitalize ${
                  milestoneStatusClasses[item.status] ??
                  milestoneStatusClasses.pending
                }`}
              >
                {item.status.replace("_", " ")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectDetails({
  project,
  memberCount,
  progress,
  statusLabel,
  onClose,
}: {
  project: Project;
  memberCount: number;
  progress: number;
  statusLabel: string;
  onClose: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="relative p-5" >
      <button
        type="button"
        onClick={onClose}
        className="absolute end-3 top-3 grid size-10 place-items-center rounded-xl text-heledone-ink-muted transition hover:bg-base-200 hover:text-base-content active:scale-95"
        aria-label={t("Close project details")}
      >
        <CloseCircle size={20} />
      </button>

      <div className="pe-12">
        <p className="text-base font-black leading-tight text-base-content">
          {project.name}
        </p>
        <span
          className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[13px] font-black uppercase tracking-wide ${statusClasses[project.status] ?? statusClasses.draft}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 rounded-2xl bg-base-200/65 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-heledone-ink-muted">
            {t("Project progress")}</span>
          <span
            className={`font-black ${progress === 100 ? "text-success" : "text-primary"}`}
          >
            {formatUiNumber(progress)}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-base-300">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${progress === 100 ? "bg-success" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-base-200/65 p-3">
          <dt className="text-[13px] font-semibold text-heledone-ink-muted">
            {t("Deadline")}</dt>
          <dd className="mt-1 font-bold text-base-content">
            {formatDeadline(project.deadline)}
          </dd>
        </div>
        <div className="rounded-xl bg-base-200/65 p-3">
          <dt className="text-[13px] font-semibold text-heledone-ink-muted">
            {t("Team size")}</dt>
          <dd className="mt-1 font-bold text-base-content">
            {formatUiNumber(memberCount)} {memberCount === 1 ? t("member") : t("members")}
          </dd>
        </div>
      </dl>

      <div className="mt-3 rounded-xl bg-base-200/65 p-3">
        <p className="text-[13px] font-semibold text-heledone-ink-muted">
          {t("توضیح")}</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-base-content/75">
          {project.description || t("No description provided.")}
        </p>
      </div>
    </div>
  );
}

export function OrbitView({
  project,
  members = [],
  milestones = [],
  isPlaying: controlledIsPlaying,
  onPlayPauseChange,
  zoom: controlledZoom,
  onZoomChange,
  rotation: controlledRotation,
  onRotationChange,
  filter: controlledFilter,
  onFilterChange,
}: OrbitViewProps) {
  const t = useTranslation();
  const reduceMotion = useReducedMotion();
  const [localIsPlaying, setLocalIsPlaying] = useState(true);
  const [localZoom, setLocalZoom] = useState(1);
  const [localRotation, setLocalRotation] = useState(0);
  const [localFilter, setLocalFilter] = useState("all");
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ProjectMember | null>(
    null,
  );
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<MemberCluster | null>(
    null,
  );
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinchDistance = useRef<number | null>(null);

  const isPlaying = controlledIsPlaying ?? localIsPlaying;
  const zoom = controlledZoom ?? localZoom;
  const rotation = controlledRotation ?? localRotation;
  const filter = controlledFilter ?? localFilter;
  const setIsPlaying = onPlayPauseChange ?? setLocalIsPlaying;
  const setZoom = onZoomChange ?? setLocalZoom;
  const setRotation = onRotationChange ?? setLocalRotation;
  const setFilter = onFilterChange ?? setLocalFilter;

  useEffect(() => {
    if (!isProjectModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsProjectModalOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isProjectModalOpen]);

  const teamNames = useMemo(
    () =>
      Array.from(
        new Set(
          members.flatMap((member) =>
            member.team?.name ? [member.team.name] : [],
          ),
        ),
      ),
    [members],
  );

  const roleNames = useMemo(
    () => Array.from(new Set(members.map(getMemberRole))),
    [members],
  );

  const ringMode = milestones.length > 0 ? "milestones" : "teams";
  const allRingLabels = useMemo<RingLabel[]>(() => {
    if (milestones.length > 0) {
      return milestones.map((milestone) => {
        const taskCount = milestone.task_count ?? 0;
        const completedTaskCount = milestone.completed_task_count ?? 0;
        const progress =
          milestone.status === "completed"
            ? 100
            : taskCount > 0
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    Math.round((completedTaskCount / taskCount) * 100),
                  ),
                )
              : 0;

        return {
          id: milestone.id,
          label: milestone.title,
          status: milestone.status,
          progress,
        };
      });
    }
    if (teamNames.length > 0) {
      return teamNames.map((team, index) => ({
        id: `team-${team}-${index}`,
        label: team,
      }));
    }
    return [t("Inner orbit"), t("Core team"), t("Outer orbit")].map((label, index) => ({
      id: `fallback-${index}`,
      label,
    }));
  }, [milestones, teamNames, t]);

  const overflowLabels = useMemo(
    () => (allRingLabels.length > 4 ? allRingLabels.slice(3) : []),
    [allRingLabels],
  );

  const rings = useMemo<RingDefinition[]>(() => {
    const hasOverflow = allRingLabels.length > 4;
    const visibleLabels = hasOverflow
      ? allRingLabels.slice(0, 3)
      : allRingLabels;
    const renderedLabels: Array<RingLabel & { isOverflow?: boolean }> =
      hasOverflow
        ? [
            ...visibleLabels,
            {
              id: "overflow",
              label: t("+{value0} More {value1}", { value0: allRingLabels.length - 3, value1: ringMode === "milestones" ? "Milestones" : t("تیم‌ها") }),
              isOverflow: true,
            },
          ]
        : visibleLabels;
    const count = Math.max(1, renderedLabels.length);

    return renderedLabels.map((item, index) => ({
      id: item.id,
      label: item.label,
      isOverflow: item.isOverflow,
      status: item.status,
      progress: item.progress,
      size:
        count === 1
          ? 72
          : 48 + (index * 36) / (count - 1) + (item.isOverflow ? 9 : 0),
    }));
  }, [allRingLabels, ringMode, t]);

  const memberMatchesFilter = (member: ProjectMember) => {
    if (filter === "all") return true;
    const [kind, value] = filter.split(":", 2);
    if (kind === "team") return member.team?.name === value;
    if (kind === "role") return getMemberRole(member) === value;
    if (kind === "status") return member.is_active === (value === "active");
    return true;
  };

  const matchingMemberCount = members.filter(memberMatchesFilter).length;
  const nonOverflowRings = rings.filter((ring) => !ring.isOverflow);
  const maxMemberRingIndex = Math.min(2, nonOverflowRings.length - 1);

  const memberRingIndex = (member: ProjectMember, index: number) => {
    if (maxMemberRingIndex < 0) return -1;
    if (ringMode === "teams" && member.team) {
      const matchingRing = allRingLabels.findIndex(
        (ring) => ring.label === member.team?.name,
      );
      if (matchingRing >= 0) {
        return Math.min(matchingRing, maxMemberRingIndex);
      }
    }
    return index % (maxMemberRingIndex + 1);
  };

  const updateZoom = (nextZoom: SetStateAction<number>) => {
    setZoom((current) =>
      clampZoom(typeof nextZoom === "function" ? nextZoom(current) : nextZoom),
    );
  };
  const resetView = () => {
    setZoom(1);
    setRotation(0);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      (event.target as HTMLElement).closest("[data-orbit-node], button, select")
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = activePointers.current.get(event.pointerId);
    if (!previous) return;

    activePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = Array.from(activePointers.current.values());

    if (points.length >= 2) {
      const [first, second] = points;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (lastPinchDistance.current !== null) {
        updateZoom(
          (current) => current + (distance - lastPinchDistance.current!) / 320,
        );
      }
      lastPinchDistance.current = distance;
      return;
    }

    setRotation((current) => current + (event.clientX - previous.x) * 0.45);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(event.pointerId);
    if (activePointers.current.size < 2) lastPinchDistance.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const progress = Math.min(100, Math.max(0, project.progress_percentage ?? 0));
  const statusLabel =
    project.status_display || project.status.replace("_", " ");
  const sunStyle = sunStyles[project.status] ?? sunStyles.draft;
  const overflowStatusStyle =
    overflowStatusClasses[project.status] ?? overflowStatusClasses.draft;
  const toggleFilter = (nextFilter: string) => {
    setFilter(filter === nextFilter ? "all" : nextFilter);
  };
  const handleMemberSelect = (member: ProjectMember) => {
    setSelectedCluster(null);
    setIsOverflowOpen(false);

    if (member.team) {
      setSelectedMember(null);
      setSelectedTeam({
        id: member.team.id,
        name: member.team.name,
        lead_id: null,
        is_active: true,
      });
      return;
    }

    setSelectedTeam(null);
    setSelectedMember(member);
  };
  const closePanels = () => {
    setSelectedMember(null);
    setSelectedTeam(null);
    setSelectedCluster(null);
    setIsOverflowOpen(false);
  };

  return (
    <section className="relative isolate h-[70vh] min-h-[460px] max-h-[640px] w-full overflow-hidden rounded-2xl border border-base-content/8 bg-base-100 shadow-sm md:h-[620px]">
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
      `}</style>
      <div
        className={`pointer-events-none absolute inset-[24%] rounded-full blur-3xl ${sunStyle.glow}`}
      />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle,color-mix(in_srgb,var(--color-base-content)_18%,transparent)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="absolute start-4 top-4 z-30 hidden sm:block">
        <OrbitControls
          isPlaying={isPlaying}
          showPlayLabel
          onTogglePlaying={() => setIsPlaying((playing) => !playing)}
          onZoomOut={() => updateZoom((value) => value - ZOOM_STEP)}
          onZoomIn={() => updateZoom((value) => value + ZOOM_STEP)}
          onReset={resetView}
          onRotateLeft={() => setRotation((value) => value - 16)}
          onRotateRight={() => setRotation((value) => value + 16)}
        />
      </div>

      <div className="absolute end-3 top-3 z-30 md:end-4 md:top-4">
        <label className="flex h-10 items-center gap-1.5 rounded-xl border border-base-content/10 bg-base-100/80 px-2 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-base-100/70 sm:h-11 sm:gap-2 sm:px-2.5">
          <People size={15} className="shrink-0 text-secondary" />
          <span className="sr-only">{t("Filter orbit nodes")}</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="select h-8 min-h-0 max-w-32 border-0 bg-transparent px-1 text-[13px] font-bold shadow-none focus:outline-none sm:max-w-36 sm:text-[13px]"
          >
            <option value="all">{t("All members")}</option>
            {teamNames.map((team) => (
              <option key={`team:${team}`} value={`team:${team}`}>
                {t("Team:")} {team}
              </option>
            ))}
            {roleNames.map((role) => (
              <option key={`role:${role}`} value={`role:${role}`}>
                {t("Role:")} {role}
              </option>
            ))}
            <option value="status:active">{t("Status: Active")}</option>
            <option value="status:inactive">{t("Status: Inactive")}</option>
          </select>
        </label>
      </div>

      <div className="absolute bottom-3 start-1/2 z-30 -translate-x-1/2 sm:hidden rtl:translate-x-1/2">
        <OrbitControls
          isPlaying={isPlaying}
          onTogglePlaying={() => setIsPlaying((playing) => !playing)}
          onZoomOut={() => updateZoom((value) => value - ZOOM_STEP)}
          onZoomIn={() => updateZoom((value) => value + ZOOM_STEP)}
          onReset={resetView}
          onRotateLeft={() => setRotation((value) => value - 16)}
          onRotateRight={() => setRotation((value) => value + 16)}
        />
      </div>

      <div
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          updateZoom((value) => value - event.deltaY * 0.002);
        }}
        aria-label={t("Interactive project orbit. Drag to rotate and pinch to zoom.")}
      >
        <motion.div
          className="absolute inset-0 m-auto aspect-square w-[88%] max-w-[560px] sm:w-[82%] md:w-[76%]"
          animate={{ scale: zoom }}
          transition={{ type: "spring", stiffness: 180, damping: 24 }}
        >
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: rotation }}
            transition={{ type: "spring", stiffness: 180, damping: 24 }}
          >
            {rings.map((ring) => (
              <div
                key={ring.id}
                className={`pointer-events-none absolute start-1/2 top-1/2 z-10 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full rtl:translate-x-1/2 ${
                  ring.isOverflow
                    ? `border-2 border-dashed [border-dasharray:9_7] ${overflowStatusStyle.ring}`
                    : "border border-base-content/18 dark:border-base-content/10 [[data-theme=dark]_&]:border-base-content/10"
                }`}
                style={{ width: `${ring.size}%` }}
              >
                {ring.isOverflow ? (
                  <button
                    type="button"
                    className={`pointer-events-auto absolute start-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-bold shadow-md backdrop-blur-md transition active:scale-95 sm:text-xs rtl:translate-x-1/2 ${overflowStatusStyle.button}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedMember(null);
                      setSelectedTeam(null);
                      setSelectedCluster(null);
                      setIsOverflowOpen(true);
                    }}
                    data-orbit-node
                    aria-label={t("Show {value0} overflow milestones", { value0: overflowLabels.length })}
                  >
                    {ring.label}
                  </button>
                ) : (
                  <span className="absolute start-1/2 top-0 inline-flex max-w-[calc(100%_-_1rem)] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-base-content/10 bg-base-100/80 px-2 py-0.5 text-xs font-medium text-base-content/70 backdrop-blur-xs dark:bg-base-300/60 dark:text-heledone-ink-muted [[data-theme=dark]_&]:bg-base-300/60 [[data-theme=dark]_&]:text-heledone-ink-muted rtl:translate-x-1/2">
                    <span className="truncate">{ring.label}</span>
                    {ringMode === "milestones" && ring.status && (
                      <span
                        className={`shrink-0 rounded px-1 text-[13px] font-bold ${
                          milestoneStatusClasses[ring.status] ??
                          milestoneStatusClasses.pending
                        }`}
                      >
                        {ring.status === "completed"
                          ? t("انجام‌شده")
                          : `${ring.progress ?? 0}%`}
                      </span>
                    )}
                  </span>
                )}
              </div>
            ))}

            {rings.map((ring, ringIndex) => {
              const ringMembers = members.filter(
                (member, index) => memberRingIndex(member, index) === ringIndex,
              );
              const displayedMembers =
                ringMembers.length > MAX_RING_NODES
                  ? ringMembers.slice(0, VISIBLE_RING_MEMBERS)
                  : ringMembers;
              const remainingMembers = ringMembers.slice(
                displayedMembers.length,
              );
              const renderedNodeCount =
                displayedMembers.length + (remainingMembers.length > 0 ? 1 : 0);
              const duration = 30 + ringIndex * 11;

              return (
                <div
                  key={`nodes-${ring.id}`}
                  className="pointer-events-none absolute start-1/2 top-1/2 z-40 aspect-square -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
                  style={{ width: `${ring.size}%` }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      animation: `spin ${duration}s linear infinite`,
                      animationPlayState:
                        isPlaying && !reduceMotion ? "running" : "paused",
                      willChange: "transform",
                    }}
                  >
                    {displayedMembers.map((member, memberIndex) => {
                      const angle =
                        (360 / Math.max(1, renderedNodeCount)) * memberIndex +
                        ringIndex * 31;
                      const radians = ((angle - 90) * Math.PI) / 180;
                      const name = getMemberName(member);
                      const role = getMemberRole(member);
                      const isFilterActive = filter !== "all";
                      const isMatchingFilter = memberMatchesFilter(member);

                      return (
                        <div
                          key={member.id}
                          className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                            isFilterActive && !isMatchingFilter
                              ? "pointer-events-none scale-95 opacity-25 grayscale"
                              : isFilterActive
                                ? "z-40 scale-105 opacity-100"
                                : "z-40 opacity-100"
                          }`}
                          style={{
                            left: `${50 + Math.cos(radians) * 50}%`,
                            top: `${50 + Math.sin(radians) * 50}%`,
                          }}
                        >
                          <div
                            style={{
                              animation: `spin-reverse ${duration}s linear infinite`,
                              animationPlayState:
                                isPlaying && !reduceMotion
                                  ? "running"
                                  : "paused",
                              willChange: "transform",
                            }}
                          >
                            <div className="group relative" data-orbit-node>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleMemberSelect(member);
                                }}
                                className={`relative grid size-9 min-h-8 min-w-8 place-items-center rounded-2xl border border-base-content/20 bg-base-100/40 text-[13px] font-black text-base-content shadow-lg backdrop-blur-md transition duration-200 hover:scale-110 hover:border-primary/50 hover:bg-base-100/60 md:size-10 ${
                                  isFilterActive && isMatchingFilter
                                    ? "ring-2 ring-primary/45 ring-offset-2 ring-offset-base-100/60"
                                    : ""
                                }`}
                                aria-label={t("Open details for {value0}", { value0: name })}
                              >
                                {member.user?.avatar ? (
                                  <img
                                    src={member.user.avatar}
                                    alt=""
                                    className="size-full rounded-[inherit] object-cover"
                                  />
                                ) : member.team ? (
                                  <People size={15} />
                                ) : (
                                  getInitials(name)
                                )}
                                <span
                                  className={`absolute end-0 top-0 size-2 rounded-full border border-base-100 ${
                                    member.is_active
                                      ? "bg-success shadow-[0_0_8px_color-mix(in_srgb,var(--color-success)_80%,transparent)]"
                                      : "bg-base-content/30"
                                  }`}
                                />
                              </button>
                              <span className="pointer-events-none absolute start-1/2 top-[calc(100%+0.25rem)] max-w-24 -translate-x-1/2 truncate rounded-full border border-secondary/20 bg-base-100/90 px-1.5 py-0.5 text-[13px] font-bold text-secondary shadow-sm backdrop-blur-sm md:hidden rtl:translate-x-1/2">
                                {role}
                              </span>
                              <div className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] start-1/2 z-50 hidden w-max max-w-44 -translate-x-1/2 rounded-xl border border-base-content/10 bg-base-100/95 px-3 py-2 text-center shadow-xl backdrop-blur-xl group-hover:block group-focus-within:block rtl:translate-x-1/2">
                                <p

                                  className="max-w-36 truncate text-[13px] font-bold text-base-content"
                                >
                                  {name}
                                </p>
                                <p

                                  className="mt-0.5 max-w-36 truncate text-[13px] font-semibold text-secondary"
                                >
                                  {role}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {remainingMembers.length > 0 &&
                      (() => {
                        const clusterIndex = displayedMembers.length;
                        const isFilterActive = filter !== "all";
                        const matchingClusterMembers = remainingMembers.filter(
                          memberMatchesFilter,
                        );
                        const isMatchingFilter =
                          matchingClusterMembers.length > 0;
                        const angle =
                          (360 / renderedNodeCount) * clusterIndex +
                          ringIndex * 31;
                        const radians = ((angle - 90) * Math.PI) / 180;

                        return (
                          <div
                            key={`cluster-${ring.id}`}
                            className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                              isFilterActive && !isMatchingFilter
                                ? "pointer-events-none scale-95 opacity-25 grayscale"
                                : isFilterActive
                                  ? "z-40 scale-105 opacity-100"
                                  : "z-40 opacity-100"
                            }`}
                            style={{
                              left: `${50 + Math.cos(radians) * 50}%`,
                              top: `${50 + Math.sin(radians) * 50}%`,
                            }}
                          >
                            <div
                              style={{
                                animation: `spin-reverse ${duration}s linear infinite`,
                                animationPlayState:
                                  isPlaying && !reduceMotion
                                    ? "running"
                                    : "paused",
                                willChange: "transform",
                              }}
                            >
                              <div data-orbit-node>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedMember(null);
                                    setSelectedTeam(null);
                                    setIsOverflowOpen(false);
                                    setSelectedCluster({
                                      label: ring.label,
                                      members: isFilterActive
                                        ? matchingClusterMembers
                                        : remainingMembers,
                                    });
                                  }}
                                  className={`grid size-9 min-h-8 min-w-8 place-items-center rounded-2xl border-2 border-secondary/35 bg-base-100 text-[13px] font-black text-secondary shadow-[0_8px_25px_color-mix(in_srgb,var(--color-secondary)_22%,transparent)] transition duration-200 hover:scale-110 hover:border-secondary hover:bg-secondary hover:text-secondary-content active:scale-95 md:size-10 ${
                                    isFilterActive && isMatchingFilter
                                      ? "ring-2 ring-primary/45 ring-offset-2 ring-offset-base-100/60"
                                      : ""
                                  }`}
                                  aria-label={t("Show {value0} more members in {value1}", { value0: isFilterActive
                                      ? matchingClusterMembers.length
                                      : remainingMembers.length, value1: ring.label })}
                                >
                                  +
                                  {formatUiNumber(isFilterActive
                                    ? matchingClusterMembers.length
                                    : remainingMembers.length)}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </div>
              );
            })}
          </motion.div>

          <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center">
            <motion.div
              className="relative grid h-[24%] w-[24%] place-items-center sm:h-[20%] sm:w-[20%]"
              animate={reduceMotion ? undefined : { scale: [1, 1.035, 1] }}
              transition={{
                duration: 4.5,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            >
              <div
                className={`absolute inset-[-48%] -z-10 rounded-full blur-2xl ${sunStyle.glow}`}
              />

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsProjectModalOpen(true);
                }}
                className={`pointer-events-auto relative grid size-full place-items-center rounded-full border p-2 text-center shadow-lg transition active:scale-95 sm:hidden ${sunStyle.surface}`}
                data-orbit-node
                aria-label={t("Open details for {value0}", { value0: project.name })}
              >
                <span

                  className="line-clamp-2 max-w-[80%] text-[13px] font-black leading-tight"
                >
                  {project.name}
                </span>
                <span
                  className="absolute bottom-[14%] start-1/2 flex -translate-x-1/2 items-center gap-0.5 rtl:translate-x-1/2"
                  aria-hidden="true"
                >
                  <span className="size-1 rounded-full bg-current opacity-45" />
                  <span className="size-1 rounded-full bg-current opacity-75" />
                  <span className="size-1 rounded-full bg-current" />
                </span>
              </button>

              <div
                className={`hidden size-full place-items-center rounded-full border p-2 text-current sm:grid ${sunStyle.surface}`}
              >
                <div
                  className={`grid size-full place-items-center rounded-full border p-2 text-center backdrop-blur-sm md:p-3 ${sunStyle.inner}`}
                >
                  <div className="min-w-0">
                    <p

                      className="line-clamp-2 text-[13px] font-black leading-tight md:text-xs"
                    >
                      {project.name}
                    </p>
                    <div
                      className={`mx-auto mt-1 grid size-9 place-items-center rounded-full md:size-11 ${progress === 100 ? "text-success" : "text-current"}`}
                      style={{
                        background: `conic-gradient(currentColor ${progress * 3.6}deg, color-mix(in srgb, currentColor 18%, transparent) 0deg)`,
                      }}
                    >
                      <div className="grid size-7 place-items-center rounded-full bg-base-100 text-[13px] font-black text-base-content md:size-8 md:text-[13px]">
                        {formatUiNumber(progress)}%
                      </div>
                    </div>
                    <span
                      className={`mt-1 inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[13px] font-black uppercase leading-none tracking-wide md:text-[13px] ${statusClasses[project.status] ?? statusClasses.draft}`}
                    >
                      {statusLabel}
                    </span>
                    <p className="mt-1 flex max-w-full items-center justify-center gap-1 truncate text-[13px] font-bold leading-none opacity-80 md:text-[13px]">
                      <Calendar1 size={8} className="shrink-0" />{" "}
                      <span className="truncate">
                        {formatDeadline(project.deadline)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute bottom-3 end-3 z-40 sm:bottom-4 sm:end-4">
        <div className="pointer-events-auto relative" >
          <AnimatePresence>
            {isLegendOpen && (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                className="pointer-events-auto absolute bottom-[calc(100%+0.5rem)] end-0 z-40 max-h-[calc(100dvh-6rem)] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-base-content/10 bg-base-100/95 p-3 shadow-xl backdrop-blur-md supports-[backdrop-filter]:bg-base-100/90"
                role="region"
                aria-label={t("Orbit filters and guide")}
              >
                {filter !== "all" ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                      <p className="truncate text-[13px] font-bold text-primary">
                        {t("Filter active")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[13px] font-bold text-primary-content transition hover:bg-primary/90 active:scale-95"
                    >
                      {t("Clear Filter")}</button>
                  </div>
                ) : (
                  <p className="rounded-xl bg-base-200/70 px-2.5 py-2 text-[13px] leading-relaxed text-heledone-ink-muted">
                    {t("Click a team or status to highlight matching nodes.")}</p>
                )}

                <section className="mt-3" aria-labelledby="orbit-filter-heading">
                  <p
                    id="orbit-filter-heading"
                    className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted"
                  >
                    {t("Filters")}</p>

                  <div className="mt-2.5">
                    <p className="text-[13px] font-semibold text-heledone-ink-muted">
                      {t("تیم‌ها")}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {teamNames.map((team) => {
                        const teamFilter = `team:${team}`;
                        return (
                          <button
                            key={teamFilter}
                            type="button"
                            onClick={() => toggleFilter(teamFilter)}
                            className={`max-w-full truncate rounded-full px-2.5 py-1 text-[13px] font-semibold transition active:scale-95 ${
                              filter === teamFilter
                                ? "bg-primary text-primary-content ring-1 ring-primary"
                                : "bg-base-200 text-heledone-ink-muted hover:bg-primary/10 hover:text-primary"
                            }`}
                            aria-pressed={filter === teamFilter}
                          >
                            {team}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <p className="text-[13px] font-semibold text-heledone-ink-muted">
                      {t("Member status")}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleFilter("status:active")}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[13px] font-bold transition active:scale-95 ${
                          filter === "status:active"
                            ? "border-primary bg-primary text-primary-content ring-1 ring-primary"
                            : "border-success/20 bg-base-200 text-success hover:border-success/40"
                        }`}
                        aria-pressed={filter === "status:active"}
                      >
                        {t("فعال")}</button>
                      <button
                        type="button"
                        onClick={() => toggleFilter("status:inactive")}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[13px] font-bold transition active:scale-95 ${
                          filter === "status:inactive"
                            ? "border-primary bg-primary text-primary-content ring-1 ring-primary"
                            : "border-base-content/15 bg-base-200 text-heledone-ink-muted hover:border-base-content/30"
                        }`}
                        aria-pressed={filter === "status:inactive"}
                      >
                        {t("Inactive")}</button>
                    </div>
                  </div>
                </section>

                <hr className="my-2.5 border-base-content/10" />

                <section aria-labelledby="orbit-guide-heading">
                  <p
                    id="orbit-guide-heading"
                    className="text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted"
                  >
                    {t("Guide & Statuses")}</p>

                  <div className="mt-2.5">
                    <p className="text-[13px] font-semibold text-heledone-ink-muted">
                      {t("Project status")}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {statusLegendItems.map((item) => (
                        <span
                          key={item.status}
                          className={`pointer-events-none inline-flex cursor-default rounded-full px-2 py-0.5 text-[13px] font-bold opacity-80 ${statusClasses[item.status] ?? statusClasses.draft}`}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-[13px] font-semibold text-heledone-ink-muted">
                      {t("Orbit layers")}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-heledone-ink-muted">
                      {ringMode === "teams" ? t("Each ring represents a team.") : t("Each ring represents a milestone.")}
                      {overflowLabels.length > 0 &&
                        t("The dashed outer ring groups all remaining labels.")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rings.map((ring) => {
                        if (ring.isOverflow) {
                          return (
                            <span
                              key={`legend-${ring.id}`}
                              className={`pointer-events-none max-w-full cursor-default truncate rounded-full border border-dashed px-2 py-0.5 text-[13px] font-semibold opacity-80 ${overflowStatusStyle.chip}`}
                            >
                              {ring.label}
                            </span>
                          );
                        }
                        return (
                          <span
                            key={`legend-${ring.id}`}
                            className="pointer-events-none max-w-full cursor-default truncate rounded-full bg-base-200/80 px-2 py-0.5 text-[13px] font-semibold text-heledone-ink-muted opacity-80"
                          >
                            {ring.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsLegendOpen((open) => !open);
            }}
            className="pointer-events-auto relative z-40 grid size-10 place-items-center rounded-2xl border border-base-content/10 bg-base-100/90 text-heledone-ink-muted shadow-xl backdrop-blur-md transition hover:bg-base-100 hover:text-base-content active:scale-95"
            aria-label={t("Toggle legend")}
            aria-expanded={isLegendOpen}
          >
            <Calendar1 size={18} variant={isLegendOpen ? "Bold" : "Linear"} />
          </button>
        </div>
      </div>

      {filter !== "all" && matchingMemberCount === 0 && (
        <div className="pointer-events-none absolute inset-x-4 bottom-5 z-20 mx-auto max-w-sm rounded-xl border border-base-content/8 bg-base-100/85 px-4 py-3 text-center text-xs font-semibold text-heledone-ink-muted backdrop-blur-xl">
          {t("No members match this filter.")}</div>
      )}

      <AnimatePresence>
        {isProjectModalOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-neutral/35 backdrop-blur-[2px] sm:hidden"
              onClick={() => setIsProjectModalOpen(false)}
              aria-label={t("Close project details")}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={t("{value0} project details", { value0: project.name })}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              transition={{ type: "spring", bounce: 0.12, duration: 0.32 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-3xl border border-base-content/10 bg-base-100/95 shadow-2xl backdrop-blur-xl sm:hidden"
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-base-content/15" />
              <ProjectDetails
                project={project}
                memberCount={members.length}
                progress={progress}
                statusLabel={statusLabel}
                onClose={() => setIsProjectModalOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(selectedMember || selectedCluster || isOverflowOpen) && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-neutral/35 backdrop-blur-[2px] md:hidden"
              onClick={closePanels}
              aria-label={t("Close orbit details")}
            />
            <motion.aside
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-3xl border border-base-content/10 bg-base-100 shadow-2xl md:absolute md:bottom-auto md:end-4 md:start-auto md:top-20 md:w-72 md:rounded-2xl"
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-base-content/15 md:hidden" />
              {isOverflowOpen ? (
                <OverflowDetails
                  labels={overflowLabels}
                  mode={ringMode}
                  onClose={closePanels}
                />
              ) : selectedMember ? (
                <MemberDetails member={selectedMember} onClose={closePanels} />
              ) : selectedCluster ? (
                <ClusterDetails
                  cluster={selectedCluster}
                  onClose={closePanels}
                  onSelectMember={handleMemberSelect}
                />
              ) : null}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <TeamMembersModal
        team={selectedTeam}
        isOpen={selectedTeam !== null}
        onClose={() => setSelectedTeam(null)}
      />
    </section>
  );
}
