import './MiniMap.css'
import { LOCATION_EXITS } from '../lib/locationExits'

interface Connection {
  id: number
  to_location_id: number
  to_location_name: string
  base_travel_time: number
  travel_type: string
}

interface MiniMapProps {
  currentLocationId: number | null
  locationName: string
  connections: Connection[]
  onTravel: (toLocationId: number, toLocationName: string, travelTime: number) => void
}

export default function MiniMap({ locationName, connections, onTravel }: MiniMapProps) {
  const filename = locationName.replace(/ /g, '_') + '.jpg'
  const src = `/images/locations/Taiar_Island/${filename}`
  const exits = LOCATION_EXITS[locationName] || []

  const handleZoneClick = (connectionName: string) => {
    const conn = connections.find(c => c.to_location_name === connectionName)
    if (conn) {
      onTravel(conn.to_location_id, conn.to_location_name, conn.base_travel_time)
    }
  }

  return (
    <div className="minimap-local">
      <div className="minimap-img-wrapper">
        <img
          src={src}
          alt={locationName}
          className="minimap-location-img"
        />
        {exits.map((exit, i) => (
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
    </div>
  )
}