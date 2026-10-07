import { t } from "../../../i18n/locale";
import { create } from 'zustand';
import type { ProjectProgressMode } from '../types';

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  statuses: { name: string; code: string; category: string }[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'general',
    get name() { return t("تسک‌های عمومی"); },
    get description() { return t("ساده و منعطف برای هر تیم"); },
    icon: '✅',
    color: '#006D73',
    statuses: [
      { get name() { return t("برای انجام"); }, code: 'todo', category: 'todo' },
      { get name() { return t("در حال انجام"); }, code: 'doing', category: 'in_progress' },
      { get name() { return t("در حال بررسی"); }, code: 'review', category: 'review' },
      { get name() { return t("انجام‌شده"); }, code: 'done', category: 'done' },
    ],
  },
  {
    id: 'agile',
    get name() { return t("توسعه نرم‌افزار"); },
    get description() { return t("برای تیم‌های فنی و توسعه"); },
    icon: '🚀',
    color: '#087F83',
    statuses: [
      { get name() { return t("برای انجام"); }, code: 'backlog', category: 'todo' },
      { get name() { return t("در حال انجام"); }, code: 'in_progress', category: 'in_progress' },
      { get name() { return t("در حال بررسی"); }, code: 'review', category: 'review' },
      { get name() { return t("انجام‌شده"); }, code: 'done', category: 'done' },
    ],
  },
  {
    id: 'content',
    get name() { return t("تولید محتوا"); },
    get description() { return t("برای تیم‌های محتوا و تحریریه"); },
    icon: '✍️',
    color: '#24734D',
    statuses: [
      { get name() { return t("Ideas"); }, code: 'ideas', category: 'todo' },
      { get name() { return t("Drafting"); }, code: 'drafting', category: 'in_progress' },
      { get name() { return t("در حال بررسی"); }, code: 'review', category: 'review' },
      { get name() { return t("Published"); }, code: 'published', category: 'done' },
    ],
  },
  {
    id: 'marketing',
    get name() { return t("کمپین بازاریابی"); },
    get description() { return t("برای تیم‌های بازاریابی و رشد"); },
    icon: '📢',
    color: '#8A5700',
    statuses: [
      { get name() { return t("Planning"); }, code: 'planning', category: 'todo' },
      { get name() { return t("در حال انجام"); }, code: 'in_progress', category: 'in_progress' },
      { get name() { return t("در حال بررسی"); }, code: 'review', category: 'review' },
      { get name() { return t("Live"); }, code: 'live', category: 'done' },
    ],
  },
];

interface ProjectWizardState {
  isOpen: boolean;
  currentStep: number;
  // Step 1
  projectName: string;
  projectColor: string;
  selectedOrgId: string | number | null;
  progressMode: ProjectProgressMode;
  // Step 2
  selectedUserIds: (string | number)[];
  // Step 3
  selectedTemplate: BoardTemplate | null;

  // Actions
  open: () => void;
  close: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setProjectName: (v: string) => void;
  setProjectColor: (v: string) => void;
  setSelectedOrgId: (id: string | number) => void;
  setProgressMode: (mode: ProjectProgressMode) => void;
  toggleUser: (id: string | number) => void;
  setSelectedTemplate: (t: BoardTemplate) => void;
  reset: () => void;
}

export const useProjectWizardStore = create<ProjectWizardState>((set) => ({
  isOpen: false,
  currentStep: 1,
  projectName: '',
  projectColor: '#087F83',
  selectedOrgId: null,
  progressMode: 'task_based',
  selectedUserIds: [],
  selectedTemplate: BOARD_TEMPLATES[0],

  open: () => set({ isOpen: true, currentStep: 1 }),
  close: () => set({ isOpen: false }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 3) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),
  setProjectName: (v) => set({ projectName: v }),
  setProjectColor: (v) => set({ projectColor: v }),
  setSelectedOrgId: (id) => set({ selectedOrgId: id }),
  setProgressMode: (mode) => set({ progressMode: mode }),
  toggleUser: (id) =>
    set((s) => ({
      selectedUserIds: s.selectedUserIds.includes(id)
        ? s.selectedUserIds.filter((u) => u !== id)
        : [...s.selectedUserIds, id],
    })),
  setSelectedTemplate: (t) => set({ selectedTemplate: t }),
  reset: () =>
    set({
      currentStep: 1,
      projectName: '',
      projectColor: '#087F83',
      selectedOrgId: null,
      progressMode: 'task_based',
      selectedUserIds: [],
      selectedTemplate: BOARD_TEMPLATES[0],
    }),
}));
