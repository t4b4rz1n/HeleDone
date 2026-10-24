import { useTranslation } from "../../../i18n/locale";
import { AnimatePresence, motion } from "motion/react";
import { Add } from "iconsax-reactjs";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pagination } from "../../../components/Pagination";
import { ViewSwitcher } from "../../../components/ViewSwitcher";
// import { useAuthStore } from "../../auth/store/authStore";
import { CreateEditUserModal } from "../components/CreateEditUserModal";
import { UsersGrid } from "../components/UsersGrid";
import { UsersTable } from "../components/UsersTable";
import { UsersToolbar } from "../components/UsersToolbar";
import { useUsers } from "../hooks/useUsers";
import type { User } from "../types";
import { usePermissions } from "../../auth/hooks/usePermissions";

type ViewMode = "grid" | "table";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function UsersListPage() {
  const t = useTranslation();
  const { hasAnyPermission } = usePermissions();

  const canManageUsers = hasAnyPermission(["org.manage_members", "org.manage_settings"]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [modalState, setModalState] = useState<{
    open: boolean;
    user: User | null;
  }>({ open: false, user: null });

  // Default to grid view, but check params
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const {
    data: usersResponse,
    isLoading,
    isFetching,
    isError,
  } = useUsers(searchParams);
  const showLoading = isLoading || isFetching;

  const updateSearchParams = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
        if (key !== "page") {
          newParams.set("page", "1");
        }
        return newParams;
      });
    },
    [setSearchParams],
  );

  const handleFilter = useCallback(
    (filters: Record<string, string>) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.delete("is_active");
        newParams.delete("role_id");
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            newParams.set(key, value);
          }
        });

        newParams.set("page", "1");
        return newParams;
      });
    },
    [setSearchParams],
  );

  const handleSort = useCallback(
    (sortKey: string) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        newParams.set("ordering", sortKey);
        newParams.set("page", "1");
        return newParams;
      });
    },
    [setSearchParams],
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        if (query) {
          newParams.set("search", query);
        } else {
          newParams.delete("search");
        }
        newParams.set("page", "1");
        return newParams;
      });
    },
    [setSearchParams],
  );

  const currentPage = usersResponse?.current_page || 1;
  const pageSize = Number(searchParams.get("page_size")) || 10;
  const totalPages = usersResponse?.total_pages || 1;
  const totalResults = usersResponse?.total_results || 0;

  const handlePageChange = useCallback(
    (page: number) => updateSearchParams("page", page.toString()),
    [updateSearchParams],
  );

  const handlePageSizeChange = useCallback(
    (size: number) => updateSearchParams("page_size", size.toString()),
    [updateSearchParams],
  );

  const handleCreateUser = () => {
    setModalState({ open: true, user: null });
  };

  const handleEditUser = (user: User) => {
    setModalState({ open: true, user });
  };

  const handleCloseModal = () => {
    setModalState({ open: false, user: null });
  };

  const users = useMemo(
    () => usersResponse?.results || [],
    [usersResponse?.results],
  );
  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="heledone-page-content min-h-[calc(100dvh-121px)] flex flex-col"
      >
        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="heledone-page-heading flex flex-col md:flex-row md:justify-between md:items-start gap-4"
        >
          <div>
            <span className="text-[13px] font-semibold tracking-wider text-primary uppercase">{t("DIRECTORY")}</span>
            <h1 className="text-2xl font-bold tracking-tight text-base-content">{t("Team & Access Directory")}</h1>
            <p className="text-xs text-heledone-ink-muted mt-1">{t("Manage users, organizational assignments, and permission roles across workspaces.")}</p>
          </div>
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <ViewSwitcher
              viewMode={viewMode}
              setViewMode={setViewMode}
              className="w-full sm:w-auto bg-base-200/40 backdrop-blur-md border border-base-content/8 rounded-xl"
            />
            {canManageUsers && (
              <button
                onClick={handleCreateUser}
                className="btn btn-primary btn-sm md:btn-md rounded-xl gap-2 font-medium shadow-sm hover:shadow-md transition-transform duration-100 active:scale-95"
              >
                <Add size={20} />
                <span>{t("Create User")}</span>
              </button>
            )}
          </div>
        </motion.div>

        {/* Toolbar */}
        <motion.div variants={itemVariants} className="relative z-10 mt-6">
          <UsersToolbar
            onSearch={handleSearch}
            onSortChange={handleSort}
            onFilterChange={handleFilter}
          />
        </motion.div>

        {/* Content */}
        <motion.div variants={itemVariants} className="grow mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={viewMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {viewMode === "table" ? (
                <UsersTable
                  users={users}
                  isLoading={showLoading}
                  isError={isError}
                  onEdit={handleEditUser}
                  canManage={canManageUsers}
                />
              ) : (
                <UsersGrid
                  users={users}
                  isLoading={showLoading}
                  isError={isError}
                  onEdit={handleEditUser}
                  canManage={canManageUsers}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Pagination */}
        <motion.div variants={itemVariants} className="mt-auto pt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalCount={totalResults}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </motion.div>
      </motion.div>

      {/* Create/Edit Modal */}
      <CreateEditUserModal
        isOpen={canManageUsers && modalState.open}
        onClose={handleCloseModal}
        user={modalState.user}
      />
    </>
  );
}
