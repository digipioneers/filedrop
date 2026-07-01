import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Merchant pages
import { DashboardPage } from './pages/DashboardPage';
import { UploadFieldsPage } from './pages/UploadFieldsPage';
import { UploadFieldFormPage } from './pages/UploadFieldFormPage';
import { UploadsPage } from './pages/UploadsPage';
import { OrdersPage } from './pages/OrdersPage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AppLayout } from './components/layout/AppLayout';

// Admin pages
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminPlans } from './pages/admin/AdminPlans';
import { AdminMerchants } from './pages/admin/AdminMerchants';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminUploads } from './pages/admin/AdminUploads';

// Public pages
import { InstallDisabledPage } from './pages/public/InstallDisabledPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function TokenHandler({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  useEffect(() => {
    const token = params.get('token');
    const shop = params.get('shop');
    if (token) {
      localStorage.setItem('cfup_token', token);
      if (shop) localStorage.setItem('cfup_shop', shop);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [params]);
  return <>{children}</>;
}

function AdminRoute() {
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('admin_key'));
  if (!authenticated) return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  return <AdminLayout />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider i18n={enTranslations}>
        <BrowserRouter>
          <TokenHandler>
            <Routes>
              {/* Merchant app */}
              <Route path="/app" element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="fields" element={<UploadFieldsPage />} />
                <Route path="fields/new" element={<UploadFieldFormPage />} />
                <Route path="fields/:id/edit" element={<UploadFieldFormPage />} />
                <Route path="uploads" element={<UploadsPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Admin panel */}
              <Route path="/admin" element={<AdminRoute />}>
                <Route index element={<AdminDashboard />} />
                <Route path="plans" element={<AdminPlans />} />
                <Route path="merchants" element={<AdminMerchants />} />
                <Route path="uploads" element={<AdminUploads />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

              {/* Public */}
              <Route path="/install-disabled" element={<InstallDisabledPage />} />

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </TokenHandler>
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
}
