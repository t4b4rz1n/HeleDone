import { getErrorMessage as translateError } from "../../../core/utils/errorHandler";
import { t as translate, useTranslation } from "../../../i18n/locale";
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CloseCircle,
  User,
  AddCircle,
  SearchNormal1,
  TickCircle,
  Lock,
  Sms,
  Profile2User,
  Shield,
  DollarCircle,
} from "iconsax-reactjs";
import { createPortal } from "react-dom";
import { z } from "zod";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCreateUser, useUnassignedUsers } from "../../users/hooks/useUsers";
import { useRoles } from "../../roles/hooks/useRoles";
import { addExistingMember } from "../api/organizationsApi";

export interface CreateOrgMemberModalProps {
  orgId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newUserId?: string) => void;
  initialTab?: "add_existing" | "create_new";
}

type MemberTab = "add_existing" | "create_new";

const createOrgMemberSchema = z.object({
  username: z.string().min(1, translate("Username required")),
  email: z.string().email(translate("Invalid email")),
  password: z.string().min(6, translate("Password too short")),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role_id: z.string().nullable().optional(),
  salary_type: z.enum(["monthly", "hourly"]).nullable().optional(),
  salary_amount: z.string().optional().nullable(),
});

type OrgMemberFormData = z.infer<typeof createOrgMemberSchema>;


