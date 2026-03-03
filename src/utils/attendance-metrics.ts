import { CheckInStatus } from '../models/AttendanceRecord';

export interface AttendanceMetricRecord {
  dateKey: string;
  checkInAt: Date | string;
  checkOutAt?: Date | string | null;
  checkInStatus: CheckInStatus;
}

export interface AttendanceSummary {
  expectedWorkDays: number;
  excusedDays: number;
  attendanceDays: number;
  onTimeDays: number;
  lateDays: number;
  checkedOutDays: number;
  missingCheckoutDays: number;
  punctualityRate: number;
  attendanceRate: number;
  averageCheckInTime: string | null;
  averageCheckOutTime: string | null;
  averageWorkHours: number | null;
}

export interface MonthlyAttendanceSummary extends AttendanceSummary {
  month: string;
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;

export function parseCutoffTime(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

export function getLocalTimeParts(date: Date, timeZone?: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone
    });
    const parts = formatter.formatToParts(date);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

    return { hour, minute };
  } catch {
    const fallback = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);

    const hour = Number(fallback.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(fallback.find((part) => part.type === 'minute')?.value ?? '0');

    return { hour, minute };
  }
}

export function resolveCheckInStatus(
  checkInAt: Date,
  cutoffTime: string,
  timeZone?: string
): CheckInStatus {
  const cutoff = parseCutoffTime(cutoffTime) ?? { hour: 8, minute: 0 };
  const { hour, minute } = getLocalTimeParts(checkInAt, timeZone);

  if (hour < cutoff.hour) {
    return 'on-time';
  }

  if (hour === cutoff.hour && minute <= cutoff.minute) {
    return 'on-time';
  }

  return 'late';
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function isValidDateKey(value: string) {
  return DATE_KEY_REGEX.test(value);
}

export function isValidMonthKey(value: string) {
  return MONTH_KEY_REGEX.test(value);
}

export function getMonthBounds(monthKey: string) {
  if (!isValidMonthKey(monthKey)) {
    return null;
  }

  const [yearValue, monthValue] = monthKey.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    start,
    end,
    startKey: toDateKey(start),
    endKey: toDateKey(end)
  };
}

