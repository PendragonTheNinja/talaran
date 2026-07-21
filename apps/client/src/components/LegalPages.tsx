import { Link } from 'react-router-dom'
import './LegalPages.css'

// Legal pages required for Paddle domain verification (docs/support-spec.md).
// DRAFTS — review before going live, and replace the placeholders:
//   Nathan Wheatley     — Nathan's legal name (Paddle prefers it for sole proprietors)
//   support@talaran.net  — e.g. support@talaran.net
// Not legal advice; have a professional review when the money gets real.

const EFFECTIVE_DATE = 'July 18, 2026'

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="legal-page">
            <div className="legal-content">
                <Link to="/" className="legal-home gold-text">← Talaran</Link>
                <h1>{title}</h1>
                <p className="legal-date">Effective {EFFECTIVE_DATE}</p>
                {children}
                <div className="legal-footer">
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/refunds">Refund Policy</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                </div>
            </div>
        </div>
    )
}

export function TermsPage() {
    return (
        <LegalShell title="Terms of Service">
            <p>
                Talaran ("the Game") is a browser game operated by Nathan Wheatley, doing business as
                Talaran ("we", "us"). By creating an account or playing, you agree to these terms.
                Questions: .
            </p>

            <h2>1. Your account</h2>
            <p>
                You are responsible for your account and its security. You must provide accurate
                information and may not share, sell, or transfer accounts. We may suspend or close
                accounts that violate these terms, abuse other players, exploit bugs, or automate
                gameplay.
            </p>

            <h2>2. The Game and your content</h2>
            <p>
                The Game, including its art, text, code, and design, belongs to us. Content you post
                (chat, forum posts, shared palettes) remains yours, but you grant us a license to
                display it within the Game. Keep it civil; we may remove content that is abusive,
                illegal, or disruptive.
            </p>

            <h2>3. Talers (virtual currency)</h2>
            <p>
                Talers are a virtual currency purchasable with real money and spendable only on
                cosmetic and expressive items within the Game. Talers and everything bought with
                them: (a) have no real-world monetary value; (b) are not transferable between
                accounts or redeemable for cash; (c) are non-refundable once spent, except as
                described in our <Link to="/refunds">Refund Policy</Link> or required by law; and
                (d) may be revoked in cases of fraud, chargeback abuse, or violation of these terms.
                Purchases are processed by Paddle, our merchant of record — Paddle's terms also
                apply to the payment itself, and Paddle will appear on your statement.
            </p>

            <h2>4. Alpha status</h2>
            <p>
                Talaran is in active development. Features, balance, and content will change, and
                gameplay data may occasionally be adjusted or reset as development requires.
                Cosmetic purchases and Taler balances will be preserved across any such changes
                wherever reasonably possible.
            </p>

            <h2>5. Disclaimers</h2>
            <p>
                The Game is provided "as is" without warranties of any kind. To the fullest extent
                permitted by law, we are not liable for indirect or consequential damages, and our
                total liability is limited to the amount you paid us in the twelve months before a
                claim.
            </p>

            <h2>6. Changes</h2>
            <p>
                We may update these terms; material changes will be announced in the Game or on our
                news page. Continued play after changes take effect means you accept them.
            </p>
        </LegalShell>
    )
}

export function RefundPage() {
    return (
        <LegalShell title="Refund Policy">
            <p>
                We want supporters to feel good about supporting Talaran. This policy covers
                purchases of Talers, our cosmetic-only virtual currency. Payments are processed by
                Paddle, our merchant of record.
            </p>

            <h2>Unspent Talers</h2>
            <p>
                If you purchased Talers and have not spent them, contact us at support@talaran.net
                within 14 days of purchase and we will arrange a refund of that purchase through
                Paddle.
            </p>

            <h2>Spent Talers</h2>
            <p>
                Talers that have been spent on cosmetic items are non-refundable, and the items
                themselves are non-returnable — they are delivered instantly and permanently to
                your account. Where local consumer law grants additional rights, those rights are
                unaffected.
            </p>

            <h2>Problems and mistakes</h2>
            <p>
                Charged twice, credited the wrong amount, or bought the wrong tier by accident?
                Write to support@talaran.net with the email you used at checkout and we will make it
                right. Refund requests can also be raised directly with Paddle via the receipt
                email they send you.
            </p>
        </LegalShell>
    )
}

export function PrivacyPage() {
    return (
        <LegalShell title="Privacy Policy">
            <p>
                This policy describes what Talaran (Nathan Wheatley) collects and why. Short version:
                we collect what the Game needs to run, and we don't sell your data. Contact:
                support@talaran.net.
            </p>

            <h2>What we collect</h2>
            <p>
                <strong>Account data:</strong> username, email address, and a hashed password.{' '}
                <strong>Gameplay data:</strong> your characters, progress, inventory, chat and forum
                messages, and settings. <strong>Technical data:</strong> IP address and browser
                information in server logs, used for security, abuse prevention, and bot detection.{' '}
                <strong>Purchase data:</strong> if you buy Talers, our payment processor Paddle (as
                merchant of record) collects your payment details — we never see your card number.
                We receive and store the transaction reference, the tier purchased, and the buyer
                country for accounting and fraud prevention.
            </p>

            <h2>How we use it</h2>
            <p>
                To operate the Game, keep accounts secure, prevent cheating and abuse, credit
                purchases, and communicate service information. We do not sell personal data or use
                it for third-party advertising.
            </p>

            <h2>Storage and sharing</h2>
            <p>
                Data is stored on servers operated by our hosting providers. We share data only
                with service providers necessary to run the Game (hosting, DDoS protection, and
                Paddle for payments), or if required by law. The Game stores a small amount of
                local data in your browser (such as your session token and theme preference).
            </p>

            <h2>Your choices</h2>
            <p>
                You can request a copy of your data or deletion of your account by emailing
                support@talaran.net. Deleting your account removes your personal data; purchase records
                are retained as required for accounting.
            </p>
        </LegalShell>
    )
}
