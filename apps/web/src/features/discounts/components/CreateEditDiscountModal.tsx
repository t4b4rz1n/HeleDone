import { useTranslation } from "../../../i18n/locale";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Add, Edit } from "iconsax-reactjs";
import { useCreateDiscount, useUpdateDiscount } from "../hooks/useDiscounts";
import {
  discountSchema,
  type DiscountFormData,
} from "../validation/discountSchema";
import { DiscountForm } from "./DiscountForm";
import type { Discount } from "../types";

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const modalVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 30, scale: 0.98 },
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  discount?: Discount | null;
}

export const CreateEditDiscountModal = ({
  isOpen,
  onClose,
  discount,
}: ModalProps) => {
  const t = useTranslation();
  const editMode = !!discount;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DiscountFormData>({
    resolver: zodResolver(discountSchema) as any,
    defaultValues: {
      code: "",
      description: "",
      percent: 0,
      max_usage: 1,
      expiration_date: "",
      is_active: true,
    },
  });

  const createMutation = useCreateDiscount();
  const updateMutation = useUpdateDiscount();

  useEffect(() => {
    if (isOpen) {
      if (discount) {
        reset({
          code: discount.code,
          description: discount.description,
          percent: discount.percent,
          max_usage: discount.max_usage,
          expiration_date: discount.expiration_date,
          is_active: discount.is_active,
        });
      } else {
        reset({
          code: "",
          description: "",
          percent: 0,
          max_usage: 1,
          expiration_date: "",
          is_active: true,
        });
      }
    }
  }, [isOpen, discount, reset]);

  const onSubmit = handleSubmit((data: DiscountFormData) => {
    if (editMode && discount) {
      updateMutation.mutate(
        { id: discount.id, data },
        {
          onSuccess: () => {
            onClose();
          },
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          onClose();
        },
      });
    }
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"

        >
          <motion.div
            variants={modalVariants}
            className="relative w-full max-w-2xl bg-base-100 rounded-2xl shadow-xl m-4 max-h-[calc(100dvh-2rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 flex-shrink-0">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                  {editMode ? <Edit size={28} /> : <Add size={28} />}
                </div>
                <div>
                  <h3 className="font-bold text-2xl">
                    {editMode
                      ? t("Edit Discount Code")
                      : t("Create New Discount Code")}
                  </h3>
                  <p className="text-base-content/70 text-sm">
                    {editMode
                      ? t("Update discount details")
                      : t("Create a new discount code")}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6">
              <form onSubmit={onSubmit} className="space-y-6">
                <DiscountForm
                  control={control}
                  errors={errors}
                  editMode={editMode}
                />
              </form>
            </div>

            <div className="p-6 flex-shrink-0 border-t border-base-content/10">
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost rounded-xl"
                  disabled={isLoading}
                >
                  {t("انصراف")}</button>
                <button
                  type="submit"
                  onClick={onSubmit}
                  disabled={isLoading}
                  className="btn btn-primary rounded-xl"
                >
                  {isLoading ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : editMode ? (
                    t("به‌روزرسانی")
                  ) : (
                    t("ساخت")
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