export const CreateOrgMemberModal = ({
  orgId,
  isOpen,
  onClose,
  onSuccess,
  initialTab = "add_existing",
}: CreateOrgMemberModalProps) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MemberTab>(initialTab);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedSalaryType, setSelectedSalaryType] = useState<"monthly" | "hourly" | "">("");
  const [selectedSalaryAmount, setSelectedSalaryAmount] = useState<string>("");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync activeTab when modal opens
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createMutation = useCreateUser();
  const { data: unassignedUsers = [], isLoading: isLoadingUsers } = useUnassignedUsers();
  const { data: rolesData } = useRoles(orgId ? { organization_id: orgId } : undefined);
  const roles = rolesData?.results ?? [];

  const addExistingMutation = useMutation({
    mutationFn: (data: { user_id: string; role_id?: string | null; salary_type?: "monthly" | "hourly" | null; salary_amount?: string | null }) =>
      addExistingMember(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-members", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization-members"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["users", "unassigned"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      toast.success(t("Member added successfully"));
      handleClose();
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        toast.error(t("User is already a member of this organization"));
        return;
      }
      toast.error(translateError(error?.response?.data?.message || "Failed to add member"));
    },
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OrgMemberFormData>({
    resolver: zodResolver(createOrgMemberSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      first_name: "",
      last_name: "",
      role_id: null,
      salary_type: null,
      salary_amount: null,
    },
  });

  const resetForm = () => {
    reset({
      username: "",
      email: "",
      password: "",
      first_name: "",
      last_name: "",
      role_id: null,
      salary_type: null,
      salary_amount: null,
    });
    setSelectedUserId("");
    setSelectedRoleId("");
    setSelectedSalaryType("");
    setSelectedSalaryAmount("");
    setUserSearch("");
    setIsUserDropdownOpen(false);
  };


  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleTabChange = (tab: MemberTab) => {
    setActiveTab(tab);
    resetForm();
  };

  const filteredUsers = (unassignedUsers as any[]).filter((u: any) => {
    const q = userSearch.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.first_name || "").toLowerCase().includes(q) ||
      (u.last_name || "").toLowerCase().includes(q)
    );
  });

  const handleAddExistingSubmit = () => {
    if (!selectedUserId) {
      toast.error(t("Please select a user"));
      return;
    }
    if (!selectedRoleId) {
      toast.error(t("Please select a role"));
      return;
    }
    addExistingMutation.mutate({
      user_id: selectedUserId,
      role_id: selectedRoleId,
      salary_type: selectedSalaryType || null,
      salary_amount: selectedSalaryAmount || null,
    });
  };

  const onSubmit = handleSubmit((data) => {
    const payload = {
      username: data.username,
      email: data.email,
      password: data.password,
      first_name: data.first_name ?? "",
      last_name: data.last_name ?? "",
      is_active: true,
      is_staff: false,
      role_id: data.role_id ?? null,
      organization_id: orgId,
      salary_type: data.salary_type ?? null,
      salary_amount: data.salary_amount ?? null,
    };
    createMutation.mutate(payload, {
      onSuccess: (response: any) => {
        queryClient.invalidateQueries({ queryKey: ["organizations"] });
        queryClient.invalidateQueries({ queryKey: ["organizations", orgId] });
        queryClient.invalidateQueries({ queryKey: ["organization-members", orgId] });
        resetForm();
        if (onSuccess) {
          const newUserId = response?.data?.id ? String(response.data.id) : undefined;
          onSuccess(newUserId);
        } else {
          onClose();
        }
      },
    });
  });


  const isLoading = createMutation.isPending || addExistingMutation.isPending;

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
          onMouseDown={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md overflow-hidden rounded-3xl border border-base-content/10 bg-base-100 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-primary/90 to-primary text-primary-content">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-2xl bg-white/20 backdrop-blur-xs">
                  {activeTab === "add_existing" ? <User size={18} /> : <AddCircle size={18} />}
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">
                    {activeTab === "add_existing" ? t("Add Existing User") : t("Create New User")}
                  </h3>
                  <p className="text-[13px] text-primary-content/80 font-medium">
                    {activeTab === "add_existing"
                      ? t("Add an unassigned user to this organization")
                      : t("Create a new account and add to organization")}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="rounded-xl p-1.5 text-primary-content/80 hover:bg-white/20 hover:text-primary-content transition duration-150"
              >
                <CloseCircle size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1 rounded-none border-b border-base-content/8 bg-base-200/50 p-1.5">
              <button
                type="button"
                onClick={() => handleTabChange("add_existing")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                  activeTab === "add_existing"
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-heledone-ink-muted hover:text-base-content"
                }`}
              >
                <User size={14} />  {t("Add Existing")}</button>
              <button
                type="button"
                onClick={() => handleTabChange("create_new")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition-all ${
                  activeTab === "create_new"
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-heledone-ink-muted hover:text-base-content"
                }`}
              >
                <AddCircle size={14} />  {t("Create New")}</button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs max-h-[70dvh] overflow-y-auto">
              {activeTab === "add_existing" ? (
                <>
                  {/* User search dropdown */}
                  <div ref={dropdownRef} className="relative">
                    <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                      {t("Select User")} <span className="text-error">*</span>
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted">
                        <SearchNormal1 size={15} />
                      </div>
                      <input
                        type="text"

                        placeholder={t("Search by name, username or email...")}
                        value={userSearch}
                        onFocus={() => setIsUserDropdownOpen(true)}
                        onChange={(e) => {
                          setUserSearch(e.target.value);
                          setIsUserDropdownOpen(true);
                          setSelectedUserId("");
                        }}
                        className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 ps-9 pe-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                      />
                    </div>
                    {isUserDropdownOpen && (
                      <div className="absolute z-50 start-0 end-0 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-base-content/10 bg-base-100 p-1.5 shadow-xl backdrop-blur-md animate-in fade-in duration-100 space-y-0.5">
                        {isLoadingUsers ? (
                          <div className="p-3 text-center text-xs text-heledone-ink-muted">{t("Loading users...")}</div>
                        ) : filteredUsers.length === 0 ? (
                          <div className="p-3 text-center text-xs text-heledone-ink-muted">{t("No unassigned users found")}</div>
                        ) : (
                          filteredUsers.map((u: any) => {
                            const displayName =
                              `${u.first_name || ""} ${u.last_name || ""}`.trim() ||
                              u.username ||
                              u.email;
                            const isSelected = selectedUserId === String(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                  setSelectedUserId(String(u.id));
                                  setUserSearch(displayName);
                                  setIsUserDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-start transition-all ${
                                  isSelected
                                    ? "bg-primary/10 text-primary font-bold"
                                    : "hover:bg-base-200/60 text-base-content font-medium"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary text-[13px] font-bold shrink-0">
                                    {displayName[0]?.toUpperCase() || "U"}
                                  </div>
                                  <div className="min-w-0">
                                    <p  className="truncate text-xs font-bold">{displayName}</p>
                                    {u.email && (
                                      <p className="truncate text-[13px] text-heledone-ink-muted">{u.email}</p>
                                    )}
                                  </div>
                                </div>
                                {isSelected && <TickCircle size={15} className="shrink-0 text-primary" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Role selector */}
                  <div>
                    <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                      <Shield size={11} className="inline me-1" />
                      {t("Assign Role")} <span className="text-error">*</span>
                    </label>
                    <select
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
                    >
                      <option value="" disabled>{t("Select a role")}</option>
                      {roles.map((r: any) => (
                        <option key={r.id} value={String(r.id)}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Salary fields */}
                  <div>
                    <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                      <DollarCircle size={11} className="inline me-1" />
                      {t("Salary (Optional)")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={selectedSalaryType}
                        onChange={(e) => setSelectedSalaryType(e.target.value as "monthly" | "hourly" | "")}
                        className="h-10 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
                      >
                        <option value="">{t("No salary")}</option>
                        <option value="monthly">{t("ماهانه")}</option>
                        <option value="hourly">{t("ساعتی")}</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={selectedSalaryAmount}
                        onChange={(e) => setSelectedSalaryAmount(e.target.value)}
                        placeholder={t("مبلغ")}
                        disabled={!selectedSalaryType}
                        className="h-10 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted disabled:opacity-40"
                      />
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-base-content/8">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isLoading}
                      className="h-9 px-4 rounded-xl border border-base-content/10 text-xs font-bold text-base-content/70 hover:bg-base-200 transition-all"
                    >
                      {t("انصراف")}</button>
                    <button
                      type="button"
                      onClick={handleAddExistingSubmit}
                      disabled={isLoading || !selectedUserId}
                      className="h-9 px-5 rounded-xl bg-primary text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/95 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isLoading ? t("Adding…") : t("Add Member")}
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={onSubmit} className="space-y-3">
                  {/* Username */}
                  <Controller
                    name="username"
                    control={control}
                    render={({ field }) => (
                      <div>
                        <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                          {t("Username")} <span className="text-error">*</span>
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted">
                            <User size={14} />
                          </div>
                          <input
                            {...field}
                            value={field.value ?? ""}
                            placeholder={t("Enter username")}
                            className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 ps-9 pe-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                          />
                        </div>
                        {errors.username && (
                          <p className="text-error text-[13px] mt-1 font-medium">{errors.username.message}</p>
                        )}
                      </div>
                    )}
                  />

                  {/* Email */}
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <div>
                        <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                          {t("Email")} <span className="text-error">*</span>
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted">
                            <Sms size={14} />
                          </div>
                          <input
                            {...field}
                            value={field.value ?? ""}
                            type="email"
                            placeholder={t("Enter email address")}
                            className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 ps-9 pe-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                          />
                        </div>
                        {errors.email && (
                          <p className="text-error text-[13px] mt-1 font-medium">{errors.email.message}</p>
                        )}
                      </div>
                    )}
                  />

                  {/* Password */}
                  <Controller
                    name="password"
                    control={control}
                    render={({ field }) => (
                      <div>
                        <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                          {t("Password")} <span className="text-error">*</span>
                        </label>
                        <div className="relative">
                          <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted">
                            <Lock size={14} />
                          </div>
                          <input
                            {...field}
                            value={field.value ?? ""}
                            type="password"
                            placeholder={t("Min. 6 characters")}
                            className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 ps-9 pe-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                          />
                        </div>
                        {errors.password && (
                          <p className="text-error text-[13px] mt-1 font-medium">{errors.password.message}</p>
                        )}
                      </div>
                    )}
                  />

                  {/* First & Last name ΓÇö two columns */}
                  <div className="grid grid-cols-2 gap-3">
                    <Controller
                      name="first_name"
                      control={control}
                      render={({ field }) => (
                        <div>
                          <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                            {t("First name")}</label>
                          <div className="relative">
                            <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted">
                              <Profile2User size={13} />
                            </div>
                            <input
                              {...field}
                              value={field.value ?? ""}
                              placeholder={t("First")}
                              className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 ps-8 pe-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                            />
                          </div>
                        </div>
                      )}
                    />
                    <Controller
                      name="last_name"
                      control={control}
                      render={({ field }) => (
                        <div>
                          <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                            {t("Last name")}</label>
                          <div className="relative">
                            <div className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted">
                              <Profile2User size={13} />
                            </div>
                            <input
                              {...field}
                              value={field.value ?? ""}
                              placeholder={t("Last")}
                              className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 ps-8 pe-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                            />
                          </div>
                        </div>
                      )}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                      <Shield size={11} className="inline me-1" />
                      {t("Role")}</label>
                    <select
                      {...control.register("role_id")}
                      className="w-full h-10 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
                    >
                      <option value="" disabled>{t("Select a role")}</option>
                      {roles.map((r: any) => (
                        <option key={r.id} value={String(r.id)}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Salary */}
                  <div>
                    <label className="block font-bold text-heledone-ink-muted mb-1 uppercase tracking-wider text-[13px]">
                      <DollarCircle size={11} className="inline me-1" />
                      {t("Salary (Optional)")}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Controller
                        name="salary_type"
                        control={control}
                        render={({ field }) => (
                          <select
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                            className="h-10 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all"
                          >
                            <option value="">{t("No salary")}</option>
                            <option value="monthly">{t("ماهانه")}</option>
                            <option value="hourly">{t("ساعتی")}</option>
                          </select>
                        )}
                      />
                      <Controller
                        name="salary_amount"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value || null)}
                            placeholder={t("مبلغ")}
                            className="h-10 rounded-xl border border-base-content/10 bg-base-200/50 px-3 font-semibold text-base-content outline-none focus:border-primary/40 focus:bg-base-100 transition-all placeholder:text-heledone-ink-muted"
                          />
                        )}
                      />
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-base-content/8">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isLoading}
                      className="h-9 px-4 rounded-xl border border-base-content/10 text-xs font-bold text-base-content/70 hover:bg-base-200 transition-all"
                    >
                      {t("انصراف")}</button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="h-9 px-5 rounded-xl bg-primary text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/95 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isLoading ? t("Creating…") : t("Create User")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
