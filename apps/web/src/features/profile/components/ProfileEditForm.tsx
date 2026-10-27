import { useTranslation } from "../../../i18n/locale";
import { Lock, Sms, TickCircle } from "iconsax-reactjs";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import InputField from "../../../components/InputField";
import { useAuthStore } from "../../auth/store/authStore";
import { useUpdateProfile, useTelegramMagicLink, useProfileQuery } from "../hooks/useProfile";
import type { ProfileUpdateData } from "../types";

export const ProfileEditForm = () => {
  const t = useTranslation();
  const [isWaitingForTelegram, setIsWaitingForTelegram] = useState(false);
  const user = useAuthStore((state) => state.user);

  // Timeout for waiting state
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isWaitingForTelegram && !user?.telegram_connected) {
      timeoutId = setTimeout(() => {
        setIsWaitingForTelegram(false);
        toast.info(t("Telegram connection timed out. Please try again."));
      }, 60000); // 1 minute
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isWaitingForTelegram, user?.telegram_connected, t]);

  // Only poll if we are waiting and the user is NOT connected yet
  const shouldPoll = isWaitingForTelegram && !user?.telegram_connected;
  useProfileQuery(shouldPoll ? 3000 : false);

  const updateMutation = useUpdateProfile();
  const telegramMutation = useTelegramMagicLink();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty },
  } = useForm<ProfileUpdateData>({
    values: {
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      password: "",
      password_confirm: "",
      notify_via_email: user?.notify_via_email ?? true,
      notify_via_telegram: user?.notify_via_telegram ?? false,
      calendar_preference: user?.calendar_preference || "jalali",
    },
  });

  useEffect(() => {
    return () => {
      if (profileImagePreview?.startsWith("blob:")) URL.revokeObjectURL(profileImagePreview);
    };
  }, [profileImagePreview]);
  if (!user) {
    return (
      <div className="text-center text-error py-10">
        {t("Error loading profile information.")}
      </div>
    );
  }


  const handleProfileImageChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("Only JPG and PNG images are supported."));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("Profile image must be smaller than 5 MB."));
      return;
    }

    setProfileImage(file);
    setProfileImagePreview(URL.createObjectURL(file));
  };

  const onSubmit = (data: ProfileUpdateData) => {
    if (data.password || data.password_confirm) {
      if (data.password !== data.password_confirm) {
        toast.error(t("Passwords do not match."));
        return;
      }
      if (!data.password || data.password.length < 8) {
        toast.error(t("Password must be at least 8 characters."));
        return;
      }
    }

    const updateData: ProfileUpdateData = {};

    if (data.first_name !== user.first_name) {
      updateData.first_name = data.first_name;
    }
    if (data.last_name !== user.last_name) {
      updateData.last_name = data.last_name;
    }
    if (data.password && data.password_confirm) {
      updateData.password = data.password;
      updateData.password_confirm = data.password_confirm;
    }
    if (data.notify_via_email !== user.notify_via_email) {
      updateData.notify_via_email = data.notify_via_email;
    }
    if (data.notify_via_telegram !== user.notify_via_telegram) {
      updateData.notify_via_telegram = data.notify_via_telegram;
    }
    if (data.calendar_preference !== user.calendar_preference) {
      updateData.calendar_preference = data.calendar_preference;
    }
    if (profileImage) {
      updateData.avatar = profileImage;
    }

    if (Object.keys(updateData).length === 0) {
      toast.info(t("No changes to save."));
      return;
    }

    updateMutation.mutate(updateData, {
      onSuccess: () => {
        reset({
          first_name: data.first_name,
          last_name: data.last_name,
          password: "",
          password_confirm: "",
          notify_via_email: data.notify_via_email,
          notify_via_telegram: data.notify_via_telegram,
          calendar_preference: data.calendar_preference,
        });
        setProfileImage(null);
        setProfileImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  };

  const currentProfileImage =
    profileImagePreview || user.profile_image_url || "/images/heledone-mark.svg";



  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Column 1: Profile & Personal Info */}
        <div className="flex flex-col gap-6">

          {/* Profile Picture Card */}
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-6 flex flex-col items-center text-center">
            <h3 className="font-bold text-base-content self-start mb-4">{t("Profile Photo")}</h3>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 mb-4"
              aria-label={t("Change profile image")}
            >
              <div className="avatar">
                <div className="w-24 rounded-full bg-base-200 text-heledone-ink-muted flex items-center justify-center overflow-hidden">
                  {currentProfileImage !== "/images/heledone-mark.svg" ? (
                    <img src={currentProfileImage} alt={t("Profile")} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl font-black">{user.first_name?.[0] || ""}{user.last_name?.[0] || ""}</span>
                  )}
                </div>
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleProfileImageChange} className="hidden" />


            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-sm btn-outline rounded-lg bg-base-100 mb-4">
              {t("Update Photo")}</button>

            <h2 className="w-full text-start font-bold text-xl text-base-content">{user.first_name} {user.last_name}</h2>
            {user.is_staff && (
              <span className="badge badge-success bg-success/10 text-success border-success/20 gap-1 font-bold mt-2 py-3 px-3">
                {t("Staff Member")} <TickCircle size={14} variant="Bold" />
              </span>
            )}
          </div>

          {/* Personal Details Card */}
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-6">
            <h3 className="font-bold text-base-content mb-4">{t("Personal Information")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("First Name")}</label>
                <Controller
                  name="first_name"
                  control={control}
                  render={({ field }) => (
                    <InputField {...field} value={field.value || ""} placeholder={t("First name")} classNameInput="!bg-base-100 !h-10" />
                  )}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("Last Name")}</label>
                <Controller
                  name="last_name"
                  control={control}
                  render={({ field }) => (
                    <InputField {...field} value={field.value || ""} placeholder={t("Last name")} classNameInput="!bg-base-100 !h-10" />
                  )}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("Email Address")}</label>
                <InputField name="email" value={user.email} onChange={() => {}} placeholder={t("Email")} classNameInput="!bg-base-200/40 !border-transparent !cursor-not-allowed !text-heledone-ink-muted !h-10" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("Username")}</label>
                <InputField name="username" value={user.username} onChange={() => {}} placeholder={t("Username")} classNameInput="!bg-base-200/40 !border-transparent !cursor-not-allowed !text-heledone-ink-muted !h-10" />
              </div>
            </div>
          </div>

        </div>

        {/* Column 2: Security & Preferences */}
        <div className="flex flex-col gap-6">
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-6">
            <h3 className="font-bold text-base-content mb-4">{t("Account Security")}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("New Password")}</label>
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <InputField {...field} value={field.value || ""} type="password" placeholder="••••••••" classNameInput="!bg-base-100 !h-10" />
                  )}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("Confirm New Password")}</label>
                <Controller
                  name="password_confirm"
                  control={control}
                  render={({ field }) => (
                    <InputField {...field} value={field.value || ""} type="password" placeholder="••••••••" classNameInput="!bg-base-100 !h-10" />
                  )}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-1">{t("Password Strength")}</label>
                <div className="flex gap-1 h-1.5 mt-2">
                  <div className="flex-1 rounded-full bg-success"></div>
                  <div className="flex-1 rounded-full bg-success"></div>
                  <div className="flex-1 rounded-full bg-success"></div>
                  <div className="flex-1 rounded-full bg-base-200"></div>
                </div>
              </div>

              <div className="mt-6 bg-info/10 border-s-4 border-info rounded-r-lg p-4">
                <div className="flex gap-2">
                  <div className="text-info flex-shrink-0 mt-0.5"><Lock size={16} variant="Bold" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-base-content mb-1">{t("Security Tip")}</h4>
                    <p className="text-xs font-medium text-base-content/70">
                      {t("Enable Two-Factor Authentication (2FA) for enhanced account security. Go to security settings to set up.")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-base-100 rounded-xl border border-base-content/10 p-6">
            <h3 className="font-bold text-base-content mb-4">{t("Account Preferences")}</h3>
            <div className="space-y-6">

              <div>
                <label className="block text-xs font-semibold text-base-content/70 mb-2">{t("Calendar System")}</label>
                <Controller
                  name="calendar_preference"
                  control={control}
                  render={({ field }) => (
                    <select
                      className="select select-bordered select-sm h-10 w-full bg-base-100"
                      value={field.value || "jalali"}
                      onChange={(e) => {
                        field.onChange(e);
                        updateMutation.mutate({ calendar_preference: e.target.value as "gregorian" | "jalali" }, {
                          onSuccess: () => reset({ ...watch(), calendar_preference: e.target.value as "gregorian" | "jalali" })
                        });
                      }}
                    >
                      <option value="gregorian">{t("Gregorian Calendar")}</option>
                      <option value="jalali">{t("Jalali Calendar")}</option>
                    </select>
                  )}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-base-content">{t("Email Notifications")}</h4>
                  <p className="text-xs font-bold text-success mt-1">{watch("notify_via_email") ? t("Enabled") : t("Disabled")}</p>
                </div>
                <Controller
                  name="notify_via_email"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      className="toggle toggle-success"
                      checked={field.value}
                      onChange={(e) => {
                        field.onChange(e);
                        updateMutation.mutate({ notify_via_email: e.target.checked }, {
                          onSuccess: () => reset({ ...watch(), notify_via_email: e.target.checked })
                        });
                      }}
                    />
                  )}
                />
              </div>

              <div>
                <h4 className="text-sm font-semibold text-base-content mb-2">{t("Telegram Integration")}</h4>
                <div className="flex flex-col gap-2">
                  {user.telegram_connected ? (
                    <div className="flex items-center justify-center gap-2 w-full btn btn-sm h-10 btn-outline text-success border-success/30 hover:bg-success hover:text-success-content pointer-events-none">
                      <TickCircle size={18} variant="Bold" />  {t("Connected")}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => telegramMutation.mutate(undefined, { onSuccess: () => setIsWaitingForTelegram(true) })}
                      disabled={telegramMutation.isPending || isWaitingForTelegram}
                      className="btn btn-sm h-10 btn-outline border-base-content/20 bg-base-100 w-full flex items-center justify-center gap-2 text-info"
                    >
                      {telegramMutation.isPending || isWaitingForTelegram ? (
                        <span className="loading loading-spinner loading-xs"></span>
                      ) : (
                        <><Sms size={18} variant="Bold" />  {t("Connect Telegram")}</>
                      )}
                    </button>
                  )}
                  <p className="text-xs text-center text-heledone-ink-muted font-medium">
                    {user.telegram_connected ? t("Notifications active") : t("Not Connected")}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Save Action Bar */}
      <div className="flex items-center justify-between bg-base-100 border border-base-content/10 rounded-xl p-4 shadow-sm mt-4">
        <div className="text-sm font-bold ps-2">
          {isDirty || profileImage ? (
            <span className="flex items-center gap-2 text-warning">
              <div className="w-2 h-2 bg-warning rounded-full"></div>
              {t("Unsaved changes")}</span>
          ) : (
            <span className="flex items-center gap-2 text-heledone-ink-muted">
              <div className="w-2 h-2 bg-base-content/20 rounded-full"></div>
              {t("All changes saved")}</span>
          )}
        </div>
        <button
          type="submit"
          className="btn btn-neutral rounded-xl px-6 text-xs font-bold min-h-0 h-10"
          disabled={updateMutation.isPending || (!isDirty && !profileImage)}
        >
          {updateMutation.isPending ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            t("Save Changes")
          )}
        </button>
      </div>
    </form>
  );
};
