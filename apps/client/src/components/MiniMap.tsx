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
  onTravel: (toLocationId: number, toLocationName: string, travelTime: number) => void
  /** The place's island (locations.region): its pictures live in a folder of its own. */
  region?: string
}

export default function MiniMap({ locationName, connections, onTravel, region }: MiniMapProps) {
  const filename = locationName.replace(/ /g, '_') + '.jpg'
  const folder = (region || 'Taiar Island').replace(/ /g, '_')
  const src = `/images/locations/${folder}/${filename}`
  const exits = LOCATION_EXITS[locationName] || []
  // A place with no picture yet (Antura's, until the art) shows its name.
  const [missing, setMissing] = useState<string | null>(null)
  const pictured = missing !== src
  // Roads the picture has no exit for, as plain buttons: without them a place
  // with no art yet could not be left. Sea crossings are the location panel's.
  const drawn = new Set(pictured ? exits.map(e => e.connectionName) : [])
  const listed = connections.filter(c => c.travel_type !== 'sea' && !drawn.has(c.to_location_name))

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
          {listed.map(c => (
            <button key={c.id} className="minimap-travel-btn" onClick={() => onTravel(c.to_location_id, c.to_location_name, c.base_travel_time)}>
              → {c.to_location_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}