import { describe, it, expect } from 'vitest';
import { percentChange } from '@/components/admin/charts';

describe('percentChange', () => {
  it('compares against the previous period', () => {
    expect(percentChange(154, 125)).toBeCloseTo(23.2, 1);
    expect(percentChange(90, 120)).toBe(-25);
    expect(percentChange(40, 40)).toBe(0);
  });

  it('gives no percentage when the previous period is too small to mean anything', () => {
    expect(percentChange(154, 5)).toBeNull();
    expect(percentChange(3, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(12, 9)).toBeNull();
    expect(percentChange(12, 10)).toBe(20);
  });

  it('takes a custom minimum base', () => {
    expect(percentChange(6, 3, 1)).toBe(100);
  });
});
