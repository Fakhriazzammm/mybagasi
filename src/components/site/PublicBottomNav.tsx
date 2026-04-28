import { Home, Search, Package, MessageCircle, User } from "lucide-react";
import { BottomNav } from "./BottomNav";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/quotation", label: "Cek Harga", icon: Search },
  { to: "/batch-shipping", label: "Batch", icon: Package },
  { to: "/dashboard", label: "Akun", icon: User },
];

export const PublicBottomNav = () => <BottomNav items={items} />;
