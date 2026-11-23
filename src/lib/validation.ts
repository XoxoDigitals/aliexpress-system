import { z } from "zod";

const money = z.coerce.number().finite().min(0).max(1_000_000);
const positiveMoney = z.coerce.number().finite().positive().max(10_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid http(s) link");

export const orderCreateSchema = z.object({
  clientId: z.string().optional(), // required for admin, ignored for clients
  assignedToId: z.string().optional().nullable(), // admin only
  clientReference: optionalText(120),
  customerDetails: z.string().trim().min(1, "Paste the customer details").max(1000),
  productUrl: httpUrl,
  variantName: z.string().trim().min(1, "Required").max(200),
  cardInfo: optionalText(1000),
});

export const assignSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(500),
  teamMemberId: z.string().min(1).nullable(),
});

export const processSchema = z.object({
  accountName: z.string().trim().min(1, "Account name is required").max(160),
  purchasePrice: money,
});

export const trackingSchema = z.object({
  trackingNumber: z.string().trim().min(3, "Tracking number is required").max(120),
  carrier: optionalText(60),
});

export const paymentSchema = z.object({
  clientId: z.string().min(1),
  amount: positiveMoney,
  note: optionalText(300),
  orderIds: z.array(z.string().min(1)).max(1000).optional(),
});

const password = z.string().min(8, "At least 8 characters").max(200);

export const createUserSchema = z
  .object({
    email: z.string().trim().email().max(200),
    name: z.string().trim().min(1, "Required").max(120),
    password,
    role: z.enum(["CLIENT", "TEAM", "ADMIN"]),
    ratePerOrder: money.optional().nullable(),
  })
  .refine((v) => v.role !== "CLIENT" || (v.ratePerOrder != null && v.ratePerOrder > 0), {
    path: ["ratePerOrder"],
    message: "Clients need a rate greater than 0",
  });

export const updateUserSchema = z.object({
  email: z.string().trim().email().max(200).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  password: password.optional().or(z.literal("")),
  active: z.boolean().optional(),
  ratePerOrder: z.coerce.number().finite().positive().max(1_000_000).optional(),
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
