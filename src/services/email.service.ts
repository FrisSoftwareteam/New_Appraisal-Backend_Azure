import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT) || 465,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return _transporter;
}

function wrap(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#18181b;padding:20px 24px;">
            <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${title}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;">
            <p style="margin:0 0 8px;">Access the application here: <a href="https://fris-appraisal-app.vercel.app/" style="color:#2563eb;text-decoration:none;font-weight:500;">https://fris-appraisal-app.vercel.app/</a></p>
            This is an automated notification. Please do not reply to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#71717a;font-size:14px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0 6px 12px;font-size:14px;color:#18181b;">${value}</td>
  </tr>`;
}

function infoTable(rows: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${rows.map(([l, v]) => infoRow(l, v)).join('')}</table>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

function badge(text: string, color: string): string {
  const colors: Record<string, string> = {
    green: 'background:#dcfce7;color:#166534;',
    red: 'background:#fee2e2;color:#991b1b;',
    yellow: 'background:#fef9c3;color:#854d0e;',
    blue: 'background:#dbeafe;color:#1e40af;',
    gray: 'background:#f4f4f5;color:#3f3f46;',
  };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;${colors[color] || colors.gray}">${text}</span>`;
}

interface SendOptions {
  to: string | string[];
  subject: string;
  title: string;
  body: string;
}

async function send({ to, subject, title, body }: SendOptions): Promise<void> {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[Email] Skipped — EMAIL_USER/EMAIL_PASS not configured');
    return;
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) return;

  const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@app.com';
  const from = `"FRIS HR SYSTEM" <${fromEmail}>`;

  try {
    await getTransporter().sendMail({
      from,
      to: recipients.join(', '),
      subject,
      html: wrap(title, body),
    });
  } catch (err) {
    console.error('[Email] Failed to send:', err);
  }
}

// ─── Leave Request Notifications ─────────────────────────────────────

const LEAVE_TYPE_EMAIL_LABELS: Record<string, string> = {
  annual_leave: 'Annual Leave',
  sick_leave: 'Sick Leave',
  official_assignment: 'Official Assignment',
  other: 'Other Leave',
};

export async function notifyLeaveSubmitted(
  applicantEmail: string,
  applicantName: string,
  leaveType: string,
  startDate: string,
  endDate: string,
  firstApproverName: string,
) {
  const typeLabel = LEAVE_TYPE_EMAIL_LABELS[leaveType] || leaveType;
  await send({
    to: applicantEmail,
    subject: `Leave Request Submitted — ${typeLabel}`,
    title: 'Leave Request Submitted',
    body:
      paragraph(`Hi ${applicantName}, your leave request has been submitted and is awaiting approval.`) +
      infoTable([
        ['Type', badge(typeLabel, 'blue')],
        ['Dates', `${startDate} — ${endDate}`],
        ['First Approver', firstApproverName],
      ]),
  });
}

export async function notifyLeaveApprovalNeeded(
  approverEmail: string,
  approverName: string,
  applicantName: string,
  leaveType: string,
  startDate: string,
  endDate: string,
  stepLabel: string,
  reason: string,
) {
  const typeLabel = LEAVE_TYPE_EMAIL_LABELS[leaveType] || leaveType;
  await send({
    to: approverEmail,
    subject: `Leave Approval Needed — ${applicantName}`,
    title: 'Leave Approval Required',
    body:
      paragraph(`Hi ${approverName}, a leave request requires your approval as <strong>${stepLabel}</strong>.`) +
      infoTable([
        ['Applicant', applicantName],
        ['Type', badge(typeLabel, 'blue')],
        ['Dates', `${startDate} — ${endDate}`],
        ['Reason', reason],
      ]) +
      paragraph('Please log in to the app to approve or reject this request.'),
  });
}

export async function notifyLeaveStepApproved(
  applicantEmail: string,
  applicantName: string,
  stepLabel: string,
  approverName: string,
  isFullyApproved: boolean,
  nextApproverLabel?: string,
) {
  await send({
    to: applicantEmail,
    subject: isFullyApproved ? 'Leave Request Approved' : `Leave Step Approved — ${stepLabel}`,
    title: isFullyApproved ? 'Leave Request Approved' : 'Leave Step Approved',
    body: isFullyApproved
      ? paragraph(`Hi ${applicantName}, your leave request has been <strong>fully approved</strong>. Your leave dates are now registered and will appear on the calendar.`) +
        infoTable([['Final Approver', approverName], ['Status', badge('Approved', 'green')]])
      : paragraph(`Hi ${applicantName}, the <strong>${stepLabel}</strong> step of your leave request has been approved by ${approverName}.`) +
        infoTable([
          ['Step', `${stepLabel} — ${badge('Approved', 'green')}`],
          ['Next', nextApproverLabel || 'N/A'],
        ]),
  });
}

