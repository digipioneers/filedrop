import React, { useState } from 'react';

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { setError('Please enter the admin key'); return; }
    localStorage.setItem('admin_key', key);
    onLogin();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f6f6f7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 16px rgba(0,0,0,.1)',
        padding: '40px 48px',
        maxWidth: 400,
        width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            background: '#008060',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 24,
          }}>🔐</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1a1a1a' }}>
            Admin Panel
          </h1>
          <p style={{ color: '#888', margin: '8px 0 0', fontSize: 14 }}>
            Filedrop
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Enter admin secret key"
            value={key}
            onChange={e => { setKey(e.target.value); setError(''); }}
            style={{
              width: '100%',
              padding: '12px 14px',
              border: error ? '1.5px solid #cc0000' : '1px solid #ddd',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: '#cc0000', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#008060',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            Login
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 24 }}>
          Set ADMIN_SECRET_KEY in Railway environment variables
        </p>
      </div>
    </div>
  );
}
