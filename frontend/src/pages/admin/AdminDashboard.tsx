import React, { useState, useEffect } from 'react';

const BACKEND = 'https://filedrop-production-28dd.up.railway.app/api/v1';

function fmt(b: number) {
  if (b >= 1e9) return `${(b/1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b/1e6).toFixed(2)} MB`;
  return `${(b/1024).toFixed(1)} KB`;
}

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const adminKey = localStorage.getItem('admin_key') || '';

  useEffect(() => {
    fetch(`${BACKEND}/admin/metrics?t=${Date.now()}`, {
      headers: { 'x-admin-key': adminKey },
    })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || r.status);
        setMetrics(d.data);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const s = { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };

  if (loading) return <div style={{ ...s, padding: 40, textAlign: 'center', color: '#637381' }}>Loading metrics...</div>;
  if (error) return <div style={{ ...s, padding: 40 }}><div style={{ background: '#fef3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 20 }}><strong>Error:</strong> {error}</div></div>;

  const stats = [
    { label: 'Total Merchants', value: metrics?.totalMerchants ?? 0 },
    { label: 'Active Merchants', value: metrics?.activeMerchants ?? 0 },
    { label: 'Total Uploads', value: metrics?.totalUploads ?? 0 },
    { label: 'Total Storage', value: fmt(metrics?.totalStorageBytes ?? 0) },
  ];

  return (
    <div style={{ ...s, padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>Admin Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, color: '#637381', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#202223' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e1e3e5' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Recent merchants</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f6f7' }}>
              {['Shop Domain', 'Status', 'Uploads', 'Storage', 'Joined'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#637381' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(metrics?.recentMerchants ?? []).map((m: any) => (
              <tr key={m.id} style={{ borderTop: '1px solid #f1f1f1' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{m.shopDomain}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ background: m.isActive ? '#e3f1df' : '#fef3cd', color: m.isActive ? '#008060' : '#916a00', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>{m.totalUploads ?? 0}</td>
                <td style={{ padding: '12px 16px' }}>{fmt(m.storageUsedBytes ?? 0)}</td>
                <td style={{ padding: '12px 16px', color: '#637381' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {(metrics?.recentMerchants ?? []).length === 0 && (
              <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#637381' }}>No merchants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
