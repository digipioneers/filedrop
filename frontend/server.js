/**
 * Simple static file server for the React SPA.
 * Sets correct security headers for Shopify embedded apps:
 * - Removes X-Frame-Options (it blocks Shopify admin from loading the iframe)
 * - Sets Content-Security-Policy frame-ancestors to allow only Shopify domains
 */
const express = require('express');
const path = require('path');
const app = express();

const DIST = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 3001;

// Security headers for Shopify embedded app
app.use((req, res, next) => {
  // Allow Shopify to load this in an iframe
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Static files with caching
app.use(express.static(DIST, {
  maxAge: '1y',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
});
