import React from 'react';

export function SessionExpiredPage() {
  const handleReinstall = () => {
    // Try to get shop from URL params (Shopify passes this in embedded context)
    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop') || localStorage.getItem('cfup_shop');
    if (shop) {
      const apiBase = (import.meta as any).env?.VITE_API_URL?.replace('/api/v1', '') || '';
      window.location.href = `${apiBase}/api/v1/auth/install?shop=${shop}`;
    } else {
      window.location.href = 'https://apps.shopify.com/filedrop';
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#f6f6f7',
      padding: '24px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 16px rgba(0,0,0,.1)',
        padding: '40px 48px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>
          Session Expired
        </h1>
        <p style={{ color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
          Your session has expired. Please click below to reconnect Filedrop to your Shopify store.
        </p>
        <button
          onClick={handleReinstall}
          style={{
            background: '#008060',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Reconnect to Shopify
        </button>
      </div>
    </div>
  );
}
