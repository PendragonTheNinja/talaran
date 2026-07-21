import { useState, useEffect } from 'react'
import { formatGameDateLong } from '../lib/time'
import { apiFetch } from '../lib/api'
import { getItemIcon, getSlotIcon } from '../lib/items'
import PaletteGallery from './PaletteGallery'
import { apiFetch as apiFetchPalettes } from '../lib/api'
import './PlayerProfile.css'

interface ProfileSkill {
    name: string
    type: string
    xp: number
    level: number
}

interface ProfileData {
    player: {
        id: number
        username: string
        guild_tag: string | null
        forum_post_count: number
        created_at: string
    }
    skills: ProfileSkill[]
    equipment: Record<string, string | null>
    totalLevel: number
    totalXp: number
}

interface PlayerProfileProps {
    playerId: number
    onClose: () => void
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

export default function PlayerProfile({ playerId, onClose }: PlayerProfileProps) {
    const [hasPalettePerk, setHasPalettePerk] = useState(false)
    useEffect(() => {
        apiFetchPalettes<{ hasPerk: boolean }>('/api/palettes')
            .then(d => setHasPalettePerk(d.hasPerk))
            .catch(() => { /* leave false */ })
    }, [])
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'skills' | 'equipment'>('equipment')

    useEffect(() => {
        apiFetch<ProfileData>(`/api/player/${playerId}/profile`)
            .then(data => setProfile(data))
            .catch(() => { })
            .finally(() => setLoading(false))
    }, [playerId])

    const formatDate = (str: string) => formatGameDateLong(new Date(str))
    return (
        <div className="profile-overlay" onClick={onClose}>
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
                            <div className="profile-username">
                                <span className="gold-text" style={{ fontSize: '22px', fontFamily: 'var(--font-heading)' }}>
                                    {profile.player.username}
                                </span>
                                {profile.player.guild_tag && (
                                    <span className="muted-text" style={{ fontSize: '16px' }}>[{profile.player.guild_tag}]</span>
                                )}
                            </div>
                            <div className="profile-meta">
                                <span className="muted-text" style={{ fontSize: '13px' }}>Joined {formatDate(profile.player.created_at)}</span>
                                <span className="muted-text" style={{ fontSize: '13px' }}>{profile.player.forum_post_count} forum posts</span>
                            </div>
                            <div className="profile-totals">
                                <div className="profile-total-item">
                                    <span className="muted-text" style={{ fontSize: '12px' }}>Total Level</span>
                                    <span className="gold-text" style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>{profile.totalLevel}</span>
                                </div>
                                <div className="profile-total-item">
                                    <span className="muted-text" style={{ fontSize: '12px' }}>Total XP</span>
                                    <span className="gold-text" style={{ fontSize: '18px', fontFamily: 'var(--font-heading)' }}>{profile.totalXp.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="profile-tabs">
                            <button className={`profile-tab ${activeTab === 'equipment' ? 'active' : ''}`} onClick={() => setActiveTab('equipment')}>Equipment</button>
                            <button className={`profile-tab ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>Skills</button>
                        </div>

                        {/* Skills tab */}
                        {activeTab === 'skills' && (
                            <div className="profile-skills-grid">
                                {profile.skills.map(skill => (
                                    <div
                                        key={skill.name}
                                        className="profile-skill-item"
                                        title={`${skill.name} — Level ${skill.level}\n${skill.xp.toLocaleString()} XP`}
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
        </div>
    )
}