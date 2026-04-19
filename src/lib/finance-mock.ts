export const financeStats = {
  paymentsToday: 184_500_000,
  paymentsDelta: "+24%",
  pendingPayment: 42_300_000,
  pendingCount: 14,
  refundsQueue: 8_750_000,
  refundsCount: 5,
  membershipMtd: 56_400_000,
  affiliateOwed: 12_840_000,
  pointsLiability: 38_600_000,
  gmvMtd: 3_240_000_000,
};

export const payments = [
  { id: "PAY-9921", order: "ORD-8821", customer: "Rina Anggraini", method: "VA BCA", amount: 1_547_000, status: "settled", at: "Hari ini · 11:05" },
  { id: "PAY-9920", order: "ORD-8819", customer: "Bagus Pratama", method: "QRIS", amount: 936_000, status: "settled", at: "Hari ini · 10:42" },
  { id: "PAY-9919", order: "ORD-8817", customer: "Sari Putri", method: "VA Mandiri", amount: 482_000, status: "pending", at: "Hari ini · 09:30" },
  { id: "PAY-9918", order: "ORD-8814", customer: "Dimas Wirawan", method: "Credit Card", amount: 5_240_000, status: "settled", at: "Hari ini · 08:12" },
  { id: "PAY-9917", order: "ORD-8811", customer: "Maya Lestari", method: "VA BNI", amount: 264_000, status: "pending", at: "Kemarin · 22:18" },
  { id: "PAY-9916", order: "ORD-8809", customer: "Yoga Saputra", method: "GoPay", amount: 1_890_000, status: "settled", at: "Kemarin · 19:55" },
  { id: "PAY-9915", order: "ORD-8807", customer: "Anisa R.", method: "ShopeePay", amount: 412_000, status: "failed", at: "Kemarin · 15:01" },
];

export const refunds = [
  { id: "RF-201", order: "ORD-8740", customer: "Bagus Pratama", amount: 1_890_000, reason: "Warna salah dari seller", status: "pending_review", at: "2 jam lalu" },
  { id: "RF-200", order: "ORD-8709", customer: "Rina Anggraini", amount: 850_000, reason: "Paket rusak — klaim asuransi", status: "approved", at: "Kemarin" },
  { id: "RF-199", order: "ORD-8688", customer: "Sari Putri", amount: 320_000, reason: "Item tidak sesuai foto", status: "pending_review", at: "Kemarin" },
  { id: "RF-198", order: "ORD-8671", customer: "Dimas Wirawan", amount: 4_200_000, reason: "Cancel sebelum dibeli", status: "processing", at: "2 hari lalu" },
  { id: "RF-197", order: "ORD-8650", customer: "Maya Lestari", amount: 1_490_000, reason: "Stock habis di Jepang", status: "completed", at: "3 hari lalu" },
];

export const pointLedger = [
  { id: "PL-501", customer: "Rina Anggraini", type: "earn", amount: 1_547, ref: "ORD-8821", at: "Hari ini · 11:08" },
  { id: "PL-500", customer: "Bagus Pratama", type: "earn", amount: 936, ref: "ORD-8819", at: "Hari ini · 10:45" },
  { id: "PL-499", customer: "Dimas Wirawan", type: "redeem", amount: -2_000, ref: "Q-1284", at: "Hari ini · 09:20" },
  { id: "PL-498", customer: "Sari Putri", type: "earn", amount: 482, ref: "ORD-8817", at: "Hari ini · 09:35" },
  { id: "PL-497", customer: "Maya Lestari", type: "expire", amount: -340, ref: "auto", at: "Kemarin" },
  { id: "PL-496", customer: "Yoga Saputra", type: "earn", amount: 1_890, ref: "ORD-8809", at: "Kemarin" },
];

export const affiliatePayouts = [
  { id: "AP-44", affiliate: "creator.bagus", orders: 28, commission: 4_200_000, status: "pending", period: "Apr 2026" },
  { id: "AP-43", affiliate: "tokyo.haul", orders: 19, commission: 3_180_000, status: "pending", period: "Apr 2026" },
  { id: "AP-42", affiliate: "japanstuff.id", orders: 14, commission: 2_460_000, status: "approved", period: "Apr 2026" },
  { id: "AP-41", affiliate: "rina.shops", orders: 12, commission: 1_840_000, status: "paid", period: "Mar 2026" },
  { id: "AP-40", affiliate: "weeb.daily", orders: 8, commission: 1_160_000, status: "paid", period: "Mar 2026" },
];

export const membershipRevenue = [
  { tier: "Plus", subscribers: 824, mrr: 24_720_000, growth: "+8%" },
  { tier: "Pro", subscribers: 312, mrr: 28_080_000, growth: "+15%" },
  { tier: "Seller", subscribers: 47, mrr: 14_100_000, growth: "+22%" },
];

export const fmtRp = (n: number) => "Rp " + n.toLocaleString("id-ID");
