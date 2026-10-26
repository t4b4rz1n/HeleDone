import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { AUTH_STORAGE_KEY } from "../../../core/config/constants";
import type { User } from "../types/authTypes";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  setAuthData: (data: { user: User }) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
  setLoading: (isLoading: boolean) => void;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setAuthData: (data) => {
        set({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      updateUser: (userData) => {
        const currentUser = get().user;
        if (!currentUser) return;

        set(() => ({
          user: { ...currentUser, ...userData } as User,
        }));
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      version: 1,
      migrate: (persistedState) => {
        const persisted = persistedState as Partial<AuthState> | undefined;
        return {
          user: persisted?.user ?? null,
          isAuthenticated: persisted?.isAuthenticated ?? false,
          isLoading: false,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setLoading(false);
      },
    }
  )
);
