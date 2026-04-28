import type { OrderStatus } from "@/types/database.types";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft order",
  quote_created: "Quotation dibuat",
  waiting_payment: "Menunggu pembayaran",
  paid: "Pembayaran diterima",
  procurement_queue: "Masuk antrean procurement",
  purchased: "Produk dibeli",
  in_japan_warehouse: "Tiba di gudang Jepang",
  packed: "Sedang dikemas",
  shipped_to_indonesia: "Dikirim ke Indonesia",
  customs_clearance: "Proses bea cukai",
  last_mile_delivery: "Pengiriman lokal",
  delivered: "Selesai diterima",
  refunded: "Refund diproses",
  cancelled: "Dibatalkan",
};
