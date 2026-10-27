import { useTranslation } from "../../../i18n/locale";
import { AnimatePresence, motion } from "motion/react";
import { Add, DiscountShape } from "iconsax-reactjs";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pagination } from "../../../components/Pagination";
import { ViewSwitcher } from "../../../components/ViewSwitcher";
import { useAuthStore } from "../../auth/store/authStore";
import { CreateEditDiscountModal } from "../components/CreateEditDiscountModal";
import { DiscountsGrid } from "../components/DiscountsGrid";
import { DiscountsTable } from "../components/DiscountsTable";
import { DiscountsToolbar } from "../components/DiscountsToolbar";
import { useDiscounts } from "../hooks/useDiscounts";
import type { Discount } from "../types";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

type ViewMode = "grid" | "table";

const DiscountsListPage = () => {
  const t = useTranslation();
  const canManageDiscounts = useAuthStore((state) => state.user?.is_superuser === true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalState, setModalState] = useState<{
    open: boolean;
    discount?: Discount | null;
  }>({
    open: false,
    discount: null,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const {
    data: discountsResponse,
    isLoading,
    isFetching,
    isError,
  } = useDiscounts(searchParams);
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
    [setSearchParams]
  );

  const handlePageChange = (page: number) => {
    updateSearchParams("page", String(page));
  };
  const handlePageSizeChange = (size: number) => {
    updateSearchParams("page_size", String(size));
  };
  const handleSearch = useCallback(
    (query: string) => updateSearchParams("search", query),
    [updateSearchParams]
  );
  const handleSort = useCallback(
    (sortKey: string) => updateSearchParams("ordering", sortKey),
    [updateSearchParams]
  );
  const handleFilter = useCallback(
    (filters: Record<string, string>) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        Object.entries(filters).forEach(([key, value]) => {
          if (value) {
            newParams.set(key, value);
          } else {
            newParams.delete(key);
          }
        });
        newParams.set("page", "1");
        return newParams;
      });
    },
    [setSearchParams]
  );

  const openCreateModal = () => setModalState({ open: true, discount: null });
  const openEditModal = (discount: Discount) =>
    setModalState({ open: true, discount });
  const closeModal = () => setModalState({ open: false, discount: null });

  const currentPage = discountsResponse?.current_page || 1;
  const pageSize = Number(searchParams.get("page_size")) || 10;

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="heledone-page-content min-h-[calc(100dvh-121px)] flex flex-col"
      >
        <motion.div
          variants={itemVariants}
          className="heledone-page-heading flex flex-col md:flex-row md:justify-between md:items-start gap-4"
        >
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DiscountShape size={28} />  {t("Discount Management")}</h1>
            <p className="text-base-content/70 mt-1">{t("Manage discount codes.")}</p>
          </div>
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <ViewSwitcher
              viewMode={viewMode}
              setViewMode={setViewMode}
              className="w-full sm:w-auto"
            />
            {canManageDiscounts && (
              <button
                className="btn btn-primary rounded-xl"
                onClick={openCreateModal}
              >
                <Add />
                <span>{t("Create Discount")}</span>
              </button>
            )}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-6">
          <DiscountsToolbar
            onSearch={handleSearch}
            onSortChange={handleSort}
            onFilterChange={handleFilter}
          />
        </motion.div>

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
                <DiscountsTable
                  discounts={discountsResponse?.results || []}
                  isLoading={showLoading}
                  isError={isError}
                  onEdit={openEditModal}
                  canManage={canManageDiscounts}
                />
              ) : (
                <DiscountsGrid
                  discounts={discountsResponse?.results || []}
                  isLoading={showLoading}
                  isError={isError}
                  onEdit={openEditModal}
                  canManage={canManageDiscounts}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-auto pt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={discountsResponse?.total_pages || 1}
            totalCount={discountsResponse?.total_results || 0}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </motion.div>
      </motion.div>

      <CreateEditDiscountModal
        isOpen={canManageDiscounts && modalState.open}
        onClose={closeModal}
        discount={modalState.discount}
      />
    </>
  );
};

export default DiscountsListPage;
