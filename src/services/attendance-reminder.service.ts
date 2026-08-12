import AttendanceRecord from '../models/AttendanceRecord';
import AttendanceReminderLog from '../models/AttendanceReminderLog';
import AttendanceSetting from '../models/AttendanceSetting';
import User from '../models/User';
import { notifyAttendanceCheckInReminder } from './email.service';
import { getExceptionMapForUsersOnDate, listAttendanceExceptionsInRange } from './attendance-exception.service';
import { getExemptUserIdSet } from './attendance-reminder-exemption.service';
import {
  getAttendanceCaptureStateForDate,
  getAttendanceCutoffTime,
  getAttendanceTimezone
} from './attendance.service';
import { getLocalTimeParts, parseCutoffTime, toDateKeyInTimeZone } from '../utils/attendance-metrics';

const REMINDER_ENABLED_SETTING_KEY = 'attendance_reminder_enabled';
const REMINDER_LEAD_MINUTES_SETTING_KEY = 'attendance_reminder_lead_minutes';
const DEFAULT_REMINDER_ENABLED = true;
export const DEFAULT_REMINDER_LEAD_MINUTES = 15;
export const MIN_REMINDER_LEAD_MINUTES = 1;
export const MAX_REMINDER_LEAD_MINUTES = 120;
// Office 365 throttles a mailbox at roughly 30 messages/minute. A typical run
// covers most of the workforce, so sends are paced to stay under that — a full
// batch still finishes well inside the shortest sensible reminder window.
const SEND_INTERVAL_MS = Number(process.env.ATTENDANCE_REMINDER_SEND_INTERVAL_MS ?? 2100);

export type ReminderSkipReason =
  | 'disabled'
  | 'capture_disabled'
  | 'weekend'
  | 'company_holiday'
  | 'outside_window'
  | 'invalid_cutoff';

export interface AttendanceReminderSettings {
  enabled: boolean;
  leadMinutes: number;
}

export interface AttendanceReminderRunSummary {
  skipped: ReminderSkipReason | null;
  dateKey: string;
  cutoffTime: string;
  leadMinutes: number;
  minutesRemaining: number | null;
  candidates: number;
  sent: number;
  alreadySent: number;
  failed: number;
  dryRun: boolean;
}

// ─── Settings ────────────────────────────────────────────────────────

export async function getAttendanceReminderSettings(): Promise<AttendanceReminderSettings> {
  const [enabledSetting, leadSetting] = await Promise.all([
    AttendanceSetting.findOne({ key: REMINDER_ENABLED_SETTING_KEY }),
    AttendanceSetting.findOne({ key: REMINDER_LEAD_MINUTES_SETTING_KEY })
  ]);

  return {
    enabled: parseBooleanSetting(enabledSetting?.value, DEFAULT_REMINDER_ENABLED),
    leadMinutes: parseLeadMinutes(leadSetting?.value) ?? DEFAULT_REMINDER_LEAD_MINUTES
  };
}

