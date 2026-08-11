export interface Player {
  id: number
  username: string
  email: string
  gold?: number
}

export interface PlayerSkill {
  skillId: number
  skillName: string
  xp: number
  level: number
}