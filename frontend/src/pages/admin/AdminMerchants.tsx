import React, { useState, useEffect } from 'react';

const BACKEND = 'https://filedrop-production-6d21.up.railway.app/api/v1';

function fmt(b: number) {
  if (b >= 1e9) return `${(b/1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b/1e6).toFixed(2)} MB`;
  return `${(b/1024).toFixed(1)} KB`;
}

export function AdminMerchants() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState('');
  const adminKey = localStorage.getItem('admin_key') || '';

  const load = () => {
    setLoading(true);
    fetch(`${BACKEND}/admin/merchants?t=${Date.now()}`, { headers: { 'x-admin-key': adminKey } })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message); setMerchants(Array.isArray(d.data) ? d.data : []); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const deleteMerchant = async (id: string, domain: string) => {
    if (!confirm(`Delete ${domain}? This cannot be undone.`)) return;
    setDeleting(id);
    await fetch(`${BACKEND}/admin/merchants/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
    setDeleting('');
    load();
  };

  const s = { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };
  const filtered = merchants.filter(m => !search || m.shopDomain?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ ...s, padding: 40, textAlign: 'center', color: '#637381' }}>Loading merchants...</div>;
  if (error) return <div style={{ ...s, padding: 40 }}><div style={{ background: '#fef3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 20 }}><strong>Error:</strong> {error}</div></div>;

  return (
    <div style={{ ...s, padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Merchants</h1>
      <p style={{ color: '#637381', marginBottom: 20 }}>{merchants.length} total merchants</p>

      <input
        placeholder="Search by shop domain..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', border: '1px solid #c9cccf', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}
      />

      <div style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f6f7' }}>
              {['Shop', 'Status', 'Plan', 'Uploads', 'Storage', 'Joined', 'Action'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#637381' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m: any) => (
              <tr key={m.id} style={{ borderTop: '1px solid #f1f1f1' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{m.shopDomain}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ background: m.isActive ? '#e3f1df' : '#fef3cd', color: m.isActive ? '#008060' : '#916a00', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>{m.subscription?.status || 'free'}</td>
                <td style={{ padding: '12px 16px' }}>{m.totalUploads ?? 0}</td>
                <td style={{ padding: '12px 16px' }}>{fmt(m.storageUsedBytes ?? 0)}</td>
                <td style={{ padding: '12px 16px', color: '#637381' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => deleteMerchant(m.id, m.shopDomain)} disabled={deleting === m.id}
                    style={{ background: '#de3618', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
                    {deleting === m.id ? '...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#637381' }}>No merchants found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
