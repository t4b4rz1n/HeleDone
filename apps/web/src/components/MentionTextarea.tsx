import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "../i18n/locale";
import { getHeledoneAvatar } from "../utils/avatarUtils";
import { normalizeProjectMembers, type MentionUser } from "../utils/mentionUtils";

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: any[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  rows?: number;
  id?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  position?: "top" | "bottom" | "auto";
  wrapperClassName?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}

export const MentionTextarea = React.forwardRef<
  HTMLTextAreaElement,
  MentionTextareaProps
>(
  (
    {
      value,
      onChange,
      members,
      placeholder,
      className,
      disabled = false,
      rows,
      id,
      ariaLabel,
      autoFocus,
      onKeyDown,
      onFocus,
      onBlur,
      position = "auto",
      wrapperClassName = "",
    },
    forwardedRef
  ) => {
    const t = useTranslation();
    const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(forwardedRef, () => internalTextareaRef.current!);

    // Mention state
    const [isMentionOpen, setIsMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [dropdownPlacement, setDropdownPlacement] = useState<"top" | "bottom">(
      position === "bottom" ? "bottom" : "top"
    );

    // Normalize project members
    const normalizedMembers = useMemo(
      () => normalizeProjectMembers(members),
      [members]
    );

    // Filter project members matching query
    const filteredMembers = useMemo(() => {
      if (!isMentionOpen) return [];
      const q = mentionQuery.toLowerCase().trim();
      if (!q) return normalizedMembers;
      return normalizedMembers.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q)
      );
    }, [isMentionOpen, mentionQuery, normalizedMembers]);

    // Keep selectedIndex in bounds
    useEffect(() => {
      setSelectedIndex(0);
    }, [mentionQuery, filteredMembers.length]);

    // Check trigger on selection or text change
    const checkMentionTrigger = useCallback(() => {
      const textarea = internalTextareaRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart;
      const textBefore = value.slice(0, cursor);

      // Check if preceded by space or start of line, followed by @ and optional query characters
      const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_\u0600-\u06FF.-]*)$/);

      if (match) {
        const query = match[1];
        // Calculate the exact index of the '@' symbol
        const atIndex = match.index! + (match[0].startsWith(" ") || match[0].startsWith("\n") ? 1 : 0);

        setMentionTriggerIndex(atIndex);
        setMentionQuery(query);
        setIsMentionOpen(true);

        // Auto position top vs bottom based on viewport space
        if (position === "auto" && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          if (rect.top < 260) {
            setDropdownPlacement("bottom");
          } else {
            setDropdownPlacement("top");
          }
        }
      } else {
        setIsMentionOpen(false);
        setMentionTriggerIndex(-1);
        setMentionQuery("");
      }
    }, [value, position]);

    const handleSelectUser = useCallback(
      (user: MentionUser) => {
        const textarea = internalTextareaRef.current;
        if (!textarea) return;

        const cursor = textarea.selectionStart;
        const before = value.slice(0, mentionTriggerIndex);
        const after = value.slice(cursor);
        const mentionString = `@${user.username} `;
        const nextValue = before + mentionString + after;

        onChange(nextValue);
        setIsMentionOpen(false);
        setMentionTriggerIndex(-1);
        setMentionQuery("");

        // Restore focus and place cursor after inserted username
        requestAnimationFrame(() => {
          if (internalTextareaRef.current) {
            internalTextareaRef.current.focus();
            const newCursor = (before + mentionString).length;
            internalTextareaRef.current.setSelectionRange(newCursor, newCursor);
          }
        });
      },
      [value, mentionTriggerIndex, onChange]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isMentionOpen && filteredMembers.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          // If mention dropdown is active, select the member
          e.preventDefault();
          const selected = filteredMembers[selectedIndex];
          if (selected) {
            handleSelectUser(selected);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setIsMentionOpen(false);
          return;
        }
      }

      onKeyDown?.(e);
    };

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node) &&
          internalTextareaRef.current &&
          !internalTextareaRef.current.contains(e.target as Node)
        ) {
          setIsMentionOpen(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div
        ref={containerRef}
        className={`relative w-full ${wrapperClassName}`}
      >
        <textarea
          ref={internalTextareaRef}
          id={id}
          value={value}
          rows={rows}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={className}
          onChange={(e) => {
            onChange(e.target.value);
            checkMentionTrigger();
          }}
          onClick={checkMentionTrigger}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backspace"].includes(e.key)) {
              checkMentionTrigger();
            }
          }}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            onFocus?.(e);
            checkMentionTrigger();
          }}
          onBlur={(e) => {
            onBlur?.(e);
          }}
        />

        {/* Mention Suggestions Floating Dropdown */}
        <AnimatePresence>
          {isMentionOpen && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, scale: 0.95, y: dropdownPlacement === "top" ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: dropdownPlacement === "top" ? 6 : -6 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={`absolute z-50 w-72 max-w-[calc(100vw-3rem)] rounded-2xl border border-base-content/10 bg-base-100 shadow-2xl overflow-hidden backdrop-blur-xl ${
                dropdownPlacement === "top"
                  ? "bottom-full mb-2 start-0"
                  : "top-full mt-2 start-0"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-base-content/10 bg-base-200/50 px-3.5 py-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                  <span className="grid size-4 place-items-center rounded bg-primary/15 text-primary text-[11px] font-mono">
                    @
                  </span>
                  <span>{t("اعضای پروژه")}</span>
                </div>
                <span className="text-[10px] font-semibold text-heledone-ink-muted">
                  {filteredMembers.length} {t("عضو")}
                </span>
              </div>

              {/* Members List */}
              <div className="custom-scrollbar max-h-52 overflow-y-auto p-1.5 space-y-0.5">
                {filteredMembers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-heledone-ink-muted">
                    {t("عضوی در این پروژه با این نام یافت نشد")}
                  </div>
                ) : (
                  filteredMembers.map((member, idx) => {
                    const isSelected = idx === selectedIndex;
                    const avatarSrc =
                      member.avatar || getHeledoneAvatar(member.id, member.username);

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onMouseDown={(e) => {
                          // Prevent blur so handleSelectUser executes properly
                          e.preventDefault();
                          handleSelectUser(member);
                        }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-all ${
                          isSelected
                            ? "bg-primary/10 text-primary"
                            : "text-base-content hover:bg-base-200/60"
                        }`}
                      >
                        <img
                          src={avatarSrc}
                          alt={member.username}
                          className="size-7 shrink-0 rounded-full object-cover ring-1 ring-base-content/10"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate text-xs font-bold leading-tight">
                            {member.displayName}
                          </span>
                          <span
                            className={`truncate text-[11px] font-mono leading-none mt-0.5 ${
                              isSelected ? "text-primary" : "text-heledone-ink-muted"
                            }`}
                          >
                            @{member.username}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer Helper */}
              <div className="border-t border-base-content/8 bg-base-200/30 px-3 py-1.5 text-[10px] text-heledone-ink-muted flex items-center justify-between">
                <span>{t("انتخاب با")} ↑ ↓</span>
                <span>{t("تایید با Enter")}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

MentionTextarea.displayName = "MentionTextarea";
