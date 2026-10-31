export const backgroundThemes = [
  {
    id: "terrace",
    label: "Coastal terrace",
    image: "/images/heledone-assets/ocean-terrace-background.png",
  },
  {
    id: "hormuz",
    label: "Hormuz red coast",
    image: "/images/heledone-assets/background-variants/south-01-hormuz-red-coast.png",
  },
  {
    id: "qeshm",
    label: "Qeshm mangroves",
    image: "/images/heledone-assets/background-variants/south-02-qeshm-hara-mangroves.png",
  },
  {
    id: "bushehr",
    label: "Bushehr harbor",
    image: "/images/heledone-assets/background-variants/south-03-bushehr-harbor.png",
  },
  {
    id: "kish",
    label: "Kish beach",
    image: "/images/heledone-assets/background-variants/south-04-kish-palm-beach.png",
  },
  {
    id: "makran",
    label: "Makran cliffs",
    image: "/images/heledone-assets/background-variants/south-05-makran-cliffs.png",
  },
  {
    id: "big-sur",
    label: "Big Sur coast",
    image: "/images/heledone-assets/background-variants/world-01-big-sur-california.png",
  },
  {
    id: "cape-town",
    label: "Cape Town coast",
    image: "/images/heledone-assets/background-variants/world-02-cape-town.png",
  },
  {
    id: "zanzibar",
    label: "Zanzibar coast",
    image: "/images/heledone-assets/background-variants/world-03-zanzibar.png",
  },
  {
    id: "nova-scotia",
    label: "Nova Scotia coast",
    image: "/images/heledone-assets/background-variants/world-04-nova-scotia.png",
  },
  {
    id: "algarve",
    label: "Algarve coast",
    image: "/images/heledone-assets/background-variants/world-05-algarve.png",
  },
] as const;

export type BackgroundThemeId = (typeof backgroundThemes)[number]["id"];

const storageKey = "heledone-background-theme";

export const getBackgroundTheme = (): BackgroundThemeId => {
  try {
    const stored = localStorage.getItem(storageKey);
    return backgroundThemes.find((theme) => theme.id === stored)?.id ?? "terrace";
  } catch {
    return "terrace";
  }
};

export const applyBackgroundTheme = (id: BackgroundThemeId) => {
  const theme = backgroundThemes.find((item) => item.id === id);
  if (!theme) return;
  document.documentElement.style.setProperty("--app-background-image", `url("${theme.image}")`);
};

export const saveBackgroundTheme = (id: BackgroundThemeId) => {
  applyBackgroundTheme(id);
  try {
    localStorage.setItem(storageKey, id);
  } catch {
    // The selected background still applies for this session.
  }
};
