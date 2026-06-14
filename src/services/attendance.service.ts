import mongoose from 'mongoose';
import AttendanceRecord, {
  type AttendanceFlagStatus,
  IAttendanceRecord
} from '../models/AttendanceRecord';
import AttendanceSetting from '../models/AttendanceSetting';
import User from '../models/User';
import {
  countDateKeysInRange,
  getExceptionForUserOnDate,
  getExcusedWeekdayDateKeysForUserInRange,
  listAttendanceExceptionsInRange,
  type SerializedAttendanceException
} from './attendance-exception.service';
import {
  AttendanceSummary,
  MonthlyAttendanceSummary,
  buildMonthlyAttendanceBreakdown,
  countWeekdaysInRange,
  getMonthBounds,
  isValidDateKey,
  parseCutoffTime,
  summarizeAttendance,
  toDateKey,
  toDateKeyInTimeZone
} from '../utils/attendance-metrics';

const CUTOFF_SETTING_KEY = 'attendance_cutoff_time';
const DEFAULT_CUTOFF_TIME = '08:00';
const ATTENDANCE_TIMEZONE =
  typeof process.env.ATTENDANCE_TIMEZONE === 'string' && process.env.ATTENDANCE_TIMEZONE.trim()
    ? process.env.ATTENDANCE_TIMEZONE.trim()
    : 'Africa/Lagos';
const CAPTURE_ENABLED_SETTING_KEY = 'attendance_capture_enabled';
const DEFAULT_CAPTURE_ENABLED = false;
export const WEEKENDS_AUTO_PAUSED = parseBooleanEnv(process.env.ATTENDANCE_WEEKENDS_AUTO_PAUSED, true);
// Deprecated: force-pause is disabled so HR Admin/Super Admin can always start/stop capture.
const CAPTURE_FORCE_PAUSED = false;
// Optional: when false, approved exceptions do not pause attendance capture.
const EXCEPTIONS_AFFECT_CAPTURE = parseBooleanEnv(process.env.ATTENDANCE_EXCEPTIONS_AFFECT_CAPTURE, false);

export type AttendanceCapturePauseReason = 'admin_paused' | 'weekend' | 'exception_day' | null;

export interface AttendanceCaptureState {
  captureEnabled: boolean;
  captureForcePaused: boolean;
  weekendsAutoPaused: boolean;
  isWeekend: boolean;
  captureAllowed: boolean;
  pauseReason: AttendanceCapturePauseReason;
  pauseException?: SerializedAttendanceException;
}

export interface SerializedAttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department?: string;
  dateKey: string;
  checkInAt: string;
  checkOutAt?: string;
  checkInStatus: 'on-time' | 'late';
  locationLabel?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  photoUrl?: string;
  photoPublicId?: string;
  checkOutPhotoUrl?: string;
  checkOutPhotoPublicId?: string;
  checkOutLocationLabel?: string;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkOutAccuracy?: number;
  flagStatus: AttendanceFlagStatus;
  flagReason?: string;
  flaggedAt?: string;
  flaggedById?: string;
  flaggedByName?: string;
  flagResolutionNote?: string;
  resolvedAt?: string;
  resolvedById?: string;
  resolvedByName?: string;
  workDurationHours: number | null;
}

export interface AttendanceInsights {
  startDate: string;
  endDate: string;
  summary: AttendanceSummary;
  monthlyBreakdown: MonthlyAttendanceSummary[];
  records: SerializedAttendanceRecord[];
}

