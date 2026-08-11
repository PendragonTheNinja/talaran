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
  username: string;
}