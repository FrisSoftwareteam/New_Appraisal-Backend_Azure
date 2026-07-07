# Offline Attendance Excel Upload Specification

This document defines the template, headers, and data format requirements for the Offline Attendance Excel upload feature. The backend parses this spreadsheet to create or update employee attendance records.

---

## 1. Sheet Structure & Discovery

- **First Sheet with Data**: The backend automatically searches and processes the **first sheet** in the workbook that contains non-empty rows.
- **Header Normalization**: Headers are case-insensitive and ignore spaces or special characters. The backend normalizes keys by keeping only lowercase letters (e.g., `Check-In Time` becomes `checkintime`).

---

## 2. Expected Columns and Header Mapping

The table below shows the required and optional columns, along with the allowed headers that the backend maps to each field.

| Backend Field | Required? | Accepted Header Variations (Normalized) | Description / Guidelines |
| :--- | :--- | :--- | :--- |
| **Email** | **Yes** | `email`, `emailaddress`, `staffemail`, `useremail` | Used to look up the employee in the database. Must match a registered user email (case-insensitive, trimmed). |
| **Date** | **Yes** (Recommended) | `date`, `attendancedate`, `day` | The attendance date. *If omitted, the backend will try to extract the date from the Check-In column (if it contains a full date and time).* |
| **Check In** | **Yes** | `checkin`, `checkintime`, `timein`, `checkinat` | The time the employee checked in. Can be time-only or full datetime. |
| **Check Out** | No | `checkout`, `checkouttime`, `timeout`, `checkoutat` | The time the employee checked out. Optional; if provided, updates the check-out record. |

---

## 3. Supported Value Formats

To prevent processing errors, the data inside the sheet columns should adhere to these formats:

### A. Email
* **Format**: Standard email string.
* **Examples**: `john.doe@company.com`, `staff.jane@company.com`

### B. Date
* **Excel Date Cell**: Recommended (proper Date formatted cell in Excel).
* **String Dates**:
  - `YYYY-MM-DD` (e.g., `2026-06-28`)
  - `DD/MM/YYYY` (e.g., `28/06/2026`)
  - `MM/DD/YYYY` (e.g., `06/28/2026`)
* **Excel Serial Numbers**: Numeric representation (e.g., `46200` for 2026-06-28).

### C. Check-In & Check-Out Times
* **Excel Time Cell**: Recommended (fractional days, e.g., `0.35416` for `08:30:00`).
* **24-Hour Time Strings**: `HH:MM` or `HH:MM:SS` (e.g., `08:30`, `17:15:30`).
* **12-Hour Time Strings**: `HH:MM AM/PM` (e.g., `8:30 AM`, `5:15 PM`).
* **Full ISO/Datetime Strings**: Can include date and time (e.g., `2026-06-28T08:30:00Z`). The backend resolves the time part and aligns it with the timezone of the attendance workspace.

---

## 4. Example Template Structure

Below is a visual representation of how the spreadsheet table should look:

| Staff Email | Attendance Date | Time In | Time Out |
| :--- | :--- | :--- | :--- |
| john.doe@company.com | 2026-06-28 | 08:30 AM | 05:30 PM |
| jane.smith@company.com | 28/06/2026 | 08:45 | 17:00 |
| bob.jones@company.com | 2026-06-28 | 09:00:00 | |

---

## 5. Backend Logic & Behavior Notes

1. **User Lookup**: Every email is looked up in the DB. If the email doesn't exist, the row is skipped and logged in the API response errors array.
2. **Timezone Resolution**: Times are parsed and stored in UTC according to the configured workspace timezone.
3. **Record Creation vs. Update**:
   - If no attendance record exists for the user on that date, a new record is **created** (with source set to `'On Prem (Offline)'`).
   - If an attendance record already exists, it is **updated only if** the new times differ by more than 1 second.
4. **Validation Error Reporting**: The API response returns a summary list of errors, indicating the row number and the exact issue (e.g. `Row 5 (user@email.com): Employee not found in database.`).
