import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "../i18n/locale";
import {
  backgroundThemes,
  getBackgroundTheme,
  saveBackgroundTheme,
  type BackgroundThemeId,
} from "../core/config/backgroundThemes";

export function BackgroundThemePicker() {
  const t = useTranslation();
  const [selected, setSelected] = useState<BackgroundThemeId>(getBackgroundTheme);

  useEffect(() => {
    const syncSelection = () => setSelected(getBackgroundTheme());
    window.addEventListener("storage", syncSelection);
    return () => window.removeEventListener("storage", syncSelection);
  }, []);

  const selectTheme = (id: BackgroundThemeId) => {
    saveBackgroundTheme(id);
    setSelected(id);
  };

  return (
    <section aria-labelledby="background-theme-heading" className="heledone-surface p-4 sm:p-5">
      <h2 id="background-theme-heading" className="text-base font-bold text-base-content">
        {t("Background theme")}
      </h2>
      <p className="mt-1 text-sm text-heledone-ink-muted">
        {t("Choose a coastal view for your workspace.")}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {backgroundThemes.map((theme) => {
          const isSelected = selected === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              aria-label={t(theme.label)}
              aria-pressed={isSelected}
              onClick={() => selectTheme(theme.id)}
              className={`group relative overflow-hidden rounded-xl border text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-base-content/15 bg-base-100/60 hover:border-primary/50"
              }`}
            >
              <img
                src={theme.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-full object-cover"
              />
              {isSelected && (
                <span className="absolute bottom-2 end-2 grid size-8 place-items-center rounded-full border border-white/70 bg-primary text-primary-content shadow-md">
                  <Check size={17} aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
