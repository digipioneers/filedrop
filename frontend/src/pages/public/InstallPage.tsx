import React from 'react';

interface InstallPageProps {
  shopifyApiKey?: string;
}

export function InstallPage({ shopifyApiKey }: InstallPageProps) {
  const apiUrl = import.meta.env.VITE_API_URL || '/api/v1';

  const handleInstall = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const shop = (form.elements.namedItem('shop') as HTMLInputElement).value.trim();
    if (!shop) return;
    const normalised = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    window.location.href = `${apiUrl}/auth/install?shop=${encodeURIComponent(normalised)}`;
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
        <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>
          Filedrop
        </h1>
        <p style={{ color: '#666', marginBottom: 32, lineHeight: 1.6 }}>
          Let customers upload files — images, PDFs, videos — right on your product pages.
        </p>

        <form onSubmit={handleInstall}>
          <input
            name="shop"
            type="text"
            placeholder="your-store.myshopify.com"
            required
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              fontSize: 15,
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px 24px',
              background: '#008060',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Install App
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 13, color: '#999' }}>
          By installing, you agree to our{' '}
          <a href="/privacy.html" style={{ color: '#008060' }}>Privacy Policy</a>
          {' '}and{' '}
          <a href="/terms.html" style={{ color: '#008060' }}>Terms of Service</a>.
        </p>
      </div>
    </div>
  );
}

export function ErrorPage({ message = 'Something went wrong. Please try again.' }: { message?: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#f6f6f7',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '40px 48px',
        maxWidth: 440,
        textAlign: 'center',
        boxShadow: '0 2px 16px rgba(0,0,0,.1)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#cc0000', marginBottom: 12 }}>Error</h1>
        <p style={{ color: '#555', lineHeight: 1.6 }}>{message}</p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: 24,
            padding: '10px 24px',
            background: '#008060',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Go Home
        </a>
      </div>
    </div>
  );
}
