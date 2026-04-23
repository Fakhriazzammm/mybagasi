import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import WhatsAppDemo from "./pages/WhatsAppDemo.tsx";
import Quotation from "./pages/Quotation.tsx";
import NotFound from "./pages/NotFound.tsx";
import Install from "./pages/Install.tsx";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import Quotations from "./pages/dashboard/Quotations";
import Orders from "./pages/dashboard/Orders";
import OrderDetail from "./pages/dashboard/OrderDetail";
import Wishlist from "./pages/dashboard/Wishlist";
import PriceAlerts from "./pages/dashboard/PriceAlerts";
import Addresses from "./pages/dashboard/Addresses";
import Membership from "./pages/dashboard/Membership";
import Points from "./pages/dashboard/Points";
import AIShopper from "./pages/dashboard/AIShopper";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentStatusPage from "./pages/PaymentStatusPage";
import BatchShipping from "./pages/BatchShipping";
import Preorder from "./pages/Preorder";
import { AdminLayout } from "./components/admin/AdminLayout";
import AdminOverview from "./pages/admin/Overview";
import Procurement from "./pages/admin/Procurement";
import TrackingExceptionsPage from "./pages/admin/TrackingExceptions";
import ScraperFailuresPage from "./pages/admin/ScraperFailures";
import Approvals from "./pages/admin/Approvals";
import Support from "./pages/admin/Support";
import { FinanceLayout } from "./components/finance/FinanceLayout";
import FinanceOverview from "./pages/finance/Overview";
import Payments from "./pages/finance/Payments";
import Pending from "./pages/finance/Pending";
import Refunds from "./pages/finance/Refunds";
import PointsLedger from "./pages/finance/Points";
import AffiliatePayoutPage from "./pages/finance/Affiliate";
import MembershipRevenuePage from "./pages/finance/Membership";
import { SuperAdminLayout } from "./components/superadmin/SuperAdminLayout";
import SuperAdminOverview from "./pages/superadmin/Overview";
import UsersPage from "./pages/superadmin/Users";
import Plans from "./pages/superadmin/Plans";
import Pricing from "./pages/superadmin/Pricing";
import Fees from "./pages/superadmin/Fees";
import Shipping from "./pages/superadmin/Shipping";
import Marketplaces from "./pages/superadmin/Marketplaces";
import Commission from "./pages/superadmin/Commission";
import AISettingsPage from "./pages/superadmin/AISettings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/whatsapp-demo" element={<WhatsAppDemo />} />
          <Route path="/quotation" element={<Quotation />} />
          <Route path="/batch-shipping" element={<BatchShipping />} />
          <Route path="/preorder" element={<Preorder />} />
          <Route path="/install" element={<Install />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/payment/status" element={<PaymentStatusPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="procurement" element={<Procurement />} />
            <Route path="tracking" element={<TrackingExceptionsPage />} />
            <Route path="scraper" element={<ScraperFailuresPage />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="support" element={<Support />} />
          </Route>
          <Route path="/finance" element={<FinanceLayout />}>
            <Route index element={<FinanceOverview />} />
            <Route path="payments" element={<Payments />} />
            <Route path="pending" element={<Pending />} />
            <Route path="refunds" element={<Refunds />} />
            <Route path="points" element={<PointsLedger />} />
            <Route path="affiliate" element={<AffiliatePayoutPage />} />
            <Route path="membership" element={<MembershipRevenuePage />} />
          </Route>
          <Route path="/super-admin" element={<SuperAdminLayout />}>
            <Route index element={<SuperAdminOverview />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="plans" element={<Plans />} />
            <Route path="pricing" element={<Pricing />} />
            <Route path="fees" element={<Fees />} />
            <Route path="shipping" element={<Shipping />} />
            <Route path="marketplaces" element={<Marketplaces />} />
            <Route path="commission" element={<Commission />} />
            <Route path="ai" element={<AISettingsPage />} />
          </Route>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<Overview />} />
            <Route path="quotations" element={<Quotations />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="price-alerts" element={<PriceAlerts />} />
            <Route path="addresses" element={<Addresses />} />
            <Route path="membership" element={<Membership />} />
            <Route path="points" element={<Points />} />
            <Route path="ai-shopper" element={<AIShopper />} />
            <Route path="shopper-ai" element={<AIShopper />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
