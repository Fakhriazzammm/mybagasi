import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

const links = [
  { to: "/", label: "Beranda" },
  { to: "/quotation", label: "Cek Harga" },
  { to: "/biaya-transparan", label: "Biaya Transparan" },
  { to: "/batch-shipping", label: "Batch" },
  { to: "/preorder", label: "Pre-order" },
  { to: "/whatsapp-demo", label: "Demo WA" },
  { to: "/#faq", label: "FAQ" },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                pathname === l.to ? "text-primary bg-primary-soft" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard">Dashboard</Link>
          </Button>
          <Button variant="hero" size="sm" asChild>
            <Link to="/whatsapp-demo">
              <MessageCircle className="h-4 w-4" />
              Mulai via WhatsApp
            </Link>
          </Button>
        </div>
        <button
          className="md:hidden h-10 w-10 grid place-items-center rounded-full hover:bg-secondary"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur">
          <div className="container mx-auto py-4 flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-2xl text-sm font-medium hover:bg-secondary"
              >
                {l.label}
              </Link>
            ))}
            <Button variant="hero" className="mt-2" asChild>
              <Link to="/whatsapp-demo" onClick={() => setOpen(false)}>
                <MessageCircle className="h-4 w-4" /> Mulai via WhatsApp
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
