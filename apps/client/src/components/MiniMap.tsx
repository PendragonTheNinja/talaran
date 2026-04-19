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

// Direction arrows for travel exits
function TravelArrow({ x, y, direction, label, onClick }: {
  x: number
  y: number
  direction: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest'
  label: string
  onClick: () => void
}) {
  const arrows: Record<string, string> = {
    north: '?', south: '?', east: '?', west: '?',
    northeast: '?', northwest: '?', southeast: '?', southwest: '?'
  }

  return (
    <g className="travel-arrow" onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle cx={x} cy={y} r={14} fill="rgba(200,146,42,0.15)" stroke="#c8922a" strokeWidth={1.5} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize="10" fill="#e8b84b" fontWeight="bold">
        {arrows[direction]}
      </text>
      <text x={x} y={y + 20} textAnchor="middle" fontSize="6.5"
        fill="#c8a96e" fontFamily="serif">
        {label.length > 10 ? label.substring(0, 9) + '…' : label}
      </text>
    </g>
  )
}

// --- TALADOR -----------------------------------------------------------------
function TaladorMap({ connections, onTravel }: { connections: Connection[], onTravel: MiniMapProps['onTravel'] }) {
  const outskirts = connections.find(c => c.to_location_name === 'Talador Outskirts')

  return (
    <svg width="100%" height="100%" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg">
      {/* Sky */}
      <rect width="210" height="210" fill="#1a2a3a" />

      {/* Ocean / cove */}
      <ellipse cx="105" cy="195" rx="120" ry="60" fill="#0d2a3d" />
      <ellipse cx="105" cy="200" rx="90" ry="45" fill="#0a2030" />
      {/* Water shimmer */}
      <line x1="60" y1="178" x2="90" y2="175" stroke="#1a4060" strokeWidth="1" opacity="0.6" />
      <line x1="110" y1="182" x2="150" y2="178" stroke="#1a4060" strokeWidth="1" opacity="0.6" />
      <line x1="75" y1="190" x2="100" y2="188" stroke="#1a4060" strokeWidth="1" opacity="0.5" />

      {/* Land mass */}
      <ellipse cx="105" cy="90" rx="100" ry="85" fill="#2a3a20" />

      {/* Coastal sand/beach */}
      <ellipse cx="105" cy="160" rx="80" ry="25" fill="#5a4a28" />
      <ellipse cx="105" cy="162" rx="65" ry="18" fill="#6b5a30" />

      {/* Town buildings — simplified silhouette */}
      {/* Main hall */}
      <rect x="85" y="110" width="40" height="30" rx="2" fill="#3a2e1a" stroke="#5a4020" strokeWidth="1" />
      <polygon points="85,110 105,95 125,110" fill="#2e2410" stroke="#5a4020" strokeWidth="1" />

      {/* Side buildings */}
      <rect x="55" y="120" width="25" height="22" rx="1" fill="#352a18" stroke="#4a3818" strokeWidth="1" />
      <polygon points="55,120 67,110 80,120" fill="#2a2010" />

      <rect x="130" y="118" width="28" height="24" rx="1" fill="#352a18" stroke="#4a3818" strokeWidth="1" />
      <polygon points="130,118 144,108 158,118" fill="#2a2010" />

      {/* Small houses */}
      <rect x="40" y="128" width="18" height="14" rx="1" fill="#302818" />
      <polygon points="40,128 49,122 58,128" fill="#252010" />

      <rect x="152" y="126" width="18" height="14" rx="1" fill="#302818" />
      <polygon points="152,126 161,120 170,126" fill="#252010" />

      {/* Dock/pier */}
      <rect x="98" y="148" width="14" height="25" fill="#4a3820" />
      <rect x="88" y="165" width="34" height="4" fill="#5a4828" />
      <rect x="93" y="169" width="4" height="8" fill="#5a4828" />
      <rect x="113" y="169" width="4" height="8" fill="#5a4828" />

      {/* Ship silhouette */}
      <ellipse cx="60" cy="185" rx="20" ry="5" fill="#2a2010" />
      <rect x="57" y="170" width="2" height="18" fill="#3a3020" />
      <polygon points="59,170 80,178 59,178" fill="#1a1808" opacity="0.7" />

      {/* Trees around town */}
      {[30, 42, 170, 180].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={i < 2 ? 115 : 112} r={8} fill="#1e3a1a" />
          <circle cx={x + 5} cy={i < 2 ? 108 : 105} r={7} fill="#234020" />
        </g>
      ))}

      {/* Mountains in distance (north) */}
      <polygon points="20,70 45,40 70,70" fill="#2a2a2a" opacity="0.6" />
      <polygon points="50,70 80,35 110,70" fill="#252525" opacity="0.5" />
      <polygon points="100,70 130,38 160,70" fill="#2a2a2a" opacity="0.6" />
      <polygon points="140,70 165,45 190,70" fill="#252525" opacity="0.5" />
      {/* Snow caps */}
      <polygon points="45,40 55,50 35,50" fill="#e0e0e0" opacity="0.3" />
      <polygon points="80,35 90,47 70,47" fill="#e0e0e0" opacity="0.3" />
      <polygon points="130,38 140,50 120,50" fill="#e0e0e0" opacity="0.3" />

      {/* Location label */}
      <text x="105" y="18" textAnchor="middle" fontSize="9"
        fill="#e8d5a3" fontFamily="serif" fontWeight="bold" letterSpacing="1">
        TALADOR
      </text>
      <line x1="60" y1="22" x2="150" y2="22" stroke="#6b5030" strokeWidth="0.5" />

      {/* Travel arrows */}
      {outskirts && (
        <TravelArrow
          x={170} y={80}
          direction="northeast"
          label="Outskirts"
          onClick={() => onTravel(outskirts.to_location_id, outskirts.to_location_name, outskirts.base_travel_time)}
        />
      )}
    </svg>
  )
}

