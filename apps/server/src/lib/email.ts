import { logger } from '../index';

// Transactional email via Resend (https://resend.com). Kept deliberately small
// and dependency-free (uses fetch), so swapping providers later means editing
// only this file. Requires:
//   RESEND_API_KEY  — API key with Sending access (starts 're_')
//   RESEND_FROM     — verified sender, e.g. 'Talaran <noreply@send.talaran.net>'
// If the key is absent, sends are skipped (logged), never thrown — a missing
// email config must not take down auth routes.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Talaran <noreply@send.talaran.net>';

export function emailConfigured(): boolean {
    return !!RESEND_API_KEY;
}

export async function sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
}): Promise<boolean> {
    if (!RESEND_API_KEY) {
        logger.error('[email] RESEND_API_KEY not set — email not sent');
        return false;
    }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: RESEND_FROM,
                to: params.to,
                subject: params.subject,
                html: params.html,
                ...(params.text ? { text: params.text } : {}),
            }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            logger.error(`[email] Resend send failed (${res.status}): ${body}`);
            return false;
        }
        return true;
    } catch (err) {
        logger.error(`[email] Resend send error: ${err}`);
        return false;
    }
}

// --- Templates ------------------------------------------------------------

export function passwordResetEmail(username: string, resetLink: string): { subject: string; html: string; text: string } {
    const subject = 'Reset your Talaran password';
    const text =
        `Hello ${username},\n\n` +
        `Someone (hopefully you) asked to reset your Talaran password. ` +
        `Open the link below to choose a new one. It expires in 1 hour.\n\n` +
        `${resetLink}\n\n` +
        `If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
        `— Talaran`;
    const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 520px; margin: 0 auto; color: #2a2118;">
      <h1 style="color: #8a6a28; font-size: 24px;">Talaran</h1>
      <p>Hello ${escapeHtml(username)},</p>
      <p>Someone (hopefully you) asked to reset your Talaran password. Choose a new one using the button below — this link expires in <strong>1 hour</strong>.</p>
      <p style="margin: 28px 0;">
        <a href="${resetLink}" style="background: #8a6a28; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Reset my password</a>
      </p>
      <p style="font-size: 13px; color: #6f5d40;">If the button doesn't work, paste this link into your browser:<br>
        <a href="${resetLink}" style="color: #8a6a28;">${resetLink}</a>
      </p>
      <p style="font-size: 13px; color: #6f5d40;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      <p style="font-size: 13px; color: #6f5d40;">— Talaran</p>
    </div>`;
    return { subject, html, text };
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ));
}
