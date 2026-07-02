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
      const shop = localStorage.getItem('cfup_shop') ||
        new URLSearchParams(window.location.search).get('shop');
      if (shop) {
        localStorage.removeItem('cfup_token');
        // Derive backend base URL from API_URL by removing /api/v1
        const backendBase = API_URL.replace('/api/v1', '');
        window.location.href = `${backendBase}/api/v1/auth/install?shop=${shop}`;
      } else {
        alert('Session expired. Please reinstall the app from Shopify Admin.');
        window.location.href = '/app';
      }
    }
    return Promise.reject(error);
  },
);