// --- TALADOR OUTSKIRTS -------------------------------------------------------
function OutskirtsMap({ connections, onTravel }: { connections: Connection[], onTravel: MiniMapProps['onTravel'] }) {
  const talador = connections.find(c => c.to_location_name === 'Talador')
  const forest = connections.find(c => c.to_location_name === 'Lanai Forest')

  return (
    <svg width="100%" height="100%" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg">
      {/* Sky */}
      <rect width="210" height="210" fill="#1e2a16" />

      {/* Ground */}
      <rect x="0" y="120" width="210" height="90" fill="#2a3a1a" />

      {/* Rolling hills */}
      <ellipse cx="50" cy="125" rx="70" ry="20" fill="#304020" />
      <ellipse cx="160" cy="128" rx="80" ry="18" fill="#2e3c1e" />
      <ellipse cx="105" cy="122" rx="60" ry="15" fill="#354520" />

      {/* Dirt path */}
      <path d="M 105 210 Q 110 170 115 150 Q 120 130 140 110 Q 160 90 170 70"
        stroke="#6b5030" strokeWidth="8" fill="none" opacity="0.7" />
      <path d="M 105 210 Q 110 170 115 150 Q 120 130 140 110 Q 160 90 170 70"
        stroke="#7a6040" strokeWidth="4" fill="none" opacity="0.5" />

      {/* Path going back to Talador (southwest) */}
      <path d="M 105 210 Q 95 185 70 175 Q 45 165 30 155"
        stroke="#6b5030" strokeWidth="6" fill="none" opacity="0.5" />

      {/* Scattered trees */}
      {[
        [30, 140], [20, 155], [50, 148], [80, 135],
        [170, 145], [185, 135], [190, 155], [160, 155],
      ].map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 2} y={y} width={4} height={12} fill="#4a3820" />
          <circle cx={x} cy={y - 2} r={10} fill="#1e3a16" />
          <circle cx={x + 4} cy={y - 6} r={8} fill="#234020" />
        </g>
      ))}

      {/* Distant town visible to southwest */}
      <rect x="18" y="160" width="10" height="8" fill="#2a2010" opacity="0.6" />
      <polygon points="18,160 23,155 28,160" fill="#1e1808" opacity="0.6" />

      {/* Mountains north */}
      <polygon points="10,80 40,45 70,80" fill="#252525" opacity="0.7" />
      <polygon points="55,80 90,40 125,80" fill="#2a2a2a" opacity="0.6" />
      <polygon points="110,80 145,42 180,80" fill="#252525" opacity="0.7" />
      <polygon points="40,45 52,56 28,56" fill="#ddd" opacity="0.25" />
      <polygon points="90,40 102,53 78,53" fill="#ddd" opacity="0.25" />

      {/* Grass tufts */}
      {[45, 65, 85, 120, 140, 155].map((x, i) => (
        <g key={i}>
          <line x1={x} y1={130} x2={x - 3} y2={122} stroke="#3a5020" strokeWidth="1.5" />
          <line x1={x + 4} y1={131} x2={x + 2} y2={123} stroke="#3a5020" strokeWidth="1.5" />
          <line x1={x + 8} y1={130} x2={x + 6} y2={122} stroke="#3a5020" strokeWidth="1.5" />
        </g>
      ))}

      <text x="105" y="18" textAnchor="middle" fontSize="8"
        fill="#e8d5a3" fontFamily="serif" fontWeight="bold" letterSpacing="1">
        TALADOR OUTSKIRTS
      </text>
      <line x1="40" y1="22" x2="170" y2="22" stroke="#6b5030" strokeWidth="0.5" />

      {talador && (
        <TravelArrow x={35} y={175} direction="southwest" label="Talador"
          onClick={() => onTravel(talador.to_location_id, talador.to_location_name, talador.base_travel_time)} />
      )}
      {forest && (
        <TravelArrow x={175} y={60} direction="northeast" label="Lanai Forest"
          onClick={() => onTravel(forest.to_location_id, forest.to_location_name, forest.base_travel_time)} />
      )}
    </svg>
  )
}

