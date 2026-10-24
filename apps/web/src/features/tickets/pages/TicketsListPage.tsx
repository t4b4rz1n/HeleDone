import { useTranslation } from "../../../i18n/locale";
import { motion, AnimatePresence } from "motion/react";
import {
  Add,
  Messages,
  Category,
  CloseCircle,
  Edit,
  Trash,
  SearchNormal1,
  ArrowUp2,
  ArrowDown2,
  Sort,
} from "iconsax-reactjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pagination } from "../../../components/Pagination";
import { CreateTicketModal } from "../components/CreateTicketModal";
import { TicketsTable } from "../components/TicketsTable";
import { TicketsToolbar } from "../components/TicketsToolbar";
import {
  useTickets,
  useTicketTypes,
  useCreateTicketType,
  useUpdateTicketType,
  useDeleteTicketType,
} from "../hooks/useTickets";
import { ConfirmationModal } from "../../../components/ConfirmationModal";
import InputField from "../../../components/InputField";
import { formatDate } from "../../../utils/formatDate";
import { useDebounce } from "../../../hooks/useDebounce";
import type { TicketTypeItem } from "../types";
import { usePermissions } from "../../auth/hooks/usePermissions";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
const modalVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 30, scale: 0.98 },
};

type TabId = "tickets" | "categories";

