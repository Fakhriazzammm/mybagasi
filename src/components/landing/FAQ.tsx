import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  { q: "Berapa lama barang sampai?", a: "Rata-rata 7–14 hari kerja sejak pembayaran. Bergantung pada metode pengiriman dan bea cukai." },
  { q: "Marketplace Jepang apa saja yang didukung?", a: "Amazon JP, Rakuten, Mercari, Yahoo Auction, Zozotown, dan toko brand resmi. Bisa request marketplace lain." },
  { q: "Apakah bisa beli barang yang tidak ada link-nya?", a: "Bisa! Kirim foto atau deskripsi, AI personal shopper kami akan bantu carikan." },
  { q: "Bagaimana cara hitung total biayanya?", a: "Total = harga produk + kurs + fee jasa + ongkir Jepang→Indo + pajak/bea + biaya last-mile. Semua transparan di quotation." },
  { q: "Bagaimana kalau barang tidak sesuai?", a: "Kami foto bukti sebelum kirim. Jika ada masalah pengiriman, kami bantu klaim asuransi." },
  { q: "Apakah aman bayar di MyBagasi?", a: "Iya. Pembayaran via VA bank resmi & e-wallet. Dana dikelola escrow sampai barang sampai gudang Jepang." },
];

export const FAQ = () => (
  <section id="faq" className="bg-secondary/40 py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <div className="text-center mb-12">
        <span className="text-xs uppercase tracking-widest text-primary font-semibold">FAQ</span>
        <h2 className="font-display text-3xl md:text-5xl font-bold mt-3">Pertanyaan yang sering ditanya.</h2>
      </div>
      <Accordion type="single" collapsible className="space-y-3">
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="rounded-2xl bg-card border border-border/40 px-6 shadow-soft">
            <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-5">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </section>
);
