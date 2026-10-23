import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Kanban,
  List,
  Calendar as CalendarIcon,
  FolderOpen,
  Settings,
  ChevronDown,
  Target,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useTranslation, formatNumber as formatUiNumber } from '../../../i18n/locale';
import { useProjects, useProject, useProjectMembers, useProjectMilestones } from '../../projects/hooks/useProjects';
import type { TaskViewMode } from '../store/useTaskStore';

interface ProjectWorkspaceSidebarProps {
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  activeView: TaskViewMode;
  onSelectView: (view: TaskViewMode) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ProjectWorkspaceSidebar: React.FC<ProjectWorkspaceSidebarProps> = ({
  activeProjectId,
  onSelectProject,
  activeView,
  onSelectView,
  collapsed = false,
  onToggleCollapse,
}) => {
  const t = useTranslation();
  const navigate = useNavigate();
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Queries
  const { data: projects = [] } = useProjects();
  const { data: currentProject } = useProject(activeProjectId || '');
  const { data: members = [] } = useProjectMembers(activeProjectId || '');
  const { data: milestones = [] } = useProjectMilestones(activeProjectId || '');

  const activeProject = currentProject || projects.find((p) => String(p.id) === String(activeProjectId));
  const isTaskBased = activeProject?.progress_mode !== 'milestone_based';

  // Find nearest active milestone (not completed, not cancelled)
  const activeMilestone = milestones.find((m) => m.status !== 'completed' && m.status !== 'cancelled') || milestones[0];

  const completedMilestones = milestones.filter((milestone) => milestone.status === 'completed').length;

  // Accurate Milestone Progress calculation
  const milestoneProgress = useMemo(() => {
    if (!activeMilestone) return 0;
    if (activeMilestone.status === 'completed') return 100;
    if (activeMilestone.status === 'cancelled') return 0;

    const taskCount = activeMilestone.task_count ?? 0;
    const completedCount = activeMilestone.completed_task_count ?? 0;

    if (isTaskBased) {
      if (taskCount > 0) {
        return Math.min(100, Math.max(0, Math.round((completedCount / taskCount) * 100)));
      }
      if (activeMilestone.progress_percentage !== undefined) {
        return Math.round(activeMilestone.progress_percentage);
      }
      return 0;
    } else {
      // Milestone-based calculation:
      // Weight of completed milestones vs total weight of all milestones
      const totalWeight = milestones.reduce((s, m) => s + (m.weight || 1), 0);
      const completedWeight = milestones
        .filter((m) => m.status === 'completed')
        .reduce((s, m) => s + (m.weight || 1), 0);
      const projectMilestonePercent = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

      // If this individual milestone has linked tasks, reflect them:
      if (taskCount > 0) {
        return Math.min(100, Math.max(0, Math.round((completedCount / taskCount) * 100)));
      }
      if (activeMilestone.progress_percentage !== undefined) {
        return Math.round(activeMilestone.progress_percentage);
      }
      return projectMilestonePercent;
    }
  }, [activeMilestone, isTaskBased, milestones]);

  const viewItems: { id: TaskViewMode; label: string; icon: React.ReactNode }[] = [
    {
      id: 'kanban',
      label: t('بورد کانبان'),
      icon: <Kanban size={17} className="shrink-0" />,
    },
    {
      id: 'list',
      label: t('نمای لیست'),
      icon: <List size={17} className="shrink-0" />,
    },
    {
      id: 'calendar',
      label: t('تقویم'),
      icon: <CalendarIcon size={17} className="shrink-0" />,
    },
    {
      id: 'files',
      label: t('فایل‌های پروژه'),
      icon: <FolderOpen size={17} className="shrink-0" />,
    },
  ];

  return (
    <aside
      className={`relative z-30 flex flex-col border-e border-base-200/90 bg-base-100 transition-all duration-200 shrink-0 select-none ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* ─── Top Project Switcher & Collapse Toggle ─── */}
      <div className="border-b border-base-300/80 p-3">
        {!collapsed ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black tracking-wider text-heledone-ink-muted uppercase">
                {t('فضای کاری')}
              </span>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="p-1 rounded-lg text-heledone-ink-muted hover:text-base-content hover:bg-base-200/80 transition-colors"
                  title={t('بستن سایدبار')}
                >
                  <PanelLeftClose size={15} />
                </button>
              )}
            </div>

            {/* Project Selector Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-100 px-3 py-2 transition-all text-start hover:border-primary/40 hover:bg-base-200/40 group"
                title={activeProject?.name || t('انتخاب پروژه')}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-md shrink-0 shadow-xs"
                    style={{ backgroundColor: activeProject?.color || '#087F83' }}
                  />
                  <span className="truncate text-xs font-bold text-base-content group-hover:text-primary transition-colors">
                    {activeProject?.name || t('پروژه‌ای انتخاب نشده')}
                  </span>
                </div>
                <ChevronDown size={14} className="text-heledone-ink-muted shrink-0 group-hover:text-base-content transition-colors" />
              </button>

              {/* Project Dropdown Menu */}
              {isProjectDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProjectDropdownOpen(false)}
                  />
                  <div className="absolute top-full start-0 mt-1 w-64 max-h-64 overflow-y-auto rounded-2xl bg-base-100 p-1.5 shadow-xl border border-base-200 z-50 animate-in fade-in zoom-in-95 duration-100 custom-scrollbar">
                    <div className="px-2 py-1 text-[11px] font-bold text-heledone-ink-muted uppercase">
                      {t('پروژه‌ها')}
                    </div>
                    {projects.map((proj) => {
                      const isSelected = String(proj.id) === String(activeProjectId);
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            onSelectProject(String(proj.id));
                            setIsProjectDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold transition-all text-start ${
                            isSelected
                              ? 'bg-primary/10 text-primary font-black'
                              : 'hover:bg-base-200 text-base-content'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: proj.color || '#087F83' }}
                          />
                          <span className="truncate flex-1">{proj.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-1.5 rounded-xl text-heledone-ink-muted hover:text-base-content hover:bg-base-200/80 transition-colors"
                title={t('باز کردن سایدبار')}
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
              className="w-9 h-9 rounded-xl grid place-items-center bg-base-200/60 hover:bg-base-200 border border-base-300/60 transition-all shadow-2xs"
              title={activeProject?.name || t('انتخاب پروژه')}
            >
              <span
                className="w-3.5 h-3.5 rounded-md shrink-0"
                style={{ backgroundColor: activeProject?.color || '#087F83' }}
              />
            </button>
          </div>
        )}
      </div>

      {/* ─── Body Sections ─── */}
      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {/* 1. Milestones Widget */}
        {!collapsed && (
          <div>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-heledone-ink-muted">
                <Target size={13} className="text-primary" />
                <span>{t('پروژه')}</span>
              </span>
              {activeProjectId && (
                <Link
                  to={`/projects/${activeProjectId}?tab=milestones`}
                  className="text-[10px] font-bold text-primary hover:underline"
                >
                  {t('مشاهده')}
                </Link>
              )}
            </div>

            {activeMilestone ? (
              <div
                onClick={() => {
                  if (activeProjectId) {
                    navigate(`/projects/${activeProjectId}?tab=milestones`);
                  }
                }}
                className="group cursor-pointer rounded-lg border border-base-300 bg-base-100 p-3 transition-all hover:border-primary/35 hover:bg-base-200/35"
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-base-content">
                  <span className="truncate group-hover:text-primary transition-colors">
                    {activeProject?.name || activeMilestone.title}
                  </span>
                  <ChevronDown size={14} className="shrink-0 text-heledone-ink-muted" />
                </div>
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-heledone-ink-muted">
                  <span>
                    {formatUiNumber(completedMilestones)}/{formatUiNumber(milestones.length)} {t('مایل‌استون‌ها')}
                  </span>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-black text-primary">
                    {formatUiNumber(milestoneProgress)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, milestoneProgress))}%`,
                      background: 'linear-gradient(90deg, var(--color-primary), var(--color-success))',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-base-300 p-2.5 text-center">
                <p className="text-[11px] text-heledone-ink-muted">{t('مایل‌استون فعالی نیست')}</p>
              </div>
            )}
          </div>
        )}

        {/* 2. Views Navigation */}
        <div>
          {!collapsed && (
            <div className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-wider text-heledone-ink-muted">
              {t('نماها')}
            </div>
          )}
          <nav className="space-y-1">
            {viewItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold transition-all text-start ${
                    isActive
                      ? 'border-s-2 border-primary bg-primary/10 text-primary font-black'
                      : 'text-base-content/80 hover:bg-base-200/70 hover:text-base-content'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                  title={item.label}
                >
                  {item.icon}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 3. Team Members Section */}
        {!collapsed && (
          <div>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-heledone-ink-muted">
                <Users size={13} className="text-heledone-ink-muted" />
                <span>{t('اعضای تیم')}</span>
              </span>
              <span className="text-[11px] font-bold text-heledone-ink-muted">
                {formatUiNumber(members.length)}
              </span>
            </div>

            <div className="space-y-1 max-h-44 overflow-y-auto pe-1 custom-scrollbar">
              {members.map((member: any) => {
                const userObj = member.user_detail || member.user || member;
                const name =
                  userObj.first_name || userObj.last_name
                    ? `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim()
                    : userObj.username || userObj.email || t('عضو');
                const initial = (name[0] || '?').toUpperCase();
                const avatarUrl = userObj.avatar_url || userObj.avatar;

                return (
                  <div
                    key={member.id || userObj.id}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-base-200/60 transition-colors"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={name}
                        className="w-6 h-6 rounded-full object-cover border border-base-200 shrink-0"
                      />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[11px] grid place-items-center shrink-0">
                        {initial}
                      </span>
                    )}
                    <span className="truncate text-xs font-semibold text-base-content/90">
                      {name}
                    </span>
                  </div>
                );
              })}

              {members.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-heledone-ink-muted">
                  {t('عضوی در این پروژه ثبت نشده است')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom Project Settings ─── */}
      <div className="border-t border-base-300/80 bg-base-100 p-3">
        <button
          type="button"
          onClick={() => {
            if (activeProjectId) {
              navigate(`/projects/${activeProjectId}`);
            } else {
              navigate('/settings');
            }
          }}
          className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-base-content/80 hover:bg-base-200/80 hover:text-base-content transition-colors text-start ${
            collapsed ? 'justify-center px-0' : ''
          }`}
          title={t('تنظیمات پروژه')}
        >
          <Settings size={16} className="text-heledone-ink-muted shrink-0" />
          {!collapsed && <span>{t('تنظیمات پروژه')}</span>}
        </button>
      </div>
    </aside>
  );
};
