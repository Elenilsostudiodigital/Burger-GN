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
import ClubeCliente from "./pages/ClubeCliente";
import { MyOrderFab } from "./components/MyOrderFab";
import { useCustomerOrderSync } from "./hooks/useCustomerOrderSync";
import { AdminPanelScroll } from "./components/AdminPanelScroll";
import { AdminNotificationEngine } from "./components/AdminNotificationEngine";
import AdminLogin from "./pages/admin/Login";
import AdminForgotPassword from "./pages/admin/ForgotPassword";
import AdminSecurity from "./pages/admin/Security";
import AdminSalesDashboard from "./pages/admin/SalesDashboard";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminFinalizedOrders from "./pages/admin/FinalizedOrders";
import AdminNewOrder from "./pages/admin/NewOrder";
import AdminMenuAdmin from "./pages/admin/MenuAdmin";
import AdminCoupons from "./pages/admin/Coupons";
import AdminDeliveryZones from "./pages/admin/DeliveryZones";
import AdminKmDelivery from "./pages/admin/KmDelivery";
import AdminSettingsHub from "./pages/admin/SettingsHub";
import AdminImportMenu from "./pages/admin/ImportMenu";
import AdminFinancial from "./pages/admin/Financial";
import AdminClubeBurger from "./pages/admin/ClubeBurger";
import AdminReviews from "./pages/admin/Reviews";
import AdminClientsList from "./pages/admin/ClientsList";
import AdminClientsImport from "./pages/admin/ClientsImport";
import AdminClientDetail from "./pages/admin/ClientDetail";
import AdminClientsRecovery from "./pages/admin/ClientsRecovery";
import AdminNovasRuas from "./pages/admin/NovasRuas";
import AdminRuasEntrega from "./pages/admin/RuasEntrega";
import AdminDivulgacao from "./pages/admin/Divulgacao";
import { MenuPresenceTracker } from "./components/MenuPresenceTracker";

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

  return (
    <>
      <AdminPanelScroll />
      <AdminNotificationEngine />
      <Component />
    </>
  );
}

/** Stable route wrappers — avoid anonymous `() => <ProtectedAdminRoute…/>` remounting the page fiber. */
function AdminRuasEntregaRoute() {
  return <ProtectedAdminRoute component={AdminRuasEntrega} />;
}
function AdminNovasRuasRoute() {
  return <ProtectedAdminRoute component={AdminNovasRuas} />;
}
function AdminSettingsHubRoute() {
  return <ProtectedAdminRoute component={AdminSettingsHub} />;
}
function AdminFinalizedOrdersRoute() {
  return <ProtectedAdminRoute component={AdminFinalizedOrders} />;
}
function AdminPedidosRoute() {
  return <ProtectedAdminRoute component={AdminDashboard} />;
}
function AdminSecurityRoute() {
  return <ProtectedAdminRoute component={AdminSecurity} />;
}

function Router() {
  useCustomerOrderSync();
  return (
    <>
      <MenuPresenceTracker />
      <Switch>
        {/* Customer routes */}
        <Route path="/" component={Home} />
        <Route path="/cardapio" component={Menu} />
        <Route path="/clube" component={ClubeCliente} />
        <Route path="/carrinho" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/confirmacao" component={Confirmation} />
        <Route path="/meu-pedido" component={MyOrderPage} />
        <Route path="/pedido/:trackingId" component={OrderTracking} />

        {/* Admin routes */}
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/esqueci-senha" component={AdminForgotPassword} />
        <Route path="/admin/seguranca" component={AdminSecurityRoute} />
        <Route path="/admin/pedidos-finalizados" component={AdminFinalizedOrdersRoute} />
        <Route path="/admin/pedidos" component={AdminPedidosRoute} />
        <Route path="/admin/novo-pedido" component={() => <ProtectedAdminRoute component={AdminNewOrder} />} />
        <Route path="/admin/cardapio" component={() => <ProtectedAdminRoute component={AdminMenuAdmin} />} />
        <Route path="/admin/divulgacao" component={() => <ProtectedAdminRoute component={AdminDivulgacao} />} />
        <Route path="/admin/financeiro" component={() => <ProtectedAdminRoute component={AdminFinancial} />} />
        <Route path="/admin/cupons" component={() => <ProtectedAdminRoute component={AdminCoupons} />} />
        <Route path="/admin/clube" component={() => <ProtectedAdminRoute component={AdminClubeBurger} />} />
        <Route path="/admin/clientes/importar" component={() => <ProtectedAdminRoute component={AdminClientsImport} />} />
        <Route path="/admin/clientes/recuperacao" component={() => <ProtectedAdminRoute component={AdminClientsRecovery} />} />
        <Route path="/admin/clientes/:id" component={() => <ProtectedAdminRoute component={AdminClientDetail} />} />
        <Route path="/admin/clientes" component={() => <ProtectedAdminRoute component={AdminClientsList} />} />
        <Route path="/admin/avaliacoes" component={() => <ProtectedAdminRoute component={AdminReviews} />} />
        <Route path="/admin/taxas" component={() => <ProtectedAdminRoute component={AdminDeliveryZones} />} />
        <Route path="/admin/novas-ruas" component={AdminNovasRuasRoute} />
        <Route path="/admin/ruas-entrega" component={AdminRuasEntregaRoute} />
        <Route path="/admin/entrega-km" component={() => <ProtectedAdminRoute component={AdminKmDelivery} />} />
        <Route path="/admin/config" component={AdminSettingsHubRoute} />
        <Route path="/admin/importar" component={() => <ProtectedAdminRoute component={AdminImportMenu} />} />
        {/* Home: sales dashboard — keep after more specific /admin/* routes */}
        <Route path="/admin" component={() => <ProtectedAdminRoute component={AdminSalesDashboard} />} />

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
