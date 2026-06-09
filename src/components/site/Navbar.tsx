import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, MessageCircle, User, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { useAuth } from "@/contexts/AuthContext";

const links = [
  { to: "/", label: "Beranda" },
  { to: "/aipersonalshopper", label: "AI Shopper" },
  { to: "/biaya-transparan", label: "Biaya Transparan" },
  { to: "/batch-shipping", label: "Batch" },
  { to: "/preorder", label: "Pre-order" },
  { to: "/#faq", label: "FAQ" },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { profile, signOut, getDashboardRoute } = useAuth();

  const dashRoute = getDashboardRoute();

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
          {profile ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to={dashRoute}>
                  <LayoutDashboard className="h-4 w-4 mr-1.5" />
                  Dashboard
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/profile">
                  <User className="h-4 w-4 mr-1.5" />
                  {profile.name?.split(' ')[0] || 'Profil'}
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth/login">Masuk</Link>
              </Button>
              <Button variant="hero" size="sm" asChild>
                <Link to="/auth/register">Daftar Gratis</Link>
              </Button>
            </>
          )}
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
            <div className="border-t border-border/60 my-2 pt-2">
              {profile ? (
                <>
                  <Link
                    to={dashRoute}
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 rounded-2xl text-sm font-medium hover:bg-secondary flex items-center gap-2"
                  >
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 rounded-2xl text-sm font-medium hover:bg-secondary flex items-center gap-2"
                  >
                    <User className="h-4 w-4" /> {profile.name || 'Profil'}
                  </Link>
                  <button
                    onClick={() => { signOut(); setOpen(false); }}
                    className="w-full px-4 py-3 rounded-2xl text-sm font-medium hover:bg-secondary flex items-center gap-2 text-red-500"
                  >
                    <LogOut className="h-4 w-4" /> Keluar
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/auth/login"
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 rounded-2xl text-sm font-medium hover:bg-secondary"
                  >
                    Masuk
                  </Link>
                  <Link
                    to="/auth/register"
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 rounded-2xl text-sm font-bold text-primary hover:bg-primary-soft"
                  >
                    Daftar Gratis
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
