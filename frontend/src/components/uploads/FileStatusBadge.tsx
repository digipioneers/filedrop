import React from 'react';
import { Badge } from '@shopify/polaris';

type UploadStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'failed';

interface FileStatusBadgeProps {
  status: UploadStatus;
}

const STATUS_CONFIG: Record<UploadStatus, { tone: 'success' | 'critical' | 'warning' | 'attention' | 'info'; label: string }> = {
  clean:    { tone: 'success',   label: 'Clean' },
  infected: { tone: 'critical',  label: 'Infected' },
  scanning: { tone: 'attention', label: 'Scanning' },
  pending:  { tone: 'warning',   label: 'Pending' },
  failed:   { tone: 'critical',  label: 'Failed' },
};

export function FileStatusBadge({ status }: FileStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { tone: 'info' as const, label: status };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
