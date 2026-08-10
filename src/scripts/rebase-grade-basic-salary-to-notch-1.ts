import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Grade from '../models/Grade';
import SystemSetting from '../models/SystemSetting';

dotenv.config();

// ┌──────────────────────────────────────────────────────────────────────────────────────┐
// │ SUPERSEDED — DO NOT RUN. Applied once, on 2026-08-10, and kept only as the record of  │
// │ what that run did.                                                                    │
// │                                                                                       │
// │ Grade salaries now come from the approved pay-scale sheet via                          │
// │ src/scripts/set-grade-basic-salary-from-payscale.ts (npm run payscale:apply), which    │
// │ writes absolute figures. Running this script again would divide those pay-scale        │
// │ figures by (1 - p) a second time and inflate every salary. Its npm entry has been      │
// │ removed for that reason; the notchBaseRebasedAt SystemSetting marker is left in place  │
// │ as history and would also refuse a second --apply.                                     │
// └──────────────────────────────────────────────────────────────────────────────────────┘
//
// computeBasicSalary used to treat `Grade.basicSalary` as an implicit pre-Notch-1 base and
// apply notchPercentages[0] to reach Notch 1. It now treats basicSalary AS the Notch 1
// salary, with notchPercentages[0] instead defining the Notch 0 (probation) reduction.
//
// The figures already stored in `basicSalary` are the Notch 0 (probation) amounts, so this
// migration derives Notch 1 back out of them:
//
//     newBasicSalary = storedNotch0 / (1 - notchPercentages[0]/100)
//
// Dividing, not multiplying: the old formula's step UP (base x (1 + p)) is not the inverse
// of the new rule's step DOWN (Notch1 x (1 - p)). Multiplying by (1 + p) would leave the
// recomputed probation figure at stored x (1 - p^2), roughly 0.4% below the number HR
// actually entered. Dividing round-trips exactly - feed the new base back through
// computeBasicSalary(grade, 0) and you get the stored value again.
//
// Consequence, and it is intended: every notch from 1 upward now computes about
// 1/(1 - p^2) higher than the app showed before, because the old formula was reaching
// Notch 1 by the wrong step. This is the correction, not a regression.
//
// Preview (default, no writes):  npm run migrate:notch1-base
// Apply:                         npm run migrate:notch1-base -- --apply
//
// Applying twice would compound the divisor and inflate every salary, so a completion
// marker is written to SystemSetting and a second --apply is refused unless --force is
// passed. Preview first — this rewrites real pay figures and there is no undo.

const MARKER_KEY = 'notchBaseRebasedAt';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

const round2 = (value: number) => Math.round(value * 100) / 100;

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log(`Connected to MongoDB${apply ? '' : '  [PREVIEW — no writes]'}`);

    const marker = await SystemSetting.findOne({ key: MARKER_KEY });
    if (marker && !force) {
      console.error(
        `\nAlready applied on ${marker.value}. Re-applying would divide every base a second ` +
          `time and inflate every salary.\nPass --force only if you are certain the previous ` +
          `run did not write (e.g. it failed partway).`
      );
      process.exit(1);
    }

    const grades = await Grade.find();
    if (grades.length === 0) {
      console.log('No grades found — nothing to do.');
      process.exit(0);
    }

    // Two passes on purpose. Everything is validated and planned before a single write goes
    // out, so one bad grade aborts the whole migration instead of leaving the collection half
    // converted - which would be indistinguishable from a completed run on the next attempt.
    const planned: { id: unknown; name: string; percentage: number; from: number; to: number }[] = [];
    const invalid: string[] = [];

    for (const grade of grades) {
      const probationPercentage = grade.notchPercentages[0] ?? 0;

      // Guard the divide: at 100% the reduction wipes out the salary entirely and there is no
      // Notch 1 to recover; above 100% the sign flips. Either would write a nonsense figure.
      if (!Number.isFinite(probationPercentage) || probationPercentage >= 100) {
        invalid.push(
          `${grade.name}: Notch 1 % is ${probationPercentage} — cannot derive Notch 1 from a ` +
            `reduction of 100% or more. Fix this grade's percentages first.`
        );
        continue;
      }

      planned.push({
        id: grade._id,
        name: grade.name,
        percentage: probationPercentage,
        from: grade.basicSalary,
        to: round2(grade.basicSalary / (1 - probationPercentage / 100)),
      });
    }

    if (invalid.length > 0) {
      for (const message of invalid) console.error(`INVALID  ${message}`);
      console.error(
        `\n${invalid.length} grade(s) could not be converted. Nothing was written and no ` +
          `completion marker was set — fix those grades and re-run.`
      );
      process.exit(1);
    }

    let changed = 0;
    let unchanged = 0;

    for (const entry of planned) {
      if (entry.to === entry.from) {
        unchanged++;
        console.log(
          `ok       ${entry.name}: ${entry.from.toLocaleString()} (Notch 1 % is ` +
            `${entry.percentage}%, so Notch 0 and Notch 1 are the same)`
        );
        continue;
      }

      if (apply) {
        // updateOne rather than .save() so the exactly-20-entries notchPercentages validator
        // can't reject a grade document that predates it.
        await Grade.updateOne({ _id: entry.id }, { $set: { basicSalary: entry.to } });
      }
      changed++;

      // Feeding the new base back through the Notch 0 rule must reproduce the stored figure -
      // that round-trip is the check that this migration converted in the right direction.
      const notch0AfterRebase = round2(entry.to * (1 - entry.percentage / 100));
      const drift = round2(notch0AfterRebase - entry.from);
      console.log(
        `rebase   ${entry.name}: Notch 0 ${entry.from.toLocaleString()}` +
          `${drift === 0 ? ' (unchanged)' : ` (recomputes to ${notch0AfterRebase.toLocaleString()}, drift ${drift})`}` +
          ` -> Notch 1 ${entry.to.toLocaleString()}  [${entry.percentage}%]`
      );
    }

    if (apply) {
      await SystemSetting.findOneAndUpdate(
        { key: MARKER_KEY },
        { $set: { value: new Date().toISOString() } },
        { upsert: true }
      );
    }

    console.log(
      `\n${apply ? 'Applied' : 'Would apply'}: ${changed} rebased, ${unchanged} unchanged (Notch 1 % of 0).` +
        `\nEach grade's Notch 0 stays as stored; Notch 1 and above rise by 1/(1 - p^2).`
    );
    if (!apply) {
      console.log('Preview only — nothing was written. Re-run with -- --apply to commit.');
    } else {
      console.log(
        'Grades are cached for 60s by salary.service.ts — restart the API to see new figures immediately.'
      );
    }
    process.exit(0);
  } catch (error) {
    console.error('Error rebasing grade basic salaries:', error);
    process.exit(1);
  }
};

run();
