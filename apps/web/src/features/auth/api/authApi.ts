import { t } from "../../../i18n/locale";
import ApiService from "../../../core/api/apiService";
import { getErrorMessage } from "../../../core/utils/errorHandler";
import type {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
} from "../types/authTypes";

const AUTH_ENDPOINTS = {
  LOGIN: "/auth/login/",
  REGISTER: "/auth/register/",
};

export const registerRequest = async (
  credentials: RegisterCredentials
): Promise<User> => {
  try {
    const response = await ApiService.post<User>(
      AUTH_ENDPOINTS.REGISTER,
      credentials
    );
    return response.data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, t("Registration failed. Please try again."))
    );
  }
};

export const loginRequest = async (
  credentials: LoginCredentials
): Promise<AuthResponse> => {
  try {
    const response = await ApiService.post<AuthResponse>(
      AUTH_ENDPOINTS.LOGIN,
      credentials
    );
    return response.data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, t("Login failed. Please check your credentials."))
    );
  }
};

export const logoutRequest = async (): Promise<void> => {
  await ApiService.post<void>("/auth/logout/");
};

export const getProfileRequest = async (): Promise<User> => {
  try {
    const response = await ApiService.get<User>("/accounts/profile/");
    return response.data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, t("Failed to load user profile."))
    );
  }
};
