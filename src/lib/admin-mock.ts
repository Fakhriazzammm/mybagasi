// Centralized mock data for the Admin Ops dashboard.
export const adminStats = {
  quotationsToday: 142,
  quotationsDelta: "+18%",
  ordersToday: 87,
  ordersDelta: "+12%",
  paymentsPending: 14,
  procurementPending: 23,
  trackingExceptions: 5,
  scraperFailures: 7,
  approvalsQueue: 9,
  supportOpen: 12,
  gmvToday: 184_500_000,
  gmvDelta: "+24%",
};

export const procurementQueue = [
  { id: "ORD-8821", customer: "Rina Anggraini", product: "Onitsuka Tiger Mexico 66", source: "Mercari", price: 14_800, qty: 1, priority: "high", assigned: "Yuki", waitingHours: 2 },
  { id: "ORD-8819", customer: "Bagus Pratama", product: "Pokemon Card 151 ×3", source: "Yahoo Auction", price: 8_900, qty: 3, priority: "high", assigned: "—", waitingHours: 4 },
  { id: "ORD-8817", customer: "Sari Putri", product: "Hada Labo Premium", source: "Rakuten", price: 4_200, qty: 2, priority: "normal", assigned: "Hiroshi", waitingHours: 6 },
  { id: "ORD-8814", customer: "Dimas Wirawan", product: "Sony WH-1000XM5", source: "Amazon JP", price: 48_900, qty: 1, priority: "normal", assigned: "Yuki", waitingHours: 8 },
  { id: "ORD-8811", customer: "Maya Lestari", product: "Muji Stationery Set", source: "Muji JP", price: 2_400, qty: 5, priority: "low", assigned: "—", waitingHours: 12 },
];

export const trackingExceptions = [
  { id: "ORD-8762", customer: "Sari Putri", issue: "Customs hold — invoice mismatch", severity: "high", since: "2 jam lalu", tracking: "JP9820017562ID" },
  { id: "ORD-8755", customer: "Dimas Wirawan", issue: "Last-mile gagal antar 2x", severity: "high", since: "5 jam lalu", tracking: "JP9820016755ID" },
  { id: "ORD-8740", customer: "Bagus Pratama", issue: "Tracking belum update >48 jam", severity: "medium", since: "kemarin", tracking: "JP9820016740ID" },
  { id: "ORD-8721", customer: "Maya Lestari", issue: "Kurir minta foto identitas", severity: "low", since: "kemarin", tracking: "JP9820016721ID" },
  { id: "ORD-8709", customer: "Rina Anggraini", issue: "Paket rusak — perlu klaim", severity: "medium", since: "2 hari lalu", tracking: "JP9820016709ID" },
];

export const scraperFailures = [
  { id: "SF-302", source: "Mercari", url: "mercari.com/jp/items/m9876…", reason: "Halaman 404 — produk dihapus", since: "10 menit lalu", retries: 3 },
  { id: "SF-301", source: "Yahoo Auction", url: "auctions.yahoo.co.jp/x88421", reason: "Captcha challenge", since: "25 menit lalu", retries: 2 },
  { id: "SF-300", source: "Rakuten", url: "item.rakuten.co.jp/zozo/abc", reason: "Selector berubah — harga tidak ditemukan", since: "1 jam lalu", retries: 5 },
  { id: "SF-299", source: "Amazon JP", url: "amazon.co.jp/dp/B0CXYZ123", reason: "Rate limit IP", since: "2 jam lalu", retries: 4 },
  { id: "SF-298", source: "ZOZOTOWN", url: "zozo.jp/shop/uniqlo/goods/12345", reason: "Produk out of stock", since: "3 jam lalu", retries: 1 },
];

export const quoteApprovals = [
  { id: "Q-1290", customer: "Bagus Pratama", product: "Vintage Casio Watch (langka)", total: 4_800_000, reason: "Item langka — perlu verifikasi seller", submitted: "12 menit lalu" },
  { id: "Q-1289", customer: "Sari Putri", product: "Custom order — bundling 8 item", total: 6_240_000, reason: "Multi-source procurement", submitted: "30 menit lalu" },
  { id: "Q-1288", customer: "Dimas Wirawan", product: "Limited Pokemon Box (>5jt)", total: 8_900_000, reason: "High-value item", submitted: "1 jam lalu" },
  { id: "Q-1287", customer: "Rina Anggraini", product: "Onitsuka Tiger Mexico 66", total: 1_547_000, reason: "Auto-flagged (new buyer)", submitted: "2 jam lalu" },
];

export const supportNotes = [
  { id: "SN-501", customer: "Sari Putri", order: "ORD-8762", channel: "WhatsApp", note: "Customer khawatir paket lama di customs, minta update setiap hari.", agent: "Nadia", at: "10 menit lalu", status: "open" },
  { id: "SN-500", customer: "Dimas Wirawan", order: "ORD-8755", channel: "WhatsApp", note: "Reschedule pengiriman ke alamat kantor besok pagi.", agent: "Rio", at: "1 jam lalu", status: "in_progress" },
  { id: "SN-499", customer: "Bagus Pratama", order: "ORD-8740", channel: "Email", note: "Minta refund parsial karena seller kirim warna salah.", agent: "Nadia", at: "3 jam lalu", status: "open" },
  { id: "SN-498", customer: "Maya Lestari", order: "—", channel: "WhatsApp", note: "Tanya cara join batch shipping bulan depan.", agent: "Rio", at: "kemarin", status: "resolved" },
];

