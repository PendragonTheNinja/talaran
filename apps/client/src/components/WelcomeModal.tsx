import { useState } from 'react'
import { apiFetch } from '../lib/api'
import './WelcomeModal.css'

interface WelcomeModalProps {
  username: string
  onClose: () => void
}

// The first thing anyone reads. Three jobs, in this order:
//
//   1. Say what kind of game this is, since the timed-work loop is the thing
//      newcomers to the genre get wrong and quietly bounce off.
//   2. Say plainly that there will be one wipe. Up front, in a box, before
//      anyone has invested a weekend. Finding that out on week three is how you
//      lose a player permanently and deserve to.
//   3. Point at Quank and get out of the way. He does the actual teaching now,
//      so this does not need to.
//
// The old version handed out a hatchet and a pickaxe and named three skills.
// The tutors give the tools, and there are ten trades.

// Matches the panel convention used elsewhere: an entry animation on mount,
// and a `closing` class held long enough for the exit to finish before the
// component unmounts. CLOSE_MS must stay in step with the animation duration in
// WelcomeModal.css.
const CLOSE_MS = 280

export default function WelcomeModal({ username, onClose }: WelcomeModalProps) {
  const [closing, setClosing] = useState(false)

  const handleClose = async () => {
    if (closing) return
    setClosing(true)

    // Fired without waiting: the flag is bookkeeping, and a slow round trip
    // should not hold the door open.
    apiFetch('/api/player/welcome-seen', { method: 'POST' })
      .catch(err => console.error('Failed to mark welcome seen:', err))

    setTimeout(onClose, CLOSE_MS)
  }

  return (
    <div className={`welcome-overlay${closing ? ' closing' : ''}`}>
      <div className="welcome-modal">
        <div className="welcome-header">
          <h1 className="welcome-title gold-text">Welcome to Talaran</h1>
          <p className="welcome-subtitle">{username}</p>
        </div>

        <div className="welcome-body">
          <p className="welcome-text">
            You have come ashore at Talador, on Taiar Island. There is a world north
            and west of here: forests, ore, farmland, rivers, and a good deal of
            walking in between.
          </p>
          <p className="welcome-text">
            Talaran is a game of trades. You will mine, fell timber, hunt, fish, farm,
            keep animals, forage, build, forge and craft, and each of those is a skill
            that grows the more you do it. Work takes real time and continues while you
            are away from the screen, so the rhythm here is to set something going,
            live your life for a while, and come back to it.
          </p>
          <p className="welcome-text">
            Nothing is bought at the start. Every trade has a teacher standing beside
            it who will hand you the tools to begin.
          </p>

          <div className="welcome-notice">
            <p className="welcome-notice-head">This is an alpha</p>
            <p>
              Talaran is still being built, and it is being built quickly. There will be
              <strong> one single wipe</strong> of all characters and progress before the
              full launch, and never another one after it. We would rather you knew that
              now than found out in a month.
            </p>
            <p>
              Everything you find, everything that breaks, and everything you wish were
              different is worth telling us about. Alpha players shape what this becomes.
            </p>
          </div>

          <div className="welcome-hints">
            <div className="welcome-hint">
              <span className="welcome-hint-icon">🪶</span>
              <span>
                Speak to <strong>Quank</strong>, here in Talador. He has been waiting
                a long time to explain things to somebody.
              </span>
            </div>
            <div className="welcome-hint">
              <span className="welcome-hint-icon">📖</span>
              <span>
                The <strong>Manual</strong> covers the whole world in detail, and keeps
                itself up to date.
              </span>
            </div>
            <div className="welcome-hint">
              <span className="welcome-hint-icon">💬</span>
              <span>
                Ask anything in the <strong>help chat</strong>. Someone will know.
              </span>
            </div>
          </div>
        </div>

        <button className="btn btn-gold welcome-btn" onClick={handleClose} disabled={closing}>
          Go and find Quank
        </button>
      </div>
    </div>
  )
}
