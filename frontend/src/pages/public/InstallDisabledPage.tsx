import React from 'react';

export function InstallDisabledPage() {
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
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>
          Installations Temporarily Paused
        </h1>
        <p style={{ color: '#666', marginBottom: 0, lineHeight: 1.6 }}>
          We're not accepting new store installs right now. Please check back shortly,
          or contact support if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
}