// --- LANAI FOREST ------------------------------------------------------------
function LanaiForestMap({ connections, onTravel }: { connections: Connection[], onTravel: MiniMapProps['onTravel'] }) {
  const outskirts = connections.find(c => c.to_location_name === 'Talador Outskirts')
  const deepForest = connections.find(c => c.to_location_name === 'Deep Lanai Forest')

  const trees = [
    [15, 60], [35, 45], [55, 55], [75, 40], [95, 50], [115, 42], [135, 52], [155, 44], [175, 58], [195, 48],
    [10, 90], [30, 80], [60, 85], [90, 75], [120, 82], [150, 78], [180, 88], [200, 75],
    [20, 120], [50, 110], [80, 118], [110, 108], [140, 115], [170, 110], [200, 118],
    [15, 150], [45, 145], [75, 152], [105, 145], [135, 150], [165, 145], [195, 152],
    [25, 180], [55, 175], [85, 182], [115, 175], [145, 180], [175, 175],
  ]

  return (
    <svg width="100%" height="100%" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg">
      {/* Forest floor */}
      <rect width="210" height="210" fill="#0f1f0a" />

      {/* Dappled light patches */}
      {[40, 90, 140, 70, 160].map((x, i) => (
        <ellipse key={i} cx={x} cy={80 + i * 25} rx={15} ry={8}
          fill="#2a4a10" opacity="0.4" />
      ))}

      {/* Ground cover */}
      <rect x="0" y="160" width="210" height="50" fill="#1a2e10" />

      {/* Path through forest */}
      <path d="M 30 210 Q 60 180 80 160 Q 100 140 105 105 Q 110 70 130 50 Q 150 30 180 20"
        stroke="#4a3820" strokeWidth="7" fill="none" opacity="0.6" />
      <path d="M 30 210 Q 60 180 80 160 Q 100 140 105 105 Q 110 70 130 50 Q 150 30 180 20"
        stroke="#5a4828" strokeWidth="3" fill="none" opacity="0.4" />

      {/* Trees */}
      {trees.map(([x, y], i) => {
        const size = 8 + (i % 3) * 3
        const color = i % 3 === 0 ? '#1a3a10' : i % 3 === 1 ? '#1e4015' : '#163510'
        return (
          <g key={i}>
            <rect x={x - 2} y={y + size} width={3} height={size * 0.8} fill="#3a2e18" />
            <circle cx={x} cy={y} r={size} fill={color} />
            <circle cx={x + size * 0.4} cy={y - size * 0.3} r={size * 0.7} fill={i % 2 === 0 ? '#234018' : '#1e3a12'} />
          </g>
        )
      })}

      {/* Lanai log on ground */}
      <ellipse cx="105" cy="165" rx="20" ry="6" fill="#4a3020" />
      <ellipse cx="105" cy="162" rx="20" ry="5" fill="#5a3a28" />

      {/* Firefly/light particles */}
      {[40, 80, 130, 170, 60, 150].map((x, i) => (
        <circle key={i} cx={x} cy={50 + i * 20} r={1.5}
          fill="#c8e060" opacity={0.3 + (i % 3) * 0.2} />
      ))}

      <text x="105" y="14" textAnchor="middle" fontSize="8"
        fill="#e8d5a3" fontFamily="serif" fontWeight="bold" letterSpacing="1">
        LANAI FOREST
      </text>
      <line x1="55" y1="18" x2="155" y2="18" stroke="#6b5030" strokeWidth="0.5" />

      {outskirts && (
        <TravelArrow x={35} y={190} direction="southwest" label="Outskirts"
          onClick={() => onTravel(outskirts.to_location_id, outskirts.to_location_name, outskirts.base_travel_time)} />
      )}
      {deepForest && (
        <TravelArrow x={178} y={32} direction="northeast" label="Deep Lanai"
          onClick={() => onTravel(deepForest.to_location_id, deepForest.to_location_name, deepForest.base_travel_time)} />
      )}
    </svg>
  )
}

