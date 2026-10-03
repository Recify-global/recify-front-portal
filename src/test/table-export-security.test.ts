import { describe, expect, it } from 'vitest';
import { neutralizeCsvFormula } from '@/utils/table-export';

describe('CSV formula injection hardening', () => {
  it.each(['=SUM(A1:A2)', '+cmd', '-1+1', '@payload'])(
    'neutralizes %s',
    (value) => {
      expect(neutralizeCsvFormula(value)).toBe(`'${value}`);
    },
  );

  it('does not alter ordinary text', () => {
    expect(neutralizeCsvFormula('Proveedor SA')).toBe('Proveedor SA');
  });
});
