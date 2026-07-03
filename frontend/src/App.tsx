import React, { useEffect } from 'react';
import { useState } from 'react';
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
import { SessionExpiredPage } from './pages/public/SessionExpiredPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/**
 * Persists `shop`/`host` from the URL so the API client (utils/api.ts) can
 * still figure out which shop to redirect to for re-install if a session
 * token request ever fails. App Bridge (loaded via CDN in index.html) reads
 * the shopify-api-key meta tag and the `host` URL param itself to bootstrap
 * `window.shopify` — there's no provider component needed anymore.
 */
function ShopContextHandler({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  useEffect(() => {
    const shop = params.get('shop');
    const host = params.get('host');

    if (host) {
      localStorage.setItem('cfup_host', host);
      try {
        const decoded = atob(host);
        const match = decoded.match(/([^/]+\.myshopify\.com)/);
        if (match?.[1]) localStorage.setItem('cfup_shop', match[1]);
      } catch {}
    }

    if (shop) localStorage.setItem('cfup_shop', shop);
  }, [params]);
  return <>{children}</>;
}

function AdminRoute() {
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('admin_key'));
  if (!authenticated) return <AdminLogin onLogin={() => setAuthenticated(true)} />;
  return <AdminLayout />;
}

function AppWithBridge() {
  return (
    <AppProvider i18n={enTranslations}>
      <ShopContextHandler>
        <AppRoutes />
      </ShopContextHandler>
    </AppProvider>
  );
}

function AppRoutes() {
  return (
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
      <Route path="/install-expired" element={<SessionExpiredPage />} />

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppWithBridge />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
