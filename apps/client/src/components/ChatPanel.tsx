import { useState } from 'react'
import './ChatPanel.css'

const CHANNELS = ['World Chat', 'Local', 'Clan', 'Trade']

export default function ChatPanel() {
  const [activeChannel, setActiveChannel] = useState('World Chat')
  const [message, setMessage] = useState('')

  return (
    <div className="chat-panel panel">
      <div className="chat-channels">
        {CHANNELS.map(ch => (
          <button
            key={ch}
            className={`chat-channel-btn btn ${activeChannel === ch ? 'active' : ''}`}
            onClick={() => setActiveChannel(ch)}
          >
            {ch}
          </button>
        ))}
      </div>

      <div className="chat-messages panel-inset">
        <p className="chat-welcome muted-text">
          Welcome to Talaran, adventurer. The world awaits.
        </p>
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          type="text"
          placeholder="Type your message..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setMessage('')}
        />
        <button className="btn btn-gold" onClick={() => setMessage('')}>
          Send
        </button>
      </div>
    </div>
  )
}