import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

export interface UploadField {
  id: string;
  merchantId: string;
  fieldType: 'image' | 'pdf' | 'video' | 'zip' | 'document' | 'custom';
  assignmentType: 'store' | 'product' | 'variant' | 'collection' | 'tag';
  assignmentIds?: string[];
  assignedTags?: string[];
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  buttonText: string;
  maxFileSizeMb: number;
  minFileSizeMb: number;
  maxFiles: number;
  allowedExtensions?: string[];
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  requiredAspectRatio?: string;
  enableCropping: boolean;
  enableRotation: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function useUploadFields() {
  return useQuery<UploadField[]>({
    queryKey: ['upload-fields'],
    queryFn: () => api.get('/uploads/fields').then((r) => r.data.data ?? []),
    staleTime: 60_000,
  });
}

export function useUploadField(id: string | undefined) {
  return useQuery<UploadField>({
    queryKey: ['upload-field', id],
    queryFn: () => api.get(`/uploads/fields/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export function useCreateUploadField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<UploadField>) =>
      api.post('/uploads/fields', data).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upload-fields'] }),
  });
}

export function useUpdateUploadField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<UploadField> & { id: string }) =>
      api.patch(`/uploads/fields/${id}`, data).then((r) => r.data.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['upload-fields'] });
      qc.invalidateQueries({ queryKey: ['upload-field', vars.id] });
    },
  });
}

export function useDeleteUploadField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/uploads/fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upload-fields'] }),
  });
}
