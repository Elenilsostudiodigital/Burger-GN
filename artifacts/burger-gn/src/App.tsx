import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "./context/CartContext";
import { AdminProvider, useAdmin } from "./context/AdminContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import NotFound from "@/pages/not-found";

import Home from "./pages/Home";
import Menu from "./pages/Menu";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Confirmation from "./pages/Confirmation";
import OrderTracking, { MyOrderPage } from "./pages/OrderTracking";
import { MyOrderFab } from "./components/MyOrderFab";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminMenuAdmin from "./pages/admin/MenuAdmin";
import AdminCoupons from "./pages/admin/Coupons";
import AdminDeliveryZones from "./pages/admin/DeliveryZones";
import AdminKmDelivery from "./pages/admin/KmDelivery";
import AdminSettingsHub from "./pages/admin/SettingsHub";
import AdminImportMenu from "./pages/admin/ImportMenu";
import AdminFinancial from "./pages/admin/Financial";
import AdminClubeBurger from "./pages/admin/ClubeBurger";
import AdminReviews from "./pages/admin/Reviews";

const queryClient = new QueryClient();

function ProtectedAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAdmin, loading } = useAdmin();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !isAdmin) setLocation("/admin/login");
  }, [loading, isAdmin, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Component />;
}

function Router() {
  return (
    <>
      <Switch>
        {/* Customer routes */}
        <Route path="/" component={Home} />
        <Route path="/cardapio" component={Menu} />
        <Route path="/carrinho" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/confirmacao" component={Confirmation} />
        <Route path="/meu-pedido" component={MyOrderPage} />
        <Route path="/pedido/:trackingId" component={OrderTracking} />

        {/* Admin routes */}
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin" component={() => <ProtectedAdminRoute component={AdminDashboard} />} />
        <Route path="/admin/cardapio" component={() => <ProtectedAdminRoute component={AdminMenuAdmin} />} />
        <Route path="/admin/financeiro" component={() => <ProtectedAdminRoute component={AdminFinancial} />} />
        <Route path="/admin/cupons" component={() => <ProtectedAdminRoute component={AdminCoupons} />} />
        <Route path="/admin/clube" component={() => <ProtectedAdminRoute component={AdminClubeBurger} />} />
        <Route path="/admin/avaliacoes" component={() => <ProtectedAdminRoute component={AdminReviews} />} />
        <Route path="/admin/taxas" component={() => <ProtectedAdminRoute component={AdminDeliveryZones} />} />
        <Route path="/admin/entrega-km" component={() => <ProtectedAdminRoute component={AdminKmDelivery} />} />
        <Route path="/admin/config" component={() => <ProtectedAdminRoute component={AdminSettingsHub} />} />
        <Route path="/admin/importar" component={() => <ProtectedAdminRoute component={AdminImportMenu} />} />

        <Route component={NotFound} />
      </Switch>
      <MyOrderFab />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AdminProvider>
            <CartProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </CartProvider>
          </AdminProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
