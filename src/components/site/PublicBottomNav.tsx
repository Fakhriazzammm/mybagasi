import { Home, Search, Package, ShoppingCart, User } from "lucide-react";
import { BottomNav } from "./BottomNav";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/aipersonalshopper", label: "AI Shopper", icon: Search },
  { to: "/cart", label: "Cart", icon: ShoppingCart },
  { to: "/jadwal", label: "Jadwal", icon: Package },
  { to: "/dashboard", label: "Akun", icon: User },
];

export const PublicBottomNav = () => <BottomNav items={items} />;
