import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { useTranslation } from "../../../i18n/locale";
import { formatDisplayDate } from "../../../utils/date";
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTimeOffRequests, approveTimeOffRequest, rejectTimeOffRequest, cancelTimeOffRequest } from '../api/attendanceApi';
import { useAttendanceStore } from '../store/useAttendanceStore';

import { TickCircle, CloseCircle, Trash, DocumentText, CloseSquare } from 'iconsax-reactjs';
import { toast } from 'sonner';

// ─── Reject Modal ────────────────────────────────────────────────────────────
interface RejectModalProps {
  requestId: string | number | null;
  onConfirm: (id: string | number, note: string) => void;
  onClose: () => void;
}

const RejectModal: React.FC<RejectModalProps> = ({ requestId, onConfirm, onClose }) => {
  const t = useTranslation();
  const [note, setNote] = useState('');

  if (requestId === null) return null;

  const handleSubmit = () => {
    onConfirm(requestId, note);
    setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"  />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-base-content/10 bg-base-100 shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-content/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-error/10 text-error">
              <CloseCircle size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-base-content">{t("Reject Request")}</h3>
              <p className="mt-0.5 text-xs text-heledone-ink-muted">{t("Provide a reason for rejection")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-heledone-ink-muted transition-colors hover:bg-base-200 hover:text-base-content"
          >
            <CloseSquare size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          <label className="mb-1.5 block text-[13px] font-bold uppercase tracking-wider text-heledone-ink-muted">
            {t("Rejection Reason")} <span className="text-heledone-ink-muted normal-case font-normal tracking-normal">{t("(optional)")}</span>
          </label>
          <textarea
            autoFocus
            rows={3}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t("e.g. Overlaps with another team member's leave...")}
            className="w-full resize-none rounded-xl border border-base-content/10 bg-base-200/50 p-3 text-sm font-medium text-base-content outline-none transition-all placeholder:text-heledone-ink-muted focus:border-error/40 focus:bg-base-100"
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-base-content/10 p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-base-content/10 px-4 py-2 text-sm font-semibold text-heledone-ink-muted transition-colors hover:bg-base-200"
          >
            {t("انصراف")}</button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-xl bg-error px-4 py-2 text-sm font-semibold text-error-content transition-opacity hover:opacity-90"
          >
            <CloseCircle size={16} />
            {t("Reject Request")}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Cancel Confirm Modal ─────────────────────────────────────────────────────
interface CancelModalProps {
  requestId: string | number | null;
  onConfirm: (id: string | number) => void;
  onClose: () => void;
}

const CancelModal: React.FC<CancelModalProps> = ({ requestId, onConfirm, onClose }) => {
  const t = useTranslation();
  if (requestId === null) return null;

  const handleConfirm = () => {
    onConfirm(requestId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"  />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-base-content/10 bg-base-100 shadow-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-content/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-warning/10 text-warning">
              <Trash size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-base-content">{t("Cancel Request")}</h3>
              <p className="mt-0.5 text-xs text-heledone-ink-muted">{t("This action cannot be undone")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-heledone-ink-muted transition-colors hover:bg-base-200 hover:text-base-content"
          >
            <CloseSquare size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          <p className="text-sm text-heledone-ink-muted">
            {t("Are you sure you want to cancel this time off request?")}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-base-content/10 p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-base-content/10 px-4 py-2 text-sm font-semibold text-heledone-ink-muted transition-colors hover:bg-base-200"
          >
            {t("Keep Request")}</button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-xl bg-warning px-4 py-2 text-sm font-semibold text-warning-content transition-opacity hover:opacity-90"
          >
            <Trash size={16} />
            {t("Yes, Cancel")}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TimeOffRequestList: React.FC<{ isManager?: boolean }> = ({ isManager = false }) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useAttendanceStore();

  const [rejectTarget, setRejectTarget] = useState<string | number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | number | null>(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['timeOffRequests', activeOrganizationId],
    queryFn: () => getTimeOffRequests(activeOrganizationId ? { organization: activeOrganizationId } : {}),
    enabled: !!activeOrganizationId,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string | number) => approveTimeOffRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffRequests'] });
      toast.success(t("Request approved"));
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || 'Could not approve the request.';
      toast.error(translateError(msg));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string | number, note: string }) => rejectTimeOffRequest(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffRequests'] });
      toast.success(t("Request rejected"));
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || 'Could not reject the request.';
      toast.error(translateError(msg));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string | number) => cancelTimeOffRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffRequests'] });
      toast.success(t("Request cancelled"));
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || 'Could not cancel the request.';
      toast.error(translateError(msg));
    },
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'approved': return 'text-success bg-success/10 border-success/20';
      case 'rejected': return 'text-error bg-error/10 border-error/20';
      default: return 'text-warning bg-warning/10 border-warning/20';
    }
  };

  if (!activeOrganizationId) {
    return <div className="heledone-surface rounded-2xl border border-dashed border-base-content/15 bg-base-100 p-8 text-center text-sm text-heledone-ink-muted">{t("Please select an organization to view requests.")}</div>;
  }

  return (
    <>
      {/* Reject Modal */}
      <RejectModal
        requestId={rejectTarget}
        onConfirm={(id, note) => rejectMutation.mutate({ id, note })}
        onClose={() => setRejectTarget(null)}
      />

      {/* Cancel Confirm Modal */}
      <CancelModal
        requestId={cancelTarget}
        onConfirm={(id) => cancelMutation.mutate(id)}
        onClose={() => setCancelTarget(null)}
      />

      <div className="heledone-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-base-content/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary"><DocumentText size={20} /></div>
            <div><h2 className="text-base font-semibold text-base-content">{t("Time off requests")}</h2><p className="mt-1 text-xs text-heledone-ink-muted">{t("Review leave status and approvals.")}</p></div>
          </div>
        </div>

        <div className="p-0 overflow-x-auto w-full">
          {isLoading ? (
            <div className="p-5 animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-base-200/70" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center text-heledone-ink-muted">
              <DocumentText size={40} className="mx-auto mb-3 text-heledone-ink-muted" />
              <p>{t("No requests found.")}</p>
            </div>
          ) : (
            <table className="w-full min-w-[600px] text-start text-sm text-base-content/70">
              <thead className="border-b border-base-content/10 bg-base-200 text-xs uppercase text-heledone-ink-muted">
                <tr>
                  <th className="px-6 py-4 font-semibold">{t("User")}</th>
                  <th className="px-6 py-4 font-semibold">{t("Type")}</th>
                  <th className="px-6 py-4 font-semibold">{t("Duration")}</th>
                  <th className="px-6 py-4 font-semibold">{t("وضعیت")}</th>
                  <th className="px-6 py-4 font-semibold text-end">{t("Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-content/10">
                {requests.map(req => (
                  <tr key={req.id} className="transition-colors hover:bg-base-200/60">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="grid size-8 place-items-center rounded-full bg-info/10 text-xs font-bold uppercase text-info">
                          {req.user_detail?.first_name?.[0] || req.user_detail?.username?.[0] || 'U'}
                        </div>
                        <span className="font-medium text-base-content/90">{req.user_detail?.first_name || req.user_detail?.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 capitalize font-medium">{req.request_type}</td>
                    <td className="px-6 py-4">
                      <div className="text-base-content/90">{formatDisplayDate(new Date(req.start_datetime), 'MMM d, HH:mm')}</div>
                      <div className="text-xs text-heledone-ink-muted">{t("to")} {formatDisplayDate(new Date(req.end_datetime), 'MMM d, HH:mm')}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-[13px] uppercase tracking-wider font-bold rounded-full border ${getStatusColor(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex justify-end gap-2">
                      {req.status === 'pending' && isManager && (
                        <>
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate(req.id)}
                            className="rounded-lg p-2 text-success transition-colors hover:bg-success/10"
                            title={t("Approve")}
                          >
                            <TickCircle size={20} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectTarget(req.id)}
                            className="rounded-lg p-2 text-error transition-colors hover:bg-error/10"
                            title={t("Reject")}
                          >
                            <CloseCircle size={20} />
                          </button>
                        </>
                      )}
                      {req.status === 'pending' && !isManager && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(req.id)}
                          className="rounded-lg p-2 text-heledone-ink-muted transition-colors hover:bg-error/10 hover:text-error"
                          title={t("انصراف")}
                        >
                          <Trash size={20} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
};
