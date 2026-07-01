import { describe, it, expect } from 'vitest';
import { formatBytes, formatDate, formatDateTime } from '../utils/format';

describe('formatBytes', () => {
  it('should return "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
    expect(formatBytes(10_485_760)).toBe('10.0 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB');
  });

  it('should respect decimal places', () => {
    expect(formatBytes(1536, 2)).toBe('1.50 KB');
    expect(formatBytes(1536, 0)).toBe('2 KB');
  });

  it('should handle null / undefined gracefully', () => {
    expect(formatBytes(null as any)).toBe('0 B');
    expect(formatBytes(undefined as any)).toBe('0 B');
  });
});

describe('formatDate', () => {
  it('should format a date string', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/15/);
  });

  it('should format a Date object', () => {
    const result = formatDate(new Date('2024-06-01'));
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });
});

describe('formatDateTime', () => {
  it('should include both date and time', () => {
    const result = formatDateTime('2024-01-15T14:30:00Z');
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2024/);
    // Time portion should be present
    expect(result.length).toBeGreaterThan(12);
  });
});
