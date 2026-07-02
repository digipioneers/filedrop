import React, { useState, useEffect } from 'react';

import { API_URL as BACKEND } from '../../utils/config';

export function AdminSettings() {
  const [settings, setSettings] = useState<any>({ appName: 'Custom File Upload Pro', supportEmail: '', defaultTrialDays: 14, maintenanceMode: false, allowNewRegistrations: true });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const adminKey = localStorage.getItem('admin_key') || '';

  useEffect(() => {
    fetch(`${BACKEND}/admin/settings`, { headers: { 'x-admin-key': adminKey } })
      .then(r => r.json())
      .then(d => { if (d.data) setSettings(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    const r = await fetch(`${BACKEND}/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify(settings),
    });
    if (r.ok) { setToast('Settings saved!'); setTimeout(() => setToast(''), 3000); }
  };

  const s = { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };

  return (
    <div style={{ ...s, padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>App Settings</h1>
      <p style={{ color: '#637381', marginBottom: 24 }}>Global configuration for the platform</p>

      {toast && <div style={{ background: '#e3f1df', border: '1px solid #008060', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>{toast}</div>}
      {settings.maintenanceMode && <div style={{ background: '#fef3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>⚠️ Maintenance mode is ON — uploads are blocked for all merchants</div>}

      <div style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 10, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>General</h2>
        {[
          { label: 'App name', key: 'appName', type: 'text' },
          { label: 'Support email', key: 'supportEmail', type: 'email' },
          { label: 'Default trial days', key: 'defaultTrialDays', type: 'number' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{f.label}</label>
            <input type={f.type} value={settings[f.key] ?? ''} onChange={e => setSettings({ ...settings, [f.key]: f.type === 'number' ? parseInt(e.target.value) : e.target.value })}
              style={{ width: '100%', border: '1px solid #c9cccf', borderRadius: 6, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }} />
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 10, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Access Control</h2>
        {[
          { label: 'Maintenance mode (blocks all uploads)', key: 'maintenanceMode' },
          { label: 'Allow new store registrations', key: 'allowNewRegistrations' },
        ].map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <input type="checkbox" id={f.key} checked={settings[f.key] ?? false}
              onChange={e => setSettings({ ...settings, [f.key]: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <label htmlFor={f.key} style={{ fontSize: 14, cursor: 'pointer' }}>{f.label}</label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={save} style={{ background: '#008060', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