export async function notifyLeaveRejected(
  applicantEmail: string,
  applicantName: string,
  rejectedByName: string,
  stepLabel: string,
  comment?: string,
) {
  await send({
    to: applicantEmail,
    subject: `Leave Request Rejected — ${stepLabel}`,
    title: 'Leave Request Rejected',
    body:
      paragraph(`Hi ${applicantName}, your leave request has been <strong>rejected</strong> at the <strong>${stepLabel}</strong> step.`) +
      infoTable([
        ['Rejected By', rejectedByName],
        ['Step', `${stepLabel} — ${badge('Rejected', 'red')}`],
        ...(comment ? [['Comment', comment] as [string, string]] : []),
      ]) +
      paragraph('You may submit a new leave request if needed.'),
  });
}

// ─── Appraisal Flow Notifications ────────────────────────────────────

export async function notifyAppraisalInitiated(
  employeeEmail: string,
  employeeName: string,
  period: string,
  firstStepName: string,
) {
  await send({
    to: employeeEmail,
    subject: `Appraisal Started — ${period}`,
    title: 'Appraisal Cycle Started',
    body:
      paragraph(`Hi ${employeeName}, your appraisal for <strong>${period}</strong> has been initiated.`) +
      infoTable([
        ['Period', period],
        ['First Step', firstStepName],
      ]) +
      paragraph('Please log in to the app to begin your self-assessment.'),
  });
}

export async function notifyAppraisalReviewSubmitted(
  recipientEmail: string,
  recipientName: string,
  employeeName: string,
  reviewerName: string,
  stepName: string,
  actionRequired: string,
) {
  await send({
    to: recipientEmail,
    subject: `Appraisal Review Submitted — ${employeeName}`,
    title: 'Appraisal Review Submitted',
    body:
      paragraph(`Hi ${recipientName}, a review has been submitted for <strong>${employeeName}</strong>'s appraisal.`) +
      infoTable([
        ['Reviewer', reviewerName],
        ['Step', stepName],
        ['Action Required', actionRequired],
      ]) +
      paragraph('Please log in to the app to take action.'),
  });
}

export async function notifyAppraisalPendingAcceptance(
  employeeEmail: string,
  employeeName: string,
  reviewerName: string,
  stepName: string,
) {
  await send({
    to: employeeEmail,
    subject: `Appraisal Review Ready for Your Acceptance`,
    title: 'Review Ready for Acceptance',
    body:
      paragraph(`Hi ${employeeName}, <strong>${reviewerName}</strong> has submitted their review for the <strong>${stepName}</strong> step of your appraisal.`) +
      paragraph('Please log in to review and accept or reject the assessment.'),
  });
}

export async function notifyAppraisalRejected(
  recipientEmail: string,
  recipientName: string,
  employeeName: string,
  rejectorRole: string,
  reason: string,
) {
  await send({
    to: recipientEmail,
    subject: `Appraisal Returned — ${employeeName}`,
    title: 'Appraisal Returned for Revision',
    body:
      paragraph(`Hi ${recipientName}, the appraisal for <strong>${employeeName}</strong> has been returned for revision.`) +
      infoTable([
        ['Returned By', rejectorRole],
        ['Reason', reason || 'No reason provided'],
      ]) +
      paragraph('Please log in to the app to review and resubmit.'),
  });
}

export async function notifyAppraisalCompleted(
  employeeEmail: string,
  employeeName: string,
  period: string,
) {
  await send({
    to: employeeEmail,
    subject: `Appraisal Completed — ${period}`,
    title: 'Appraisal Completed',
    body:
      paragraph(`Hi ${employeeName}, your appraisal for <strong>${period}</strong> has been completed. ${badge('Completed', 'green')}`) +
      paragraph('You can view the final scorecard in the app.'),
  });
}

export async function notifyAppraisalStepAssigned(
  assigneeEmail: string,
  assigneeName: string,
  employeeName: string,
  stepName: string,
  period: string,
) {
  await send({
    to: assigneeEmail,
    subject: `Appraisal Review Assigned — ${employeeName}`,
    title: 'You Have Been Assigned an Appraisal Review',
    body:
      paragraph(`Hi ${assigneeName}, you have been assigned to review <strong>${employeeName}</strong>'s appraisal for <strong>${period}</strong>.`) +
      infoTable([
        ['Step', stepName],
        ['Employee', employeeName],
        ['Period', period],
      ]) +
      paragraph('Please log in to the app to complete your review.'),
  });
}
