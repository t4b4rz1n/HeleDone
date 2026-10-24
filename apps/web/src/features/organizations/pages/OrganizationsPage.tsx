import { formatNumber as formatUiNumber } from "../../../i18n/locale";
import { t as translate, useTranslation } from "../../../i18n/locale";
import { AnimatePresence, motion } from "motion/react";
import { Add, CloseCircle, Edit2, Folder2, People, Trash } from "iconsax-reactjs";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createOrganization, deleteOrganization, getOrganizations, updateOrganization } from "../api/organizationsApi";
import { usePermissions } from "../../auth/hooks/usePermissions";
import type { Organization, OrganizationPayload, OrganizationStatus } from "../types";

const statusOptions: Array<{ value: OrganizationStatus; label: string }> = [
  { value: "active", get label() { return translate("فعال"); } },
  { value: "suspended", get label() { return translate("Suspended"); } },
  { value: "archived", get label() { return translate("Archived"); } },
];

const statusStyles: Record<OrganizationStatus, string> = {
  active: "bg-success/12 text-success",
  suspended: "bg-warning/15 text-warning",
  archived: "bg-base-200 text-heledone-ink-muted",
};

const statusLabels: Record<OrganizationStatus, string> = {
  get active() { return translate("فعال"); },
  suspended: "Suspended",
  archived: "Archived",
};

const emptyForm = (): OrganizationPayload => ({ name: "", description: "", currency: "IRR", status: "active" });

const getErrorMessage = (error: any, fallback: string): string => {
  const data = error?.response?.data ?? error?.data ?? error;
  if (typeof data === "string" && data.trim()) return data;
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  if (data && typeof data === "object") {
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (typeof val === "string" && val.trim()) return val;
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
        return val[0];
      }
    }
  }
  return error?.message || fallback;
};

