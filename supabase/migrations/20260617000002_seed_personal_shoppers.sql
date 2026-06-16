-- ============================================================
-- Seed data: Marketplace Personal Shopper
-- ============================================================

INSERT INTO personal_shoppers (name, slug, tagline, description, verification, services, pricing_description, starting_price, location, website, social_links, stats, featured, display_order)
VALUES
(
  'MyBagasi & Jastip',
  'mybagasi-jastip',
  'Premium Personal Shopper Jepang — Terpercaya & Berpengalaman',
  'MyBagasi & Jastip adalah layanan personal shopper Jepang terpercaya yang sudah melayani ribuan pelanggan di Indonesia. Kami siap membelikan barang-barang impian Anda dari Jepang — mulai dari fashion, elektronik, hingga barang koleksi langka. Dengan jaringan luas di Tokyo dan Jakarta, kami menjamin proses cepat, aman, dan transparan.

✅ Keunggulan:
• Estimasi harga instan via AI
• Pre-order & ready stock
• Konsolidasi paket — hemat ongkir
• Tracking real-time
• Garansi 100% uang kembali jika barang tidak sampai

Hubungi kami sekarang untuk konsultasi gratis!',
  'gold',
  ARRAY['Belanja dari Jepang', 'Cek Harga Real-time', 'Konsolidasi Paket', 'Pengiriman ke Indonesia', 'Pre-order Barang Limited', 'Custom Request', 'Beli Barang Auction'],
  'Estimasi otomatis via AI. Fee transparan, tanpa biaya tersembunyi.',
  500,
  'Tokyo, Jepang & Jakarta, Indonesia',
  'https://mybagasi.id',
  '{"instagram": "https://instagram.com/mybagasi", "telegram": "https://t.me/mybagasi_bot", "whatsapp": "https://wa.me/6281234567890"}',
  '{"orders_completed": 1500, "rating": 4.9, "reviews_count": 520}',
  TRUE,
  1
),
(
  'Shln.page',
  'shln-page',
  'Personal Shopper Fashion Jepang — Cepat & Terpercaya',
  'Shln.page adalah personal shopper spesialis fashion Jepang! Kami fokus pada streetwear Jepang, sneakers limited edition, dan aksesoris eksklusif. Dengan koneksi langsung ke toko-toko di Harajuku, Shibuya, dan Shinjuku, kami bisa mendapatkan barang-barang incaran Anda dengan harga kompetitif.

🔥 Spesialisasi:
• Streetwear Jepang (Undercover, WTAPS, Neighborhood)
• Sneakers Limited Edition
• Aksesoris Japan-exclusive
• Brand Jepang lainnya

Proses mudah: chat → transfer → barang dikirim ke rumah!',
  'blue',
  ARRAY['Belanja Fashion Jepang', 'Streetwear Import', 'Sneakers Limited', 'Aksesoris Japan Exclusive', 'Pre-order'],
  'Harga bervariasi tergantung produk. Diskusikan budget Anda!',
  750,
  'Tokyo, Jepang',
  'https://shln.page',
  '{"instagram": "https://instagram.com/shln.page"}',
  '{"orders_completed": 340, "rating": 4.8, "reviews_count": 120}',
  TRUE,
  2
),
(
  'Jastip.shinrai',
  'jastip-shinrai',
  'Jastip Jepang — Amanah, Profesional, Original',
  'Jastip.shinrai adalah layanan jasa titip (jastip) dari Jepang ke Indonesia yang mengutamakan kepercayaan dan profesionalisme. Berbasis di Osaka, kami mengkhususkan diri pada skincare Jepang, kosmetik, suplemen kesehatan, makanan ringan, dan barang koleksi.

✨ Kenapa pilih Shinrai?
• Barang 100% original dari Jepang
• Harga transparan — fee 15%
• Packing aman & rapi
• Respon cepat via chat
• Minimal order Rp 100.000

Kami percaya setiap titipan adalah amanah. 🫡',
  'blue',
  ARRAY['Jastip Jepang', 'Skincare & Kosmetik', 'Suplemen Kesehatan', 'Makanan & Snack Jepang', 'Barang Koleksi', 'Obat & Vitamin'],
  'Fee 15% dari harga barang. Minimal order Rp 100,000.',
  1000,
  'Osaka, Jepang',
  'https://jastip.shinrai.id',
  '{"instagram": "https://instagram.com/jastip.shinrai", "telegram": "https://t.me/jastipshinrai"}',
  '{"orders_completed": 890, "rating": 4.7, "reviews_count": 310}',
  FALSE,
  3
);
