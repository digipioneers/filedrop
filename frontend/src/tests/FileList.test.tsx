import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { FileList } from '../components/uploads/FileList';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider i18n={enTranslations}>{children}</AppProvider>
);

const mockUploads = [
  {
    id: 'upload-1',
    originalFileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 204800,
    status: 'clean' as const,
    orderId: '1001',
    customerEmail: 'customer@example.com',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'upload-2',
    originalFileName: 'document.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 512000,
    status: 'infected' as const,
    orderId: '1001',
    createdAt: '2024-01-15T11:00:00Z',
  },
];

describe('FileList', () => {
  it('renders empty state when no uploads', () => {
    render(<FileList uploads={[]} />, { wrapper: Wrapper });
    expect(screen.getByText('No uploads yet')).toBeInTheDocument();
  });

  it('renders file names', () => {
    render(<FileList uploads={mockUploads} />, { wrapper: Wrapper });
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('shows loading spinner when loading=true', () => {
    const { container } = render(<FileList uploads={[]} loading />, { wrapper: Wrapper });
    // Polaris Spinner renders with a specific class
    expect(container.querySelector('[class*="Spinner"]') || screen.queryByRole('status')).toBeTruthy();
  });

  it('calls onDownload when Download is clicked for clean files', () => {
    const onDownload = vi.fn();
    render(<FileList uploads={mockUploads} onDownload={onDownload} />, { wrapper: Wrapper });
    const downloadBtns = screen.getAllByText('Download');
    fireEvent.click(downloadBtns[0]);
    expect(onDownload).toHaveBeenCalledWith('upload-1');
  });

  it('does not show Download for infected files', () => {
    render(<FileList uploads={mockUploads} onDownload={vi.fn()} />, { wrapper: Wrapper });
    // Only 1 download button — the infected file should not have one
    const downloadBtns = screen.queryAllByText('Download');
    expect(downloadBtns).toHaveLength(1);
  });

  it('calls onDelete when Delete is clicked', () => {
    const onDelete = vi.fn();
    render(<FileList uploads={[mockUploads[0]]} onDelete={onDelete} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('upload-1');
  });

  it('uses custom empty message', () => {
    render(
      <FileList uploads={[]} emptyMessage="No customer files for this order." />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('No customer files for this order.')).toBeInTheDocument();
  });
});
