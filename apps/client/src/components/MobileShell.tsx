import { useState, useEffect, useRef } from 'react'
import './MobileShell.css'

type MobileView = 'action' | 'inventory' | 'skills' | 'chat' | 'map'

interface MobileShellProps {
    menuItems: { label: string; onClick: () => void; badge?: number; danger?: boolean }[]
    actionScene: React.ReactNode
    locationPanel: React.ReactNode
    inventoryPanel: React.ReactNode
    equipmentPanel: React.ReactNode
    skillsPanel: React.ReactNode
    chatPanel: React.ReactNode
    miniMap: React.ReactNode
    mapRegion: string
    /** Increments when something starts that the player should be watching. */
    focusAction?: number
}

const NAV: { key: MobileView; label: string; icon: string }[] = [
    { key: 'action', label: 'Action', icon: '⚔️' },
    { key: 'inventory', label: 'Items', icon: '🎒' },
    { key: 'skills', label: 'Skills', icon: '📜' },
    { key: 'chat', label: 'Chat', icon: '💬' },
    { key: 'map', label: 'Map', icon: '🗺️' },
]

export default function MobileShell({ menuItems, actionScene, locationPanel, inventoryPanel, equipmentPanel, skillsPanel, chatPanel, miniMap, mapRegion, focusAction = 0 }: MobileShellProps) {
    const [view, setView] = useState<MobileView>('action')
    const [showFullMap, setShowFullMap] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    /* Jump to the action view when travel begins. Tapping a road on the map tab
       otherwise looks like nothing happened, because the thing that changed is
       on a screen the player is not looking at.

       Guarded on the first render so arriving on the app does not fight whatever
       view the player last had. */
    const lastFocus = useRef(focusAction)
    useEffect(() => {
        if (focusAction === lastFocus.current) return
        lastFocus.current = focusAction
        setShowFullMap(false)
        setView('action')
    }, [focusAction])

    return (
        <div className="mobile-shell">
            <div className="mobile-topbar">
                <span className="mobile-brand">Talaran</span>
                <button className="mobile-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menu">☰</button>
            </div>

            <div className="mobile-view">
                {/* Action view stays mounted so the live action/socket logic never resets on tab switch */}
                <div className="mobile-action-view" style={{ display: view === 'action' ? 'flex' : 'none' }}>
                    <div className="mobile-action-scene">{actionScene}</div>
                    <div className="mobile-action-location">{locationPanel}</div>
                </div>

                {view === 'inventory' && (
                    <div className="mobile-items-view">
                        {inventoryPanel}
                    </div>
                )}

                {view === 'skills' && (
                    <div className="mobile-skills-view">
                        {skillsPanel}
                    </div>
                )}

                {view === 'chat' && (
                    <div className="mobile-chat-view">
                        {chatPanel}
                    </div>
                )}

                {view === 'map' && (
                    <div className="mobile-map-view">
                        <div className="mobile-map-canvas">{miniMap}</div>
                        <button className="btn mobile-map-fullbtn" onClick={() => setShowFullMap(true)}>
                            View Full Map
                        </button>
                    </div>
                )}
            </div>

            <nav className="mobile-bottom-nav">
                {NAV.map(n => (
                    <button
                        key={n.key}
                        className={`mobile-nav-btn ${view === n.key ? 'active' : ''}`}
                        onClick={() => setView(n.key)}
                    >
                        <span className="mobile-nav-icon">{n.icon}</span>
                        <span className="mobile-nav-label">{n.label}</span>
                    </button>
                ))}
            </nav>

            {showFullMap && (
                <div className="map-overlay" onClick={() => setShowFullMap(false)}>
                    <div className="map-popup" onClick={e => e.stopPropagation()}>
                        <button className="modal-close-btn map-close" onClick={() => setShowFullMap(false)}>✕</button>
                        <img
                            src={`/images/maps/${mapRegion.replace(/ /g, '_')}.jpg`}
                            alt="Island Map"
                            className="map-image"
                        />
                    </div>
                </div>
            )}

            {menuOpen && (
                <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)}>
                    <div className="mobile-menu-drawer" onClick={e => e.stopPropagation()}>
                        <div className="mobile-menu-header">
                            <span className="mobile-brand">Menu</span>
                            <button className="mobile-menu-btn" onClick={() => setMenuOpen(false)} aria-label="Close">✕</button>
                        </div>
                        {menuItems.map(item => (
                            <button
                                key={item.label}
                                className={`mobile-menu-item ${item.danger ? 'danger' : ''}`}
                                onClick={() => { item.onClick(); setMenuOpen(false) }}
                            >
                                <span>{item.label}</span>
                                {item.badge ? <span className="mobile-menu-badge">{item.badge}</span> : null}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}