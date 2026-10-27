import { t } from "../../i18n/locale";

/**
 * Extracts the first field-level error message from a DRF validation error object.
 * Returns only the error text (not the field name) for a cleaner UX.
 */
const extractFieldError = (data: Record<string, unknown>): string | null => {
  for (const [, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      return value[0];
    }
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
};

export const getErrorMessage = (
  error: unknown,
  fallbackMessage = "Could not complete action."
): string => {
  if (typeof error === "string" && error.trim().length > 0) {
    if (/^Request failed with status code \d+$/.test(error)) return t(fallbackMessage);
    if (/^timeout of \d+ms exceeded$/.test(error)) return t("Request timed out. Please try again.");
    return t(error);
  }

  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;

    if (typeof err.detail === "string") {
      return t(err.detail);
    }

    if (err.errors && typeof err.errors === "object") {
      const msg = extractFieldError(err.errors as Record<string, unknown>);
      if (msg) return t(msg);
    }

    const response = err.response as
      | { status?: number; data?: Record<string, unknown> }
      | undefined;

    if (response?.status === 403) return t("You do not have permission to perform this action.");

    if (response?.data && typeof response.data === "object") {
      const data = response.data;

      if (typeof data.message === "string") return t(data.message);
      if (typeof data.detail === "string") return t(data.detail);

      if (data.errors && typeof data.errors === "object") {
        const msg = extractFieldError(data.errors as Record<string, unknown>);
        if (msg) return t(msg);
      }

      // DRF sometimes returns validation errors directly as { field: ["error msg"] }
      // (no "errors" wrapper) — handle that case too
      const directMsg = extractFieldError(data);
      if (directMsg) return t(directMsg);
    }
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") return t("Request timed out. Please try again.");
    if (err.message === "Network Error") return t("Network Error");
    if (typeof err.message === "string" && !/^Request failed with status code \d+$/.test(err.message)) return t(err.message);
  }

  return t(fallbackMessage);
};
