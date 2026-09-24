export interface Player {
  id: number
  username: string
  email: string
  password_hash: string
  is_banned: boolean
  is_admin: boolean
  is_mod: boolean
  last_login: Date | null
  gold: number
  banned_until: Date | null
  ban_reason: string | null
}

export interface JwtPayload {
  playerId: number;
  // Never actually put in a token: no sign-in route ever included it, and
  // nothing reads it. Optional so the type matches what is issued.
  username?: string;
  // Present only on guest tokens. Upgrading issues a fresh token without it.
  // Every token, guest or not, is checked by lib/sessions.ts.
  isGuest?: boolean;
  // The player's token_version when this token was issued. Compared on every
  // request and socket connection (lib/sessions.ts); bumping the column ends
  // every session issued before. Absent on tokens from before it existed,
  // which read as 0.
  tv?: number;
}