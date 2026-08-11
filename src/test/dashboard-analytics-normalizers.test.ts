import { describe, expect, it } from 'vitest';
import {
  normalizeCashFlow,
  normalizeDeductibleTaxByCategory,
  normalizeExpensesByVendor,
} from '@/utils/dashboard-analytics';

describe('normalizeCashFlow', () => {
  it('formats a monthly period object as a human label', () => {
    const view = normalizeCashFlow(
      {
        groupBy: 'month',
        series: [
          {
            period: { year: 2026, month: 8 },
            income: 300,
            expenses: 100,
            balance: 200,
          },
        ],
      },
      'month',
    );

    expect(view.buckets[0].label).toBe('ago 2026');
    expect(view.buckets[0].label).not.toContain('[object Object]');
  });

  it('formats a weekly period object as a human label', () => {
    const view = normalizeCashFlow(
      {
        groupBy: 'week',
        series: [
          {
            period: { year: 2026, week: 32 },
            income: 200,
            expenses: 50,
            balance: 150,
          },
        ],
      },
      'week',
    );

    expect(view.buckets[0].label).toBe('Semana 32');
    expect(view.buckets[0].label).not.toContain('[object Object]');
  });
});

describe('normalizeExpensesByVendor', () => {
  it('keeps backend percentages as ratios without renormalizing the subset', () => {
    const view = normalizeExpensesByVendor({
      vendors: [
        { vendor: 'A', amount: 500, count: 2, percentage: 25 },
        { vendor: 'B', amount: 250, count: 1, percentage: 12.5 },
        { vendor: 'C', amount: 20, count: 1, percentage: 1 },
      ],
    });

    expect(view.rows.map((row) => row.percentage)).toEqual([0.25, 0.125, 0.01]);
    expect(view.rows.reduce((sum, row) => sum + row.percentage, 0)).toBe(0.385);
  });
});

describe('normalizeDeductibleTaxByCategory', () => {
  it('keeps only contractual IVA values used by the tooltip', () => {
    const view = normalizeDeductibleTaxByCategory({
      categories: [
        {
          category: 'Combustible',
          deductibleTax: 80,
          nonDeductibleTax: 20,
          totalTax: 100,
          count: 3,
        },
      ],
    });

    expect(view.rows[0]).toMatchObject({
      deductibleTax: 80,
      nonDeductibleTax: 20,
      totalTax: 100,
    });
  });
});
