export const platformStats = {
  totalUsers: 12_840,
  activeMembers: 1_183,
  affiliates: 214,
  marketplacesActive: 8,
  aiTokensMtd: 4_280_000,
  systemHealth: "healthy",
};

export const users = [
  { id: "U-1042", name: "Rina Anggraini", email: "rina@demo.id", role: "customer", tier: "Plus", status: "active", joined: "12 Jan 2026" },
  { id: "U-1041", name: "Bagus Pratama", email: "bagus@demo.id", role: "customer", tier: "Free", status: "active", joined: "08 Jan 2026" },
  { id: "U-1020", name: "Yuki Tanaka", email: "yuki@mybagasi.id", role: "ops_admin", tier: "—", status: "active", joined: "10 Des 2025" },
  { id: "U-1019", name: "Hiroshi M.", email: "hiroshi@mybagasi.id", role: "ops_admin", tier: "—", status: "active", joined: "10 Des 2025" },
  { id: "U-1015", name: "Nadia Putri", email: "nadia@mybagasi.id", role: "support", tier: "—", status: "active", joined: "05 Des 2025" },
  { id: "U-1010", name: "Dewi Finance", email: "finance@mybagasi.id", role: "finance", tier: "—", status: "active", joined: "01 Des 2025" },
  { id: "U-0998", name: "creator.bagus", email: "bagus@creator.id", role: "affiliate", tier: "Pro", status: "active", joined: "18 Nov 2025" },
  { id: "U-0987", name: "Test Suspended", email: "test@spam.id", role: "customer", tier: "Free", status: "suspended", joined: "01 Nov 2025" },
];

export const membershipPlans = [
  { id: "P-FREE", name: "Free", priceMonthly: 0, discount: "0%", pointMultiplier: "1×", priorityProcurement: false, active: true },
  { id: "P-PLUS", name: "Plus", priceMonthly: 49_000, discount: "5%", pointMultiplier: "1.5×", priorityProcurement: false, active: true },
  { id: "P-PRO", name: "Pro", priceMonthly: 149_000, discount: "10%", pointMultiplier: "2×", priorityProcurement: true, active: true },
  { id: "P-SELLER", name: "Seller", priceMonthly: 399_000, discount: "15%", pointMultiplier: "3×", priorityProcurement: true, active: true },
];

export const pricingRules = [
  { id: "PR-01", name: "Service fee standar", type: "percent", value: 8, applyTo: "Semua quotation", active: true },
  { id: "PR-02", name: "Service fee Plus", type: "percent", value: 6, applyTo: "Membership Plus", active: true },
  { id: "PR-03", name: "Service fee Pro", type: "percent", value: 5, applyTo: "Membership Pro", active: true },
  { id: "PR-04", name: "Markup high-value (>5jt)", type: "percent", value: 3, applyTo: "Item >Rp 5.000.000", active: true },
  { id: "PR-05", name: "Min service fee", type: "flat", value: 25_000, applyTo: "Semua quotation", active: true },
];

export const feeSettings = [
  { key: "JPY → IDR rate", value: "Rp 108", note: "Auto-update tiap 6 jam dari xe.com" },
  { key: "Payment gateway fee", value: "2.5%", note: "Dibebankan ke customer" },
  { key: "Insurance fee", value: "1% dari nilai barang", note: "Optional di checkout" },
  { key: "Customs handling", value: "Rp 50.000", note: "Per shipment" },
  { key: "Storage fee (gudang Tokyo)", value: "Gratis 14 hari", note: "Setelah itu Rp 5.000/hari" },
];

export const shippingRules = [
  { id: "SR-01", route: "Tokyo → Jakarta (Air)", pricePerKg: 285_000, eta: "5-7 hari", minWeight: "0.5 kg", active: true },
  { id: "SR-02", route: "Tokyo → Jakarta (Batch)", pricePerKg: 185_000, eta: "8-12 hari", minWeight: "0.5 kg", active: true },
  { id: "SR-03", route: "Osaka → Surabaya (Sea)", pricePerKg: 95_000, eta: "20-25 hari", minWeight: "1 kg", active: true },
  { id: "SR-04", route: "Tokyo → Bali (Air)", pricePerKg: 320_000, eta: "6-8 hari", minWeight: "0.5 kg", active: true },
  { id: "SR-05", route: "Tokyo → Bandung (Air)", pricePerKg: 295_000, eta: "6-8 hari", minWeight: "0.5 kg", active: false },
];

export const marketplaces = [
  { id: "MP-01", name: "Mercari", domain: "mercari.com", scraperHealth: 98, ordersMtd: 412, active: true },
  { id: "MP-02", name: "Rakuten", domain: "rakuten.co.jp", scraperHealth: 96, ordersMtd: 287, active: true },
  { id: "MP-03", name: "Amazon JP", domain: "amazon.co.jp", scraperHealth: 92, ordersMtd: 234, active: true },
  { id: "MP-04", name: "Yahoo Auction", domain: "auctions.yahoo.co.jp", scraperHealth: 88, ordersMtd: 198, active: true },
  { id: "MP-05", name: "ZOZOTOWN", domain: "zozo.jp", scraperHealth: 94, ordersMtd: 156, active: true },
  { id: "MP-06", name: "Muji JP", domain: "muji.com/jp", scraperHealth: 99, ordersMtd: 89, active: true },
  { id: "MP-07", name: "Map Camera", domain: "mapcamera.com", scraperHealth: 95, ordersMtd: 42, active: true },
  { id: "MP-08", name: "Ippodo", domain: "ippodo-tea.co.jp", scraperHealth: 100, ordersMtd: 28, active: true },
  { id: "MP-09", name: "Suruga-ya", domain: "suruga-ya.jp", scraperHealth: 0, ordersMtd: 0, active: false },
];

export const commissionTiers = [
  { tier: "Starter", minOrders: 0, percent: 3, payoutMin: 100_000 },
  { tier: "Creator", minOrders: 10, percent: 5, payoutMin: 250_000 },
  { tier: "Top Creator", minOrders: 50, percent: 8, payoutMin: 500_000 },
  { tier: "Elite", minOrders: 200, percent: 12, payoutMin: 1_000_000 },
];

export const aiSettings = [
  { key: "Model utama", value: "google/gemini-2.5-flash", note: "Untuk AI Personal Shopper" },
  { key: "Model fallback", value: "openai/gpt-5-mini", note: "Saat primary down" },
  { key: "Max tokens / chat", value: "4,096", note: "Limit per request" },
  { key: "Temperature", value: "0.7", note: "Balance kreatif & akurat" },
  { key: "Rate limit / user", value: "30 req/menit", note: "Anti-abuse" },
  { key: "Auto-suggest produk", value: "Aktif", note: "Saat user kirim foto/link" },
];

export const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
