import ProfileAvatar from "../../components/ProfileAvatar";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import { useTranslation } from "../../i18n/locale";
import { useAuthStore } from "../auth/store/authStore";
import { useLogout } from "../auth/hooks/useAuth";

export function UserMenu() {
  const t = useTranslation();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || t("Account");
  const avatar = user?.profile_image_url || user?.avatar_url;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("حساب من")}
        title={t("حساب من")}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="motion-interactive grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-transparent hover:bg-base-200 sm:size-11"
      >
        <ProfileAvatar src={avatar} name={name} className="size-9 overflow-hidden rounded-full border border-primary/30 sm:size-10" fallbackClassName="flex size-full items-center justify-center rounded-full bg-primary/10 text-primary" />
      </button>
      {open && (
        <div id={menuId} className="absolute end-0 top-full z-[100] mt-2 w-56 max-w-[calc(100vw-24px)] rounded-lg border border-heledone-border bg-base-100 p-2 text-base-content shadow-xl">
          <div className="border-b border-heledone-border px-3 py-2">
            <p className="break-words text-sm font-bold">{name}</p>
            <p className="mt-0.5 text-xs text-heledone-ink-muted">{t("Account")}</p>
          </div>
          <Link to="/profile" onClick={() => setOpen(false)} className="mt-1 flex min-h-10 items-center gap-2 rounded-md px-3 text-sm hover:bg-base-200">
            <UserRound size={17} aria-hidden="true" />
            {t("حساب من")}
          </Link>
          <button type="button" onClick={() => { setOpen(false); logout(); }} className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-start text-sm text-error hover:bg-error/10">
            <LogOut size={17} aria-hidden="true" />
            {t("خروج")}
          </button>
        </div>
      )}
    </div>
  );
}
