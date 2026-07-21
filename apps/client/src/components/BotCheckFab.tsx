import './BotCheckFab.css'

interface BotCheckFabProps {
    onClick: () => void
}

// Floating "reset my AFK timer" button. Rendered once in GameLayout for both
// mobile and desktop, anchored bottom-right to mirror the travel log's
// bottom-left. Lives below open panels so it never covers a slide-in.
export default function BotCheckFab({ onClick }: BotCheckFabProps) {
    return (
        <button
            className="botcheck-fab"
            onClick={onClick}
            aria-label="Reset AFK timer"
            title="Reset your AFK timer: do a bot check now to start a fresh 30-minute window before stepping away."
        >
            🤖
        </button>
    )
}
