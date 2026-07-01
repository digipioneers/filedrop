import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/admin', label: '📊 Dashboard', exact: true },
  { path: '/admin/plans', label: '💰 Plans & Pricing' },
  { path: '/admin/merchants', label: '🏪 Merchants' },
  { path: '/admin/uploads', label: '📁 All Uploads' },
  { path: '/admin/settings', label: '⚙️ App Settings' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string, exact = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const handleLogout = () => {
    localStorage.removeItem('admin_key');
    window.location.reload();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Sidebar */}
      <div style={{
        width: 220,
        background: '#1a1a2e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#00d4aa' }}>⬆️ Filedrop</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Admin Panel</div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 20px',
                background: isActive(item.path, item.exact) ? 'rgba(0,212,170,.15)' : 'none',
                border: 'none',
                borderLeft: isActive(item.path, item.exact) ? '3px solid #00d4aa' : '3px solid transparent',
                color: isActive(item.path, item.exact) ? '#00d4aa' : 'rgba(255,255,255,.7)',
                fontSize: 13,
                fontWeight: isActive(item.path, item.exact) ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,.2)',
              borderRadius: 6,
              color: 'rgba(255,255,255,.6)',
              padding: '8px 14px',
              fontSize: 12,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, background: '#f6f6f7', overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
