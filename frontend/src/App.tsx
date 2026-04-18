import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ReactElement } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import TaxReport from "./pages/TaxReport";
import GasLedger from "./pages/GasLedger";
import DeliverySlip from "./pages/DeliverySlip";
import Login from "./pages/Login";
import UsersPage from "./pages/Users";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider, useAuth } from "@/lib/auth";

const queryClient = new QueryClient();

/** Redirect authenticated users to their landing page by role. */
function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/" : "/tao-don"} replace />;
}

/** Protect route and enforce optional allowed roles. */
function GuardedRoute({ allowedRoles, children }: { allowedRoles?: Array<"admin" | "user">; children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Đang tải phiên đăng nhập...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "admin" ? "/" : "/tao-don"} replace />;
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
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
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
              path="/tao-don"
              element={
                <GuardedRoute allowedRoles={["user"]}>
                  <Orders creationOnly />
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
            <Route path="/home" element={<HomeRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
