import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t } from "../../../i18n/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { loginRequest, logoutRequest, registerRequest } from "../api/authApi";
import { useAuthStore } from "../store/authStore";
import type {
  LoginFormData,
  RegisterFormData,
} from "../validation/authSchema";

export const useLogin = () => {
  const navigate = useNavigate();
  const setAuthData = useAuthStore((state) => state.setAuthData);

  return useMutation({
    mutationFn: (loginData: LoginFormData) => loginRequest(loginData),
    onSuccess: (data) => {
      if (data?.user) {
        setAuthData({ user: data.user });
        toast.success(t("خوش برگشتید؛ روز خوبی در پیش باشد!"));
        navigate("/", { replace: true });
      }
    },
    onError: (error: Error) => {
      toast.error(translateError(error.message));
    },
  });
};

export const useRegister = () => {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (registerData: RegisterFormData) =>
      registerRequest(registerData),
    onSuccess: () => {
      toast.success(t("حساب شما ساخته شد؛ اکنون وارد شوید."));
      navigate("/login", { replace: true });
    },
    onError: (error: Error) => {
      toast.error(translateError(error.message));
    },
  });
};

export const useLogout = () => {
  const navigate = useNavigate();
  const logoutAction = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();

  return async () => {
    try {
      await logoutRequest();
    } catch {
      // Always clear local state if the server cannot be reached.
    }
    logoutAction();
    import("../../tasks/store/useTaskStore").then(module => {
      module.useTaskStore.getState().reset();
    });
    queryClient.clear();
    toast.info(t("از حساب خارج شدید."));
    navigate("/login");
  };
};

export const useRefreshProfile = () => {
  const updateUser = useAuthStore((state) => state.updateUser);

  return useMutation({
    mutationFn: () => import("../api/authApi").then(m => m.getProfileRequest()),
    onSuccess: (userProfile) => {
      if (userProfile) {
        updateUser(userProfile);
      }
    },
  });
};
