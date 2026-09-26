import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ReactElement } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Products from "./pages/Products";
import TaxReport from "./pages/TaxReport";
import GasLedger from "./pages/GasLedger";
import DeliverySlip from "./pages/DeliverySlip";
import Login from "./pages/Login";
import UsersPage from "./pages/Users";
import CylinderTemplatesPage from "./pages/CylinderTemplates";
import StaffOrderHistory from "./pages/StaffOrderHistory";
import OrderNotes from "./pages/OrderNotes";
import CoreOperations from "./pages/CoreOperations";
import FinanceGovernance from "./pages/FinanceGovernance";
import CustomerExperience from "./pages/CustomerExperience";
import StaffDeliveryMap from "./pages/StaffDeliveryMap";
import CustomerProfilesMock from "./pages/CustomerProfilesMock";
import NotFound from "./pages/NotFound.tsx";
import PlanRedirect from "./pages/PlanRedirect";
import TnPlanRedirect from "./pages/TnPlanRedirect";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ADMIN_HOME_PATH, ERP_LOGIN_PATH, STAFF_HOME_PATH } from "@/lib/appPaths";
import StoreLanding from "./pages/StoreLanding";

const queryClient = new QueryClient();

/** Admin bookmarks ``/ban-do`` → Đơn hàng tab bản đồ; staff vẫn xem trang bản đồ. */
function BanDoRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Đang tải phiên đăng nhập…</div>;
  if (!user) return <Navigate to={ERP_LOGIN_PATH} replace />;
  if (user.role === "admin") return <Navigate to="/don-hang?tab=map" replace />;
  return <StaffDeliveryMap />;
}

/** Send a signed-in user to the ERP home for their role. */
function roleHome(role: "admin" | "user") {
  return role === "admin" ? ADMIN_HOME_PATH : STAFF_HOME_PATH;
}

/** Redirect authenticated users to their ERP home by role. */
function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to={ERP_LOGIN_PATH} replace />;
  return <Navigate to={roleHome(user.role)} replace />;
}

/** Protect route and enforce optional allowed roles. */
function GuardedRoute({ allowedRoles, children }: { allowedRoles?: Array<"admin" | "user">; children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Đang tải phiên đăng nhập...</div>;
  if (!user) return <Navigate to={ERP_LOGIN_PATH} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }
  return children;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<StoreLanding />} />
            <Route path="/login" element={<Navigate to={ERP_LOGIN_PATH} replace />} />
            <Route path={ERP_LOGIN_PATH} element={<Login />} />
            <Route
              path={ADMIN_HOME_PATH}
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <Dashboard />
                </GuardedRoute>
              }
            />
            <Route
              path="/don-hang"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <Orders />
                </GuardedRoute>
              }
            />
            <Route
              path="/don-cua-toi"
              element={
                <GuardedRoute allowedRoles={["user"]}>
                  <StaffOrderHistory />
                </GuardedRoute>
              }
            />
            <Route
              path="/ghi-chu-giao"
              element={
                <GuardedRoute allowedRoles={["admin", "user"]}>
                  <OrderNotes />
                </GuardedRoute>
              }
            />
            <Route
              path="/don-hang/phieu/:id"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <DeliverySlip />
                </GuardedRoute>
              }
            />
            <Route
              path="/so-gas"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <GasLedger />
                </GuardedRoute>
              }
            />
            <Route
              path="/san-pham"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <Products />
                </GuardedRoute>
              }
            />
            <Route
              path="/kho"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <Inventory />
                </GuardedRoute>
              }
            />
            <Route
              path="/bao-cao-thue"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <TaxReport />
                </GuardedRoute>
              }
            />
            <Route
              path="/nguoi-dung"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <UsersPage />
                </GuardedRoute>
              }
            />
            <Route
              path="/mau-chai"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <CylinderTemplatesPage />
                </GuardedRoute>
              }
            />
            <Route
              path="/dieu-hanh"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <CoreOperations />
                </GuardedRoute>
              }
            />
            <Route
              path="/tai-chinh-quan-tri"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <FinanceGovernance />
                </GuardedRoute>
              }
            />
            <Route
              path="/trai-nghiem-khach-hang"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <CustomerExperience />
                </GuardedRoute>
              }
            />
            <Route
              path="/khach-hang-mock"
              element={
                <GuardedRoute allowedRoles={["admin"]}>
                  <CustomerProfilesMock />
                </GuardedRoute>
              }
            />
            <Route
              path="/ban-do"
              element={
                <GuardedRoute allowedRoles={["admin", "user"]}>
                  <BanDoRedirect />
                </GuardedRoute>
              }
            />
            <Route path="/ban-do-mock" element={<Navigate to="/ban-do" replace />} />
            <Route path="/plan" element={<PlanRedirect />} />
            <Route path="/tn-plan" element={<TnPlanRedirect />} />
            <Route path="/home" element={<HomeRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
