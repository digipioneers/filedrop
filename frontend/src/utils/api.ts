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

      // Get shop from multiple sources
      const shop =
        localStorage.getItem('cfup_shop') ||
        new URLSearchParams(window.location.search).get('shop') ||
        // Extract from Shopify embedded app URL pattern
        extractShopFromReferrer();

      if (shop) {
        const backendBase = API_URL.replace('/api/v1', '');
        window.location.href = `${backendBase}/api/v1/auth/install?shop=${shop}`;
      } else {
        // No alert — just redirect to install page with instructions
        window.location.href = '/install-expired';
      }
    }
    return Promise.reject(error);
  },
);

function extractShopFromReferrer(): string | null {
  try {
    // Shopify passes shop in URL when loading embedded app
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    if (host) {
      const decoded = atob(host);
      const match = decoded.match(/([^/]+\.myshopify\.com)/);
      if (match) return match[1];
    }
  } catch {}
  return null;
}
