import mongoose from 'mongoose';
import AttendanceRecord, {
  type AttendanceFlagStatus,
  IAttendanceRecord
} from '../models/AttendanceRecord';
import AttendanceSetting from '../models/AttendanceSetting';
import {
  countDateKeysInRange,
  getExceptionForUserOnDate,
  getExcusedWeekdayDateKeysForUserInRange,
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
const WEEKENDS_AUTO_PAUSED = parseBooleanEnv(process.env.ATTENDANCE_WEEKENDS_AUTO_PAUSED, true);
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
    summary: summarizeAttendance(metricRecords, { expectedWorkDays, excusedDays }),
    monthlyBreakdown: buildMonthlyAttendanceBreakdown(metricRecords, start, end, {
      excusedDateKeys
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

function isWeekendDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const day = date.getUTCDay();
  return day === 0 || day === 6;
}
