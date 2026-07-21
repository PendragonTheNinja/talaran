import { Link } from 'react-router-dom'
import './SupportUsPage.css'

// Public /support-us page: explains Talers to logged-out visitors — and to
// Paddle's domain reviewers, who need to see the product without an account.
// Tier and price displays here are informational copies of the live config
// (config/talerTiers.ts and services/store.ts); update together.

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
                <h1>Support Talaran</h1>
                <p className="supportus-lede">
                    Talaran is a free browser MMORPG built and run by one person, for the love of it.
                    If the world has earned a place in your day, you can support its servers and its
                    growth — and get to look good doing it.
                </p>

                <h2>Talers</h2>
                <p>
                    Supporting the game buys <span className="gold-text">Talers</span>, Talaran's
                    cosmetic currency. Talers are spent entirely on looks and self-expression:
                    interface themes, custom color palettes, and supporter flair.{' '}
                    <strong>Never power.</strong> No experience boosts, no exclusive gear, no
                    shortcuts — everyone plays the same game; supporters just get more ways to make
                    it theirs.
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
                    <em>Forgeheart</em> — individually or as a discounted set. And for those who want
                    to go further, the <strong>Custom Palettes</strong> perk: paint your own Talaran
                    with a full palette studio, preview every change live across the whole game, and
                    share your creations with fellow customizers. Two themes are free for everyone,
                    always.
                </p>

                <h2>How it works</h2>
                <p>
                    Purchases happen inside the game — create a free account, open the{' '}
                    <strong>♥ Support</strong> page, and pick a tier. Payments are securely processed
                    by <strong>Paddle</strong>, our merchant of record, and accept major cards,
                    PayPal, Apple Pay, and Google Pay; Paddle will appear on your statement. Talers
                    have no real-world value, are non-transferable, and are non-refundable once
                    spent — the full details live in our <Link to="/terms">Terms</Link> and{' '}
                    <Link to="/refunds">Refund Policy</Link>.
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
