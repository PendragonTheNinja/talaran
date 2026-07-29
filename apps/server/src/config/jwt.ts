import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';

// Audit finding 6 (docs/AUDIT-2026-07-26.md).
//
// This used to be `process.env.JWT_SECRET || 'fallback_secret'`. If the variable
// were ever unset or misspelled in the environment, the server would happily sign
// tokens with a publicly known string and anyone could mint a valid token for any
// player, including an admin. Failing to boot is the correct response.
//
// Resolved through a function rather than
//
//     const JWT_SECRET = process.env.JWT_SECRET;
//     if (!JWT_SECRET) throw new Error(...);
//
// because that leaves the declared type as `string | undefined`, and TypeScript
// does not carry the narrowing into the function bodies below. jwt.sign and
// jwt.verify then fail overload resolution, and verify's return type degrades
// into something the `as JwtPayload` cast rejects. This form is plainly `string`.
function requireSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET is not set. Refusing to start: without it, tokens would be '
      + 'signed with a known value and anyone could forge an admin session.',
    );
  }

  return secret;
}

const JWT_SECRET: string = requireSecret();
const JWT_EXPIRES_IN = '7d';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