export default function TicketsListPage() {
  const t = useTranslation();
  const { hasAnyPermission, isStaff } = usePermissions();
  const isManager = isStaff || hasAnyPermission(["org.manage_members", "org.manage_settings"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>("tickets");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!isManager && activeTab !== "tickets") {
      setActiveTab("tickets");
    }
  }, [activeTab, isManager]);

  // ── Tickets state ──────────────────────────────────────────────────────────
  const {
    data: ticketsResponse,
    isLoading,
    isError,
    isFetching,
  } = useTickets(searchParams);

  const updateSearchParams = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        if (value) newParams.set(key, value);
        else newParams.delete(key);
        if (key !== "page") newParams.set("page", "1");
        return newParams;
      });
    },
    [setSearchParams],
  );

  const handleSearch = useCallback(
    (q: string) => updateSearchParams("search", q),
    [updateSearchParams],
  );
  const handleSort = useCallback(
    (k: string) => updateSearchParams("ordering", k),
    [updateSearchParams],
  );
  const handleFilter = useCallback(
    (filters: Record<string, string>) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);
        Object.entries(filters).forEach(([k, v]) => {
          if (v) newParams.set(k, v);
          else newParams.delete(k);
        });
        newParams.set("page", "1");
        return newParams;
      });
    },
    [setSearchParams],
  );

  const currentPage = ticketsResponse?.current_page || 1;
  const pageSize = Number(searchParams.get("page_size")) || 10;
  const totalPages = ticketsResponse?.total_pages || 1;
  const totalResults = ticketsResponse?.total_results || 0;
  const handlePageChange = useCallback(
    (p: number) => updateSearchParams("page", p.toString()),
    [updateSearchParams],
  );
  const handlePageSizeChange = useCallback(
    (s: number) => updateSearchParams("page_size", s.toString()),
    [updateSearchParams],
  );
  const tickets = useMemo(
    () => ticketsResponse?.results || [],
    [ticketsResponse?.results],
  );

  // ── Categories state ───────────────────────────────────────────────────────
  const [catSearch, setCatSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: "name";
    dir: "asc" | "desc";
  }>({ key: "name", dir: "asc" });
  const debouncedCatSearch = useDebounce(catSearch, 500);

  const [catApiParams, setCatApiParams] = useState(
    () => new URLSearchParams({ ordering: "name" }),
  );

  const updateCatSearchRef = useRef((query: string) => {
    setCatApiParams((prev) => {
      const p = new URLSearchParams(prev);
      if (query) p.set("search", query);
      else p.delete("search");
      p.set("page", "1");
      return p;
    });
  });

  useEffect(() => {
    updateCatSearchRef.current(debouncedCatSearch);
  }, [debouncedCatSearch]);

  useEffect(() => {
    setCatApiParams((prev) => {
      const p = new URLSearchParams(prev);
      const prefix = sortConfig.dir === "desc" ? "-" : "";
      p.set("ordering", `${prefix}${sortConfig.key}`);
      return p;
    });
  }, [sortConfig]);

  const {
    data: ticketTypesResponse,
    isLoading: catLoading,
    isError: catError,
  } = useTicketTypes(catApiParams);
  const createMutation = useCreateTicketType();
  const updateMutation = useUpdateTicketType();
  const deleteMutation = useDeleteTicketType();

  const catCurrentPage = ticketTypesResponse?.current_page || 1;
  const catPageSize = 10;
  const catTotalPages = ticketTypesResponse?.total_pages || 1;
  const catTotalResults = ticketTypesResponse?.total_results || 0;
  const handleCatPageChange = useCallback((p: number) => {
    setCatApiParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set("page", p.toString());
      return n;
    });
  }, []);
  const handleCatPageSizeChange = useCallback((s: number) => {
    setCatApiParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set("page_size", s.toString());
      return n;
    });
  }, []);

  const ticketTypes = useMemo(
    () => ticketTypesResponse?.results || [],
    [ticketTypesResponse?.results],
  );

  const [modalState, setModalState] = useState<{
    open: boolean;
    item: TicketTypeItem | null;
    name: string;
  }>({
    open: false,
    item: null,
    name: "",
  });
  const [deleteModalState, setDeleteModalState] = useState<{
    open: boolean;
    item: TicketTypeItem | null;
  }>({
    open: false,
    item: null,
  });
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!isManager) return;
    if (!modalState.name.trim()) return;
    if (modalState.item) {
      updateMutation.mutate(
        { id: modalState.item.id, name: modalState.name },
        {
          onSuccess: () => setModalState({ open: false, item: null, name: "" }),
        },
      );
    } else {
      createMutation.mutate(modalState.name, {
        onSuccess: () => setModalState({ open: false, item: null, name: "" }),
      });
    }
  };

  const handleDelete = () => {
    if (!isManager) return;
    if (deleteModalState.item) {
      deleteMutation.mutate(deleteModalState.item.id, {
        onSuccess: () => setDeleteModalState({ open: false, item: null }),
      });
    }
  };

  const tabs: {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
      {
        id: "tickets",
        label: t("درخواست‌ها"),
        icon: <Messages size={16} />,
        count: totalResults || undefined,
      },
      ...(isManager
        ? [
          {
            id: "categories" as const,
            label: t("Categories"),
            icon: <Category size={16} />,
            count: catTotalResults || undefined,
          },
        ]
        : []),
    ];

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
          className="heledone-page-heading flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
        >
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-base-content sm:text-3xl">
                {activeTab === "tickets" ? t("درخواست‌ها") : t("Categories")}
              </h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                {activeTab === "tickets" ? totalResults : catTotalResults}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-heledone-ink-muted">
              {activeTab === "tickets"
                ? isManager
                  ? t("Manage and respond to support tickets submitted by users.")
                  : t("View and follow up on your support tickets.")
                : t("Manage ticket types and departments.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "tickets" ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/90 transition-all"
              >
                <Add size={16} />
                <span>{t("Create Ticket")}</span>
              </button>
            ) : isManager ? (
              <button
                type="button"
                onClick={() => setModalState({ open: true, item: null, name: "" })}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-content shadow-md shadow-primary/15 hover:bg-primary/90 transition-all"
              >
                <Add size={16} />
                <span>{t("Create Category")}</span>
              </button>
            ) : null}
          </div>
        </motion.div>

        {/* Tabs */}
        {isManager && (
          <motion.div variants={itemVariants} className="mt-4">
            <div className="flex gap-1 p-1 bg-base-100 border border-base-content/8 rounded-xl w-fit">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab.id
                      ? "bg-primary text-primary-content shadow-xs"
                      : "text-heledone-ink-muted hover:bg-base-200 hover:text-base-content"
                    }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}


        {/* ── Tab Content ────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === "tickets" ? (
            <motion.div
              key="tickets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 mt-5 gap-5"
            >
              <TicketsToolbar
                onSearch={handleSearch}
                onSortChange={handleSort}
                onFilterChange={handleFilter}
              />

              <div className="grow relative min-h-[200px]">
                {isFetching && !isLoading && (
                  <div className="absolute inset-0 bg-base-100/40 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-2xl border border-primary/10">
                    <span className="loading loading-spinner loading-lg text-primary" />
                  </div>
                )}
                <TicketsTable
                  tickets={tickets}
                  isLoading={isLoading}
                  isError={isError}
                />
              </div>

              <div className="mt-auto pt-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalCount={totalResults}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="categories"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 mt-5 gap-5"
            >
              {/* Category Toolbar */}
              <div className="flex flex-col md:flex-row items-center gap-3 w-full p-2 bg-linear-to-r from-base-100 to-base-200/40">
                <div className="grow w-full">
                  <InputField
                    name="cat-search"
                    placeholder={t("Search categories...")}
                    icon={<SearchNormal1 size={18} />}
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    classNameInput="!bg-transparent !shadow-none"
                  />
                </div>
                <div className="flex items-center gap-1 border border-base-content/10 rounded-xl p-1 bg-base-100/50">
                  <button className="btn btn-ghost rounded-xl hover:bg-primary/10 hover:text-primary border-none flex items-center gap-1.5 h-[42px] min-h-[42px] px-3">
                    <Sort size={18} />
                    <span className="font-semibold mx-1 whitespace-nowrap text-sm">
                      {t("Category Name")}</span>
                  </button>
                  <button
                    onClick={() =>
                      setSortConfig((prev) => ({
                        ...prev,
                        dir: prev.dir === "asc" ? "desc" : "asc",
                      }))
                    }
                    className="btn btn-ghost rounded-xl hover:bg-primary/10 hover:text-primary border-none btn-circle w-[42px] h-[42px] min-h-[42px] flex items-center justify-center"
                  >
                    {sortConfig.dir === "asc" ? (
                      <ArrowUp2 size={18} />
                    ) : (
                      <ArrowDown2 size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* Category Table */}
              <div className="grow">
                {catLoading ? (
                  <div className="bg-base-100 rounded-2xl border border-base-content/10 overflow-hidden">
                    <div className="p-6">
                      <div className="animate-pulse space-y-4">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="h-16 bg-base-content/10 rounded-xl"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : catError ? (
                  <div className="bg-linear-to-br from-error/5 to-error/10 rounded-2xl border border-error/20 p-12 text-center">
                    <div className="text-error mb-4">
                      <CloseCircle className="w-16 h-16 mx-auto" />
                    </div>
                    <h3 className="text-lg font-bold text-error mb-2">
                      {t("Error Loading Data")}</h3>
                    <p className="text-error">
                      {t("There was a problem loading categories")}</p>
                  </div>
                ) : ticketTypes.length === 0 ? (
                  <div className="bg-linear-to-br from-base-200 to-base-300 rounded-2xl border border-base-content/10 p-12 text-center">
                    <div className="text-heledone-ink-muted mb-4">
                      <Category className="w-16 h-16 mx-auto text-heledone-ink-muted" />
                    </div>
                    <h3 className="text-lg font-bold text-base-content mb-2">
                      {t("No categories defined")}</h3>
                    <p className="text-base-content/70">
                      {t("Add the first category to get started.")}</p>
                  </div>
                ) : (
                  <div className="bg-base-100 rounded-2xl border border-base-content/10 overflow-hidden">
                    <div className="w-full overflow-x-auto">
                      <table className="w-full min-w-[650px]">
                      <thead className="bg-linear-to-r from-primary/10 to-primary/5 border-b border-base-content/10">
                        <tr>
                          <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                            {t("Category")}</th>
                          <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                            {t("Created At")}</th>
                          {isManager && (
                            <th className="px-6 py-4 text-start text-sm font-bold text-base-content whitespace-nowrap">
                              {t("Actions")}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-base-content/5">
                        {ticketTypes.map((item, idx) => (
                          <motion.tr
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: idx * 0.05 }}
                            className="hover:bg-base-200 transition-all duration-200 group"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-base-200">
                                  <Category
                                    size={18}
                                    className="text-primary"
                                  />
                                </span>
                                <span className="text-sm font-bold text-base-content">
                                  {item.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-base-content/75">
                              {formatDate(item.created_at)}
                            </td>
                            {isManager && (
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      setModalState({
                                        open: true,
                                        item,
                                        name: item.name,
                                      })
                                    }
                                    className="p-2 hover:bg-primary/10 text-heledone-ink-muted hover:text-primary rounded-lg transition-colors"
                                    title={t("ویرایش")}
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setDeleteModalState({ open: true, item })
                                    }
                                    className="p-2 hover:bg-error/10 text-heledone-ink-muted hover:text-error rounded-lg transition-colors"
                                    title={t("حذف")}
                                  >
                                    <Trash size={16} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </motion.tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-2">
                <Pagination
                  currentPage={catCurrentPage}
                  totalPages={catTotalPages}
                  pageSize={catPageSize}
                  totalCount={catTotalResults}
                  onPageChange={handleCatPageChange}
                  onPageSizeChange={handleCatPageSizeChange}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Create Ticket Modal */}
      <CreateTicketModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {/* Create/Edit Category Modal */}
      <AnimatePresence>
        {modalState.open && isManager && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-base-100 rounded-2xl shadow-xl m-4 max-h-[calc(100dvh-2rem)] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 flex-shrink-0 border-b border-base-content/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                      <Category size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-2xl text-base-content">
                        {modalState.item ? t("Edit Category") : t("Add Category")}
                      </h3>
                      <p className="text-base-content/70 text-sm">
                        {t("Ticket Category")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setModalState({ open: false, item: null, name: "" })
                    }
                    className="p-2 hover:bg-base-content/10 rounded-lg transition-colors"
                  >
                    <CloseCircle className="w-6 h-6 text-heledone-ink-muted" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <label className="block text-xs font-semibold text-heledone-ink-muted uppercase tracking-wider mb-2">
                  {t("Category Name")}</label>
                <InputField
                  name="category-name"
                  value={modalState.name}
                  onChange={(e) =>
                    setModalState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={t("Category name...")}
                  classNameInput="!shadow-none border-base-300 focus:border-primary"
                />
              </div>

              {/* Modal Footer */}
              <div className="p-6 flex-shrink-0 border-t border-base-content/10 bg-base-200/30 rounded-b-2xl">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() =>
                      setModalState({ open: false, item: null, name: "" })
                    }
                    disabled={isSaving}
                    className="btn btn-ghost rounded-xl"
                  >
                    {t("انصراف")}</button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !modalState.name.trim()}
                    className="btn btn-primary rounded-xl px-6"
                  >
                    {isSaving && (
                      <span className="loading loading-spinner loading-xs" />
                    )}
                    {isSaving ? t("در حال ذخیره…") : t("ذخیره")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={isManager && deleteModalState.open}
        onClose={() => setDeleteModalState({ open: false, item: null })}
        onConfirm={handleDelete}
        title={t("Delete Category")}
        message={t("Are you sure you want to delete the category \"{value0}\"?", { value0: deleteModalState.item?.name })}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
