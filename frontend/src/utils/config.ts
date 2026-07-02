/**
 * Central configuration — all URLs come from environment variables.
 * Set VITE_API_URL in your Railway frontend service Variables tab.
 * Example: VITE_API_URL=https://filedrop-production-6d21.up.railway.app/api/v1
 */
export const API_URL: string = (() => {
  // 1. Runtime config injected by server (window.FILEDROP_CONFIG)
  const win = window as any;
  if (win?.FILEDROP_CONFIG?.apiUrl) return win.FILEDROP_CONFIG.apiUrl;
  // 2. Vite build-time env var (set in Railway frontend Variables)
  const viteUrl = (import.meta as any).env?.VITE_API_URL;
  if (viteUrl && !viteUrl.includes('localhost')) return viteUrl;
  // 3. Last resort - same origin (works if frontend and backend are on same domain)
  return '/api/v1';
})();

export function getApiUrl(): string {
  return API_URL;
}
