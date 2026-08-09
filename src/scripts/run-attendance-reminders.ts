import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AttendanceReminderLog from '../models/AttendanceReminderLog';
import {
  findUsersNeedingCheckInReminder,
  getAttendanceReminderSettings,
  runAttendanceCheckInReminders
} from '../services/attendance-reminder.service';
import { getAttendanceTimezone, getTodayDateKey } from '../services/attendance.service';

dotenv.config();

// Manual runner for the attendance check-in reminder job.
//
//   npm run reminders:dry-run          → evaluate eligibility, send nothing
//   npm run reminders:dry-run -- --send → actually send, ignoring the time window
//
// `--send` forces the run outside the real pre-cutoff window, which is how you
// verify delivery without waiting for the cut-off to approach.
const args = process.argv.slice(2);
const shouldSend = args.includes('--send');
const dryRun = !shouldSend;

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    await AttendanceReminderLog.syncIndexes();

    const dateKey = getTodayDateKey();
    const settings = await getAttendanceReminderSettings();
    console.log(
      `Timezone: ${getAttendanceTimezone()} | Date: ${dateKey} | ` +
        `enabled=${settings.enabled} leadMinutes=${settings.leadMinutes} | mode=${dryRun ? 'DRY RUN' : 'SEND'}`
    );

    const summary = await runAttendanceCheckInReminders({ force: true, dryRun });
    console.log('Run summary:', summary);

    if (summary.skipped) {
      console.log(`\nNo reminders: run was skipped (${summary.skipped}).`);
    } else if (dryRun) {
      const candidates = await findUsersNeedingCheckInReminder(dateKey);
      console.log(`\nWould remind ${candidates.length} employee(s):`);
      candidates.forEach((candidate) => console.log(`  - ${candidate.name} <${candidate.email}>`));
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error running attendance reminders:', error);
    process.exit(1);
  }
};

run();
