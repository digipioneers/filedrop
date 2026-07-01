import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { FileStatusBadge } from '../components/uploads/FileStatusBadge';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider i18n={enTranslations}>{children}</AppProvider>
);

describe('FileStatusBadge', () => {
  it('renders "Clean" for clean status', () => {
    render(<FileStatusBadge status="clean" />, { wrapper: Wrapper });
    expect(screen.getByText('Clean')).toBeInTheDocument();
  });

  it('renders "Infected" for infected status', () => {
    render(<FileStatusBadge status="infected" />, { wrapper: Wrapper });
    expect(screen.getByText('Infected')).toBeInTheDocument();
  });

  it('renders "Scanning" for scanning status', () => {
    render(<FileStatusBadge status="scanning" />, { wrapper: Wrapper });
    expect(screen.getByText('Scanning')).toBeInTheDocument();
  });

  it('renders "Pending" for pending status', () => {
    render(<FileStatusBadge status="pending" />, { wrapper: Wrapper });
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders "Failed" for failed status', () => {
    render(<FileStatusBadge status="failed" />, { wrapper: Wrapper });
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
