/**
 * The one email the service sends.
 *
 * A pure function on purpose: pass it an event payload, get back the three
 * fields nodemailer needs. Nothing here reads config, touches a transport, or
 * knows what a recipient is - which makes it trivially testable in isolation
 * and means the handler can decide what to do when the template throws
 * (nothing throws today; one day a stricter template might).
 *
 * The event payload is the one `audienceFor` resolves in the API's interview
 * module: six fields, no email (that is this service's job to look up), no
 * duration, no company. The template reads whatever is useful and gives
 * fallbacks for the fields that may be null (jobTitle, mode).
 */
export function interviewScheduledEmail({ scheduledAt, mode, jobTitle, studentName }) {
  const when = new Date(scheduledAt).toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const job = jobTitle ?? 'a scheduled role';
  const salutation = studentName ? `Hi ${studentName},` : 'Hi,';
  const modeLabel = mode ? `${mode.charAt(0).toUpperCase()}${mode.slice(1)}` : 'An';

  const subject = `Interview scheduled — ${job}`;

  const text = [
    salutation,
    '',
    `${modeLabel} interview has been scheduled for your application to "${job}".`,
    '',
    `When: ${when}`,
    `Mode: ${mode ?? 'to be confirmed'}`,
    '',
    'You can see the details in your Naukri Suvidha applications page.',
    '',
    '— Naukri Suvidha',
  ].join('\n');

  // Inline styles because many clients strip <style> and <link>. Plain and
  // readable rather than clever - a job post, not a marketing email.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; max-width: 560px;">
      <p>${salutation}</p>
      <p>${modeLabel} interview has been scheduled for your application to <strong>${job}</strong>.</p>
      <table cellpadding="6" style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="color: #64748b;">When</td><td><strong>${when}</strong></td></tr>
        <tr><td style="color: #64748b;">Mode</td><td>${mode ?? 'to be confirmed'}</td></tr>
      </table>
      <p>You can see the details in your Naukri Suvidha applications page.</p>
      <p style="color: #64748b; font-size: 12px; margin-top: 24px;">— Naukri Suvidha</p>
    </div>
  `.trim();

  return { subject, text, html };
}