// --- DEEP LANAI FOREST -------------------------------------------------------
function DeepLanaiForestMap({ connections, onTravel }: { connections: Connection[], onTravel: MiniMapProps['onTravel'] }) {
  const forest = connections.find(c => c.to_location_name === 'Lanai Forest')

  const trees = [
    [5, 40], [25, 25], [45, 35], [65, 22], [85, 32], [105, 20], [125, 30], [145, 22], [165, 35], [185, 25], [205, 38],
    [5, 75], [20, 60], [45, 68], [70, 58], [100, 65], [130, 60], [155, 68], [185, 60], [205, 72],
    [5, 110], [30, 98], [60, 105], [90, 95], [120, 102], [150, 96], [180, 105], [205, 98],
    [5, 145], [35, 135], [65, 142], [95, 132], [125, 140], [155, 134], [185, 142], [205, 135],
    [5, 178], [35, 168], [65, 175], [95, 165], [125, 172], [155, 166], [185, 175], [205, 168],
  ]

  return (
    <svg width="100%" height="100%" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg">
      {/* Very dark forest floor */}
      <rect width="210" height="210" fill="#080f05" />

      {/* Minimal light filtering through */}
      <ellipse cx="105" cy="100" rx="40" ry="60" fill="#0f1e08" opacity="0.8" />
      <ellipse cx="80" cy="130" rx="20" ry="30" fill="#122010" opacity="0.5" />

      {/* Ancient gnarled trees — bigger, darker */}
      {trees.map(([x, y], i) => {
        const size = 12 + (i % 4) * 4
        const colors = ['#0f2808', '#122e0a', '#0d2506', '#163510']
        const color = colors[i % 4]
        return (
          <g key={i}>
            <rect x={x - 3} y={y + size} width={5} height={size} fill="#2a2015" />
            <circle cx={x} cy={y} r={size} fill={color} />
            <circle cx={x - size * 0.3} cy={y - size * 0.4} r={size * 0.8} fill={colors[(i + 1) % 4]} />
            <circle cx={x + size * 0.4} cy={y - size * 0.2} r={size * 0.6} fill={colors[(i + 2) % 4]} />
          </g>
        )
      })}

      {/* Misty atmosphere */}
      <rect width="210" height="210" fill="#0a1506" opacity="0.3" />

      {/* Rare light shaft */}
      <polygon points="90,0 120,0 130,80 80,80" fill="#c8e060" opacity="0.03" />

      {/* Ancient log on ground */}
      <ellipse cx="105" cy="175" rx="35" ry="8" fill="#2a1e10" />
      <ellipse cx="105" cy="172" rx="35" ry="7" fill="#3a2818" />
      <ellipse cx="125" cy="172" rx="8" ry="7" fill="#4a3020" />

      {/* Glowing mushrooms */}
      {[55, 105, 155].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={168} rx={5} ry={3} fill="#4a8040" opacity="0.6" />
          <circle cx={x} cy={165} r={4} fill="#3a6030" opacity="0.7" />
          <circle cx={x} cy={165} r={2} fill="#60c050" opacity="0.4" />
        </g>
      ))}

      {/* Fireflies — more of them, deeper magic */}
      {[20, 50, 80, 110, 140, 170, 35, 95, 155].map((x, i) => (
        <circle key={i} cx={x} cy={40 + i * 18} r={1.5}
          fill="#a0d840" opacity={0.2 + (i % 4) * 0.15} />
      ))}

      <text x="105" y="14" textAnchor="middle" fontSize="8"
        fill="#c8d5a0" fontFamily="serif" fontWeight="bold" letterSpacing="1">
        DEEP LANAI FOREST
      </text>
      <line x1="40" y1="18" x2="170" y2="18" stroke="#4a6030" strokeWidth="0.5" />

      {forest && (
        <TravelArrow x={35} y={190} direction="southwest" label="Lanai Forest"
          onClick={() => onTravel(forest.to_location_id, forest.to_location_name, forest.base_travel_time)} />
      )}
    </svg>
  )
}

// --- MAIN COMPONENT ----------------------------------------------------------
export default function MiniMap({ locationName, connections, onTravel }: MiniMapProps) {
  const name = locationName?.toLowerCase() || ''

  if (name.includes('deep lanai')) {
    return <DeepLanaiForestMap connections={connections} onTravel={onTravel} />
  }
  if (name.includes('lanai forest')) {
    return <LanaiForestMap connections={connections} onTravel={onTravel} />
  }
  if (name.includes('outskirts')) {
    return <OutskirtsMap connections={connections} onTravel={onTravel} />
  }
  if (name.includes('talador')) {
    return <TaladorMap connections={connections} onTravel={onTravel} />
  }

  // Fallback
  return (
    <svg width="100%" height="100%" viewBox="0 0 210 210" xmlns="http://www.w3.org/2000/svg">
      <rect width="210" height="210" fill="#0d0a07" />
      <text x="105" y="105" textAnchor="middle" fontSize="10"
        fill="#6b5a3e" fontFamily="serif">{locationName}</text>
    </svg>
  )
}