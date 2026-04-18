// Centralized mock data for the customer dashboard demo.
export const customer = {
  name: "Rina Anggraini",
  email: "rina@demo.id",
  initials: "RA",
  membership: {
    tier: "Plus",
    nextTier: "Pro",
    spent: 4_280_000,
    target: 7_500_000,
    renewsOn: "12 Mar 2026",
  },
  points: {
    balance: 2_840,
    rupiahValue: 28_400,
    expires: "31 Des 2026",
  },
};

export type OrderStatus =
  | "draft" | "quote_created" | "waiting_payment" | "paid"
  | "procurement_queue" | "purchased" | "in_japan_warehouse" | "packed"
  | "shipped_to_indonesia" | "customs_clearance" | "last_mile_delivery"
  | "delivered" | "cancelled" | "refunded";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Draft",
  quote_created: "Quote dibuat",
  waiting_payment: "Menunggu pembayaran",
  paid: "Dibayar",
  procurement_queue: "Antrian beli",
  purchased: "Dibeli di Jepang",
  in_japan_warehouse: "Gudang Tokyo",
  packed: "Dikemas",
  shipped_to_indonesia: "Dikirim ke Indo",
  customs_clearance: "Bea cukai",
  last_mile_delivery: "Last-mile",
  delivered: "Sampai",
  cancelled: "Dibatalkan",
  refunded: "Refund",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  quote_created: "bg-secondary text-foreground",
  waiting_payment: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  procurement_queue: "bg-primary-soft text-primary",
  purchased: "bg-primary-soft text-primary",
  in_japan_warehouse: "bg-primary-soft text-primary",
  packed: "bg-primary-soft text-primary",
  shipped_to_indonesia: "bg-primary-soft text-primary",
  customs_clearance: "bg-warning/15 text-warning",
  last_mile_delivery: "bg-primary-soft text-primary",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
  refunded: "bg-muted text-muted-foreground",
};

export const quotations = [
  { id: "Q-1287", product: "Onitsuka Tiger Mexico 66", total: 1_547_000, status: "active", createdAt: "18 Apr 2026", source: "Mercari" },
  { id: "Q-1284", product: "Hada Labo Premium Set", total: 482_000, status: "active", createdAt: "16 Apr 2026", source: "Rakuten" },
  { id: "Q-1280", product: "Sony WH-1000XM5", total: 5_240_000, status: "expired", createdAt: "10 Apr 2026", source: "Amazon JP" },
  { id: "Q-1276", product: "Pokemon Card Pack 151", total: 312_000, status: "converted", createdAt: "05 Apr 2026", source: "Yahoo Auction" },
];

export const orders: Array<{
  id: string; product: string; total: number; status: OrderStatus; createdAt: string; eta: string; tracking: string;
}> = [
  { id: "ORD-8821", product: "Onitsuka Tiger Mexico 66", total: 1_547_000, status: "shipped_to_indonesia", createdAt: "18 Apr 2026", eta: "26 Apr 2026", tracking: "JP9821774421ID" },
  { id: "ORD-8804", product: "Pokemon Card Pack 151 ×3", total: 936_000, status: "in_japan_warehouse", createdAt: "12 Apr 2026", eta: "28 Apr 2026", tracking: "JP9821770088ID" },
  { id: "ORD-8762", product: "Hada Labo Premium Set", total: 482_000, status: "delivered", createdAt: "01 Apr 2026", eta: "10 Apr 2026", tracking: "JP9820017562ID" },
  { id: "ORD-8740", product: "Casio G-Shock GA-2100", total: 1_890_000, status: "delivered", createdAt: "20 Mar 2026", eta: "31 Mar 2026", tracking: "JP9820016740ID" },
  { id: "ORD-8721", product: "Muji Stationery Bundle", total: 264_000, status: "cancelled", createdAt: "14 Mar 2026", eta: "—", tracking: "—" },
];

export const trackingTimeline: Array<{ status: OrderStatus; at: string; note?: string; done: boolean; current?: boolean }> = [
  { status: "quote_created", at: "18 Apr 2026 · 10:12", done: true },
  { status: "paid", at: "18 Apr 2026 · 11:05", note: "VA BCA · Rp 1.547.000", done: true },
  { status: "procurement_queue", at: "18 Apr 2026 · 11:30", done: true },
  { status: "purchased", at: "19 Apr 2026 · 09:40", note: "Mercari · seller rating 4.9", done: true },
  { status: "in_japan_warehouse", at: "20 Apr 2026 · 14:22", note: "Gudang Tokyo · QC passed", done: true },
  { status: "packed", at: "21 Apr 2026 · 08:10", done: true },
  { status: "shipped_to_indonesia", at: "22 Apr 2026 · 06:00", note: "JAL Cargo · JP9821774421ID", done: true, current: true },
  { status: "customs_clearance", at: "Estimasi 24 Apr", done: false },
  { status: "last_mile_delivery", at: "Estimasi 25 Apr", done: false },
  { status: "delivered", at: "Estimasi 26 Apr", done: false },
];

export const wishlist = [
  { id: "W-01", emoji: "👟", name: "New Balance 990v6 Made in USA", price: 4_200_000, source: "Amazon JP", note: "size 42" },
  { id: "W-02", emoji: "📷", name: "Fujifilm X100VI Silver", price: 28_900_000, source: "Map Camera", note: "stok terbatas" },
  { id: "W-03", emoji: "🎮", name: "Nintendo Switch 2 OLED", price: 6_750_000, source: "Rakuten", note: "limited Japan edition" },
  { id: "W-04", emoji: "🍵", name: "Ippodo Matcha Set", price: 980_000, source: "Ippodo", note: "kado mama" },
];

export const priceAlerts = [
  { id: "PA-01", product: "Onitsuka Tiger Mexico 66", currentPrice: 1_547_000, targetPrice: 1_350_000, status: "monitoring", lastChecked: "2 jam lalu" },
  { id: "PA-02", product: "Sony WH-1000XM5", currentPrice: 5_240_000, targetPrice: 4_800_000, status: "monitoring", lastChecked: "5 jam lalu" },
  { id: "PA-03", product: "Uniqlo C Heattech Bundle", currentPrice: 412_000, targetPrice: 400_000, status: "triggered", lastChecked: "kemarin" },
];

export const addresses = [
  { id: "A-01", label: "Rumah", recipient: "Rina Anggraini", phone: "+62 812-3456-7890", line: "Jl. Kemang Raya No. 88", city: "Jakarta Selatan", postal: "12730", primary: true },
  { id: "A-02", label: "Kantor", recipient: "Rina Anggraini", phone: "+62 812-3456-7890", line: "Menara BCA Lt. 32, Jl. MH Thamrin", city: "Jakarta Pusat", postal: "10310", primary: false },
];

export const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
