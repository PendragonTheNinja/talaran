import './MiniMap.css'

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

  return (
    <div className="minimap-local">
      <img
        src={src}
        alt={locationName}
        className="minimap-location-img"
      />
      <div className="minimap-connections">
        {connections.map(conn => (
          <button
            key={conn.id}
            className="minimap-travel-btn"
            onClick={() => onTravel(conn.to_location_id, conn.to_location_name, conn.base_travel_time)}
          >
            → {conn.to_location_name}
          </button>
        ))}
      </div>
    </div>
  )
}