export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";

export type Order = {
  id: string;
  userId?: string;
  licenseCode?: string;
  planId: string;
  status: OrderStatus;
  createdAt: string;
};
