import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, updateRow } from './_db.js';
import { createHash } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function hashOtp(challengeId, code) {
  const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-test-otp-foundation';
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  const challengeId = String(body.challengeId || '').trim();
  const code = String(body.code || '').replace(/\D/g, '');

  if (!challengeId || code.length !== 6) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid challenge ID and 6-digit OTP code are required.' });
  }

  try {
    const rows = await selectRows('otp_challenges', `select=*&id=${eq(challengeId)}&limit=1`);
    const challenge = rows?.[0];
    if (!challenge) {
      return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'OTP challenge was not found.' });
    }

    if (!String(challenge.status || '').startsWith('pending')) {
      return jsonResponse(409, { ok: false, version: APP_VERSION, message: `OTP challenge is already ${challenge.status}.` });
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await updateRow('otp_challenges', `id=${eq(challengeId)}`, { status: 'expired', updated_at: new Date().toISOString() });
      return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'OTP challenge has expired. Request another test OTP.' });
    }

    const attempts = Number(challenge.attempts || 0) + 1;
    const expected = String(challenge.otp_hash || '');
    const actual = hashOtp(challengeId, code);

    if (expected !== actual) {
      const locked = attempts >= 5;
      await updateRow('otp_challenges', `id=${eq(challengeId)}`, {
        attempts,
        status: locked ? 'failed_too_many_attempts' : challenge.status,
        updated_at: new Date().toISOString()
      });
      return jsonResponse(401, { ok: false, version: APP_VERSION, attempts, message: locked ? 'Too many incorrect OTP attempts. Request another test OTP.' : 'OTP code did not match.' });
    }

    await updateRow('otp_challenges', `id=${eq(challengeId)}`, {
      attempts,
      status: 'verified_test',
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      testMode: true,
      challengeId,
      tenantId: challenge.tenant_id,
      userId: challenge.user_id,
      message: 'Test-mode OTP verified. No live lockout or SMS delivery rule has been enabled yet.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      version: APP_VERSION,
      message: 'Could not verify test-mode OTP challenge.',
      error: error.message,
      details: error.details || null
    });
  }
}
