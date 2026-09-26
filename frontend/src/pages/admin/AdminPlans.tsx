import React, { useState, useEffect } from 'react';

import { API_URL as BACKEND } from '../../utils/config';

function bytesToGB(b: number) { return String(Math.round(b / 1_073_741_824)); }
function bytesToMB(b: number) { return String(Math.round(b / 1_048_576)); }
function gbToBytes(g: string) { return Math.round(Number(g) * 1_073_741_824); }
function mbToBytes(m: string) { return Math.round(Number(m) * 1_048_576); }

// Extract array from ANY response format
function extractArray(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data?.data)) return d.data.data;  // {data:{data:[]}}
  if (Array.isArray(d?.data)) return d.data;             // {data:[]}
  if (Array.isArray(d?.plans)) return d.plans;
  return [];
}

// The per-plan feature flags the storefront/admin enforce. Editing these here
// controls which features are available on each plan.
const FEATURES: { key: string; label: string }[] = [
  { key: 'imageEditor', label: 'Image editor (crop/rotate)' },
  { key: 'productPreview', label: 'Live product preview' },
  { key: 'customerPositioning', label: 'Customer can reposition their design' },
  { key: 'conditionalLogic', label: 'Conditional upload logic (assignment rules)' },
  { key: 'emailNotifications', label: 'Email notifications' },
  { key: 'customBranding', label: 'Custom branding' },
  { key: 'prioritySupport', label: 'Priority support' },
];

// Optional capability a feature row can be tied to. Picking one makes the row
// actually unlock that feature on the plan (gated by the app). Leaving it blank
// makes the row display-only marketing text.
const CAPABILITIES: { value: string; label: string }[] = [
  { value: '', label: '— display only —' },
  { value: 'imageEditor', label: 'Unlocks: Image editor' },
  { value: 'productPreview', label: 'Unlocks: Live product preview' },
  { value: 'customerPositioning', label: 'Unlocks: Customer positioning' },
  { value: 'conditionalLogic', label: 'Unlocks: Conditional upload logic' },
  { value: 'emailNotifications', label: 'Unlocks: Email notifications' },
  { value: 'customBranding', label: 'Unlocks: Custom branding' },
  { value: 'prioritySupport', label: 'Unlocks: Priority support' },
];

