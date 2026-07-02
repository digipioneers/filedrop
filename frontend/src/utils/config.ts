/**
 * Get the API base URL.
 * Hardcoded to Railway backend URL.
 */
export function getApiUrl(): string {
  const win = window as any;
  // Check runtime config first
  if (win?.FILEDROP_CONFIG?.apiUrl) {
    return win.FILEDROP_CONFIG.apiUrl;
  }
  // Check Vite env var (baked at build time)
  const viteUrl = (import.meta as any).env?.VITE_API_URL;
  if (viteUrl && !viteUrl.includes('localhost')) {
    return viteUrl;
  }
  // Hardcoded Railway backend URL - change this if your Railway URL changes
  return 'https://filedrop-production-6d21.up.railway.app/api/v1';
}
