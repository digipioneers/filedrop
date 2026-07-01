import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface Upload {
  id: string;
  merchantId: string;
  uploadFieldId?: string;
  originalFileName: string;
  sanitizedFileName: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
  imageWidth?: number;
  imageHeight?: number;
  status: 'pending' | 'scanning' | 'clean' | 'infected' | 'failed';
  scanResult?: string;
  cartToken?: string;
  orderId?: string;
  shopifyOrderId?: string;
  customerEmail?: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadsPage {
  data: Upload[];
  total: number;
}

export function useUploads(page = 1, limit = 20, orderId?: string) {
  return useQuery<UploadsPage>({
    queryKey: ['uploads', page, limit, orderId],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (orderId) params.set('orderId', orderId);
      return api.get(`/uploads?${params}`).then((r) => r.data.data);
    },
    staleTime: 30_000,
  });
}

export function useSignedUrl(uploadId: string | null) {
  return useQuery<string>({
    queryKey: ['upload-url', uploadId],
    queryFn: () =>
      api.get(`/uploads/${uploadId}/signed-url`).then((r) => r.data.data?.url),
    enabled: !!uploadId,
    staleTime: 3_300_000, // slightly less than 1-hour expiry
  });
}

export function useDeleteUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/uploads/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  });
}
