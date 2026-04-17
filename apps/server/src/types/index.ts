export interface Player {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  is_banned: boolean;
  is_admin: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface JwtPayload {
  playerId: number;
  username: string;
}