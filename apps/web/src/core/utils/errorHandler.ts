import { t } from "../../i18n/locale";

/**
 * Extracts the first field-level error message from a DRF validation error object.
 * Returns only the error text (not the field name) for a cleaner UX.
 */
const extractFieldError = (data: Record<string, unknown>): string | null => {
  for (const [, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length > 0) {
      const first = value.find((item) => typeof item === "string");
      if (typeof first === "string") return first;
      const nested = value.find((item) => item && typeof item === "object");
      if (nested) {
        const message = extractFieldError(nested as Record<string, unknown>);
        if (message) return message;
      }
    }
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value === "object") {
      const message = extractFieldError(value as Record<string, unknown>);
      if (message) return message;
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

    const status = response?.status ?? (typeof err.status === "number" ? err.status : undefined);

    // Permission failures should use the standard localized message instead of
    // exposing backend-specific details that may vary between endpoints.
    if (status === 401) return t("Your session has expired. Please sign in again.");
    if (status === 403) return t("You do not have permission to perform this action.");

    if (response?.data && typeof response.data === "object") {
      const data = response.data;

      const serverMessage =
        (typeof data.detail === "string" && data.detail) ||
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        "";
      if (status === 405 && /method.*not allowed|متد.*مجاز نیست/i.test(serverMessage)) {
        return t("This action is not available. Refresh the page and try again.");
      }
      if (typeof data.message === "string") return t(data.message);
      if (typeof data.detail === "string") return t(data.detail);
      if (typeof data.error === "string") return t(data.error);

      if (data.errors && typeof data.errors === "object") {
        const msg = extractFieldError(data.errors as Record<string, unknown>);
        if (msg) return t(msg);
      }

      // DRF sometimes returns validation errors directly as { field: ["error msg"] }
      // (no "errors" wrapper) — handle that case too
      const directMsg = extractFieldError(data);
      if (directMsg) return t(directMsg);
    }
    if (status === 404) return t("The requested item could not be found.");
    if (status === 405) return t("This action is not available. Refresh the page and try again.");
    if (status === 409) return t("This change conflicts with the current data. Refresh and try again.");
    if (status === 413) return t("The uploaded file is too large.");
    if (status === 429) return t("Too many requests. Please wait and try again.");
    if (status && status >= 500) return t("The server could not complete the request. Please try again.");
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") return t("Request timed out. Please try again.");
    if (err.message === "Network Error") return t("Network Error");
    if (typeof err.message === "string" && !/^Request failed with status code \d+$/.test(err.message)) return t(err.message);
  }

  return t(fallbackMessage);
};