export function serializeAttendanceRecord(record: IAttendanceRecord): SerializedAttendanceRecord {
  return {
    id: record._id.toString(),
    userId: record.userId.toString(),
    userName: record.userName,
    department: record.department ?? undefined,
    dateKey: record.dateKey,
    checkInAt: record.checkInAt.toISOString(),
    checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : undefined,
    checkInStatus: record.checkInStatus,
    locationLabel: record.locationLabel ?? undefined,
    latitude: record.latitude ?? undefined,
    longitude: record.longitude ?? undefined,
    accuracy: record.accuracy ?? undefined,
    photoUrl: record.photoUrl ?? undefined,
    photoPublicId: record.photoPublicId ?? undefined,
    checkOutPhotoUrl: record.checkOutPhotoUrl ?? undefined,
    checkOutPhotoPublicId: record.checkOutPhotoPublicId ?? undefined,
    checkOutLocationLabel: record.checkOutLocationLabel ?? undefined,
    checkOutLatitude: record.checkOutLatitude ?? undefined,
    checkOutLongitude: record.checkOutLongitude ?? undefined,
    checkOutAccuracy: record.checkOutAccuracy ?? undefined,
    flagStatus: record.flagStatus,
    flagReason: record.flagReason ?? undefined,
    flaggedAt: record.flaggedAt ? record.flaggedAt.toISOString() : undefined,
    flaggedById: record.flaggedById ? record.flaggedById.toString() : undefined,
    flaggedByName: record.flaggedByName ?? undefined,
    flagResolutionNote: record.flagResolutionNote ?? undefined,
    resolvedAt: record.resolvedAt ? record.resolvedAt.toISOString() : undefined,
    resolvedById: record.resolvedById ? record.resolvedById.toString() : undefined,
    resolvedByName: record.resolvedByName ?? undefined,
    workDurationHours: getWorkDurationHours(record)
  };
}

export function getDefaultCutoffTime() {
  return DEFAULT_CUTOFF_TIME;
}

export async function getAttendanceCutoffTime() {
  const setting = await AttendanceSetting.findOne({ key: CUTOFF_SETTING_KEY });
  const value = setting?.value?.trim();

  if (!value || !parseCutoffTime(value)) {
    return DEFAULT_CUTOFF_TIME;
  }

  return value;
}

