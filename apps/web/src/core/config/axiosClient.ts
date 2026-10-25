import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { useAuthStore } from "../../features/auth/store/authStore";
import { useTaskStore } from "../../features/tasks/store/useTaskStore";
import { useLocaleStore } from "../../i18n/locale";
import { API_TIMEOUT, getApiUrl } from "../api/config";

const axiosClient: AxiosInstance = axios.create({
  baseURL: getApiUrl(),
  timeout: API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: true,
});

const clearClientSession = () => {
  useAuthStore.getState().logout();
  useTaskStore.getState().reset();
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (error: any) => void;
}> = [];

const COOKIE_TRANSPORT_HEADER = "X-Auth-Transport";
let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

const getCsrfToken = async (): Promise<string> => {
  if (csrfToken) return csrfToken;
  if (!csrfTokenRequest) {
    csrfTokenRequest = axiosClient
      .get("/auth/csrf/", {
        withCredentials: true,
        headers: { [COOKIE_TRANSPORT_HEADER]: "cookie" },
      })
      .then((response) => {
        const token = response.data?.data?.csrfToken ?? response.data?.csrfToken;
        if (!token) throw new Error("CSRF endpoint returned no token");
        csrfToken = token;
        return token;
      })
      .finally(() => {
        csrfTokenRequest = null;
      });
  }
  return csrfTokenRequest;
};

const processQueue = (error: any = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve();
    }
  });
  failedQueue = [];
};

axiosClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.headers.set("Accept-Language", useLocaleStore.getState().locale);
    config.headers.set(COOKIE_TRANSPORT_HEADER, "cookie");
    config.headers.delete("Authorization");

    const method = (config.method ?? "get").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
      config.headers.set("X-CSRFToken", await getCsrfToken());
    }

    // If sending FormData (e.g. file upload), remove the hardcoded
    // Content-Type so axios can set multipart/form-data with the
    // correct boundary automatically.
    if (config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Cookie refresh keeps JWTs out of JavaScript and persisted browser storage.
axiosClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error?.config as (InternalAxiosRequestConfig & {
      _retry?: boolean;
    }) | undefined;

    if (error?.response?.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url ?? "";
    const isPublicAuthEndpoint = /\/auth\/(login|register|csrf|refresh)\//.test(url);
    if (isPublicAuthEndpoint) return Promise.reject(error);

    const redirectToLogin = () => {
      clearClientSession();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    };

    if (originalRequest._retry) {
      redirectToLogin();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      originalRequest._retry = true;
      return new Promise<void>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => {
        originalRequest.headers.delete("Authorization");
        return axiosClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const token = await getCsrfToken();
      await axiosClient.post(
        "/auth/login/refresh/",
        {},
        {
          withCredentials: true,
          headers: {
            [COOKIE_TRANSPORT_HEADER]: "cookie",
            "X-CSRFToken": token,
          },
        },
      );
      processQueue();
      originalRequest.headers.delete("Authorization");
      return axiosClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default axiosClient;
