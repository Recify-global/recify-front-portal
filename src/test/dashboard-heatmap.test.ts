import { describe, expect, it } from 'vitest';
import {
  buildHeatmapCalendar,
  buildHeatmapThresholds,
  heatmapLevel,
} from '@/utils/dashboard-analytics';
import type { AnalyticsQuery, HeatmapDay } from '@/types/dashboard-analytics';

const query: AnalyticsQuery = {
  dateFrom: '2026-08-01T00:00:00.000-06:00',
  dateTo: '2026-08-10T23:59:59.999-06:00',
};
const now = new Date('2026-08-10T18:00:00.000-06:00');

function flattenDates(days: HeatmapDay[]) {
  return buildHeatmapCalendar(days, query, now).flat().map((cell) => cell.date);
}

describe('buildHeatmapCalendar', () => {
  it('merges sparse API data and retains intermediate zero-activity days', () => {
    const weeks = buildHeatmapCalendar(
      [
        { date: '2026-08-01', income: 0, expense: 100, count: 1 },
        { date: '2026-08-04', income: 20, expense: 500, count: 2 },
      ],
      query,
      now,
    );
    const cells = weeks.flat();

    expect(cells).toHaveLength(91);
    expect(cells.find((cell) => cell.date === '2026-08-01')?.day.expense).toBe(100);
    expect(cells.find((cell) => cell.date === '2026-08-02')?.day).toMatchObject({
      income: 0,
      expense: 0,
      count: 0,
    });
    expect(cells.find((cell) => cell.date === '2026-08-03')?.day.expense).toBe(0);
    expect(cells.find((cell) => cell.date === '2026-08-04')?.day.expense).toBe(500);
  });

  it('returns 13 complete weeks when the API has no activity', () => {
    const weeks = buildHeatmapCalendar([], query, now);

    expect(weeks).toHaveLength(13);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat()).toHaveLength(91);
    expect(
      weeks
        .flat()
        .every((cell) => cell.day.income === 0 && cell.day.expense === 0 && cell.day.count === 0),
    ).toBe(true);
  });

  it('keeps the same calendar dates when switching income and expense data', () => {
    const expenseDays: HeatmapDay[] = [
      { date: '2026-08-04', income: 0, expense: 500, count: 1 },
    ];
    const incomeDays: HeatmapDay[] = [
      { date: '2026-08-04', income: 800, expense: 0, count: 1 },
    ];

    expect(flattenDates(expenseDays)).toEqual(flattenDates(incomeDays));
  });

  it('aligns every week from Monday through Sunday', () => {
    const weeks = buildHeatmapCalendar([], query, now);

    for (const week of weeks) {
      expect(new Date(`${week[0].date}T00:00:00.000Z`).getUTCDay()).toBe(1);
      expect(new Date(`${week[6].date}T00:00:00.000Z`).getUTCDay()).toBe(0);
    }
    expect(weeks[12].map((cell) => cell.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ]);
  });
});

describe('heatmap intensity', () => {
  it('uses four positive levels without letting one outlier flatten small values', () => {
    const thresholds = buildHeatmapThresholds([1, 2, 3, 50]);

    expect([0, 1, 2, 3, 50].map((value) => heatmapLevel(value, thresholds))).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });
});