export type BatchStatus = "open" | "closing_soon" | "closed" | "shipping";

export const batches: Array<{
  id: string; name: string; route: string; closesAt: string; arrivesAt: string;
  capacity: number; joined: number; savingsPercent: number; pricePerKg: number; status: BatchStatus;
}> = [
  { id: "BATCH-042", name: "Tokyo Express April #4", route: "Tokyo → Jakarta", closesAt: "2026-04-22T23:59:00", arrivesAt: "30 Apr 2026", capacity: 50, joined: 38, savingsPercent: 35, pricePerKg: 185_000, status: "closing_soon" },
  { id: "BATCH-043", name: "Osaka Sea Cargo Mei #1", route: "Osaka → Surabaya", closesAt: "2026-04-28T23:59:00", arrivesAt: "12 Mei 2026", capacity: 80, joined: 22, savingsPercent: 48, pricePerKg: 95_000, status: "open" },
  { id: "BATCH-044", name: "Tokyo Express Mei #1", route: "Tokyo → Jakarta", closesAt: "2026-05-05T23:59:00", arrivesAt: "13 Mei 2026", capacity: 50, joined: 9, savingsPercent: 35, pricePerKg: 185_000, status: "open" },
  { id: "BATCH-041", name: "Tokyo Express April #3", route: "Tokyo → Jakarta", closesAt: "2026-04-15T23:59:00", arrivesAt: "23 Apr 2026", capacity: 50, joined: 50, savingsPercent: 35, pricePerKg: 185_000, status: "shipping" },
];

export const batchParticipants = [
  { name: "Rina A.", initials: "RA", items: 2, weight: 1.8 },
  { name: "Bagus P.", initials: "BP", items: 1, weight: 0.6 },
  { name: "Sari P.", initials: "SP", items: 4, weight: 2.4 },
  { name: "Dimas W.", initials: "DW", items: 1, weight: 0.3 },
  { name: "Maya L.", initials: "ML", items: 3, weight: 1.2 },
  { name: "Yoga S.", initials: "YS", items: 2, weight: 0.9 },
];

export const preorders: Array<{
  id: string; emoji: string; name: string; brand: string; releaseDate: string;
  retailJpy: number; estimateIdr: number; dpIdr: number; quotaTotal: number; quotaTaken: number;
  closesAt: string; tag: string;
}> = [
  { id: "PO-101", emoji: "🎮", name: "Nintendo Switch 2 OLED — Japan Edition", brand: "Nintendo", releaseDate: "20 Mei 2026", retailJpy: 49_800, estimateIdr: 6_750_000, dpIdr: 1_500_000, quotaTotal: 30, quotaTaken: 22, closesAt: "2026-05-10T23:59:00", tag: "Hot" },
  { id: "PO-102", emoji: "📷", name: "Fujifilm X100VI Silver", brand: "Fujifilm", releaseDate: "15 Jun 2026", retailJpy: 248_000, estimateIdr: 28_900_000, dpIdr: 5_000_000, quotaTotal: 10, quotaTaken: 7, closesAt: "2026-05-25T23:59:00", tag: "Limited" },
  { id: "PO-103", emoji: "🎴", name: "Pokemon TCG — Scarlet Violet Box", brand: "The Pokémon Company", releaseDate: "30 Apr 2026", retailJpy: 5_500, estimateIdr: 780_000, dpIdr: 200_000, quotaTotal: 100, quotaTaken: 64, closesAt: "2026-04-25T23:59:00", tag: "Closing soon" },
  { id: "PO-104", emoji: "👟", name: "Asics Gel-Kayano 31 Tokyo Marathon", brand: "Asics", releaseDate: "05 Jun 2026", retailJpy: 22_000, estimateIdr: 2_950_000, dpIdr: 700_000, quotaTotal: 40, quotaTaken: 12, closesAt: "2026-05-20T23:59:00", tag: "New" },
  { id: "PO-105", emoji: "🎧", name: "Sony WH-1000XM6 (Japan First)", brand: "Sony", releaseDate: "12 Jul 2026", retailJpy: 59_800, estimateIdr: 7_400_000, dpIdr: 1_800_000, quotaTotal: 25, quotaTaken: 4, closesAt: "2026-06-15T23:59:00", tag: "Pre-launch" },
  { id: "PO-106", emoji: "🍵", name: "Ippodo Matcha Limited Spring", brand: "Ippodo", releaseDate: "10 Mei 2026", retailJpy: 8_400, estimateIdr: 1_180_000, dpIdr: 300_000, quotaTotal: 60, quotaTaken: 41, closesAt: "2026-05-01T23:59:00", tag: "Seasonal" },
];

export const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
export const fmtJpy = (n: number) => "¥" + n.toLocaleString("ja-JP");
