import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Grade from '../models/Grade';
import { computeBasicSalary } from '../services/salary.service';

dotenv.config();

// Writes each grade's Notch 1 salary from the approved pay-scale sheet.
//
// `Grade.basicSalary` IS the Notch 1 salary. Notch 0 (probation) is not stored anywhere - it
// is always computeBasicSalary(grade, 0) = basicSalary x (1 - notchPercentages[0]/100). The
// sheet's own N0 column is reproduced by that formula to the cent for every row it lists,
// and this script asserts exactly that before writing, so a wrong figure or a drifted
// percentage fails the run instead of quietly mispaying someone.
//
// Values are ABSOLUTE, not multipliers, which makes this idempotent: running it twice is a
// no-op and it does not care what state the collection is currently in. That is the whole
// reason it needs none of the completion-marker machinery the earlier rebase migration did.
//
// Preview (default, no writes):  npm run payscale:apply
// Apply:                         npm run payscale:apply -- --apply
//
// SUPERSEDES src/scripts/rebase-grade-basic-salary-to-notch-1.ts, which derived Notch 1 by
// dividing the old Notch 0 figures by (1 - p). The sheet is the source of truth now; that
// script must not be run again.

const apply = process.argv.includes('--apply');

const round2 = (value: number) => Math.round(value * 100) / 100;

interface PayScaleRow {
  /** Must match Grade.name exactly - grades are joined by name, not by id. */
  name: string;
  /** Expected notchPercentages[0]. Guards against the stored percentage having drifted. */
  percentage: number;
  /** The sheet's Basic column: this grade's Notch 1 salary. */
  notch1: number;
  /**
   * The sheet's N0(Probation) column, asserted against computeBasicSalary(grade, 0).
   * null for the five grades the sheet does not list, whose notch1 is instead the
   * pre-rebase figure plus the same 5% review the listed grades received.
   */
  sheetNotch0: number | null;
}

const PAY_SCALE: PayScaleRow[] = [
  { name: 'General Manager', percentage: 6.5, notch1: 5519385.93, sheetNotch0: 5160625.84 },
  { name: 'Deputy General Manager', percentage: 6.5, notch1: 4415508.75, sheetNotch0: 4128500.68 },
  { name: 'Assistant General Manager', percentage: 6.5, notch1: 2900770.01, sheetNotch0: 2712219.96 },
  { name: 'Principal Manager', percentage: 6.5, notch1: 2629285.89, sheetNotch0: 2458382.31 },
  { name: 'Snr. Manager', percentage: 6.5, notch1: 2406211.06, sheetNotch0: 2249807.34 },
  { name: 'Manager', percentage: 6.75, notch1: 2099815.51, sheetNotch0: 1958077.96 },
  { name: 'Deputy Manager', percentage: 6.75, notch1: 2013925.68, sheetNotch0: 1877985.7 },
  { name: 'Asst Manager', percentage: 6.75, notch1: 1713245.46, sheetNotch0: 1597601.39 },
  { name: 'Snr. Reg. Officer', percentage: 6.75, notch1: 1274219.3, sheetNotch0: 1188209.5 },
  { name: 'Reg. Officer', percentage: 7, notch1: 1018067.99, sheetNotch0: 946803.23 },
  { name: 'Assistant Registration Officer', percentage: 7, notch1: 970900.18, sheetNotch0: 902937.17 },
  { name: 'Snr. Reg. Assistant', percentage: 7, notch1: 923732.38, sheetNotch0: 859071.11 },
  { name: 'Reg. Assistant', percentage: 7, notch1: 827803.32, sheetNotch0: 769857.09 },
  { name: 'Executive Trainee', percentage: 7, notch1: 655619.32, sheetNotch0: 609725.97 },
  { name: 'Senior Supervisor', percentage: 7.25, notch1: 612554.79, sheetNotch0: 568144.57 },
  { name: 'Supervisor', percentage: 7.25, notch1: 519958.59, sheetNotch0: 482261.59 },
  { name: 'Asst. Supervisor', percentage: 7.25, notch1: 474654.4, sheetNotch0: 440241.96 },
  // The sheet labels this row "Clerk/Chief Driver 1/ Transport Clerk 1", but 452,002.31 is
  // the old Senior Clerk figure + 5% exactly, while the old Clerk/Chief Driver 1 figure + 5%
  // (429,350.22) appears nowhere on the sheet. Confirmed with HR: the label is wrong, the
  // money belongs to Senior Clerk.
  { name: 'Senior Clerk', percentage: 7.25, notch1: 452002.31, sheetNotch0: 419232.14 },
  { name: 'Junior Clerk/Chief Driver 2 / Transport Clerk 2', percentage: 7.25, notch1: 405271.8, sheetNotch0: 375889.59 },
  { name: 'Snr. Driver 1', percentage: 7.25, notch1: 381193.37, sheetNotch0: 353556.85 },
  { name: 'Senior Driver 2', percentage: 7.25, notch1: 312578.56, sheetNotch0: 289916.61 },
  { name: 'Driver 1', percentage: 7.25, notch1: 250062.85, sheetNotch0: 231933.29 },
  { name: 'Driver 2', percentage: 7.25, notch1: 182141.54, sheetNotch0: 168936.28 },

  // Not on the sheet. Each is the pre-rebase value x 1.05, matching the review the listed
  // grades received. No sheetNotch0 to assert against - their Notch 0 is simply whatever the
  // formula yields.
  { name: 'CLE Deputy Manager', percentage: 5, notch1: 2834168.99, sheetNotch0: null },
  { name: 'CLE Senior Associate', percentage: 5, notch1: 1927234.91, sheetNotch0: null },
  { name: 'Clerk/Chief Driver 1/ Transport Clerk 1', percentage: 7.25, notch1: 429350.22, sheetNotch0: null },
  // percentage 0, so this grade's Notch 0 and Notch 1 are the same figure.
  { name: 'Graduate Temp', percentage: 0, notch1: 423955.35, sheetNotch0: null },
  { name: 'Outsourced driver/dispatch', percentage: 20, notch1: 141318.45, sheetNotch0: null },
];

