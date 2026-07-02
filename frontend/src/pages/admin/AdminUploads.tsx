import React, { useState, useEffect } from 'react';

import { API_URL as BACKEND } from '../../utils/config';

function fmt(b: number) {
  if (b >= 1e9) return `${(b/1e9).toFixed(2)} GB`;
  if (b >= 1e6) return `${(b/1e6).toFixed(2)} MB`;
  return `${(b/1024).toFixed(1)} KB`;
}

const STATUS_COLORS: Record<string, any> = {
  clean: { bg: '#e3f1df', color: '#008060' },
  infected: { bg: '#fbeae5', color: '#de3618' },
  pending: { bg: '#fff3cd', color: '#916a00' },
  scanning: { bg: '#e8f0fe', color: '#1a73e8' },
};

export function AdminUploads() {
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const adminKey = localStorage.getItem('admin_key') || '';

  useEffect(() => {
    fetch(`${BACKEND}/admin/uploads?t=${Date.now()}`, { headers: { 'x-admin-key': adminKey } })
      .then(r => r.json())
      .then(d => { setUploads(Array.isArray(d.data) ? d.data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const s = { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };
  const filtered = uploads.filter(u => !search || u.originalFileName?.toLowerCase().includes(search.toLowerCase()) || u.customerEmail?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ ...s, padding: 40, textAlign: 'center', color: '#637381' }}>Loading uploads...</div>;

  return (
    <div style={{ ...s, padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>All Uploads</h1>
      <p style={{ color: '#637381', marginBottom: 20 }}>{uploads.length} total uploads across all merchants</p>
      <input placeholder="Search by filename or email..." value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', border: '1px solid #c9cccf', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }} />
      <div style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f6f7' }}>
              {['File', 'Customer', 'Size', 'Type', 'Status', 'Date'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#637381' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => {
              const sc = STATUS_COLORS[u.status] || STATUS_COLORS.pending;
              return (
                <tr key={u.id} style={{ borderTop: '1px solid #f1f1f1' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.originalFileName}</td>
                  <td style={{ padding: '12px 16px', color: '#637381' }}>{u.customerEmail || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{fmt(u.fileSizeBytes || 0)}</td>
                  <td style={{ padding: '12px 16px', color: '#637381', fontSize: 11 }}>{u.mimeType}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{u.status}</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#637381' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#637381' }}>No uploads yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
