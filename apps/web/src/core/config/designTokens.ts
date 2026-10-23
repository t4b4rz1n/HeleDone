import { t } from "../../i18n/locale";
/**
 * Runtime tokens shared by React interactions.
 * Visual tokens live in index.css so Tailwind and the browser can consume them.
 */
export const motionTokens = {
  duration: {
    fast: 0.12,
    standard: 0.18,
    slow: 0.28,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.22, 1, 0.36, 1],
  },
} as const;

export type WorkflowStatus = { code?: string; name?: string; category?: string };

/** Workflow meaning never depends on a project's decorative color or column order. */
export const getWorkflowAppearance = (status?: WorkflowStatus | null) => {
  const category = status?.category || status?.code?.toLowerCase().replace(/[ -]/g, "_") || "";
  const key = /block|مسدود/.test(category) ? "blocked"
    : /done|complete|publish|live|انجام.شده/.test(category) ? "done"
      : /review|بررسی/.test(category) ? "review"
        : /progress|doing|draft|در.حال.انجام/.test(category) ? "doing"
          : "todo";
  const appearances = {
    todo: { label: t("برای انجام"), color: "var(--color-heledone-todo)" },
    doing: { label: t("در حال انجام"), color: "var(--color-primary)" },
    review: { label: t("در حال بررسی"), color: "var(--color-warning)" },
    done: { label: t("انجام‌شده"), color: "var(--color-success)" },
    blocked: { label: t("مسدود"), color: "var(--color-error)" },
  };
  const appearance = appearances[key];
  const standardNames = /^(to do|todo|backlog|doing|in progress|review|done|completed|complete|blocked|برای انجام|در حال انجام|در حال بررسی|انجام‌شده|مسدود|planning|live|in review)$/i;
  const ink = key === "todo" ? appearance.color : `var(--heledone-${{ doing: "primary", review: "warning", done: "success", blocked: "error" }[key]}-ink)`;
  // If status.name is not standard, try translating it first before falling back to raw name
  const translatedName = status?.name && !standardNames.test(status.name) ? t(status.name) : null;
  return { ...appearance, ink, label: translatedName || (status?.name && !standardNames.test(status.name) ? status.name : appearance.label) };
};

/** Decorative choices shared by project and board color pickers. */
export const projectPalette = [
  { get name() { return t("فیروزه‌ای"); }, value: "#087F83" },
  { get name() { return t("مرجانی"); }, value: "#DF765B" },
  { get name() { return t("نور گرم"); }, value: "#F2BA49" },
  { get name() { return t("مه صبح"); }, value: "#EAF5F2" },
  { get name() { return t("نسیم"); }, value: "#C6E6E1" },
  { get name() { return t("فیروزه‌ای روشن"); }, value: "#A7D4CD" },
  { get name() { return t("سبز نخل"); }, value: "#D8E6D6" },
  { get name() { return t("ماسه"); }, value: "#F7DFAD" },
  { get name() { return t("مرجانی روشن"); }, value: "#F5D3C6" },
  { get name() { return t("چوب"); }, value: "#D7C8B3" },
] as const;
