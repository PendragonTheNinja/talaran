import './EventStandings.css'

/**
 * A place's last world event: its ten busiest players and the guilds whose
 * members did the most (server services/worldEvents.ts eventStandingsAt).
 * Shown under the place's description until the next event there takes its
 * place; while an event runs, these are its standings so far.
 */
export interface Standings {
    name: string
    skill: string | null
    live: boolean
    endedAt: string | null
    players: { name: string; guildTag: string | null; actions: number }[]
    guilds: { name: string; tag: string; actions: number; members: number }[]
}

export default function EventStandings({ standings }: { standings: Standings | null | undefined }) {
    if (!standings || standings.players.length === 0) return null
    const when = standings.live
        ? 'so far'
        : standings.endedAt
            ? new Date(standings.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
            : ''
    return (
        <div className="event-standings">
            <p className="event-standings-title">
                <span className="gold-text">{standings.name}</span>
                <span className="muted-text"> · {standings.live ? 'standings so far' : `the last event here, ${when}`}</span>
            </p>
            <div className="event-standings-cols">
                <ol className="event-standings-list">
                    {standings.players.map(p => (
                        <li key={p.name}>
                            <span className="event-standings-name">
                                {p.name}{p.guildTag && <span className="muted-text"> [{p.guildTag}]</span>}
                            </span>
                            <span className="event-standings-num">{p.actions.toLocaleString()}</span>
                        </li>
                    ))}
                </ol>
                {standings.guilds.length > 0 && (
                    <ol className="event-standings-list">
                        {standings.guilds.map(g => (
                            <li key={g.tag}>
                                <span className="event-standings-name">
                                    {g.name} <span className="muted-text">[{g.tag}] · {g.members} {g.members === 1 ? 'member' : 'members'}</span>
                                </span>
                                <span className="event-standings-num">{g.actions.toLocaleString()}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    )
}
