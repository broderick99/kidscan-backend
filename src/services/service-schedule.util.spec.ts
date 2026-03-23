import {
  formatDateOnlyUtc,
  generateMonthlyServiceTasks,
  getDayOfWeekNumber,
  getMonthBoundsUtc,
  parseDateOnlyUtc,
} from './service-schedule.util';

describe('service schedule utilities', () => {
  describe('getDayOfWeekNumber', () => {
    it('maps weekday names to the correct day numbers', () => {
      expect(getDayOfWeekNumber('monday')).toBe(1);
      expect(getDayOfWeekNumber('Wednesday')).toBe(3);
      expect(getDayOfWeekNumber('SUNDAY')).toBe(0);
    });

    it('rejects invalid weekday values', () => {
      expect(() => getDayOfWeekNumber('trashday')).toThrow('Invalid pickup day');
    });
  });

  describe('formatDateOnlyUtc', () => {
    it('formats a UTC date as YYYY-MM-DD', () => {
      expect(formatDateOnlyUtc(new Date(Date.UTC(2026, 2, 24, 23, 30, 0)))).toBe('2026-03-24');
    });

    it('parses a YYYY-MM-DD value into a stable UTC date', () => {
      expect(formatDateOnlyUtc(parseDateOnlyUtc('2026-03-24'))).toBe('2026-03-24');
    });
  });

  describe('getMonthBoundsUtc', () => {
    it('returns stable month bounds in UTC', () => {
      const { startOfMonth, endOfMonth } = getMonthBoundsUtc(new Date(Date.UTC(2026, 2, 23, 18, 0, 0)));

      expect(formatDateOnlyUtc(startOfMonth)).toBe('2026-03-01');
      expect(formatDateOnlyUtc(endOfMonth)).toBe('2026-03-31');
    });
  });

  describe('generateMonthlyServiceTasks', () => {
    it('generates deadline dates on the day before each pickup day for the current month', () => {
      const tasks = generateMonthlyServiceTasks(
        [
          { dayOfWeek: 'monday', canNumber: 1 },
          { dayOfWeek: 'wednesday', canNumber: 2 },
        ],
        new Date(Date.UTC(2026, 2, 23, 18, 0, 0)),
      );

      expect(tasks).toEqual([
        { scheduledDate: '2026-03-01', canNumber: 1 },
        { scheduledDate: '2026-03-03', canNumber: 2 },
        { scheduledDate: '2026-03-08', canNumber: 1 },
        { scheduledDate: '2026-03-10', canNumber: 2 },
        { scheduledDate: '2026-03-15', canNumber: 1 },
        { scheduledDate: '2026-03-17', canNumber: 2 },
        { scheduledDate: '2026-03-22', canNumber: 1 },
        { scheduledDate: '2026-03-24', canNumber: 2 },
        { scheduledDate: '2026-03-29', canNumber: 1 },
      ]);
    });

    it('keeps month generation stable regardless of the reference timestamp inside the month', () => {
      const morningTasks = generateMonthlyServiceTasks(
        [{ dayOfWeek: 'friday', canNumber: 1 }],
        new Date(Date.UTC(2026, 2, 5, 1, 0, 0)),
      );
      const lateNightTasks = generateMonthlyServiceTasks(
        [{ dayOfWeek: 'friday', canNumber: 1 }],
        new Date(Date.UTC(2026, 2, 28, 23, 59, 59)),
      );

      expect(morningTasks).toEqual(lateNightTasks);
      expect(morningTasks.map((task) => task.scheduledDate)).toEqual([
        '2026-03-05',
        '2026-03-12',
        '2026-03-19',
        '2026-03-26',
      ]);
    });
  });
});
