import { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import Overview from "./pages/Overview";
import Units from "./pages/Units";
import Spareparts from "./pages/Spareparts";
import CRM from "./pages/CRM";
import Quotations from "./pages/Quotations";
import Rentals from "./pages/Rentals";
import Users from "./pages/Users";
import Tracking from "./pages/Tracking";
import Geofencing from "./pages/Geofencing";
import ServiceRequests from "./pages/ServiceRequests";
import PartsPortal from "./pages/PartsPortal";
import RCS from "./pages/RCS";
import Reports from "./pages/Reports";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-950 text-white">
        <div className="font-mono text-xs tracking-widest uppercase animate-pulse">Memuat…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  useEffect(() => {
    document.title = "SANY PERKASA — CMS";
  }, []);
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/app"
              element={
                <Protected>
                  <DashboardLayout />
                </Protected>
              }
            >
              <Route index element={<Overview />} />
              <Route path="units" element={<Units />} />
              <Route path="spareparts" element={<Spareparts />} />
              <Route path="crm" element={<CRM />} />
              <Route path="quotations" element={<Quotations />} />
              <Route path="rentals" element={<Rentals />} />
              <Route path="tracking" element={<Tracking />} />
              <Route path="geofencing" element={<Geofencing />} />
              <Route path="service" element={<ServiceRequests />} />
              <Route path="parts-portal" element={<PartsPortal />} />
              <Route path="rcs" element={<RCS />} />
              <Route path="reports" element={<Reports />} />
              <Route path="users" element={<Users />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </div>
  );
}

export default App;
