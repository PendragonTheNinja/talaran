import { Link } from 'react-router-dom'
import './LegalPages.css'
import './RulesPage.css'

// The rules (docs/rules-draft.md, agreed with Nathan 2026-11-08). One text,
// shown two ways: the public /rules page, linked from the home page and the
// legal pages, and RulesModal, opened in game from the Rules button beside
// chat History. Change the wording here, and in the doc's history note.

const UPDATED = 'November 8, 2026'

export function RulesText() {
    return (
        <>
            <p>
                Talaran is a game for everyone, including younger players. These rules keep it fair and keep it
                a good place to spend time. Staff use their judgment in applying them, and may warn, mute or ban
                an account depending on what happened.
            </p>

            <h2>1. Your account</h2>
            <ul>
                <li><strong>One account per person.</strong> Do not make or use a second account for any reason, including trading with yourself, voting twice in polls, or holding more items or gold.</li>
                <li><strong>Your account is yours alone.</strong> Do not share it, lend it, or play on someone else's.</li>
                <li><strong>Accounts are not for sale.</strong> Do not buy, sell or trade accounts.</li>
                <li><strong>Keep your password private.</strong> Staff will never ask for it. Anyone who does is not staff.</li>
                <li>You are responsible for everything done on your account.</li>
            </ul>

            <h2>2. Playing fairly</h2>
            <ul>
                <li><strong>No bots, macros, scripts or auto-clickers.</strong> You must be the one playing. Programs that click, answer bot checks or play for you are not allowed.</li>
                <li><strong>Answer bot checks yourself.</strong></li>
                <li><strong>No real-money trading.</strong> Do not buy or sell gold, items, accounts or in-game services for real money or anything outside the game.</li>
                <li><strong>Report bugs; do not use them.</strong> If you find something that gives you items, gold or experience it should not, stop and report it on the forum or through Support. Using a bug on purpose, or telling others how to, is against the rules.</li>
                <li><strong>Do not interfere with the game or its servers</strong>, or try to get into anything that is not yours.</li>
            </ul>

            <h2>3. Names and pictures</h2>
            <ul>
                <li><strong>Names must be suitable for everyone.</strong> This covers your character name, guild names and tags, and shop names. Nothing rude, sexual, hateful or offensive, including words hidden with spelling tricks.</li>
                <li><strong>Profile pictures follow the same rule.</strong> Nothing sexual, violent, hateful or shocking.</li>
                <li><strong>Do not pretend to be staff</strong>, or say you are staff when you are not. Do not pretend to be another player.</li>
                <li>Staff may change a name or remove a picture that breaks these rules.</li>
            </ul>

            <h2>4. Public spaces</h2>
            <p>
                Public spaces are world, region, trade and help chat, the forum, and anything other players can
                read, such as guild descriptions and shop descriptions. They are kept strict.
            </p>
            <ul>
                <li><strong>No swearing.</strong> The game changes swear words automatically, but trying to get around it is still breaking the rule.</li>
                <li><strong>No sexual talk or content.</strong></li>
                <li><strong>No hate.</strong> No slurs, and no attacks on anyone for their race, religion, nationality, gender, sexuality, disability or anything else about who they are.</li>
                <li><strong>No bullying, harassment or threats.</strong> Do not target, follow or pick on another player.</li>
                <li><strong>Keep personal details private.</strong> Do not share your own or anyone else's real name, address, phone number, school, photos or social media accounts.</li>
                <li><strong>No spam.</strong> Do not flood chat, repeat the same message over and over, or post in capitals to shout.</li>
                <li><strong>No advertising</strong> other games, websites or services.</li>
                <li><strong>No scams.</strong> Do not lie to get items or gold, pretend to give things away, or trick anyone in a trade.</li>
                <li><strong>Use channels for what they are for.</strong> Help chat is for questions, trade chat is for trading.</li>
                <li><strong>Keep heated real-world topics out</strong>, such as politics. Talaran is a place to get away from them.</li>
            </ul>

            <h2>5. Private spaces</h2>
            <p>
                Guild chat, whispers and private messages are not filtered for swearing. The other rules still
                apply there: no harassment, hate, threats, sexual messages to other players, sharing personal
                details or scams.
            </p>

            <h2>6. Staff</h2>
            <ul>
                <li>Staff are here to help and to keep the game fair. Please follow their instructions.</li>
                <li>If you disagree with a decision, ask about it calmly through Support. Do not argue it out in public chat.</li>
                <li><strong>Staff will never ask for your password.</strong></li>
            </ul>

            <h2>7. Reporting</h2>
            <p>
                If someone breaks these rules, tell a member of staff through Support or a private message, and
                include what happened and when. Do not take matters into your own hands.
            </p>

            <h2>8. Changes</h2>
            <p>These rules may change as the game grows. The newest version is always the one that applies.</p>
        </>
    )
}

/**
 * "I agree to the rules", for signing up and for a guest claiming a character.
 * The server refuses either without it (routes/auth.ts) and keeps the time.
 * The link opens the rules in a new tab so the form keeps what was typed.
 */
export function RulesAgree({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
    return (
        <label className="rules-agree" htmlFor={id}>
            <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span>
                I agree to the <a href="/rules" target="_blank" rel="noopener noreferrer">rules</a>
            </span>
        </label>
    )
}

/** The public page, /rules. */
export function RulesPage() {
    return (
        <div className="legal-page">
            <div className="legal-content rules-content">
                <Link to="/" className="legal-home gold-text">← Talaran</Link>
                <h1>Rules</h1>
                <p className="legal-date">Updated {UPDATED}</p>
                <RulesText />
                <div className="legal-footer">
                    <Link to="/terms">Terms of Service</Link>
                    <Link to="/privacy">Privacy Policy</Link>
                </div>
            </div>
        </div>
    )
}

/** The same rules in game, over whatever the player was doing. */
export function RulesModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box rules-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Rules">
                <div className="rules-modal-head">
                    <h3 className="gold-text">Rules</h3>
                    <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="rules-content rules-modal-body">
                    <RulesText />
                </div>
            </div>
        </div>
    )
}