export function countWeekdaysInRange(startDate: Date, endDate: Date) {
  if (startDate > endDate) {
    return 0;
  }

  const start = asStartOfDayUtc(startDate);
  const end = asStartOfDayUtc(endDate);
  const cursor = new Date(start);

  let count = 0;
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

export function summarizeAttendance(
  records: AttendanceMetricRecord[],
  options?: { expectedWorkDays?: number; excusedDays?: number }
): AttendanceSummary {
  const dedupedRecords = dedupeByDate(records);
  const attendanceDays = dedupedRecords.length;

  const onTimeDays = dedupedRecords.filter((record) => record.checkInStatus === 'on-time').length;
  const lateDays = dedupedRecords.filter((record) => record.checkInStatus === 'late').length;
  const checkedOutDays = dedupedRecords.filter((record) => isValidDate(record.checkOutAt)).length;
  const missingCheckoutDays = Math.max(attendanceDays - checkedOutDays, 0);

  const expectedWorkDays = options?.expectedWorkDays ?? attendanceDays;
  const excusedDays = options?.excusedDays ?? 0;
  const punctualityRate = attendanceDays > 0 ? roundTo((onTimeDays / attendanceDays) * 100, 1) : 0;
  const attendanceRate = expectedWorkDays > 0 ? roundTo((attendanceDays / expectedWorkDays) * 100, 1) : 0;

  const checkInMinutes = dedupedRecords
    .map((record) => toMinutes(record.checkInAt))
    .filter((value): value is number => value !== null);
  const checkOutMinutes = dedupedRecords
    .map((record) => toMinutes(record.checkOutAt))
    .filter((value): value is number => value !== null);
  const workDurations = dedupedRecords
    .map((record) => getWorkDurationMinutes(record.checkInAt, record.checkOutAt))
    .filter((value): value is number => value !== null);

  const averageCheckInTime = mean(checkInMinutes);
  const averageCheckOutTime = mean(checkOutMinutes);
  const averageWorkMinutes = mean(workDurations);

  return {
    expectedWorkDays,
    excusedDays,
    attendanceDays,
    onTimeDays,
    lateDays,
    checkedOutDays,
    missingCheckoutDays,
    punctualityRate,
    attendanceRate,
    averageCheckInTime: averageCheckInTime === null ? null : minutesToClock(averageCheckInTime),
    averageCheckOutTime: averageCheckOutTime === null ? null : minutesToClock(averageCheckOutTime),
    averageWorkHours: averageWorkMinutes === null ? null : roundTo(averageWorkMinutes / 60, 2)
  };
}

export function buildMonthlyAttendanceBreakdown(
  records: AttendanceMetricRecord[],
  startDate: Date,
  endDate: Date,
  options?: { excusedDateKeys?: Set<string> }
): MonthlyAttendanceSummary[] {
  if (startDate > endDate) {
    return [];
  }

  const monthKeys = listMonthKeysInRange(startDate, endDate);
  const dedupedRecords = dedupeByDate(records);

  return monthKeys.map((month) => {
    const bounds = getMonthBounds(month);
    if (!bounds) {
      return {
        month,
        ...summarizeAttendance([], { expectedWorkDays: 0, excusedDays: 0 })
      };
    }

    const effectiveStart = bounds.start < startDate ? asStartOfDayUtc(startDate) : bounds.start;
    const effectiveEnd = bounds.end > endDate ? asStartOfDayUtc(endDate) : bounds.end;

    const startKey = toDateKey(effectiveStart);
    const endKey = toDateKey(effectiveEnd);

    const monthRecords = dedupedRecords.filter(
      (record) => record.dateKey >= startKey && record.dateKey <= endKey
    );
    const totalWeekdays = countWeekdaysInRange(effectiveStart, effectiveEnd);
    const excusedDays = countDateKeysInRange(options?.excusedDateKeys, startKey, endKey);
    const expectedWorkDays = Math.max(totalWeekdays - excusedDays, 0);

    return {
      month,
      ...summarizeAttendance(monthRecords, { expectedWorkDays, excusedDays })
    };
  });
}

export function listMonthKeysInRange(startDate: Date, endDate: Date) {
  if (startDate > endDate) {
    return [];
  }

  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();

  const keys: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return keys;
}

function dedupeByDate(records: AttendanceMetricRecord[]) {
  const map = new Map<string, AttendanceMetricRecord>();

  records.forEach((record) => {
    if (!DATE_KEY_REGEX.test(record.dateKey)) {
      return;
    }

    const existing = map.get(record.dateKey);
    if (!existing) {
      map.set(record.dateKey, record);
      return;
    }

    const existingCheckIn = safeDate(existing.checkInAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const incomingCheckIn = safeDate(record.checkInAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (incomingCheckIn < existingCheckIn) {
      map.set(record.dateKey, record);
    }
  });

  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function asStartOfDayUtc(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function safeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidDate(value: Date | string | null | undefined) {
  return safeDate(value) !== null;
}

function toMinutes(value: Date | string | null | undefined) {
  const date = safeDate(value);
  if (!date) {
    return null;
  }

  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function getWorkDurationMinutes(
  checkInAt: Date | string,
  checkOutAt: Date | string | null | undefined
) {
  const checkIn = safeDate(checkInAt);
  const checkOut = safeDate(checkOutAt);

  if (!checkIn || !checkOut) {
    return null;
  }

  const duration = (checkOut.getTime() - checkIn.getTime()) / 60000;
  if (duration <= 0) {
    return null;
  }

  return duration;
}

function mean(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function minutesToClock(totalMinutes: number) {
  const normalized = Math.round(totalMinutes) % (24 * 60);
  const minutes = normalized < 0 ? normalized + 24 * 60 : normalized;
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${String(hoursPart).padStart(2, '0')}:${String(minutesPart).padStart(2, '0')}`;
}

function roundTo(value: number, precision: number) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function countDateKeysInRange(
  dateKeys: Set<string> | undefined,
  startDateKey: string,
  endDateKey: string
) {
  if (!dateKeys || dateKeys.size === 0) {
    return 0;
  }

  let count = 0;
  dateKeys.forEach((dateKey) => {
    if (dateKey >= startDateKey && dateKey <= endDateKey) {
      count += 1;
    }
  });

  return count;
}