export function AdminPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState('');
  const [edits, setEdits] = useState<Record<string, any>>({});
  const adminKey = localStorage.getItem('admin_key') || '';

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`${BACKEND}/admin/plans?t=${Date.now()}`, {
      headers: { 'x-admin-key': adminKey }
    })
      .then(async r => {
        const text = await r.text();
        setRawResponse(text.slice(0, 500));
        if (!r.ok) { setError(`HTTP ${r.status}: ${text.slice(0, 200)}`); setLoading(false); return; }
        let d: any;
        try { d = JSON.parse(text); } catch { setError(`Invalid JSON: ${text.slice(0, 200)}`); setLoading(false); return; }
        const list = extractArray(d);
        if (list.length === 0) { setError(`No plans in response`); setLoading(false); return; }
        const e: Record<string, any> = {};
        list.forEach((p: any) => {
          e[p.id] = {
            displayName: p.displayName || '',
            monthlyPrice: String(p.monthlyPrice ?? 0),
            uploadsPerMonth: String(p.uploadsPerMonth ?? 100),
            storageGB: bytesToGB(p.storageBytes ?? 1073741824),
            maxFileSizeMB: bytesToMB(p.maxFileSizeBytes ?? 10485760),
            isActive: p.isActive !== false,
            features: { ...(p.features || {}) },
            // Editable feature rows. Use the saved list if present, otherwise
            // convert the plan's current boolean features into editable rows so
            // the admin sees today's features immediately.
            featureList:
              Array.isArray(p.featureList) && p.featureList.length
                ? p.featureList.map((f: any) => ({ label: f.label || '', capability: f.capability || '' }))
                : FEATURES.filter((ft) => (p.features || {})[ft.key]).map((ft) => ({ label: ft.label, capability: ft.key })),
          };
        });
        setPlans(list);
        setEdits(e);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const save = async (id: string) => {
    setSaving(id);
    const e = edits[id];
    try {
      const r = await fetch(`${BACKEND}/admin/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          displayName: e.displayName,
          monthlyPrice: parseFloat(e.monthlyPrice),
          uploadsPerMonth: parseInt(e.uploadsPerMonth),
          storageBytes: gbToBytes(e.storageGB),
          maxFileSizeBytes: mbToBytes(e.maxFileSizeMB),
          isActive: e.isActive,
          featureList: (e.featureList || []).filter((f: any) => f && (f.label || f.capability)),
        }),
      });
      const d = await r.json();
      if (r.ok) { setToast('Saved!'); setTimeout(() => setToast(''), 3000); load(); }
      else setToast(`Error: ${d.message}`);
    } catch (err: any) { setToast(`Error: ${err.message}`); }
    setSaving('');
  };

  const createPlan = async () => {
    setToast('');
    try {
      const r = await fetch(`${BACKEND}/admin/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          displayName: 'New Plan',
          monthlyPrice: 0,
          uploadsPerMonth: 100,
          storageBytes: 2147483648,   // 2 GB
          maxFileSizeBytes: 10485760, // 10 MB
          features: {},
          isActive: true,
          sortOrder: 99,
        }),
      });
      const d = await r.json();
      if (r.ok) { setToast('New plan created — edit its details below.'); load(); }
      else setToast(`Error: ${d.message}`);
    } catch (err: any) { setToast(`Error: ${err.message}`); }
  };

  const deletePlan = async (id: string, displayName: string) => {
    if (!window.confirm(`Delete the "${displayName}" plan?\n\nMerchants already on it keep it, but it will be hidden from new sign-ups.`)) return;
    setToast('');
    try {
      const r = await fetch(`${BACKEND}/admin/plans/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setToast(d.deactivated ? 'Plan is in use — deactivated (hidden from new sign-ups).' : 'Plan deleted.');
        load();
      } else setToast(`Error: ${d.message || 'Failed to delete plan'}`);
    } catch (err: any) { setToast(`Error: ${err.message}`); }
  };

  const addFeature = (id: string) =>
    setEdits(p => ({ ...p, [id]: { ...p[id], featureList: [...(p[id]?.featureList || []), { label: '', capability: '' }] } }));
  const updateFeature = (id: string, idx: number, patch: any) =>
    setEdits(p => {
      const list = [...(p[id]?.featureList || [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...p, [id]: { ...p[id], featureList: list } };
    });
  const removeFeature = (id: string, idx: number) =>
    setEdits(p => {
      const list = [...(p[id]?.featureList || [])];
      list.splice(idx, 1);
      return { ...p, [id]: { ...p[id], featureList: list } };
    });

  const f = { fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };

  if (loading) return <div style={{ ...f, padding: 40, textAlign: 'center', color: '#637381' }}>Loading plans...</div>;

  if (error) return (
    <div style={{ ...f, padding: 32 }}>
      <div style={{ background: '#fef3cd', border: '1px solid #ffc107', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <strong>Error:</strong> {error}
      </div>
      <div style={{ background: '#f4f6f8', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 12 }}>
        <strong>Raw API response:</strong>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>{rawResponse}</pre>
      </div>
      <div style={{ background: '#e8f0fe', borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 13 }}>
        Admin key: <strong>{adminKey || 'NOT SET'}</strong> ({adminKey.length} chars)
      </div>
      <button onClick={load} style={{ background: '#008060', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer' }}>Try Again</button>
    </div>
  );

  return (
    <div style={{ ...f, padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Plan Management</h1>
      <p style={{ color: '#637381', marginBottom: 16 }}>Add, edit or remove plans — pricing, limits and features. Changes apply to the app's Plan &amp; Billing page.</p>

      <div style={{ marginBottom: 24 }}>
        <button
          onClick={createPlan}
          style={{ background: '#008060', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
        >
          + Add Plan
        </button>
      </div>

      {toast && (
        <div style={{ background: toast.startsWith('Error') ? '#fbeae5' : '#e3f1df', border: '1px solid', borderColor: toast.startsWith('Error') ? '#de3618' : '#008060', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          {toast}
        </div>
      )}

      {plans.map(plan => (
        <div key={plan.id} style={{ background: '#fff', border: '1px solid #e1e3e5', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ background: plan.name === 'free' ? '#f4f6f8' : plan.name === 'starter' ? '#e3f1df' : plan.name === 'pro' ? '#e8f0fe' : '#fdf1e3', padding: '16px 24px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{plan.displayName} Plan</h2>
            <span style={{ background: plan.isActive ? '#008060' : '#de3618', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
              {plan.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            {[
              { label: 'Display Name', key: 'displayName', type: 'text', pre: '', suf: '' },
              { label: 'Monthly Price (USD)', key: 'monthlyPrice', type: 'number', pre: '$', suf: '' },
              { label: 'Uploads/Month (-1=unlimited)', key: 'uploadsPerMonth', type: 'number', pre: '', suf: '' },
              { label: 'Storage Limit', key: 'storageGB', type: 'number', pre: '', suf: 'GB' },
              { label: 'Max File Size', key: 'maxFileSizeMB', type: 'number', pre: '', suf: 'MB' },
            ].map(field => (
              <div key={field.key}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{field.label}</label>
                <div style={{ display: 'flex', border: '1px solid #c9cccf', borderRadius: 6, overflow: 'hidden' }}>
                  {field.pre && <span style={{ padding: '8px 10px', background: '#f6f6f7', color: '#637381', fontSize: 13 }}>{field.pre}</span>}
                  <input
                    type={field.type}
                    value={edits[plan.id]?.[field.key] ?? ''}
                    onChange={e => setEdits(p => ({ ...p, [plan.id]: { ...p[plan.id], [field.key]: e.target.value } }))}
                    style={{ flex: 1, border: 'none', padding: '8px 10px', fontSize: 14, outline: 'none' }}
                  />
                  {field.suf && <span style={{ padding: '8px 10px', background: '#f6f6f7', color: '#637381', fontSize: 13 }}>{field.suf}</span>}
                </div>
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Status</label>
              <select
                value={edits[plan.id]?.isActive ? 'true' : 'false'}
                onChange={e => setEdits(p => ({ ...p, [plan.id]: { ...p[plan.id], isActive: e.target.value === 'true' } }))}
                style={{ width: '100%', border: '1px solid #c9cccf', borderRadius: 6, padding: '9px 10px', fontSize: 14 }}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '0 24px 20px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Features for this plan</label>
            <p style={{ fontSize: 12, color: '#637381', margin: '0 0 12px' }}>
              These show on the app's Plan &amp; Billing page. Pick a capability to also <em>unlock</em> that feature on this plan; leave “display only” for marketing text.
            </p>
            {(edits[plan.id]?.featureList || []).map((feat: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input
                  type="text"
                  value={feat.label}
                  placeholder="Feature label shown to merchants"
                  onChange={e => updateFeature(plan.id, idx, { label: e.target.value })}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid #c4cdd5', borderRadius: 6, fontSize: 13 }}
                />
                <select
                  value={feat.capability || ''}
                  onChange={e => updateFeature(plan.id, idx, { capability: e.target.value })}
                  title="Optionally tie this row to a real feature the app enforces"
                  style={{ padding: '8px 10px', border: '1px solid #c4cdd5', borderRadius: 6, fontSize: 13, minWidth: 230 }}
                >
                  {CAPABILITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button
                  onClick={() => removeFeature(plan.id, idx)}
                  title="Delete this feature"
                  style={{ background: '#fff', color: '#de3618', border: '1px solid #de3618', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => addFeature(plan.id)}
              style={{ background: '#f4f6f8', border: '1px solid #c4cdd5', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500, marginTop: 4 }}
            >
              + Add feature
            </button>
          </div>

          <div style={{ padding: '0 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {!plan.isDefault && (
                <button
                  onClick={() => deletePlan(plan.id, plan.displayName)}
                  style={{ background: '#fff', color: '#de3618', border: '1px solid #de3618', borderRadius: 6, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                >
                  Delete
                </button>
              )}
            </div>
            <button
              onClick={() => save(plan.id)}
              disabled={saving === plan.id}
              style={{ background: '#008060', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 500, opacity: saving === plan.id ? 0.7 : 1 }}
            >
              {saving === plan.id ? 'Saving...' : `Save ${plan.displayName} Plan`}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
