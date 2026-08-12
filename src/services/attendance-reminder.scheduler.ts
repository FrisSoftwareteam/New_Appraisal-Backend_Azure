import cron, { ScheduledTask } from 'node-cron';
import AttendanceReminderLog from '../models/AttendanceReminderLog';
import AttendanceReminderExemption from '../models/AttendanceReminderExemption';
import { getAttendanceTimezone } from './attendance.service';
import { runAttendanceCheckInReminders } from './attendance-reminder.service';

let task: ScheduledTask | null = null;
// Guards against a slow run overlapping the next minute's tick.
let isRunning = false;

/**
 * Ticks once a minute and lets the reminder service decide whether "now" falls
 * inside the pre-cutoff window. Checking every minute (rather than scheduling a
 * cron expression derived from the cut-off) means an HR admin changing the
 * cut-off or the lead time takes effect immediately, with no restart.
 */
export async function startAttendanceReminderScheduler() {
  if (task) {
    return task;
  }

  // mongoose connects with autoIndex: false, so the unique { dateKey, userId }
  // guard has to be built explicitly — without it duplicate reminders are possible.
  await AttendanceReminderLog.syncIndexes();
  // Likewise the unique { userId } guard behind the reminder exemption list.
  await AttendanceReminderExemption.syncIndexes();

  const timezone = getAttendanceTimezone();
  task = cron.schedule(
    '* * * * *',
    async () => {
      if (isRunning) {
        return;
      }

      isRunning = true;
      try {
        const summary = await runAttendanceCheckInReminders();
        // Stay quiet on ordinary no-op ticks; this process already logs every request.
        if (summary.sent > 0 || summary.failed > 0) {
          console.log(
            `[AttendanceReminder] ${summary.dateKey}: sent=${summary.sent} failed=${summary.failed} ` +
              `alreadySent=${summary.alreadySent} candidates=${summary.candidates} ` +
              `cutoff=${summary.cutoffTime} minutesRemaining=${summary.minutesRemaining}`
          );
        }
      } catch (error) {
        console.error('[AttendanceReminder] Scheduled run failed:', error);
      } finally {
        isRunning = false;
      }
    },
    { timezone }
  );

  console.log(`Attendance check-in reminder scheduler started (timezone: ${timezone}).`);
  return task;
}

export function stopAttendanceReminderScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}
