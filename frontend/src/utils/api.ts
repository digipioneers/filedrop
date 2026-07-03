import axios from 'axios';
import { API_URL } from './config';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cfup_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cfup_token');

      // Get shop from stored value or Shopify's host param (base64 encoded)
      const shop = getShop();

      if (shop) {
        // Silently re-trigger OAuth — no alert, no user action needed
        const backendBase = API_URL.replace('/api/v1', '');
        window.location.href = `${backendBase}/api/v1/auth/install?shop=${shop}`;
      } else {
        // Last resort — redirect to session expired page (no native alert)
        window.location.href = '/install-expired';
      }
    }
    return Promise.reject(error);
  },
);

function getShop(): string | null {
  // 1. Stored from previous session
  const stored = localStorage.getItem('cfup_shop');
  if (stored) return stored;

  // 2. Shopify passes ?shop= directly
  const params = new URLSearchParams(window.location.search);
  const shop = params.get('shop');
  if (shop) return shop;

  // 3. Shopify passes ?host= (base64 encoded "mystore.myshopify.com/admin")
  const host = params.get('host');
  if (host) {
    try {
      const decoded = atob(host);
      const match = decoded.match(/([^/]+\.myshopify\.com)/);
      if (match) return match[1];
    } catch {}
  }

  return null;
}
