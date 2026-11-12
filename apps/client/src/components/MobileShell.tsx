import { useState, useEffect, useRef } from 'react'
import './MobileShell.css'
import { CHAT_UNSEEN_EVENT, CHAT_SHOWN_EVENT } from './ChatPanel'
import { backdropClose } from '../lib/backdrop'

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
    const menuWaiting = menuItems.reduce((n, item) => n + (item.badge ?? 0), 0)
    const [view, setView] = useState<MobileView>('action')
    const [showFullMap, setShowFullMap] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    /* Jump to the action view when travel begins. Tapping a road on the map tab
       otherwise looks like nothing happened, because the thing that changed is
       on a screen the player is not looking at.

       Guarded on the first render so arriving on the app does not fight whatever
       view the player last had. */
    /* Chat messages that arrived while another tab was open (ChatPanel fires
       CHAT_UNSEEN_EVENT for each one the player would see). Shown on the Chat
       tab like the Messages count; cleared by opening it. */
    const [unseenChat, setUnseenChat] = useState(0)
    const viewRef = useRef(view)
    useEffect(() => { viewRef.current = view }, [view])
    useEffect(() => {
        const onUnseen = (e: Event) => {
            if (viewRef.current === 'chat') return
            const n = (e as CustomEvent<{ count: number }>).detail?.count ?? 1
            setUnseenChat(c => c + n)
        }
        window.addEventListener(CHAT_UNSEEN_EVENT, onUnseen)
        return () => window.removeEventListener(CHAT_UNSEEN_EVENT, onUnseen)
    }, [])
    const openView = (next: MobileView) => {
        setView(next)
        if (next === 'chat') {
            setUnseenChat(0)
            window.dispatchEvent(new Event(CHAT_SHOWN_EVENT))
        }
    }

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
                <button className="mobile-menu-btn" onClick={() => setMenuOpen(true)} aria-label={menuWaiting > 0 ? `Menu, ${menuWaiting} waiting` : 'Menu'}>
                    ☰
                    {/* What waits inside (messages, forum replies), so a phone
                        player sees it without opening the menu. */}
                    {menuWaiting > 0 && <span className="mobile-menu-btn-badge">{menuWaiting > 99 ? '99+' : menuWaiting}</span>}
                </button>
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

                {/* Chat stays mounted too: it keeps receiving while another tab is
                    open (that is what the unseen count counts), and opening the
                    tab no longer waits on history reloading into a blank box. */}
                <div className="mobile-chat-view" style={{ display: view === 'chat' ? 'flex' : 'none' }}>
                    {chatPanel}
                </div>

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
                        onClick={() => openView(n.key)}
                    >
                        <span className="mobile-nav-icon">{n.icon}</span>
                        <span className="mobile-nav-label">{n.label}</span>
                        {n.key === 'chat' && unseenChat > 0 && (
                            <span className="mobile-nav-badge" aria-label={`${unseenChat} unread chat messages`}>
                                {unseenChat > 99 ? '99+' : unseenChat}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {showFullMap && (
                <div className="map-overlay" {...backdropClose(() => setShowFullMap(false))}>
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
                <div className="mobile-menu-overlay" {...backdropClose(() => setMenuOpen(false))}>
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