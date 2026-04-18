const categories = [
  { emoji: "👟", name: "Sneakers", count: "1.2k" },
  { emoji: "🎮", name: "Game & Anime", count: "3.4k" },
  { emoji: "💄", name: "Kosmetik", count: "890" },
  { emoji: "👜", name: "Fashion", count: "2.1k" },
  { emoji: "📷", name: "Kamera", count: "420" },
  { emoji: "🍵", name: "Snack & Teh", count: "1.5k" },
  { emoji: "🎸", name: "Musik & Vinyl", count: "310" },
  { emoji: "📚", name: "Buku & Manga", count: "5.2k" },
];

export const Categories = () => (
  <section className="container mx-auto py-20 md:py-28">
    <div className="text-center max-w-2xl mx-auto mb-12">
      <span className="text-xs uppercase tracking-widest text-primary font-semibold">Kategori</span>
      <h2 className="font-display text-3xl md:text-5xl font-bold mt-3 mb-4">
        Apa pun dari Jepang, kami carikan.
      </h2>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {categories.map((c) => (
        <button
          key={c.name}
          className="group rounded-3xl bg-card border border-border/40 p-6 text-left shadow-soft hover:shadow-card hover:-translate-y-1 transition-all"
        >
          <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{c.emoji}</div>
          <p className="font-semibold">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.count} produk dipesan</p>
        </button>
      ))}
    </div>
  </section>
);
