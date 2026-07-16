export const formatBytes = (bytes: number, decimals = 2): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

export const formatDate = (d: string): string =>
  new Date(d).toLocaleDateString();

export const formatDateTime = (d: string): string =>
  new Date(d).toLocaleString();
