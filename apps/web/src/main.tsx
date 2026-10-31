import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { MotionConfig } from "motion/react";
import { ErrorFallback } from "./components/ErrorFallback";
import { queryClient } from "./core/config/queryClient";
import "./index.css";
import "./styles/coastal-workspace.css";
import { applyDocumentLanguage, useLocaleStore } from "./i18n/locale";
import { LocaleApplication } from "./core/LocaleApplication";
import { applyBackgroundTheme, getBackgroundTheme } from "./core/config/backgroundThemes";

// Text fields match :focus-visible even after a click, so track Tab separately.
document.documentElement.dataset.focusModality = "pointer";
document.addEventListener("pointerdown", () => {
  document.documentElement.dataset.focusModality = "pointer";
}, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    document.documentElement.dataset.focusModality = "keyboard";
  }
}, true);

async function enableMocking() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true") {
    const { worker } = await import("./mocks/browser");
    return worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: {
        url: "/mockServiceWorker.js",
      },
    });
  }
}

enableMocking().finally(() => {
  const getPreferredTheme = () => {
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }

    return "light";
  };

  document.documentElement.setAttribute("data-theme", getPreferredTheme());
  applyBackgroundTheme(getBackgroundTheme());
  applyDocumentLanguage(useLocaleStore.getState().locale);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => window.location.reload()}
      >
        <QueryClientProvider client={queryClient}>
          <MotionConfig reducedMotion="user">
            <LocaleApplication />
          </MotionConfig>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
});
