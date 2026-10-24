import { useTranslation } from "../../i18n/locale";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight2, CloseCircle, SearchNormal1 } from "iconsax-reactjs";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { DrawerItem } from "./DrawerItems";
import { motionTokens } from "../../core/config/designTokens";

interface CommandMenuProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  items: DrawerItem[];
  isStaff: boolean;
}

export const CommandMenu = ({
  isOpen,
  onOpenChange,
  items,
  isStaff,
}: CommandMenuProps) => {
  const t = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        itemTitle: item.link === "dashboard" && isStaff ? t("Admin Panel") : item.title,
        itemLink: item.link === "dashboard" && isStaff ? "admin" : item.link,
      })),
    [isStaff, items, t],
  );

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return commands;

    return commands.filter((command) =>
      `${command.itemTitle} ${t(command.section)}`.toLowerCase().includes(normalizedQuery),
    );
  }, [commands, query, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
      }

      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), [role="option"]';
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    requestAnimationFrame(() => inputRef.current?.focus());
    window.addEventListener("keydown", handleTab);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleTab);
      previousActiveElement.current?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex((currentIndex) =>
      Math.min(currentIndex, Math.max(filteredCommands.length - 1, 0)),
    );
  }, [filteredCommands.length]);

  const executeCommand = (itemLink: string) => {
    onOpenChange(false);
    navigate(`/${itemLink}`);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        filteredCommands.length ? (index + 1) % filteredCommands.length : 0,
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        filteredCommands.length
          ? (index - 1 + filteredCommands.length) % filteredCommands.length
          : 0,
      );
    }

    if (event.key === "Enter" && filteredCommands[activeIndex]) {
      event.preventDefault();
      executeCommand(filteredCommands[activeIndex].itemLink);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-neutral/25 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onOpenChange(false);
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("Command menu")}
            className="heledone-glass w-full max-w-xl overflow-hidden rounded-2xl shadow-heledone-floating"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: motionTokens.duration.slow,
            }}
          >
            <div className="flex items-center gap-3 border-b border-base-content/10 px-4">
              <SearchNormal1 size={20} className="shrink-0 text-heledone-ink-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t("Search pages...")}
                className="h-14 min-w-0 flex-1 bg-transparent text-sm font-medium text-base-content outline-none placeholder:text-heledone-ink-muted"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-menu-results"
                aria-activedescendant={
                  filteredCommands[activeIndex]
                    ? `command-${filteredCommands[activeIndex].link}`
                    : undefined
                }
              />
              <kbd className="hidden rounded-md border border-base-content/10 bg-base-200 px-2 py-1 text-[0.68rem] text-heledone-ink-muted sm:inline-block">
                {t("ESC")}</kbd>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="motion-interactive rounded-lg p-1 text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
                aria-label={t("Close command menu")}
              >
                <CloseCircle size={20} />
              </button>
            </div>

            <div id="command-menu-results" role="listbox" className="max-h-[min(26rem,55dvh)] overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-heledone-ink-muted">
                  {t("No matching page found.")}</div>
              ) : (
                filteredCommands.map((command, index) => (
                  <button
                    key={command.link}
                    id={`command-${command.link}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => executeCommand(command.itemLink)}
                    className={`motion-interactive flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start ${
                      index === activeIndex
                        ? "bg-primary/10 text-primary"
                        : "text-base-content/75 hover:bg-base-200"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-200/80">
                      {command.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {command.itemTitle}
                      </span>
                      <span className="block text-xs text-heledone-ink-muted">
                        {t(command.section)}
                      </span>
                    </span>
                    <ArrowRight2 size={16} className="shrink-0 opacity-45 rtl:rotate-180" />
                  </button>
                ))
              )}
            </div>

            <div className="hidden items-center gap-4 border-t border-base-content/10 px-4 py-3 text-[0.68rem] text-heledone-ink-muted sm:flex">
              <span>{t("↑↓ Navigate")}</span>
              <span>{t("↵ Open")}</span>
              <span>{t("⌘K / Ctrl K")}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
