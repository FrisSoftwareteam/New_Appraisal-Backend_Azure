import { isWeekendDateKey } from '../src/services/attendance.service';

const testDates = [
  { date: '2024-03-16', expected: true }, // Saturday
  { date: '2024-03-17', expected: true }, // Sunday
  { date: '2024-03-18', expected: false }, // Monday
];

console.log('Verifying isWeekendDateKey logic:');
testDates.forEach(({ date, expected }) => {
  const result = isWeekendDateKey(date);
  console.log(`${date}: ${result} (Expected: ${expected}) - ${result === expected ? 'PASS' : 'FAIL'}`);
});
