import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { getItemIcon } from '../lib/items'
import './TradeWindow.css'

interface TradeItem {
    player_id: number
    item_id: number
    name: string
    type: string
    quantity: number
}

interface TradeGold {
    player_id: number
    gold_amount: number
}

interface TradeWindowProps {
    tradeId: number
    myPlayerId: number
    otherPlayer: { id: number; username: string }
    initialOffers: TradeItem[]
    initialGold: TradeGold[]
    isPlayer1: boolean
    onClose: () => void
    onInventoryClick: (enabled: boolean) => void
}

export default function TradeWindow({
    tradeId,
    myPlayerId,
    otherPlayer,
    initialOffers,
    initialGold,
    isPlayer1,
    onClose,
    onInventoryClick,
}: TradeWindowProps) {
    const [offers, setOffers] = useState<TradeItem[]>(initialOffers)
    const [gold, setGold] = useState<TradeGold[]>(initialGold)
    const [myGold, setMyGold] = useState(0)
    const [myAccepted, setMyAccepted] = useState(false)
    const [theirAccepted, setTheirAccepted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [completed, setCompleted] = useState(false)
    const [cancelled, setCancelled] = useState<string | null>(null)

    const isPlayer1Ref = useRef(isPlayer1)
    useEffect(() => {
        isPlayer1Ref.current = isPlayer1
    }, [isPlayer1])

    const myOffers = offers.filter(o => o.player_id === myPlayerId)
    const theirOffers = offers.filter(o => o.player_id === otherPlayer.id)
    const myGoldOffer = gold.find(g => g.player_id === myPlayerId)?.gold_amount || 0
    const theirGoldOffer = gold.find(g => g.player_id === otherPlayer.id)?.gold_amount || 0

    useEffect(() => {
        setMyGold(myGoldOffer)
    }, [myGoldOffer])

    useEffect(() => {
        onInventoryClick(true)
        return () => onInventoryClick(false)
    }, [])

    useEffect(() => {
        const handleUpdate = (e: any) => {
            setOffers(e.detail.offers)
            setGold(e.detail.gold)
            setMyAccepted(false)
            setTheirAccepted(false)
        }

        const handleAcceptance = (e: any) => {
            const p1Accepted = e.detail.player1Accepted
            const p2Accepted = e.detail.player2Accepted
            setMyAccepted(isPlayer1Ref.current ? p1Accepted : p2Accepted)
            setTheirAccepted(isPlayer1Ref.current ? p2Accepted : p1Accepted)
        }

        const handleComplete = () => setCompleted(true)

        const handleCancelled = (e: any) => setCancelled(e.detail.reason)

        window.addEventListener('trade_offer_updated', handleUpdate)
        window.addEventListener('trade_acceptance_updated', handleAcceptance)
        window.addEventListener('trade_completed', handleComplete)
        window.addEventListener('trade_cancelled', handleCancelled)

        return () => {
            window.removeEventListener('trade_offer_updated', handleUpdate)
            window.removeEventListener('trade_acceptance_updated', handleAcceptance)
            window.removeEventListener('trade_completed', handleComplete)
            window.removeEventListener('trade_cancelled', handleCancelled)
        }
    }, [])

    const handleUpdateGold = async () => {
        try {
            await apiFetch('/api/trades/offer/gold', {
                method: 'POST',
                body: JSON.stringify({ tradeId, goldAmount: myGold }),
            })
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleRemoveItem = async (itemId: number) => {
        try {
            await apiFetch('/api/trades/offer/item/remove', {
                method: 'POST',
                body: JSON.stringify({ tradeId, itemId }),
            })
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleAccept = async () => {
        try {
            await apiFetch('/api/trades/accept', {
                method: 'POST',
                body: JSON.stringify({ tradeId }),
            })
            setMyAccepted(true)
        } catch (err: any) {
            setError(err.message)
        }
    }

    const handleCancel = async () => {
        try {
            await apiFetch('/api/trades/cancel', {
                method: 'POST',
                body: JSON.stringify({ tradeId }),
            })
        } catch (err: any) {
            setError(err.message)
        }
    }

    if (completed) {
        return (
            <div className="trade-overlay">
                <div className="trade-window">
                    <div className="trade-complete">
                        <p className="gold-text" style={{ fontSize: '20px' }}>Trade Complete!</p>
                        <p className="muted-text" style={{ fontSize: '14px', marginTop: '8px' }}>Items have been exchanged.</p>
                        <button className="btn btn-gold" style={{ marginTop: '16px' }} onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        )
    }

    if (cancelled) {
        return (
            <div className="trade-overlay">
                <div className="trade-window">
                    <div className="trade-complete">
                        <p style={{ color: 'var(--color-red-glow)', fontSize: '18px' }}>Trade Cancelled</p>
                        <p className="muted-text" style={{ fontSize: '14px', marginTop: '8px' }}>{cancelled}</p>
                        <button className="btn" style={{ marginTop: '16px' }} onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="trade-overlay">
            <div className="trade-window">
                <div className="trade-header">
                    <h3 className="gold-text">Trading with {otherPlayer.username}</h3>
                </div>

                {error && <p className="guild-error" style={{ padding: '0 var(--space-md)', fontSize: '13px' }}>{error}</p>}

                <div className="trade-body">
                    {/* My offer */}
                    <div className="trade-side">
                        <p className="trade-side-title">Your Offer</p>
                        <p className="muted-text" style={{ fontSize: '12px', marginBottom: '8px', fontStyle: 'italic' }}>
                            Click items in your inventory to add them
                        </p>
                        <div className="trade-items">
                            {myOffers.length === 0 ? (
                                <p className="muted-text" style={{ fontSize: '13px', fontStyle: 'italic' }}>No items offered</p>
                            ) : (
                                myOffers.map(item => (
                                    <div key={item.item_id} className="trade-item">
                                        <img
                                            src={getItemIcon(item.name)}
                                            alt={item.name}
                                            className="trade-item-icon"
                                            onError={e => { e.currentTarget.style.display = 'none' }}
                                        />
                                        <span className="trade-item-name">{item.name}</span>
                                        {item.quantity > 1 && <span className="muted-text" style={{ fontSize: '12px' }}>×{item.quantity}</span>}
                                        <button
                                            className="trade-item-remove"
                                            onClick={() => handleRemoveItem(item.item_id)}
                                            title="Remove"
                                        >✕</button>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="trade-gold-row">
                            <span className="gold-text" style={{ fontSize: '14px' }}>Gold:</span>
                            <input
                                type="number"
                                min={0}
                                value={myGold}
                                onChange={e => setMyGold(Math.max(0, parseInt(e.target.value) || 0))}
                                onBlur={handleUpdateGold}
                                className="trade-gold-input"
                                placeholder="0"
                            />
                        </div>
                        <div className="trade-accepted-indicator">
                            {myAccepted && <span style={{ color: '#6ab87e', fontSize: '13px' }}>✓ You accepted</span>}
                        </div>
                    </div>

                    <div className="trade-divider" />

                    {/* Their offer */}
                    <div className="trade-side">
                        <p className="trade-side-title">{otherPlayer.username}'s Offer</p>
                        <div className="trade-items" style={{ marginTop: '28px' }}>
                            {theirOffers.length === 0 ? (
                                <p className="muted-text" style={{ fontSize: '13px', fontStyle: 'italic' }}>No items offered</p>
                            ) : (
                                theirOffers.map(item => (
                                    <div key={item.item_id} className="trade-item">
                                        <img
                                            src={getItemIcon(item.name)}
                                            alt={item.name}
                                            className="trade-item-icon"
                                            onError={e => { e.currentTarget.style.display = 'none' }}
                                        />
                                        <span className="trade-item-name">{item.name}</span>
                                        {item.quantity > 1 && <span className="muted-text" style={{ fontSize: '12px' }}>×{item.quantity}</span>}
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="trade-gold-row">
                            <span className="gold-text" style={{ fontSize: '14px' }}>Gold:</span>
                            <span style={{ fontSize: '14px' }}>{theirGoldOffer.toLocaleString()}</span>
                        </div>
                        <div className="trade-accepted-indicator">
                            {theirAccepted && <span style={{ color: '#6ab87e', fontSize: '13px' }}>✓ {otherPlayer.username} accepted</span>}
                        </div>
                    </div>
                </div>

                <div className="trade-actions">
                    <button
                        className="btn btn-gold"
                        onClick={handleAccept}
                        disabled={myAccepted}
                        style={{ opacity: myAccepted ? 0.6 : 1 }}
                    >
                        {myAccepted ? 'Waiting...' : 'Accept Trade'}
                    </button>
                    <button className="btn btn-red" onClick={handleCancel}>Cancel</button>
                </div>
            </div>
        </div>
    )
}