export async function setAttendanceCutoffTime(value: string) {
  const normalized = value.trim();
  const updated = await AttendanceSetting.findOneAndUpdate(
    { key: CUTOFF_SETTING_KEY },
    { value: normalized },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return updated?.value ?? normalized;
}

export async function getAttendanceCaptureEnabled() {
  const setting = await AttendanceSetting.findOne({ key: CAPTURE_ENABLED_SETTING_KEY });
  return parseBooleanSetting(setting?.value, DEFAULT_CAPTURE_ENABLED);
}

export async function setAttendanceCaptureEnabled(enabled: boolean) {
  const normalized = enabled ? 'true' : 'false';
  const updated = await AttendanceSetting.findOneAndUpdate(
    { key: CAPTURE_ENABLED_SETTING_KEY },
    { value: normalized },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return parseBooleanSetting(updated?.value, enabled);
}

export async function getAttendanceCaptureStateForDate(
  dateKey: string,
  userId?: mongoose.Types.ObjectId | string
): Promise<AttendanceCaptureState> {
  if (!isValidDateKey(dateKey)) {
    throw new Error('Invalid date key');
  }

  const captureEnabled = await getAttendanceCaptureEnabled();
  const isWeekend = WEEKENDS_AUTO_PAUSED && isWeekendDateKey(dateKey);
  const exceptionNullable =
    !isWeekend && userId
      ? await getExceptionForUserOnDate(userId, dateKey)
      : null;

  const isCompanyHoliday =
    exceptionNullable &&
    (exceptionNullable.scope === 'company' ||
      exceptionNullable.type === 'public_holiday' ||
      exceptionNullable.type === 'non_working_day');

  const pauseException =
    EXCEPTIONS_AFFECT_CAPTURE || isCompanyHoliday
      ? exceptionNullable
      : null;
  const captureAllowed = captureEnabled && !isWeekend && !pauseException;
  const pauseReason: AttendanceCapturePauseReason = !captureEnabled
    ? 'admin_paused'
    : isWeekend
      ? 'weekend'
      : pauseException
        ? 'exception_day'
      : null;

  return {
    captureEnabled,
    captureForcePaused: CAPTURE_FORCE_PAUSED,
    weekendsAutoPaused: WEEKENDS_AUTO_PAUSED,
    isWeekend,
    captureAllowed,
    pauseReason,
    pauseException: pauseException ?? undefined
  };
}

export function getAttendanceCaptureModeDefaults() {
  return {
    captureEnabled: DEFAULT_CAPTURE_ENABLED,
    captureForcePaused: CAPTURE_FORCE_PAUSED,
    weekendsAutoPaused: WEEKENDS_AUTO_PAUSED
  };
}

export async function getAttendanceInsightsForRange(
  userId: mongoose.Types.ObjectId | string,
  startDate: string,
  endDate: string
): Promise<AttendanceInsights> {
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
    throw new Error('Invalid date key range');
  }

  if (startDate > endDate) {
    throw new Error('Start date must be on or before end date');
  }

  const [records, excusedDateKeys] = await Promise.all([
    AttendanceRecord.find({
      userId,
      dateKey: { $gte: startDate, $lte: endDate }
    }).sort({ dateKey: 1, checkInAt: 1 }),
    getExcusedWeekdayDateKeysForUserInRange(userId, startDate, endDate)
  ]);

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const metricRecords = records.filter((record) => !isWeekendDateKey(record.dateKey));
  const totalWeekdays = countWeekdaysInRange(start, end);
  const excusedDays = countDateKeysInRange(excusedDateKeys, startDate, endDate);
  const expectedWorkDays = Math.max(totalWeekdays - excusedDays, 0);

  return {
    startDate,
    endDate,
    summary: summarizeAttendance(metricRecords, { expectedWorkDays, excusedDays, timeZone: ATTENDANCE_TIMEZONE }),
    monthlyBreakdown: buildMonthlyAttendanceBreakdown(metricRecords, start, end, {
      excusedDateKeys,
      timeZone: ATTENDANCE_TIMEZONE
    }),
    records: metricRecords.map(serializeAttendanceRecord)
  };
}

export async function getAttendanceInsightsForMonth(
  userId: mongoose.Types.ObjectId | string,
  monthKey: string
): Promise<AttendanceInsights | null> {
  const bounds = getMonthBounds(monthKey);
  if (!bounds) {
    return null;
  }

  return getAttendanceInsightsForRange(userId, bounds.startKey, bounds.endKey);
}

export interface AbsenceEmployeeRow {
  userId: string;
  name: string;
  department?: string;
  expectedDays: number;
  presentDays: number;
  excusedDays: number;
  absentDays: number;
  absentDates: string[];
  attendanceRate: number;
}

export interface AttendanceAbsenceSummary {
  startDate: string;
  endDate: string;
  totals: {
    expectedEmployees: number;
    totalAbsentees: number;
    totalAbsenceDays: number;
    totalExpectedDays: number;
    totalPresentDays: number;
    totalExcusedDays: number;
    overallAttendanceRate: number;
  };
  employees: AbsenceEmployeeRow[];
}

/**
 * Computes per-employee absence figures for a date range.
 * Absence = a weekday (Mon-Fri) within range that the employee was expected to work
 * (not a company/individual approved exception and on/after their dateEmployed) and
 * for which no attendance check-in record exists.
 */
export async function getAttendanceAbsenceSummaryForRange(params: {
  startDate: string;
  endDate: string;
  userId?: string;
}): Promise<AttendanceAbsenceSummary> {
  const { startDate, endDate } = params;
  const userId = params.userId && params.userId !== 'all' ? params.userId : undefined;

  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
    throw new Error('Invalid date key range');
  }

  if (startDate > endDate) {
    throw new Error('Start date must be on or before end date');
  }

  const userFilter: Record<string, unknown> = { role: { $ne: 'guest' } };
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid user id');
    }
    userFilter._id = new mongoose.Types.ObjectId(userId);
  }

  const [users, weekdayKeys] = [
    await User.find(userFilter)
      .select('firstName lastName department dateEmployed role')
      .lean(),
    listWeekdayDateKeysInRange(startDate, endDate)
  ];

  const userIds = users.map((user) => user._id);

  const [records, exceptions] = await Promise.all([
    AttendanceRecord.find({
      userId: { $in: userIds },
      dateKey: { $gte: startDate, $lte: endDate }
    })
      .select('userId dateKey')
      .lean(),
    listAttendanceExceptionsInRange(startDate, endDate, { statuses: ['approved'] })
  ]);

  const presentByUser = new Map<string, Set<string>>();
  records.forEach((record) => {
    if (isWeekendDateKey(record.dateKey)) {
      return;
    }
    const uid = record.userId.toString();
    if (!presentByUser.has(uid)) {
      presentByUser.set(uid, new Set<string>());
    }
    presentByUser.get(uid)!.add(record.dateKey);
  });

  const companyExcused = new Set<string>();
  const individualExcusedByUser = new Map<string, Set<string>>();
  exceptions.forEach((exception) => {
    const start = exception.startDateKey > startDate ? exception.startDateKey : startDate;
    const end = exception.endDateKey < endDate ? exception.endDateKey : endDate;
    const keys = listWeekdayDateKeysInRange(start, end);

    if (exception.scope === 'company') {
      keys.forEach((key) => companyExcused.add(key));
      return;
    }

    if (!exception.userId) {
      return;
    }

    const uid = exception.userId.toString();
    if (!individualExcusedByUser.has(uid)) {
      individualExcusedByUser.set(uid, new Set<string>());
    }
    const set = individualExcusedByUser.get(uid)!;
    keys.forEach((key) => set.add(key));
  });

  let totalAbsentees = 0;
  let totalAbsenceDays = 0;
  let totalExpectedDays = 0;
  let totalPresentDays = 0;
  let totalExcusedDays = 0;

  const employees: AbsenceEmployeeRow[] = users.map((user) => {
    const uid = user._id.toString();
    const present = presentByUser.get(uid) ?? new Set<string>();
    const individualExcused = individualExcusedByUser.get(uid);
    const employedKey = user.dateEmployed
      ? toDateKeyInTimeZone(new Date(user.dateEmployed as Date), ATTENDANCE_TIMEZONE)
      : null;

    let expectedDays = 0;
    let presentDays = 0;
    let excusedDays = 0;
    const absentDates: string[] = [];

    weekdayKeys.forEach((key) => {
      if (employedKey && key < employedKey) {
        return;
      }

      const isExcused = companyExcused.has(key) || (individualExcused?.has(key) ?? false);
      if (isExcused) {
        excusedDays += 1;
        return;
      }

      expectedDays += 1;
      if (present.has(key)) {
        presentDays += 1;
      } else {
        absentDates.push(key);
      }
    });

    const absentDays = absentDates.length;
    const attendanceRate =
      expectedDays > 0 ? Math.round((presentDays / expectedDays) * 1000) / 10 : 0;

    if (absentDays > 0) {
      totalAbsentees += 1;
    }
    totalAbsenceDays += absentDays;
    totalExpectedDays += expectedDays;
    totalPresentDays += presentDays;
    totalExcusedDays += excusedDays;

    return {
      userId: uid,
      name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Unknown',
      department: (user.department as string | undefined) ?? undefined,
      expectedDays,
      presentDays,
      excusedDays,
      absentDays,
      absentDates,
      attendanceRate
    };
  });

  employees.sort(
    (a, b) => b.absentDays - a.absentDays || a.name.localeCompare(b.name)
  );

  const overallAttendanceRate =
    totalExpectedDays > 0
      ? Math.round((totalPresentDays / totalExpectedDays) * 1000) / 10
      : 0;

  return {
    startDate,
    endDate,
    totals: {
      expectedEmployees: users.length,
      totalAbsentees,
      totalAbsenceDays,
      totalExpectedDays,
      totalPresentDays,
      totalExcusedDays,
      overallAttendanceRate
    },
    employees
  };
}

export function getTodayDateKey() {
  return toDateKeyInTimeZone(new Date(), ATTENDANCE_TIMEZONE);
}

export function getAttendanceTimezone() {
  return ATTENDANCE_TIMEZONE;
}

function getWorkDurationHours(record: IAttendanceRecord) {
  if (!record.checkOutAt) {
    return null;
  }

  const diff = (record.checkOutAt.getTime() - record.checkInAt.getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(diff) || diff <= 0) {
    return null;
  }

  return Math.round(diff * 100) / 100;
}

function parseBooleanSetting(value: string | undefined, fallback: boolean) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return fallback;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return fallback;
}

function listWeekdayDateKeysInRange(startDateKey: string, endDateKey: string): string[] {
  if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey) || startDateKey > endDateKey) {
    return [];
  }

  const keys: string[] = [];
  const cursor = new Date(`${startDateKey}T00:00:00.000Z`);
  const end = new Date(`${endDateKey}T00:00:00.000Z`);

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      keys.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

export function isWeekendDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const day = date.getUTCDay();
  return day === 0 || day === 6;
}
