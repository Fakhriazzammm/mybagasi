import { Link } from "react-router-dom";
import { Instagram, MessageCircle, Mail } from "lucide-react";
import { Logo } from "./Logo";

export const Footer = () => (
  <footer className="border-t border-border/60 bg-secondary/30 mt-24">
    <div className="container mx-auto py-14">
      <div className="grid gap-10 md:grid-cols-4">
        <div className="space-y-4">
          <Logo />
          <p className="text-sm text-muted-foreground max-w-xs">
            AI personal shopper Jepang di WhatsApp. Kirim link, kami beli & antar sampai rumah.
          </p>
          <div className="flex gap-2">
            {[Instagram, MessageCircle, Mail].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="h-9 w-9 grid place-items-center rounded-full bg-background hover:bg-primary hover:text-primary-foreground transition-colors shadow-soft"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {[
          { title: "Produk", items: ["Cek Estimasi", "Demo WhatsApp", "Batch Shipping", "Pre-order", "Price Alert"] },
          { title: "Bisnis", items: ["Membership", "Reseller", "Affiliate", "Creator Program", "API"] },
          { title: "Bantuan", items: ["FAQ", "Cara Kerja", "Lacak Order", "Kontak", "Kebijakan"] },
        ].map((col) => (
          <div key={col.title}>
            <h4 className="font-display font-semibold mb-4">{col.title}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              {col.items.map((item) => (
                <li key={item}>
                  <Link to="/" className="hover:text-foreground transition-colors">{item}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 pt-6 border-t border-border/60 flex flex-col md:flex-row gap-3 items-center justify-between text-xs text-muted-foreground">
        <p>© 2025 MyBagasi. Dibuat dengan ❤️ untuk pecinta Jepang.</p>
        <p>Tokyo 🇯🇵 — Jakarta 🇮🇩</p>
      </div>
    </div>
  </footer>
);
