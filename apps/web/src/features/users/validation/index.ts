import { t } from "../../../i18n/locale";
import { z } from "zod";

const baseUserSchema = z.object({
  username: z.string().min(1, { error: () => t("نام کاربری را وارد کنید") }),
  email: z.string().email({ error: () => t("Invalid email address") }),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  is_active: z.boolean(),
  is_staff: z.boolean(),
  role_id: z.string().nullable().optional(),
  salary_type: z.enum(["monthly", "hourly"]).nullable().optional(),
  salary_amount: z.string().nullable().optional(),
});

export const createUserSchema = baseUserSchema.extend({
  password: z
    .string()
    .min(8, { error: () => t("رمز عبور باید حداقل ۸ نویسه باشد") })
    .regex(/[A-Z]/, { error: () => t("رمز عبور باید حداقل یک حرف بزرگ لاتین داشته باشد") })
    .regex(/[a-z]/, { error: () => t("Must contain at least one lowercase letter") })
    .regex(/[0-9]/, { error: () => t("Must contain at least one number") }),
});

export const updateUserSchema = baseUserSchema.extend({
  password: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) =>
        !val ||
        (val.length >= 8 &&
          /[A-Z]/.test(val) &&
          /[a-z]/.test(val) &&
          /[0-9]/.test(val)),
      { error: () => t("رمز عبور باید حداقل ۸ نویسه و شامل حروف بزرگ، کوچک و عدد باشد") }
    ),
});
