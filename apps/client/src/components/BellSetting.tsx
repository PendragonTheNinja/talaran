import { useEffect, useRef, useState } from 'react'
import {
    BELL_SOUNDS, CUSTOM_MAX_BYTES, CUSTOM_MAX_SECONDS, bellMode, bellSound, bellVolume, clearCustomSound,
    customSoundName, onBellMode, playBell, saveCustomSound, setBellMode, setBellSound, setBellVolume,
    type BellMode, type BellSound,
} from '../lib/bell'
import { openSupport } from '../lib/talerStore'
import './SettingsPanel.css'
import ErrorLine from './ErrorLine'
import BellEventsPicker from './BellEventsPicker'

/**
 * Settings > Game: the timer bell (lib/bell.ts). Which sound, how loud, and
 * whether it is on, all for this device only. "Your own sound" needs the
 * Custom Sound perk; the file is kept in this browser and never uploaded.
 */
export default function BellSetting({ hasCustomPerk }: { hasCustomPerk: boolean }) {
    const [mode, setMode] = useState<BellMode>(bellMode)
    const [sound, setSound] = useState<BellSound>(bellSound)
    const [volume, setVolume] = useState(bellVolume)
    const [customName, setCustomName] = useState<string | null>(null)
    const [error, setError] = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    useEffect(() => onBellMode(setMode), [])
    useEffect(() => { customSoundName().then(setCustomName) }, [])

    const choose = (s: BellSound) => {
        setError('')
        setBellSound(s)
        setSound(s)
        playBell(s, volume)
    }

    const pickFile = async (file: File | undefined) => {
        if (!file) return
        setError('')
        const r = await saveCustomSound(file)
        if (fileRef.current) fileRef.current.value = ''
        if ('error' in r) { setError(r.error); return }
        setCustomName(file.name)
        choose('custom')
    }

    const removeFile = async () => {
        await clearCustomSound()
        setCustomName(null)
        setSound(bellSound())
    }

    return (
        <div className="settings-toggle-row bell-setting">
            <div className="settings-toggle-info">
                <span className="settings-toggle-label">Timer Bell</span>
                <span className="muted-text" style={{ fontSize: '13px' }}>
                    A sound for the moments you choose below. Tap the bell beside the robot to ring once, the next
                    time; hold it to ring every time; the arrow on top of it opens the same list. Saved on this
                    device only. A phone may stay silent with its screen off or the browser in the background.
                </span>

                <div className="settings-size-row" role="radiogroup" aria-label="Timer bell">
                    {(['off', 'once', 'always'] as const).map(m => (
                        <button
                            key={m}
                            role="radio"
                            aria-checked={mode === m}
                            className={`settings-size-btn ${mode === m ? 'active' : ''}`}
                            onClick={() => setBellMode(m)}
                        >
                            {m === 'off' ? 'Off' : m === 'once' ? 'Next countdown' : 'Every countdown'}
                        </button>
                    ))}
                </div>

                <span className="settings-toggle-label bell-setting-sub">Ring for</span>
                <BellEventsPicker />

                <span className="settings-toggle-label bell-setting-sub">Sound</span>
                <div className="settings-size-row" role="radiogroup" aria-label="Bell sound">
                    {BELL_SOUNDS.filter(s => s.id !== 'custom' || (hasCustomPerk && customName)).map(s => (
                        <button
                            key={s.id}
                            role="radio"
                            aria-checked={sound === s.id}
                            className={`settings-size-btn ${sound === s.id ? 'active' : ''}`}
                            onClick={() => choose(s.id)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                <label className="bell-setting-volume">
                    <span className="settings-toggle-label bell-setting-sub">Volume</span>
                    <input
                        type="range" min={0} max={100} step={5}
                        value={Math.round(volume * 100)}
                        onChange={e => { const v = Number(e.target.value) / 100; setVolume(v); setBellVolume(v) }}
                        onPointerUp={() => playBell(sound, volume)}
                        onKeyUp={() => playBell(sound, volume)}
                    />
                    <span className="muted-text">{Math.round(volume * 100)}%</span>
                    <button className="btn" onClick={() => playBell(sound, volume)}>Test</button>
                </label>

                <span className="settings-toggle-label bell-setting-sub">Your own sound</span>
                {hasCustomPerk ? (
                    <div className="bell-setting-custom">
                        <span className="muted-text" style={{ fontSize: '13px' }}>
                            {customName
                                ? <>Loaded on this device: <span className="gold-text">{customName}</span></>
                                : `An MP3, OGG, or WAV of up to ${CUSTOM_MAX_SECONDS} seconds and ${CUSTOM_MAX_BYTES / 1024} KB. It stays on this device.`}
                        </span>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="audio/*"
                            style={{ display: 'none' }}
                            onChange={e => pickFile(e.target.files?.[0])}
                        />
                        <button className="btn" onClick={() => fileRef.current?.click()}>{customName ? 'Replace' : 'Choose a file'}</button>
                        {customName && <button className="btn" onClick={removeFile}>Remove</button>}
                    </div>
                ) : (
                    <div className="bell-setting-custom">
                        <span className="muted-text" style={{ fontSize: '13px' }}>
                            Ring the bell with a clip of your own. A Custom Sound perk, in Support.
                        </span>
                        <button className="btn" onClick={() => openSupport('perks')}>See perks</button>
                    </div>
                )}
                <ErrorLine message={error} className="guild-error" />
            </div>
        </div>
    )
}
