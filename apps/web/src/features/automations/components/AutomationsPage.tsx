import { useTranslation } from "../../../i18n/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Flash, Message, Refresh2, Setting2 } from "iconsax-reactjs";
import { motion } from "motion/react";

import {
  type AutomationEvent,
  type AutomationRulePayload,
  useAutomationCatalog,
  useOrganizationsForAutomation,
  useResetAutomationRule,
  useSaveAutomationRule,
} from "../hooks/useAutomations";

const ADMIN_EVENT_CODES = new Set(["organization_created", "project_actually_created", "project_budget_set", "member_added_to_project", "member_added_to_org"]);

const payloadForEvent = (
  event: AutomationEvent,
  organization: string,
  isActive = event.rule?.is_active ?? true,
): AutomationRulePayload => ({
  organization,
  event_type: event.code,
  action_type: event.rule?.action_type ?? "both",
  telegram_group_id: event.rule?.telegram_group_id ?? null,
  message_template: event.rule?.message_template ?? "",
  recipients: event.rule?.recipients ?? event.default_recipients,
  is_active: isActive,
});

export const AutomationsPage = () => {
  const t = useTranslation();
  const [organizationId, setOrganizationId] = useState(() => localStorage.getItem("heledone_last_org_id") || "");
  const [selectedEvent, setSelectedEvent] = useState<AutomationEvent | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const { data: organizations = [], isLoading: organizationsLoading } = useOrganizationsForAutomation();
  const { data: catalog, isLoading: catalogLoading } = useAutomationCatalog(organizationId);
  const saveRule = useSaveAutomationRule(organizationId);
  const resetRule = useResetAutomationRule(organizationId);
  const { register, handleSubmit, reset, watch, setValue } = useForm<AutomationRulePayload>();
  const selectedRecipients = watch("recipients") ?? [];

  useEffect(() => {
    if (!organizationId && organizations.length === 1) {
      setOrganizationId(organizations[0].id);
    } else if (organizationId && organizations.length > 0) {
      // Ensure the saved org id actually exists in the fetched list
      if (!organizations.some(org => org.id === organizationId)) {
        setOrganizationId(organizations.length === 1 ? organizations[0].id : "");
      }
    }
  }, [organizationId, organizations]);

  useEffect(() => {
    if (organizationId) {
      localStorage.setItem("heledone_last_org_id", organizationId);
    } else {
      localStorage.removeItem("heledone_last_org_id");
    }
  }, [organizationId]);

  const recipientLabels = useMemo(
    () => new Map((catalog?.recipient_choices ?? []).map((choice) => [choice.code, choice.label])),
    [catalog],
  );

  const openEditor = (event: AutomationEvent) => {
    setSelectedEvent(event);
    reset(payloadForEvent(event, organizationId));
    modalRef.current?.showModal();
  };

  const closeEditor = () => modalRef.current?.close();

  const isPayloadDefault = (payload: Partial<AutomationRulePayload>, event: AutomationEvent) => {
    return (
      (payload.action_type || "both") === "both" &&
      !payload.telegram_group_id &&
      !payload.message_template &&
      payload.is_active === true &&
      (payload.recipients || []).length === event.default_recipients.length &&
      (payload.recipients || []).every((r) => event.default_recipients.includes(r))
    );
  };

  const submit = (payload: AutomationRulePayload) => {
    if (!selectedEvent || payload.recipients.length === 0) return;

    const finalPayload = {
      ...payload,
      organization: organizationId,
      event_type: selectedEvent.code,
      telegram_group_id: payload.telegram_group_id || null,
    };

    if (isPayloadDefault(finalPayload, selectedEvent) && selectedEvent.rule) {
      resetRule.mutate(selectedEvent.rule.id, { onSuccess: closeEditor });
      return;
    }

    saveRule.mutate(
      { id: selectedEvent.rule?.id, payload: finalPayload },
      { onSuccess: closeEditor },
    );
  };

  const toggleActive = (event: AutomationEvent, isActive: boolean) => {
    const payload = payloadForEvent(event, organizationId, isActive);

    if (isPayloadDefault(payload, event) && event.rule) {
      resetRule.mutate(event.rule.id);
      return;
    }

    saveRule.mutate({ id: event.rule?.id, payload });
  };

  const toggleRecipient = (code: string) => {
    setValue(
      "recipients",
      selectedRecipients.includes(code)
        ? selectedRecipients.filter((item) => item !== code)
        : [...selectedRecipients, code],
      { shouldValidate: true },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl space-y-5">
      <header className="heledone-page-heading flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-base-content">
            <Flash size={30} variant="Bold" className="text-primary" />
            {t("Workflow automation")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-heledone-ink-muted">{catalog?.events ? t("Manage delivery settings for {count} workflow events in the organization.", { count: catalog.events.filter(event => !ADMIN_EVENT_CODES.has(event.code)).length }) : t("Manage delivery settings for the organization’s workflow events.")}</p>
        </div>
        <div className="w-full md:w-72">
          <label htmlFor="automation-organization" className="mb-2 block text-sm font-medium text-base-content/70">{t("Organization")}</label>
          <select id="automation-organization" className="select select-bordered w-full" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={organizationsLoading} style={{ cursor: organizationsLoading ? "wait" : "default" }}>
            <option value="" disabled hidden>{t("Select an organization")}</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </div>
      </header>

      {!organizationId ? (
        <div className="rounded-2xl border border-dashed border-base-content/20 p-12 text-center text-heledone-ink-muted">{t("Select an organization to configure its workflow events.")}</div>
      ) : catalogLoading ? (
        <div className="flex justify-center py-16"><span className="loading loading-spinner loading-lg text-primary" /></div>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalog?.events.filter(event => !ADMIN_EVENT_CODES.has(event.code)).map((event) => {
            const rule = event.rule;
            const recipients = rule?.recipients ?? event.default_recipients;
            const active = rule?.is_active ?? true;
            return (
              <article key={event.code} className="flex min-h-56 flex-col rounded-2xl border border-base-content/10 bg-base-100 p-5 shadow-sm transition hover:border-primary/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Flash size={20} variant="TwoTone" /></div>
                    <div><h2 className="font-semibold text-base-content">{event.label}</h2><p className="mt-1 text-sm text-heledone-ink-muted">{event.description}</p></div>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-heledone-ink-muted">
                    <span>{active ? t("فعال") : t("Inactive")}</span>
                    <input type="checkbox" className="toggle toggle-primary toggle-sm" checked={active} onChange={(change) => toggleActive(event, change.target.checked)} disabled={saveRule.isPending} />
                  </label>
                </div>
                <div className="mt-auto pt-5">
                  <div className="flex min-h-10 items-start gap-2 text-sm text-base-content/70"><Message size={17} className="mt-0.5 shrink-0" />{recipients.map((item) => recipientLabels.get(item) ?? item).join(", ")}</div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" className="btn btn-outline btn-sm flex-1" onClick={() => openEditor(event)}><Setting2 size={16} />{t("Configure")}</button>
                    {rule && <button type="button" className="btn btn-ghost btn-sm" title={t("Restore defaults")} onClick={() => resetRule.mutate(rule.id)} disabled={resetRule.isPending}><Refresh2 size={16} /></button>}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto rounded-2xl p-0">
          <form onSubmit={handleSubmit(submit)}>
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-content/10 bg-base-100 px-6 py-5">
              <div className="rounded-xl bg-primary/10 p-2 text-primary"><Setting2 size={21} /></div>
              <div><h2 className="font-bold">{t("Configure event")}</h2><p className="text-sm text-heledone-ink-muted">{selectedEvent?.label}</p></div>
            </header>
            <div className="space-y-6 p-6">
              <input type="hidden" {...register("organization")} />
              <input type="hidden" {...register("event_type")} />

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="delivery-channel" className="mb-2 block text-sm font-medium">{t("Delivery channel")}</label>
                  <select id="delivery-channel" className="select select-bordered w-full" {...register("action_type")}>
                    <option value="both">{t("Email and Telegram")}</option><option value="email">{t("Email only")}</option><option value="telegram">{t("Telegram only")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="telegram-group" className="mb-2 block text-sm font-medium">{t("Telegram group ID")} <span className="font-normal text-heledone-ink-muted">{t("(optional)")}</span></label>
                  <input id="telegram-group" className="input input-bordered w-full font-mono" placeholder="-100123456789" {...register("telegram_group_id")} />
                  <p className="mt-2 text-xs text-heledone-ink-muted">{t("Also sends the message to this group.")}</p>
                </div>
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-medium">{t("Recipients")}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selectedEvent?.allowed_recipients.map((code) => (
                    <label key={code} className="flex cursor-pointer items-center gap-3 rounded-xl border border-base-content/10 px-3 py-2.5 text-sm transition hover:border-primary/40">
                      <input type="checkbox" className="checkbox checkbox-primary checkbox-sm" checked={selectedRecipients.includes(code)} onChange={() => toggleRecipient(code)} />
                      {recipientLabels.get(code) ?? code}
                    </label>
                  ))}
                </div>
                {selectedRecipients.length === 0 && <p className="mt-2 text-xs text-error">{t("Select at least one recipient.")}</p>}
              </fieldset>

              <div>
                <label htmlFor="message-template" className="mb-2 block text-sm font-medium">{t("Message template")} <span className="font-normal text-heledone-ink-muted">{t("(optional)")}</span></label>
                <textarea id="message-template" className="textarea textarea-bordered h-24 w-full" placeholder={t("Leave empty to use the standard event message")} {...register("message_template")} />
                <p className="mt-2 text-xs text-heledone-ink-muted">{t("Use simple event variables in custom messages, for example")} <code>{"{{task_title}}"}</code>.</p>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-base-content/10 bg-base-200/35 p-4">
                <span><span className="block text-sm font-medium">{t("Rule is active")}</span><span className="mt-1 block text-xs text-heledone-ink-muted">{t("Disable this event without deleting its saved configuration.")}</span></span>
                <input type="checkbox" className="toggle toggle-primary" {...register("is_active")} />
              </label>
            </div>
            <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-base-content/10 bg-base-100 px-6 py-4">
              <button type="button" className="btn btn-ghost" onClick={closeEditor}>{t("انصراف")}</button>
              <button type="submit" className="btn btn-primary" disabled={saveRule.isPending || selectedRecipients.length === 0}>{saveRule.isPending && <span className="loading loading-spinner loading-xs" />}{t("Save changes")}</button>
            </footer>
          </form>
        </div>
      </dialog>
    </motion.div>
  );
};