export async function setAttendanceReminderSettings(update: {
  enabled?: boolean;
  leadMinutes?: number;
}): Promise<AttendanceReminderSettings> {
  if (typeof update.enabled === 'boolean') {
    await AttendanceSetting.findOneAndUpdate(
      { key: REMINDER_ENABLED_SETTING_KEY },
      { value: update.enabled ? 'true' : 'false' },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  if (typeof update.leadMinutes === 'number') {
    if (!isValidLeadMinutes(update.leadMinutes)) {
      throw new Error('Invalid reminder lead minutes');
    }

    await AttendanceSetting.findOneAndUpdate(
      { key: REMINDER_LEAD_MINUTES_SETTING_KEY },
      { value: String(update.leadMinutes) },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  return getAttendanceReminderSettings();
}

export function isValidLeadMinutes(value: number) {
  return (
    Number.isInteger(value) &&
    value >= MIN_REMINDER_LEAD_MINUTES &&
    value <= MAX_REMINDER_LEAD_MINUTES
  );
}

// ─── Window maths ────────────────────────────────────────────────────

/**
 * Minutes left until the cut-off, or null when "now" is not inside the
 * reminder window [cutoff - leadMinutes, cutoff).
 *
 * This is a window rather than an exact-minute match so a restart or a slow
 * tick cannot miss the send outright; the unique index on AttendanceReminderLog
 * keeps the repeated attempts from producing duplicate emails.
 */
export function getMinutesUntilCutoff(
  now: Date,
  cutoffTime: string,
  leadMinutes: number,
  timeZone?: string
): number | null {
  const cutoff = parseCutoffTime(cutoffTime);
  if (!cutoff || !isValidLeadMinutes(leadMinutes)) {
    return null;
  }

  const cutoffMinuteOfDay = cutoff.hour * 60 + cutoff.minute;
  const reminderMinuteOfDay = cutoffMinuteOfDay - leadMinutes;
  if (reminderMinuteOfDay < 0) {
    // e.g. a 00:10 cut-off with a 15 minute lead — the window would fall on the
    // previous day, so there is nothing sensible to send.
    return null;
  }

  const { hour, minute } = getLocalTimeParts(now, timeZone);
  const nowMinuteOfDay = hour * 60 + minute;

  if (nowMinuteOfDay < reminderMinuteOfDay || nowMinuteOfDay >= cutoffMinuteOfDay) {
    return null;
  }

  return cutoffMinuteOfDay - nowMinuteOfDay;
}

export function isWithinReminderWindow(
  now: Date,
  cutoffTime: string,
  leadMinutes: number,
  timeZone?: string
) {
  return getMinutesUntilCutoff(now, cutoffTime, leadMinutes, timeZone) !== null;
}

// ─── The job ─────────────────────────────────────────────────────────

/**
 * Emails every employee who is expected in today and has not checked in yet.
 * Safe to call repeatedly — each user is claimed in AttendanceReminderLog
 * before their email is sent.
 */
export async function runAttendanceCheckInReminders(options?: {
  now?: Date;
  force?: boolean;
  dryRun?: boolean;
}): Promise<AttendanceReminderRunSummary> {
  const now = options?.now ?? new Date();
  const force = options?.force ?? false;
  const dryRun = options?.dryRun ?? false;
  const timeZone = getAttendanceTimezone();
  const dateKey = toDateKeyInTimeZone(now, timeZone);

  const [settings, cutoffTime] = await Promise.all([
    getAttendanceReminderSettings(),
    getAttendanceCutoffTime()
  ]);

  const base: AttendanceReminderRunSummary = {
    skipped: null,
    dateKey,
    cutoffTime,
    leadMinutes: settings.leadMinutes,
    minutesRemaining: null,
    candidates: 0,
    sent: 0,
    alreadySent: 0,
    failed: 0,
    dryRun
  };

  if (!settings.enabled && !force) {
    return { ...base, skipped: 'disabled' };
  }

  // Day-level gates: never nag on a day staff are not expected in the office.
  const captureState = await getAttendanceCaptureStateForDate(dateKey);
  if (captureState.isWeekend) {
    return { ...base, skipped: 'weekend' };
  }

  if (!captureState.captureEnabled) {
    return { ...base, skipped: 'capture_disabled' };
  }

  const companyExceptions = await listAttendanceExceptionsInRange(dateKey, dateKey, {
    scope: 'company',
    statuses: ['approved']
  });
  if (companyExceptions.length > 0) {
    return { ...base, skipped: 'company_holiday' };
  }

  const minutesRemaining = getMinutesUntilCutoff(now, cutoffTime, settings.leadMinutes, timeZone);
  if (minutesRemaining === null && !force) {
    return {
      ...base,
      skipped: parseCutoffTime(cutoffTime) ? 'outside_window' : 'invalid_cutoff'
    };
  }

  const candidates = await findUsersNeedingCheckInReminder(dateKey, timeZone);
  const summary: AttendanceReminderRunSummary = {
    ...base,
    minutesRemaining,
    candidates: candidates.length
  };

  if (dryRun || candidates.length === 0) {
    return summary;
  }

  const dateLabel = formatDateLabel(dateKey, timeZone);

  let isFirstSend = true;
  for (const candidate of candidates) {
    if (!isFirstSend && SEND_INTERVAL_MS > 0) {
      await delay(SEND_INTERVAL_MS);
    }
    isFirstSend = false;

    let claimed = false;
    try {
      await AttendanceReminderLog.create({
        dateKey,
        userId: candidate.userId,
        email: candidate.email
      });
      claimed = true;

      // Recomputed per send: pacing means the tail of a large batch goes out
      // several minutes after the head, and the email states the time left.
      const remainingNow =
        getMinutesUntilCutoff(new Date(), cutoffTime, settings.leadMinutes, timeZone) ??
        minutesRemaining ??
        0;

      await notifyAttendanceCheckInReminder(
        candidate.email,
        candidate.firstName,
        cutoffTime,
        remainingNow,
        dateLabel
      );
      summary.sent += 1;
    } catch (error: any) {
      if (error?.code === 11000) {
        // Another tick or instance already claimed this user today.
        summary.alreadySent += 1;
        continue;
      }

      summary.failed += 1;
      console.error(
        `[AttendanceReminder] Failed to remind ${candidate.email} for ${dateKey}:`,
        error
      );

      if (claimed) {
        // Release the claim so a later tick inside the window can retry.
        await AttendanceReminderLog.deleteOne({ dateKey, userId: candidate.userId }).catch(() => {});
      }
    }
  }

  return summary;
}

export interface ReminderCandidate {
  userId: string;
  email: string;
  firstName: string;
  name: string;
}

/**
 * Employees expected in today who have neither checked in nor already been
 * reminded. Excludes guests, users without an email, users not yet employed,
 * anyone with an approved attendance exception (leave, public holiday,
 * non-working day) covering today, and anyone an HR Admin has permanently
 * exempted from reminder emails.
 */
export async function findUsersNeedingCheckInReminder(
  dateKey: string,
  timeZone = getAttendanceTimezone()
): Promise<ReminderCandidate[]> {
  const users = await User.find({ role: { $ne: 'guest' } })
    .select('firstName lastName email dateEmployed role')
    .lean();

  const eligible = users.filter((user) => {
    const email = typeof user.email === 'string' ? user.email.trim() : '';
    if (!email) {
      return false;
    }

    if (user.dateEmployed) {
      const employedKey = toDateKeyInTimeZone(new Date(user.dateEmployed as Date), timeZone);
      if (employedKey > dateKey) {
        return false;
      }
    }

    return true;
  });

  if (eligible.length === 0) {
    return [];
  }

  const userIds = eligible.map((user) => user._id.toString());

  const [exceptionMap, existingRecords, alreadyReminded, exempt] = await Promise.all([
    getExceptionMapForUsersOnDate(userIds, dateKey),
    AttendanceRecord.find({ dateKey, userId: { $in: userIds } })
      .select('userId')
      .lean(),
    AttendanceReminderLog.find({ dateKey, userId: { $in: userIds } })
      .select('userId')
      .lean(),
    getExemptUserIdSet(userIds)
  ]);

  const checkedIn = new Set(existingRecords.map((record) => record.userId.toString()));
  const reminded = new Set(alreadyReminded.map((log) => log.userId.toString()));

  return eligible
    .filter((user) => {
      const id = user._id.toString();
      return !checkedIn.has(id) && !reminded.has(id) && !exceptionMap.has(id) && !exempt.has(id);
    })
    .map((user) => {
      const firstName = (user.firstName as string | undefined)?.trim() ?? '';
      const lastName = (user.lastName as string | undefined)?.trim() ?? '';
      const name = [firstName, lastName].filter(Boolean).join(' ').trim();
      const email = (user.email as string).trim();

      return {
        userId: user._id.toString(),
        email,
        firstName: firstName || name || 'there',
        name: name || email
      };
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateLabel(dateKey: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(`${dateKey}T12:00:00.000Z`));
  } catch {
    return dateKey;
  }
}

function parseLeadMinutes(value: string | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value.trim());
  return isValidLeadMinutes(parsed) ? parsed : null;
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
