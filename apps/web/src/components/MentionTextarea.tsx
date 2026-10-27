import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "../i18n/locale";
import { getHeledoneAvatar } from "../utils/avatarUtils";
import ProfileAvatar from "./ProfileAvatar";
import { normalizeProjectMembers, type MentionUser } from "../utils/mentionUtils";
import {
  computeMentionPopupPosition,
  type CaretPopupCoords,
} from "../utils/caretPosition";

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
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
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
      onPaste,
      position: _position,
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
    const [popupCoords, setPopupCoords] = useState<CaretPopupCoords>({
      left: 0,
      placement: "bottom",
      maxHeight: 240,
      isOutOfBounds: false,
    });
    const lastMentionTriggerIndexRef = useRef<number>(-1);
    const rafIdRef = useRef<number | null>(null);

    // Normalize project members
    const normalizedMembers = useMemo(
      () => normalizeProjectMembers(members),
      [members]
    );

    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Filter project members matching query
    const filteredMembers = useMemo(() => {
      if (!isMentionOpen) return [];
      const q = mentionQuery.toLowerCase().trim();
      if (!q) return normalizedMembers;
      return normalizedMembers.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          (m.email && m.email.toLowerCase().includes(q))
      );
    }, [isMentionOpen, mentionQuery, normalizedMembers]);

    // Keep selectedIndex in bounds
    useEffect(() => {
      setSelectedIndex(0);
    }, [mentionQuery, filteredMembers.length]);

    // Scroll active item into view
    useEffect(() => {
      if (isMentionOpen && itemRefs.current[selectedIndex]) {
        itemRefs.current[selectedIndex]?.scrollIntoView({
          block: "nearest",
        });
      }
    }, [selectedIndex, isMentionOpen]);

    // Update popup position anchored under caret
    const updatePosition = useCallback(() => {
      const textarea = internalTextareaRef.current;
      if (!textarea || mentionTriggerIndex < 0) return;
      const coords = computeMentionPopupPosition(textarea, mentionTriggerIndex);
      if (coords.isOutOfBounds) {
        setIsMentionOpen(false);
      } else {
        setPopupCoords(coords);
      }
    }, [mentionTriggerIndex]);

    // Listen to scroll and resize when mention popup is open with rAF throttling (60fps)
    useEffect(() => {
      if (!isMentionOpen || mentionTriggerIndex < 0) return;

      updatePosition();

      const handleScrollOrResize = () => {
        if (rafIdRef.current !== null) return;
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          updatePosition();
        });
      };

      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);

      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        window.removeEventListener("scroll", handleScrollOrResize, true);
        window.removeEventListener("resize", handleScrollOrResize);
      };
    }, [isMentionOpen, mentionTriggerIndex, updatePosition]);

    // Check trigger on selection or text change
    const checkMentionTrigger = useCallback(
      (overrideText?: string, overrideCursor?: number) => {
        const textarea = internalTextareaRef.current;
        if (!textarea) return;

        const currentText =
          typeof overrideText === "string" ? overrideText : (textarea.value ?? value);
        const cursor =
          typeof overrideCursor === "number"
            ? overrideCursor
            : (textarea.selectionStart ?? currentText.length);
        const textBefore = currentText.slice(0, cursor);

        // Check if preceded by space or start of line, followed by @ and optional query characters
        const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_\u0600-\u06FF.-]*)$/);

        if (match) {
          const query = match[1];
          // Calculate the exact index of the '@' symbol
          const leadingWhitespace = match[0].match(/^\s/);
          const atIndex = match.index! + (leadingWhitespace ? 1 : 0);

          setMentionTriggerIndex(atIndex);
          setMentionQuery(query);
          setIsMentionOpen(true);

          // Performance optimization: Only recalculate layout if '@' position moved!
          // Typing characters in the query string (@ali) does not move '@' and does not need recalculation.
          if (atIndex !== lastMentionTriggerIndexRef.current) {
            lastMentionTriggerIndexRef.current = atIndex;
            const coords = computeMentionPopupPosition(textarea, atIndex);
            setPopupCoords(coords);
          }
        } else {
          lastMentionTriggerIndexRef.current = -1;
          setIsMentionOpen(false);
          setMentionTriggerIndex(-1);
          setMentionQuery("");
        }
      },
      [value]
    );

    const handleSelectUser = useCallback(
      (user: MentionUser) => {
        const textarea = internalTextareaRef.current;
        if (!textarea) return;

        const currentText = textarea.value ?? value;
        const cursor = textarea.selectionStart ?? currentText.length;
        const before = currentText.slice(0, mentionTriggerIndex);
        const after = currentText.slice(cursor);
        const mentionString = `@${user.username} `;
        const nextValue = before + mentionString + after;

        lastMentionTriggerIndexRef.current = -1;
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
          e.preventDefault();
          const selected = filteredMembers[selectedIndex];
          if (selected) {
            handleSelectUser(selected);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          lastMentionTriggerIndexRef.current = -1;
          setIsMentionOpen(false);
          return;
        }
      }

      onKeyDown?.(e);
    };

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(target) &&
          internalTextareaRef.current &&
          !internalTextareaRef.current.contains(target)
        ) {
          lastMentionTriggerIndexRef.current = -1;
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
            const val = e.target.value;
            const cur = e.target.selectionStart;
            onChange(val);
            checkMentionTrigger(val, cur);
          }}
          onClick={() => checkMentionTrigger()}
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
          onPaste={onPaste}
        />

        {/* Mention Suggestions Floating Dropdown rendered via Portal to prevent any container clipping */}
        {isMentionOpen &&
          !popupCoords.isOutOfBounds &&
          typeof document !== "undefined" &&
          createPortal(
            <AnimatePresence>
              <motion.div
                ref={dropdownRef}
                initial={{
                  opacity: 0,
                  scale: 0.96,
                  y: popupCoords.placement === "top" ? 6 : -6,
                }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  y: popupCoords.placement === "top" ? 6 : -6,
                }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: popupCoords.top !== undefined ? `${popupCoords.top}px` : undefined,
                  bottom: popupCoords.bottom !== undefined ? `${popupCoords.bottom}px` : undefined,
                  left: `${popupCoords.left}px`,
                  width: "300px",
                  maxWidth: "calc(100vw - 2rem)",
                  zIndex: 99999,
                }}
                className="rounded-2xl border border-base-content/12 bg-base-100 shadow-2xl overflow-hidden backdrop-blur-2xl ring-1 ring-base-content/10"
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
                <div
                  style={{ maxHeight: `${popupCoords.maxHeight - 65}px` }}
                  className="custom-scrollbar overflow-y-auto p-1.5 space-y-0.5"
                >
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
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectUser(member);
                          }}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-all ${
                            isSelected
                              ? "bg-primary/10 text-primary font-bold shadow-xs"
                              : "text-base-content hover:bg-base-200/60"
                          }`}
                        >
                          <ProfileAvatar
                            src={avatarSrc}
                            name={member.displayName || member.username}
                            className="size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-base-content/10"
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
            </AnimatePresence>,
            document.body
          )}
      </div>
    );
  }
);

MentionTextarea.displayName = "MentionTextarea";