const run = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hr-appraisal';
    await mongoose.connect(MONGODB_URI);
    console.log(`Connected to MongoDB${apply ? '' : '  [PREVIEW — no writes]'}`);

    const grades = await Grade.find();
    const gradeByName = new Map(grades.map((g) => [g.name, g]));

    // Validate and plan everything before writing anything. A half-applied pay scale is worse
    // than an unapplied one: it is indistinguishable from a completed run on the next attempt.
    const planned: { id: unknown; name: string; from: number; to: number; notch0: number }[] = [];
    const problems: string[] = [];

    for (const row of PAY_SCALE) {
      const grade = gradeByName.get(row.name);
      if (!grade) {
        problems.push(`no grade named "${row.name}" exists — check for a rename or typo`);
        continue;
      }

      const storedPercentage = grade.notchPercentages[0] ?? 0;
      if (storedPercentage !== row.percentage) {
        problems.push(
          `${row.name}: stored Notch 1 percentage is ${storedPercentage}%, pay scale expects ` +
            `${row.percentage}% — Notch 0 would be wrong. Reconcile before applying.`
        );
        continue;
      }

      // Ask the real formula, not a local copy, so this stays an honest check of what the
      // application will actually compute for a probation employee.
      const notch0 = round2(
        computeBasicSalary({ ...grade.toObject(), basicSalary: row.notch1 } as any, 0)
      );

      if (row.sheetNotch0 !== null && notch0 !== row.sheetNotch0) {
        problems.push(
          `${row.name}: computeBasicSalary gives Notch 0 of ${notch0.toLocaleString()} but the ` +
            `sheet says ${row.sheetNotch0.toLocaleString()} — figures disagree, not applying.`
        );
        continue;
      }

      planned.push({ id: grade._id, name: row.name, from: grade.basicSalary, to: row.notch1, notch0 });
    }

    const uncovered = grades.filter((g) => !PAY_SCALE.some((r) => r.name === g.name));
    for (const grade of uncovered) {
      problems.push(
        `grade "${grade.name}" exists in the database but has no pay-scale row — it would keep ` +
          `a stale salary. Add it to PAY_SCALE.`
      );
    }

    if (problems.length > 0) {
      for (const message of problems) console.error(`PROBLEM  ${message}`);
      console.error(
        `\n${problems.length} problem(s). Nothing was written — resolve these and re-run.`
      );
      process.exit(1);
    }

    let changed = 0;
    let alreadyCorrect = 0;

    for (const entry of planned) {
      if (entry.to === entry.from) {
        alreadyCorrect++;
        console.log(
          `ok       ${entry.name.padEnd(48)} ${entry.to.toLocaleString().padStart(14)} ` +
            `(Notch 0 ${entry.notch0.toLocaleString()})`
        );
        continue;
      }

      if (apply) {
        // updateOne rather than .save() so the exactly-20-entries notchPercentages validator
        // can't reject a grade document that predates it.
        await Grade.updateOne({ _id: entry.id }, { $set: { basicSalary: entry.to } });
      }
      changed++;
      console.log(
        `set      ${entry.name.padEnd(48)} ${entry.from.toLocaleString().padStart(14)} -> ` +
          `${entry.to.toLocaleString().padStart(14)}  (Notch 0 ${entry.notch0.toLocaleString()})`
      );
    }

    console.log(
      `\n${apply ? 'Applied' : 'Would apply'}: ${changed} updated, ${alreadyCorrect} already at ` +
        `target, ${planned.length} grades total.`
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
    console.error('Error applying pay scale:', error);
    process.exit(1);
  }
};

run();
