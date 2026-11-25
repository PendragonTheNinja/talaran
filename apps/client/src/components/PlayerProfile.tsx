import { useState, useEffect } from 'react'
import Badge from './Badge'
import { formatGameDateLong } from '../lib/time'
import { apiFetch } from '../lib/api'
import { getItemIcon, getSlotIcon } from '../lib/items'
import PaletteGallery from './PaletteGallery'
import { apiFetch as apiFetchPalettes } from '../lib/api'
import './PlayerProfile.css'
import { useSkillTooltip } from './SkillTooltip'
import { avatarSrc } from '../lib/avatar'
import { backdropClose } from '../lib/backdrop'

interface ProfileSkill {
    name: string
    type: string
    xp: number
    level: number
    /** Added so another player's skills show the same tooltip as your own. */
    description?: string
    progress?: number
    xpIntoLevel?: number
    xpLevelSpan?: number
}

interface ProfileData {
    player: {
        id: number
        username: string
        guild_tag: string | null
        worn_title: string | null
        worn_badge: string | null
        badge_glyph: string | null
        forum_post_count: number
        created_at: string
        avatar_url?: string | null
    }
    skills: ProfileSkill[]
    equipment: Record<string, string | null>
    totalLevel: number
    totalXp: number
    /** From the server; never worked out here. */
    combatLevel?: number
}

interface PublicGuild {
    guild: { name: string; tag: string; description: string | null; openApplications: boolean }
    members: { id: number; username: string; rank: number; roleLabel: string }[]
}

interface PlayerProfileProps {
    playerId: number
    onClose: () => void
    /** Puts "Name@" in the chat box (forum, 2026-11-23). Absent where there is no chat. */
    onWhisper?: (username: string) => void
    /** The viewer's own name: no Whisper button on their own profile. */
    selfName?: string
}

const SLOTS = [
    { key: 'neck', label: 'Neck' },
    { key: 'head', label: 'Head' },
    { key: 'back', label: 'Back' },
    { key: 'mainhand', label: 'Main Hand' },
    { key: 'chest', label: 'Chest' },
    { key: 'offhand', label: 'Off Hand' },
    { key: 'finger', label: 'Finger' },
    { key: 'legs', label: 'Legs' },
    { key: 'hands', label: 'Hands' },
    { key: 'mount', label: 'Mount' },
    { key: 'feet', label: 'Feet' },
    { key: 'trophy', label: 'Trophy' },
]

