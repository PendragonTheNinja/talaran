export interface Player {
  id: number
  username: string
  email: string | null
  gold?: number
  /** True while this is a temporary trial character. */
  is_guest?: boolean
  /** When the guest session lapses. Pushed back on activity. */
  guest_expires_at?: string | null
  /** May pin, lock, delete and edit others' forum posts: an admin, or a moderator with forum rights. */
  can_moderate_forum?: boolean
}

export interface PlayerSkill {
  skillId: number
  skillName: string
  xp: number
  level: number
}