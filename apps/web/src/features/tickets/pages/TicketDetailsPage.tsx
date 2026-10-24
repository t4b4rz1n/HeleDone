import { getIntlLocale, formatNumber, useTranslation } from "../../../i18n/locale";
import { useRef, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Messages2,
  Paperclip,
  Send2,
  CloseCircle,
} from "iconsax-reactjs";
import { formatDate } from "../../../utils/formatDate";
import {
  useTicket,
  useTickets,
  useTicketMessages,
  useSendTicketMessage,
  useUpdateTicketStatus,
} from "../hooks/useTickets";
import { messageSchema } from "../validation";
import type { Ticket, TicketMessage } from "../types";
import { useAuthStore } from "../../auth/store/authStore";
import { BrandBeats } from "../../../components/Brand";
import { CoastalArtwork } from "../../../components/CoastalEmptyState";
import { MentionTextarea } from "../../../components/MentionTextarea";
import { MentionText } from "../../../components/MentionText";
import { useUsers } from "../../users/hooks/useUsers";

export default function TicketDetailsPage() {
  const t = useTranslation();
  const { id } = useParams<{ id: string }>();
  const ticketId = id || "";
  const isStaff = useAuthStore((state) => state.user?.is_staff === true);

  const { data: ticket, isLoading: isLoadingTicket, isError: isErrorTicket } = useTicket(ticketId);
  const { data: messagesResponse, isLoading: isLoadingMessages } = useTicketMessages(
    ticketId,
    new URLSearchParams({ page_size: "100" })
  );

  const [pageSize, setPageSize] = useState(15);
  const sidebarParams = useMemo(() => new URLSearchParams({ page_size: String(pageSize) }), [pageSize]);

  const { data: sidebarTicketsResponse, isLoading: isLoadingSidebarTickets, isFetching: isFetchingSidebarTickets } = useTickets(sidebarParams, {
    staleTime: 5 * 60 * 1000,
  });

  const sidebarTickets = useMemo(() => sidebarTicketsResponse?.results || [], [sidebarTicketsResponse]);
  const hasMore = useMemo(() => {
    const totalResults = sidebarTicketsResponse?.total_results || 0;
    return sidebarTickets.length < totalResults;
  }, [sidebarTickets.length, sidebarTicketsResponse?.total_results]);

  const sendMessageMutation = useSendTicketMessage(ticketId);
  const updateStatusMutation = useUpdateTicketStatus(ticketId);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const usersParams = useMemo(() => new URLSearchParams({ page_size: "100" }), []);
  const { data: usersResponse } = useUsers(usersParams);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<{ text?: string }>({
    resolver: zodResolver(messageSchema),
    defaultValues: { text: "" },
  });

  const messages = useMemo(() => {
    if (!messagesResponse?.results) return [];
    return [...messagesResponse.results].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [messagesResponse]);

  const ticketMembers = useMemo(() => {
    const list: any[] = [];
    if (ticket?.user) list.push(ticket.user);
    if (messages.length > 0) {
      messages.forEach((m) => {
        if (m.sender) list.push(m.sender);
      });
    }
    if (usersResponse?.results) {
      list.push(...usersResponse.results);
    }
    return list;
  }, [ticket, messages, usersResponse]);

  // Scroll to bottom on load/new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const queryClient = useQueryClient();

  const onSend = handleSubmit((data) => {
    if (!data.text?.trim() && !selectedFile) return;
    sendMessageMutation.mutate(
      { text: data.text, file: selectedFile || undefined },
      {
        onSuccess: () => {
          reset({ text: "" });
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          const el = document.getElementById("chat-textarea");
          if (el) el.style.height = "44px";
          queryClient.invalidateQueries({ queryKey: ["notification-unread"] });
          queryClient.invalidateQueries({ queryKey: ["notification-history"] });
        },
      }
    );
  });

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault();
      setSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  // ─── Loading / Error configurations ─────────────────────────────────────────
  const priorityConfig = {
    low: { color: "text-success", bg: "bg-success/10 border-success/20", dot: "bg-success" },
    medium: { color: "text-warning", bg: "bg-warning/10 border-warning/20", dot: "bg-warning" },
    high: { color: "text-error", bg: "bg-error/10 border-error/20", dot: "bg-error" },
  };
  const statusConfig = {
    open: { color: "text-info", bg: "bg-info/10 border-info/20", dot: "bg-info", pulse: true },
    in_progress: { color: "text-warning", bg: "bg-warning/10 border-warning/20", dot: "bg-warning", pulse: true },
    answered: { color: "text-success", bg: "bg-success/10 border-success/20", dot: "bg-success", pulse: false },
    closed: { color: "text-heledone-ink-muted", bg: "bg-base-200 border-base-content/10", dot: "bg-base-content/30", pulse: false },
  };

  const pCfg = ticket
    ? (priorityConfig[ticket.priority as keyof typeof priorityConfig] || priorityConfig.low)
    : priorityConfig.low;
  const sCfg = ticket
    ? (statusConfig[ticket.status as keyof typeof statusConfig] || statusConfig.open)
    : statusConfig.open;
  const ticketTypeName = ticket
    ? typeof ticket.ticket_type === "string"
      ? ticket.ticket_type
      : ticket.ticket_type?.name || ""
    : "";

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  return (
    <div className="space-y-4">
      <header className="heledone-task-coast">
        <BrandBeats />
        <h1>{t("درخواست‌های پشتیبانی")}</h1>
        <CoastalArtwork motif="tickets" />
      </header>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-5 min-h-[calc(100dvh-180px)]">

      {/* ── Chat Thread ─────────────────────────────────────────────────────── */}
      {isLoadingTicket ? (
        <div className="animate-pulse flex flex-col bg-base-100 rounded-2xl border border-base-content/10 h-[76dvh]">
          <div className="p-4 border-b border-base-content/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-base-content/10" />
            <div className="h-4 w-48 bg-base-content/10 rounded" />
          </div>
          <div className="flex-1 p-5 space-y-4">
            <div className="h-16 w-1/3 bg-base-content/5 rounded-2xl" />
            <div className="h-12 w-1/2 bg-base-content/10 rounded-2xl ms-auto" />
            <div className="h-20 w-1/4 bg-base-content/5 rounded-2xl" />
          </div>
          <div className="p-4 border-t border-base-content/10 h-16 bg-base-200/30" />
        </div>
      ) : isErrorTicket || !ticket ? (
        <div className="bg-base-100 rounded-2xl border border-error/20 p-14 text-center h-[76dvh] flex flex-col items-center justify-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center">
            <CloseCircle className="w-10 h-10 text-error" />
          </div>
          <h3 className="text-lg font-bold text-error mt-2">{t("Ticket Not Found")}</h3>
          <p className="text-error mt-2 text-sm">{t("The ticket you are looking for does not exist or has been deleted.")}</p>
          <Link
            to="/tickets"
            className="btn btn-primary rounded-xl gap-2 mt-6 px-6"
          >
            <ArrowLeft size={16} className="rtl:rotate-180" />
            {t("Back to Tickets")}</Link>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col bg-base-100 rounded-2xl border border-base-content/10 shadow-xs overflow-hidden h-[76dvh]"
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-base-content/10 bg-base-200/20 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                to="/tickets"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-base-200 hover:bg-primary/10 hover:text-primary text-heledone-ink-muted transition-all border border-base-content/10 shrink-0"
              >
                <ArrowLeft size={16} className="rtl:rotate-180" />
              </Link>
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Messages2 size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-sm text-base-content truncate max-w-[150px] sm:max-w-sm" >
                    {ticket.title}
                  </h2>
                  <span className={`inline-flex items-center text-[13px] px-1.5 py-0.5 rounded border uppercase font-medium shrink-0 ${pCfg.bg} ${pCfg.color}`}>
                    {capitalize(ticket.priority)}
                  </span>
                  {ticketTypeName && (
                    <span className="text-[13px] bg-base-200 border border-base-content/10 px-1.5 py-0.5 rounded text-heledone-ink-muted font-mono shrink-0">
                      {t(ticketTypeName)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-heledone-ink-muted flex items-center flex-wrap gap-1.5 mt-1">
                  <span className="font-bold text-base-content/85" >{ticket.user?.username || t("Guest")}</span>
                  {ticket.user?.email && <span className="opacity-75 text-[13px] truncate max-w-[150px]">({ticket.user.email})</span>}
                  <span>•</span>
                  <span>{formatDate(ticket.created_at)}</span>
                </p>
              </div>
            </div>
            {/* Status dropdown */}
            <div className="dropdown dropdown-end shrink-0 relative z-20">
              <label
                tabIndex={0}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer hover:bg-base-200 transition-all select-none ${sCfg.bg} ${sCfg.color}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${sCfg.dot} ${sCfg.pulse ? "animate-pulse" : ""}`} />
                {capitalize(ticket.status)}
                <span className="text-[13px] opacity-60">▼</span>
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content menu p-1.5 shadow-xl bg-base-100 border border-base-content/10 rounded-xl w-36 mt-1"
              >
                {(isStaff ? ["open", "in_progress", "answered", "closed"] as const : ["closed"] as const).map((status) => {
                  const cfg = statusConfig[status];
                  const isActive = ticket.status === status;
                  return (
                    <li key={status}>
                      <button
                        type="button"
                        onClick={() => updateStatusMutation.mutate(status)}
                        disabled={updateStatusMutation.isPending}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${isActive
                          ? `${cfg.bg} ${cfg.color}`
                          : "text-base-content/70 hover:text-base-content hover:bg-base-200"
                          }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? cfg.dot : "bg-base-content/20"}`} />
                        {capitalize(status)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto p-5 flex flex-col-reverse gap-3 bg-base-100"

          >
            <div ref={chatEndRef} />

            {isLoadingMessages ? (
              <div className="flex justify-center items-center h-full">
                <div className="loading loading-spinner text-primary" />
              </div>
            ) : messages.length > 0 ? (
              messages.map((message: TicketMessage) => {
                const isStaff = message.sender?.is_staff;
                return (
                  <div key={message.id} className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
                    <div

                      className={`max-w-[min(70%,42rem)] min-w-0 rounded-2xl px-4 py-3 shadow-xs ${isStaff
                        ? "bg-primary text-primary-content rounded-br-none"
                        : "bg-base-200 text-base-content border border-base-content/5 rounded-bl-none"
                        }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5 justify-between">
                        <span className={`text-xs font-bold ${isStaff ? "text-primary-content/85" : "text-base-content/80"}`}>
                          {message.sender?.username || t("User")}
                        </span>
                        <span className={`text-[13px] ${isStaff ? "text-primary-content" : "text-heledone-ink-muted"}`}>
                          {new Date(message.created_at).toLocaleTimeString(getIntlLocale(), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {message.attachments?.map((attachment) => (
                        <div
                          key={attachment.id}
                          className={`mt-2 mb-2 rounded-xl overflow-hidden border max-w-full ${isStaff ? "border-primary-content/20" : "border-base-content/10"}`}
                        >
                          {attachment.file_type === "image" ? (
                            <a href={attachment.file} target="_blank" rel="noopener noreferrer" className="block hover:opacity-85 transition-opacity">
                              <img src={attachment.file} alt={t("attachment")} className="max-h-60 object-cover w-full" />
                            </a>
                          ) : (
                            <a
                              href={attachment.file}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 p-3 text-xs font-medium transition-colors ${isStaff
                                ? "bg-primary-content/10 hover:bg-primary-content/20 text-primary-content"
                                : "bg-base-300 hover:bg-base-content/10 text-base-content/70"
                              }`}
                            >
                              <Paperclip size={14} />
                              <span className="truncate max-w-[200px]">{attachment.file.split("/").pop()}</span>
                            </a>
                          )}
                        </div>
                      ))}

                      <MentionText
                        content={message.text}
                        className="text-sm whitespace-pre-wrap leading-relaxed"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="my-auto flex flex-col justify-center items-center text-center p-10" >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <Messages2 size={32} className="text-primary" />
                </div>
                <p className="text-heledone-ink-muted text-sm">{t("No messages in this ticket yet.")}</p>
              </div>
            )}
          </div>

          {/* Selected File Preview */}
          {selectedFile && (
            <div className="px-4 py-3 bg-base-200/50 border-t border-base-content/10 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                {selectedFile.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(selectedFile)}
                    alt={t("preview")}
                    className="w-10 h-10 object-cover rounded-lg border border-base-content/10"
                  />
                ) : (
                  <div className="w-10 h-10 bg-base-300 rounded-lg flex items-center justify-center border border-base-content/10">
                    <Paperclip size={18} className="text-heledone-ink-muted" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-base-content truncate max-w-[220px]">{selectedFile.name}</p>
                  <p className="text-[13px] text-heledone-ink-muted">{formatNumber(selectedFile.size / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}  {t("KB")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="btn btn-circle btn-xs btn-error btn-outline"
              >
                ✕
              </button>
            </div>
          )}

          {/* Input Area */}
          <form
            onSubmit={onSend}
            className="p-3 border-t border-base-content/10 bg-base-200/20 flex gap-2.5 flex-shrink-0"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedFile(file);
                e.target.value = "";
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-ghost border border-base-content/10 hover:bg-primary/10 hover:text-primary rounded-xl w-10 h-11 p-0 shrink-0"
            >
              <Paperclip size={18} />
            </button>

            <div className="flex-1 min-w-0">
              <Controller
                name="text"
                control={control}
                render={({ field }) => (
                  <MentionTextarea
                    value={field.value || ""}
                    onChange={field.onChange}
                    members={ticketMembers}
                    position="top"
                    id="chat-textarea"
                    placeholder={t("Type your reply here... (use @ to mention)")}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    className={`textarea textarea-bordered w-full rounded-xl bg-base-100 px-4 py-2.5 text-sm text-base-content placeholder-base-content/30 resize-none overflow-y-auto leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[44px] max-h-32 ${
                      errors.text ? "border-error" : "border-base-300"
                    }`}
                  />
                )}
              />
            </div>

            <button
              type="submit"
              disabled={sendMessageMutation.isPending}
              className="btn btn-primary rounded-xl w-10 h-11 p-0 shrink-0"
            >
              {sendMessageMutation.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Send2 size={18} className="rtl:-scale-x-100" />
              )}
            </button>
          </form>
        </div>
      )}

      {/* ── Sidebar: Chats List ────────────────────────────────────────────────── */}
      <div className="bg-base-100 rounded-2xl border border-base-content/10 shadow-xs flex flex-col gap-0 overflow-hidden h-auto xl:h-[76dvh]">

        {/* Sidebar Header */}
        <div className="px-5 py-4 border-b border-base-content/10 bg-base-200/20 flex items-center gap-2.5 flex-shrink-0">
          <Messages2 size={18} className="text-primary" />
          <h3 className="font-bold text-sm text-base-content">{t("Active Chats")}</h3>
        </div>

        {/* Chats list scrollable container */}
        <div className="flex-1 overflow-y-auto divide-y divide-base-content/5">
          {isLoadingSidebarTickets ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span className="loading loading-spinner loading-md text-primary" />
              <span className="text-xs text-heledone-ink-muted font-mono">{t("Loading chats...")}</span>
            </div>
          ) : sidebarTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <span className="text-xs text-heledone-ink-muted font-mono">{t("No chats found.")}</span>
            </div>
          ) : (
            <>
              {sidebarTickets.map((tItem: Ticket) => {
                const isCurrent = tItem.id === ticketId;
                const itemStatus = statusConfig[tItem.status as keyof typeof statusConfig] || statusConfig.open;
                const itemPriority = priorityConfig[tItem.priority as keyof typeof priorityConfig] || priorityConfig.low;
                return (
                  <Link
                    key={tItem.id}
                    to={`/tickets/${tItem.id}`}
                    className={`flex items-start gap-3 p-3.5 hover:bg-base-200/50 transition-all text-start relative ${isCurrent
                      ? "bg-primary/5 border-s-2 border-s-primary"
                      : ""
                      }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-xl bg-base-200 border border-base-content/10 flex items-center justify-center text-heledone-ink-muted">
                        <Messages2 size={14} className={isCurrent ? "text-primary" : ""} />
                      </div>
                      <span className={`absolute -bottom-0.5 -end-0.5 w-2 h-2 rounded-full border border-base-100 ${itemStatus.dot}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className={`font-bold text-xs truncate block ${isCurrent ? "text-primary" : "text-base-content/85"}`} >
                          {tItem.title}
                        </span>
                        <span className="text-[13px] text-heledone-ink-muted shrink-0">
                          {formatDate(tItem.created_at)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[13px] text-heledone-ink-muted truncate block" >
                          {tItem.user?.username || t("Guest")}
                        </span>

                        <span className={`text-[13px] px-1 py-0 rounded border uppercase font-bold shrink-0 ${itemPriority.bg} ${itemPriority.color}`}>
                          {capitalize(tItem.priority)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {hasMore && (
                <div className="p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setPageSize((prev) => prev + 15)}
                    disabled={isFetchingSidebarTickets}
                    className="btn btn-ghost border border-base-content/10 hover:bg-base-200 w-full text-xs rounded-xl font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isFetchingSidebarTickets ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      t("Load More")
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