function OrganizationFormModal({
  organization,
  onClose,
  onSubmit,
  isPending,
}: {
  organization: Organization | null;
  onClose: () => void;
  onSubmit: (payload: OrganizationPayload) => void;
  isPending: boolean;
}) {
  const t = useTranslation();
  const [form, setForm] = useState<OrganizationPayload>(() =>
    organization
      ? {
        name: organization.name,
        description: organization.description || "",
        currency: organization.currency || "IRR",
        status: organization.status,
      }
      : emptyForm(),
  );

  useEffect(() => {
    setForm(
      organization
        ? {
          name: organization.name,
          description: organization.description || "",
          currency: organization.currency || "IRR",
          status: organization.status,
        }
        : emptyForm(),
    );
  }, [organization]);

  const setField = <K extends keyof OrganizationPayload>(field: K, value: OrganizationPayload[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        className="heledone-surface relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-hidden rounded-[28px] border border-base-content/10 bg-base-100/95 shadow-heledone-floating backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-modal-title"
      >
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <header className="flex items-start justify-between gap-4 border-b border-base-content/10 bg-base-200/20 px-6 py-5 sm:px-8 sm:py-6">
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-bold uppercase  text-primary">
                {t("Organization setup")}</p>
              <h2 id="organization-modal-title" className="text-2xl font-semibold tracking-tight text-base-content">
                {organization ? t("Edit organization") : t("Create an organization")}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-heledone-ink-muted">
                {t("Projects, teams and members will live inside this space.")}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-square btn-sm shrink-0 rounded-xl text-heledone-ink-muted transition hover:bg-base-200 hover:text-base-content"
              aria-label={t("Close organization form")}
            >
              <CloseCircle size={20} />
            </button>
          </header>

          <form className="space-y-6 p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, name: form.name.trim(), description: form.description?.trim() || "" }); }}>
            <div className="space-y-2">
              <label htmlFor="org-name" className="block text-sm font-medium text-base-content">
                {t("نام سازمان")} <span className="text-error">*</span>
              </label>
              <input
                id="org-name"
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                className="input input-bordered w-full rounded-xl bg-base-200/50 transition-colors focus:border-primary focus:bg-base-100 focus:outline-none"
                placeholder={t("e.g. Heledone Studio")}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="org-description" className="block text-sm font-medium text-base-content">
                {t("توضیح")}</label>
              <textarea
                id="org-description"
                value={form.description}
                onChange={(event) => setField("description", event.target.value)}
                className="textarea textarea-bordered min-h-32 w-full resize-y rounded-xl bg-base-200/50 transition-colors focus:border-primary focus:bg-base-100 focus:outline-none"
                placeholder={t("What does this organization do?")}
              />
            </div>



            {organization && (
              <div className="space-y-2">
                <label htmlFor="org-status" className="block text-sm font-medium text-base-content">
                  {t("وضعیت")}</label>
                <select
                  id="org-status"
                  value={form.status}
                  onChange={(event) => setField("status", event.target.value as OrganizationStatus)}
                  className="select select-bordered w-full rounded-xl bg-base-200/50 transition-colors focus:border-primary focus:bg-base-100 focus:outline-none"
                >
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-base-content/10 pt-6 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="btn btn-ghost rounded-xl">
                {t("انصراف")}</button>
              <button
                type="submit"
                disabled={isPending || !form.name.trim()}
                className="btn btn-primary rounded-xl px-6 shadow-lg shadow-primary/15 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    <span>{t("در حال ذخیره…")}</span>
                  </>
                ) : organization ? (
                  t("Save changes")
                ) : (
                  t("Create organization")
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function OrganizationsPage() {
  const t = useTranslation();
  const { hasAnyPermission, isStaff } = usePermissions();
  const canManageOrgs = hasAnyPermission(["org.manage_settings"]) || isStaff;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOrganization, setModalOrganization] = useState<Organization | null | undefined>(undefined);
  const [deletingOrg, setDeletingOrg] = useState<Organization | null>(null);
  const organizationsQuery = useQuery({ queryKey: ["organizations"], queryFn: getOrganizations });

  const saveMutation = useMutation({
    mutationFn: ({ organization, payload }: { organization: Organization | null; payload: OrganizationPayload }) => organization ? updateOrganization(organization.id, payload) : createOrganization(payload),
    onSuccess: (_organization, variables) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["project-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setModalOrganization(undefined);
      toast.success(variables.organization ? t("Organization updated") : t("Organization created"));
    },
    onError: (error) => toast.error(getErrorMessage(error, t("Could not save the organization."))),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["project-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeletingOrg(null);
      toast.success(t("Organization removed"));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t("Could not remove the organization.")));
      setDeletingOrg(null);
    },
  });

  const organizations = useMemo(() => organizationsQuery.data || [], [organizationsQuery.data]);
  const summary = useMemo(() => ({
    projects: organizations.reduce((total, organization) => total + (organization.project_count || 0), 0),
    members: organizations.reduce((total, organization) => total + (organization.member_count || 0), 0),
  }), [organizations]);

  useEffect(() => {
    if (!deletingOrg) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleteMutation.isPending) setDeletingOrg(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletingOrg, deleteMutation.isPending]);

  const removeOrganization = (organization: Organization) => setDeletingOrg(organization);

  return (
    <div className="min-h-[calc(100dvh-121px)] space-y-6 px-1 pb-10 sm:px-0">
      <div className="heledone-page-heading flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase  text-primary"><People size={16} />  {t("Organization")}</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("Organizations")}</h1><p className="mt-2 max-w-2xl text-heledone-ink-muted">{t("Create the spaces where your projects, teams and people come together.")}</p></div>
        {canManageOrgs && (
          <button type="button" onClick={() => setModalOrganization(null)} className="btn btn-primary w-full rounded-xl px-5 shadow-lg shadow-primary/15 sm:w-auto"><Add size={18} />  {t("New organization")}</button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3"><div className="heledone-surface rounded-2xl border border-base-content/10 bg-base-100/80 p-5 shadow-heledone-card"><p className="text-xs font-semibold uppercase tracking-wider text-heledone-ink-muted">{t("Organizations")}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{formatUiNumber(organizations.length)}</p></div><div className="heledone-surface rounded-2xl border border-base-content/10 bg-base-100/80 p-5 shadow-heledone-card"><p className="text-xs font-semibold uppercase tracking-wider text-heledone-ink-muted">{t("Projects inside")}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-primary">{formatUiNumber(summary.projects)}</p></div><div className="heledone-surface rounded-2xl border border-base-content/10 bg-base-100/80 p-5 shadow-heledone-card"><p className="text-xs font-semibold uppercase tracking-wider text-heledone-ink-muted">{t("اعضا")}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-success">{formatUiNumber(summary.members)}</p></div></div>

      <div className="rounded-2xl border border-primary/15 bg-primary/5 px-5 py-4 text-sm leading-6 text-base-content/70 shadow-sm"><strong className="text-base-content">{t("Next step:")}</strong>  {t("after creating an organization, open Projects to create the project containers your team will work in.")}</div>

      {organizationsQuery.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-2xl bg-base-200/70" />)}</div> : organizationsQuery.isError ? <div className="heledone-surface rounded-2xl border border-error/20 bg-error/5 p-8 text-center"><p className="font-semibold text-error">{t("Organizations could not be loaded.")}</p><button type="button" onClick={() => organizationsQuery.refetch()} className="btn btn-sm btn-ghost mt-3 rounded-lg">{t("Try again")}</button></div> : organizations.length === 0 ? <div className="heledone-surface rounded-[28px] border border-dashed border-base-content/15 bg-base-100 px-6 py-16 text-center shadow-heledone-card"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><People size={28} /></div><h2 className="text-xl font-semibold">{t("Create your first organization")}</h2><p className="mx-auto mt-2 max-w-md text-sm text-heledone-ink-muted">{t("An organization is the foundation for projects, people and team workflows.")}</p>{canManageOrgs && (<button type="button" onClick={() => setModalOrganization(null)} className="btn btn-primary mt-6 rounded-xl"><Add size={18} />  {t("Create organization")}</button>)}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><AnimatePresence mode="popLayout">{organizations.map((organization) => <motion.article layout key={organization.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} onClick={() => navigate(`/organizations/${organization.id}`)} className="heledone-surface cursor-pointer rounded-2xl border border-base-content/10 bg-base-100/90 p-5 shadow-heledone-card transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-heledone-raised"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><People size={21} /></span><div className="min-w-0"><h2 className="truncate text-lg font-semibold tracking-tight">{organization.name}</h2><p className="truncate text-xs text-heledone-ink-muted">/{organization.slug}</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold ${statusStyles[organization.status]}`}>{statusLabels[organization.status]}</span></div><p className="mt-5 min-h-10 line-clamp-2 text-sm leading-6 text-heledone-ink-muted">{organization.description || t("No description added yet.")}</p><div className="mt-5 grid grid-cols-3 gap-3 border-y border-base-content/10 py-4 text-sm"><div><p className="text-xs text-heledone-ink-muted">{t("اعضا")}</p><p className="mt-1 font-semibold">{formatUiNumber(organization.member_count || 0)}</p></div><div><p className="text-xs text-heledone-ink-muted">{t("تیم‌ها")}</p><p className="mt-1 font-semibold">{formatUiNumber(organization.team_count || 0)}</p></div><div><p className="text-xs text-heledone-ink-muted">{t("پروژه‌ها")}</p><p className="mt-1 font-semibold">{formatUiNumber(organization.project_count || 0)}</p></div></div><div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={(e) => { e.stopPropagation(); navigate("/projects"); }} className="btn btn-ghost btn-sm rounded-lg text-primary"><Folder2 size={15} />  {t("پروژه‌ها")}</button>{canManageOrgs && (<div className="flex items-center gap-1"><button type="button" onClick={(e) => { e.stopPropagation(); setModalOrganization(organization); }} className="btn btn-ghost btn-square btn-sm rounded-lg" aria-label={t("Edit {value0}", { value0: organization.name })}><Edit2 size={16} /></button><button type="button" onClick={(e) => { e.stopPropagation(); removeOrganization(organization); }} disabled={deleteMutation.isPending} className="btn btn-ghost btn-square btn-sm rounded-lg text-error" aria-label={t("Remove {value0}", { value0: organization.name })}><Trash size={16} /></button></div>)}</div></motion.article>)}</AnimatePresence></div>}

      {modalOrganization !== undefined && <OrganizationFormModal organization={modalOrganization} onClose={() => setModalOrganization(undefined)} onSubmit={(payload) => saveMutation.mutate({ organization: modalOrganization, payload })} isPending={saveMutation.isPending} />}

      <AnimatePresence>
        {deletingOrg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
            onMouseDown={() => {
              if (!deleteMutation.isPending) setDeletingOrg(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="heledone-surface w-full max-w-md rounded-[28px] border border-base-content/10 bg-base-100/95 p-6 shadow-heledone-floating backdrop-blur-xl sm:p-7"
              onMouseDown={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-organization-title"
              aria-describedby="delete-organization-description"
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-error/10 text-error">
                  <Trash size={28} />
                </div>
                <h2 id="delete-organization-title" className="text-xl font-semibold tracking-tight text-base-content">
                  {t("Delete Organization")}</h2>
                <p id="delete-organization-description" className="mt-4 text-sm leading-6 text-heledone-ink-muted">
                  {t("Are you sure you want to remove")} <span className="font-semibold text-base-content">{deletingOrg.name}</span>{t("? This will hide it and its projects from the workspace.")}</p>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-base-content/10 pt-5 sm:flex-row">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setDeletingOrg(null)}
                  disabled={deleteMutation.isPending}
                  className="btn btn-ghost flex-1 rounded-xl"
                >
                  {t("انصراف")}</button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(deletingOrg.id)}
                  disabled={deleteMutation.isPending}
                  className="btn btn-error flex-1 gap-2 rounded-xl text-error-content"
                >
                  {deleteMutation.isPending ? <span className="loading loading-spinner loading-xs" /> : <Trash size={18} />}
                  <span>{deleteMutation.isPending ? t("Deleting...") : t("حذف")}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