export default function PlayerProfile({ playerId, onClose, onWhisper, selfName }: PlayerProfileProps) {
    const [hasPalettePerk, setHasPalettePerk] = useState(false)
    useEffect(() => {
        apiFetchPalettes<{ hasPerk: boolean }>('/api/palettes')
            .then(d => setHasPalettePerk(d.hasPerk))
            .catch(() => { /* leave false */ })
    }, [])
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'skills' | 'equipment' | 'guild'>('equipment')
    // The guild behind the tag, fetched when the tag is tapped (forum, 2026-11-17).
    const [guild, setGuild] = useState<PublicGuild | null>(null)
    const [guildError, setGuildError] = useState('')
    const openGuild = (tag: string) => {
        setActiveTab('guild')
        if (guild?.guild.tag === tag) return
        setGuildError('')
        apiFetch<PublicGuild>(`/api/guilds/public/${encodeURIComponent(tag)}`)
            .then(setGuild)
            .catch((e: { message?: string }) => setGuildError(e?.message || 'Could not load that guild.'))
    }
    // The same skill tooltip the player's own panel uses, named for whose
    // skills these are.
    const { hoverProps, tooltipEl } = useSkillTooltip(profile?.player?.username ?? null)

    useEffect(() => {
        apiFetch<ProfileData>(`/api/player/${playerId}/profile`)
            .then(data => setProfile(data))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [playerId])

    const formatDate = (str: string) => formatGameDateLong(new Date(str))
    return (
        <div className="profile-overlay" {...backdropClose(onClose)}>
            <div className="profile-popup" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn profile-close" onClick={onClose}>✕</button>

                {loading ? (
                    <p className="muted-text" style={{ padding: '32px', textAlign: 'center', fontSize: '14px' }}>Loading...</p>
                ) : !profile ? (
                    <p className="muted-text" style={{ padding: '32px', textAlign: 'center', fontSize: '14px' }}>Player not found.</p>
                ) : (
                    <>
                        {/* Header */}
                        <div className="profile-header">
                            {avatarSrc(profile.player.avatar_url) && (
                                <img className="profile-avatar" src={avatarSrc(profile.player.avatar_url)!} alt={profile.player.username} />
                            )}
                            <div className="profile-header-main">
                            <div className="profile-username">
                                <span className="gold-text" style={{ fontSize: '22px', fontFamily: 'var(--font-heading)' }}>
                                    {profile.player.username}
                                </span>
                                {profile.player.guild_tag && (
                                    <button
                                        className="profile-guild-tag"
                                        onClick={() => openGuild(profile.player.guild_tag!)}
                                        title="See this guild's members"
                                    >
                                        [{profile.player.guild_tag}]
                                    </button>
                                )}
                                <Badge
                                    badgeKey={profile.player.worn_badge}
                                    glyph={profile.player.badge_glyph}
                                    size={20}
                                    title="A feat badge"
                                />
                            </div>

                            {/* The full title, which chat has no room for. A
                                profile is exactly where a phrase belongs. */}
                            {profile.player.worn_title && (
                                <div className="profile-title">{profile.player.worn_title}</div>
                            )}
                            <div className="profile-meta">
                                <span className="muted-text" style={{ fontSize: '13px' }}>Joined {formatDate(profile.player.created_at)}</span>
                                <span className="muted-text" style={{ fontSize: '13px' }}>{profile.player.forum_post_count} forum posts</span>
                            </div>
                            <div className="profile-totals">
                                <div className="profile-total-item">
                                    <span className="muted-text" style={{ fontSize: '12px' }}>Total Level</span>
                                    <span className="gold-text" style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>{profile.totalLevel}</span>
                                </div>
                                {profile.combatLevel !== undefined && (
                                    <div className="profile-total-item">
                                        <span className="muted-text" style={{ fontSize: '12px' }}>Combat</span>
                                        <span className="gold-text" style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>{profile.combatLevel}</span>
                                    </div>
                                )}
                                <div className="profile-total-item">
                                    <span className="muted-text" style={{ fontSize: '12px' }}>Total XP</span>
                                    <span className="gold-text" style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>{profile.totalXp.toLocaleString()}</span>
                                </div>
                            </div>
                            </div>
                        </div>

                        {onWhisper && profile.player.username !== selfName && (
                            <div className="profile-actions">
                                <button className="btn btn-gold profile-whisper-btn" onClick={() => onWhisper(profile.player.username)}>
                                    Whisper to {profile.player.username}
                                </button>
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="profile-tabs">
                            <button className={`profile-tab ${activeTab === 'equipment' ? 'active' : ''}`} onClick={() => setActiveTab('equipment')}>Equipment</button>
                            <button className={`profile-tab ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>Skills</button>
                            {profile.player.guild_tag && (
                                <button className={`profile-tab ${activeTab === 'guild' ? 'active' : ''}`} onClick={() => openGuild(profile.player.guild_tag!)}>Guild</button>
                            )}
                        </div>

                        {/* Skills tab */}
                        {activeTab === 'skills' && (
                            <div className="profile-skills-grid">
                                {profile.skills.map(skill => (
                                    <div
                                        key={skill.name}
                                        className="profile-skill-item"
                                        {...hoverProps(skill)}
                                    >
                                        <div className="skill-icon-wrap">
                                            <img
                                                src={`/images/skills/${skill.name.replace(/ /g, '_')}Skill.png`}
                                                alt={skill.name}
                                                className="skill-icon"
                                                onError={e => { e.currentTarget.style.display = 'none' }}
                                            />
                                            <span className="skill-level">{skill.level}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Guild tab: who else wears the tag */}
                        {activeTab === 'guild' && (
                            <div className="profile-guild">
                                {guildError ? (
                                    <p className="muted-text">{guildError}</p>
                                ) : !guild ? (
                                    <p className="muted-text">Loading...</p>
                                ) : (
                                    <>
                                        <div className="profile-guild-name">
                                            <span className="gold-text">{guild.guild.name}</span>
                                            <span className="muted-text"> [{guild.guild.tag}]</span>
                                        </div>
                                        {guild.guild.description && (
                                            <p className="profile-guild-desc">{guild.guild.description}</p>
                                        )}
                                        <div className="profile-guild-count muted-text">
                                            {guild.members.length} {guild.members.length === 1 ? 'member' : 'members'}
                                            {guild.guild.openApplications ? ' · taking applications' : ''}
                                        </div>
                                        <ul className="profile-guild-members">
                                            {guild.members.map(m => (
                                                <li key={m.id}>
                                                    <span>{m.username}</span>
                                                    <span className="muted-text">{m.roleLabel}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Equipment tab */}
                        {activeTab === 'equipment' && (
                            <div className="profile-equipment-grid">
                                {SLOTS.map(({ key, label }) => {
                                    const itemName = profile.equipment?.[key]
                                    return (
                                        <div
                                            key={key}
                                            className={`equipment-slot panel-inset ${itemName ? 'occupied' : ''}`}
                                            title={itemName || label}
                                        >
                                            {itemName ? (
                                                <>
                                                    <img
                                                        src={getItemIcon(itemName)}
                                                        alt={itemName}
                                                        className="equipment-item-icon"
                                                        onError={e => {
                                                            e.currentTarget.style.display = 'none'
                                                            e.currentTarget.nextElementSibling?.removeAttribute('style')
                                                        }}
                                                    />
                                                    <span className="equipment-item-text" style={{ display: 'none' }}>{itemName.split(' ')[0]}</span>
                                                </>
                                            ) : (
                                                <img src={getSlotIcon(key)} alt={label} className="equipment-slot-icon" />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <PaletteGallery
                            playerId={playerId}
                            hasPerk={hasPalettePerk}
                            compact
                        />
                    </>
                )}
            </div>
            {tooltipEl}
        </div>
    )
}