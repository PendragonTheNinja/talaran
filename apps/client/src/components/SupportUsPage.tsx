import { Link } from 'react-router-dom'
import './SupportUsPage.css'

// Public /store page: explains the cosmetic store to logged-out visitors and
// to payment/domain reviewers. Talaran is a game its operator owns and runs;
// Talers are its in-game currency, spent only on cosmetic items.
// Tier displays here mirror the live config (config/talerTiers.ts,
// services/store.ts) — update together.

const TIERS = [
    { usd: 5, talers: 500, bonus: null },
    { usd: 10, talers: 1050, bonus: '+5%' },
    { usd: 20, talers: 2200, bonus: '+10%' },
    { usd: 50, talers: 5750, bonus: '+15%' },
    { usd: 100, talers: 12000, bonus: '+20%' },
]

export default function SupportUsPage() {
    return (
        <div className="supportus-page">
            <div className="supportus-content">
                <Link to="/" className="legal-home gold-text">← Talaran</Link>
                <h1>Talaran Store</h1>
                <p className="supportus-lede">
                    Talaran is a browser MMORPG that I build and operate myself. The store is where
                    you can buy cosmetic upgrades for the game — interface themes and custom color
                    palettes — using <span className="gold-text">Talers</span>, Talaran's in-game
                    currency.
                </p>

                <h2>Talers — the in-game currency</h2>
                <p>
                    Talers are Talaran's virtual currency, purchased with real money and spent inside
                    the game on cosmetic items: interface themes, custom color palettes, and visual
                    flair. <strong>Cosmetic only — never power.</strong> No experience boosts, no
                    exclusive gear, no shortcuts. Everyone plays the same game; Talers just buy more
                    ways to make it look like yours.
                </p>

                <div className="supportus-tiers">
                    {TIERS.map(t => (
                        <div key={t.usd} className="supportus-tier">
                            <span className="supportus-tier-talers gold-text">{t.talers.toLocaleString()}</span>
                            <span className="supportus-tier-unit">Talers</span>
                            {t.bonus && <span className="supportus-tier-bonus">{t.bonus} bonus</span>}
                            <span className="supportus-tier-price">${t.usd}</span>
                        </div>
                    ))}
                </div>

                <h2>What Talers buy</h2>
                <p>
                    Premium interface themes — <em>Moonveil</em>, <em>Mosswood</em>, and{' '}
                    <em>Forgeheart</em> — individually or as a discounted set. And the{' '}
                    <strong>Custom Palettes</strong> studio: build your own theme from scratch,
                    preview every change live across the whole game, and share your creations with
                    other players. Two interface themes are free for everyone, always.
                </p>

                <h2>How it works</h2>
                <p>
                    Everything is bought inside the game — create a free account, open the{' '}
                    <strong>Store</strong>, and choose a Taler pack. Payments are securely processed by{' '}
                    <strong>Paddle</strong>, our merchant of record, and accept major cards, PayPal,
                    Apple Pay, and Google Pay; Paddle will appear on your statement. Talers and the
                    items they unlock are cosmetic in-game content with no real-world value, are
                    non-transferable, and are non-refundable once spent — the full details live in our{' '}
                    <Link to="/terms">Terms</Link> and <Link to="/refunds">Refund Policy</Link>.
                </p>

                <p className="supportus-warmth">
                    Talaran is a one-person project, so every purchase also helps keep the servers lit
                    and the world growing. Thank you for that — but make no mistake, you're buying
                    something real: the game, dressed the way you like it.
                </p>

                <p className="supportus-cta">
                    <Link to="/" className="btn btn-gold supportus-play">Play Talaran — free</Link>
                </p>

                <div className="legal-footer">
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/refunds">Refund Policy</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                </div>
            </div>
        </div>
    )
}
