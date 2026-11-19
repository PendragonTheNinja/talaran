import { useState } from 'react'
import './MiniMap.css'
import { LOCATION_EXITS } from '../lib/locationExits'

interface Connection {
  id: number
  to_location_id: number
  to_location_name: string
  base_travel_time: number
  travel_type: string
  /** A sea road's ferry (routes/travel.ts): its fare and its fixed crossing. */
  ferry_fare?: number | null
  ferry_seconds?: number | null
}

interface MiniMapProps {
  currentLocationId: number | null
  locationName: string
  connections: Connection[]
  /** `mode` crosses a sea road: 'ferry', or a boat's key. */
  onTravel: (toLocationId: number, toLocationName: string, travelTime: number, mode?: string) => void
  /** Boats the player owns, offered on a sea road. */
  ownBoats?: { key: string; name: string }[]
  /** The place's island (locations.region): its pictures live in a folder of its own. */
  region?: string
}

export default function MiniMap({ locationName, connections, onTravel, region, ownBoats = [] }: MiniMapProps) {
  const filename = locationName.replace(/ /g, '_') + '.jpg'
  const folder = (region || 'Taiar Island').replace(/ /g, '_')
  const src = `/images/locations/${folder}/${filename}`
  const exits = LOCATION_EXITS[locationName] || []
  // A place with no picture yet (Antura's, until the art) shows its name.
  const [missing, setMissing] = useState<string | null>(null)
  const pictured = missing !== src
  // Roads the picture has no exit for, and every sea road, as plain buttons:
  // without them a place with no art yet could not be left.
  const drawn = new Set(pictured ? exits.map(e => e.connectionName) : [])
  const listed = connections.filter(c => c.travel_type === 'sea' || !drawn.has(c.to_location_name))
  const minutes = (s: number) => `about ${Math.max(1, Math.round(s / 60))} minute${Math.round(s / 60) === 1 ? '' : 's'}`

  const handleZoneClick = (connectionName: string) => {
    const conn = connections.find(c => c.to_location_name === connectionName)
    if (conn) {
      onTravel(conn.to_location_id, conn.to_location_name, conn.base_travel_time)
    }
  }

  return (
    <div className="minimap-local">
      <div className="minimap-img-wrapper">
        {pictured ? (
          <img
            src={src}
            alt={locationName}
            className="minimap-location-img"
            onError={() => setMissing(src)}
          />
        ) : (
          <div className="minimap-unpictured">{locationName}</div>
        )}
        {pictured && exits.map((exit, i) => (
          <div
            key={i}
            className="minimap-exit-zone"
            style={{
              left: `${exit.x}%`,
              top: `${exit.y}%`,
              width: `${exit.w}%`,
              height: `${exit.h}%`,
            }}
            onClick={() => handleZoneClick(exit.connectionName)}
            title={`→ ${exit.connectionName}`}
          />
        ))}
      </div>
      {listed.length > 0 && (
        <div className="minimap-connections">
          {listed.map(c => c.travel_type === 'sea' ? (
            <div key={c.id}>
              {c.ferry_fare !== null && c.ferry_fare !== undefined && (
                <button className="minimap-travel-btn" onClick={() => onTravel(c.to_location_id, c.to_location_name, c.ferry_seconds ?? c.base_travel_time, 'ferry')}
                  title={`The ferry: ${c.ferry_fare} gold, ${minutes(c.ferry_seconds ?? c.base_travel_time)}`}>
                  ⛴ Ferry to {c.to_location_name}, {c.ferry_fare} gold
                </button>
              )}
              {ownBoats.map(b => (
                <button key={b.key} className="minimap-travel-btn" onClick={() => onTravel(c.to_location_id, c.to_location_name, c.base_travel_time, b.key)}>
                  ⛵ Sail your {b.name} to {c.to_location_name}
                </button>
              ))}
            </div>
          ) : (
            <button key={c.id} className="minimap-travel-btn" onClick={() => onTravel(c.to_location_id, c.to_location_name, c.base_travel_time)}>
              → {c.to_location_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}