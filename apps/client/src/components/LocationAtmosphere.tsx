interface LocationAtmosphereProps {
  locationName: string
  locationType: string
}

export default function LocationAtmosphere({ locationName, locationType }: LocationAtmosphereProps) {
  const name = locationName.toLowerCase()
  const type = locationType.toLowerCase()

  if (name.includes('mine') || type === 'mine') {
    return <MineAtmosphere />
  }
  if (name.includes('forest') || type === 'forest') {
    return <ForestAtmosphere />
  }
  if (name.includes('talador') || type === 'town') {
    return <TownAtmosphere />
  }
  if (name.includes('outskirts') || type === 'wilderness') {
    return <OutskirtsAtmosphere />
  }
  return <DefaultAtmosphere />
}

function MineAtmosphere() {
  return (
    <svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="700" height="400" fill="#0d0a07" />
      <radialGradient id="tg1" cx="10%" cy="45%" r="30%">
        <stop offset="0%" stopColor="#c8922a" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#c8922a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="tg2" cx="90%" cy="42%" r="30%">
        <stop offset="0%" stopColor="#e8b84b" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#e8b84b" stopOpacity="0" />
      </radialGradient>
      <rect width="700" height="400" fill="url(#tg1)" />
      <rect width="700" height="400" fill="url(#tg2)" />
      <polygon points="0,120 80,80 160,110 200,90 300,100 350,80 420,95 500,75 580,90 650,80 700,95 700,400 0,400" fill="#13100c" />
      <polygon points="0,150 60,130 120,145 200,120 280,140 360,125 440,138 520,120 600,135 700,125 700,400 0,400" fill="#1a1510" />
      <polygon points="0,200 100,175 200,190 300,170 400,185 500,172 600,188 700,175 700,400 0,400" fill="#1e1912" />
      {/* Torch left */}
      <rect x="58" y="148" width="6" height="20" fill="#4a3820" rx="1" />
      <ellipse cx="61" cy="143" rx="3" ry="5" fill="#f5d97a" opacity="0.7">
        <animate attributeName="rx" values="3;2;3.5;2.5;3" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="ry" values="5;6;4;6;5" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;1;0.5;0.9;0.7" dur="0.8s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="61" cy="147" rx="6" ry="10" fill="#c8922a" opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.5;0.2;0.4;0.3" dur="0.8s" repeatCount="indefinite" />
      </ellipse>
      {/* Torch right */}
      <rect x="636" y="140" width="6" height="20" fill="#4a3820" rx="1" />
      <ellipse cx="639" cy="135" rx="3" ry="5" fill="#f5d97a" opacity="0.7">
        <animate attributeName="rx" values="3;3.5;2;3;2.5" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="ry" values="5;4;6;5;6" dur="1.1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0.5;1;0.7;0.9" dur="1.1s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="639" cy="139" rx="6" ry="10" fill="#c8922a" opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.2;0.5;0.3;0.4" dur="1.1s" repeatCount="indefinite" />
      </ellipse>
      {/* Dust particles */}
      {[
        [120, 220, 4, 0.4], [200, 180, 5, 0.3], [310, 240, 6, 0.4],
        [420, 200, 4.5, 0.3], [530, 225, 5.5, 0.4], [580, 185, 3.5, 0.3],
        [160, 260, 7, 0.2], [460, 250, 6.5, 0.3], [350, 170, 8, 0.2],
        [250, 300, 5, 0.2], [480, 310, 4, 0.25], [100, 290, 6, 0.2],
      ].map(([cx, cy, dur, op], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.2" fill="#c8a96e" opacity={op}>
          <animate attributeName="cy" values={`${cy};${cy - 20};${cy}`} dur={`${dur}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values={`${op};0.05;${op}`} dur={`${dur}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* Ore glints */}
      <circle cx="90" cy="165" r="2" fill="#4fc3f7" opacity="0.5"><animate attributeName="opacity" values="0.5;0.9;0.3;0.7;0.5" dur="3s" repeatCount="indefinite" /></circle>
      <circle cx="95" cy="170" r="1.5" fill="#4fc3f7" opacity="0.3"><animate attributeName="opacity" values="0.3;0.7;0.2;0.5;0.3" dur="4s" repeatCount="indefinite" /></circle>
      <circle cx="580" cy="155" r="2" fill="#c8922a" opacity="0.4"><animate attributeName="opacity" values="0.4;0.8;0.2;0.6;0.4" dur="3.5s" repeatCount="indefinite" /></circle>
      <circle cx="250" cy="145" r="1.5" fill="#e8b84b" opacity="0.3"><animate attributeName="opacity" values="0.3;0.7;0.1;0.5;0.3" dur="5s" repeatCount="indefinite" /></circle>
    </svg>
  )
}

function ForestAtmosphere() {
  return (
    <svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="700" height="400" fill="#0a1208" />
      <radialGradient id="fg1" cx="50%" cy="30%" r="50%">
        <stop offset="0%" stopColor="#234018" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#0a1208" stopOpacity="0" />
      </radialGradient>
      <rect width="700" height="400" fill="url(#fg1)" />
      {/* Tree silhouettes */}
      {[0, 80, 160, 240, 320, 400, 480, 560, 640].map((x, i) => (
        <g key={i}>
          <rect x={x + 22} y={200 + (i % 3) * 10} width={6 + (i % 2) * 2} height={200} fill="#0d1a0a" />
          <ellipse cx={x + 25} cy={190 + (i % 3) * 10} rx={30 + (i % 2) * 10} ry={50 + (i % 3) * 10} fill={i % 2 === 0 ? '#122010' : '#0e1a0c'} />
          <ellipse cx={x + 30} cy={170 + (i % 3) * 8} rx={22 + (i % 2) * 8} ry={40 + (i % 3) * 8} fill={i % 3 === 0 ? '#163510' : '#122810'} />
        </g>
      ))}
      {/* Falling leaves */}
      {[
        [100, 50, 3, 0], [200, 20, 4, 1], [350, 80, 5, 2], [450, 30, 3.5, 0.5],
        [550, 60, 4.5, 1.5], [150, 10, 6, 3], [500, 40, 3, 2.5], [280, 70, 5.5, 1],
        [620, 20, 4, 0.5], [80, 90, 3.5, 2], [400, 15, 5, 3.5],
      ].map(([x, y, dur, delay], i) => (
        <ellipse key={i} cx={x} cy={y} rx="3" ry="1.5" fill="#234018" opacity="0.6">
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`0 0; 15 ${400 - y}; -10 ${400 - y}`}
            dur={`${dur}s`}
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
          <animate attributeName="opacity" values="0;0.6;0.6;0" dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
        </ellipse>
      ))}
      {/* Fireflies */}
      {[150, 250, 380, 480, 600, 120, 520].map((x, i) => (
        <circle key={i} cx={x} cy={150 + i * 20} r="1.5" fill="#a0d840" opacity="0.3">
          <animate attributeName="opacity" values="0.3;0.8;0.1;0.6;0.3" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values="0 0;5 -8;-3 5;0 0" dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* Light shaft */}
      <polygon points="300,0 400,0 430,400 270,400" fill="#c8e060" opacity="0.015" />
    </svg>
  )
}

function TownAtmosphere() {
  return (
    <svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="700" height="400" fill="#1a2a3a" />
      <radialGradient id="sky" cx="50%" cy="0%" r="80%">
        <stop offset="0%" stopColor="#1e3a5a" stopOpacity="1" />
        <stop offset="100%" stopColor="#0a1520" stopOpacity="1" />
      </radialGradient>
      <rect width="700" height="220" fill="url(#sky)" />
      {/* Ocean */}
      <rect x="0" y="300" width="700" height="100" fill="#0a2030" />
      <rect x="0" y="290" width="700" height="20" fill="#0d2535" />
      {/* Wave lines */}
      {[0, 1, 2, 3].map(i => (
        <path key={i} d={`M${i * 200 - 100},${310 + i * 8} Q${i * 200},${305 + i * 8} ${i * 200 + 100},${310 + i * 8}`}
          stroke="#1a4060" strokeWidth="1" fill="none" opacity="0.6">
          <animate attributeName="d"
            values={`M${i * 200 - 100},${310 + i * 8} Q${i * 200},${305 + i * 8} ${i * 200 + 100},${310 + i * 8};M${i * 200 - 100},${312 + i * 8} Q${i * 200},${308 + i * 8} ${i * 200 + 100},${312 + i * 8};M${i * 200 - 100},${310 + i * 8} Q${i * 200},${305 + i * 8} ${i * 200 + 100},${310 + i * 8}`}
            dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
        </path>
      ))}
      {/* Land */}
      <ellipse cx="350" cy="280" rx="350" ry="80" fill="#2a3a1a" />
      {/* Town silhouette */}
      <rect x="120" y="200" width="50" height="80" fill="#1e2a10" />
      <polygon points="120,200 145,175 170,200" fill="#182210" />
      <rect x="200" y="185" width="70" height="95" fill="#1a2810" />
      <polygon points="200,185 235,155 270,185" fill="#142008" />
      <rect x="300" y="210" width="40" height="70" fill="#1e2a10" />
      <polygon points="300,210 320,190 340,210" fill="#182210" />
      <rect x="420" y="195" width="55" height="85" fill="#1a2810" />
      <polygon points="420,195 447,170 474,195" fill="#142008" />
      <rect x="510" y="215" width="45" height="65" fill="#1e2a10" />
      <polygon points="510,215 532,195 554,215" fill="#182210" />
      {/* Window lights */}
      {[[135, 225], [215, 210], [315, 230], [435, 220], [522, 230]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="8" height="10" fill="#e8b84b" opacity="0.4">
          <animate attributeName="opacity" values="0.4;0.6;0.3;0.5;0.4" dur={`${2 + i * 0.7}s`} repeatCount="indefinite" />
        </rect>
      ))}
      {/* Stars */}
      {[50, 120, 200, 300, 400, 480, 580, 630, 100, 350, 520].map((x, i) => (
        <circle key={i} cx={x} cy={20 + i * 12} r="1" fill="white" opacity="0.4">
          <animate attributeName="opacity" values="0.4;0.8;0.2;0.6;0.4" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
      {/* Dock */}
      <rect x="320" y="285" width="60" height="8" fill="#3a2a15" />
      <rect x="335" y="275" width="4" height="18" fill="#4a3820" />
      <rect x="355" y="275" width="4" height="18" fill="#4a3820" />
      {/* Boat */}
      <ellipse cx="150" cy="308" rx="35" ry="7" fill="#2a1a0a" />
      <rect x="148" y="290" width="3" height="20" fill="#3a2a15" />
      <polygon points="151,290 175,300 151,300" fill="#1a1808" opacity="0.7" />
      {/* Seagulls */}
      {[[200, 60], [350, 40], [500, 70]].map(([x, y], i) => (
        <path key={i} d={`M${x},${y} Q${x + 8},${y - 5} ${x + 16},${y}`} stroke="#8a9aa0" strokeWidth="1.5" fill="none" opacity="0.5">
          <animateTransform attributeName="transform" type="translate"
            values="0 0;10 -5;20 0;10 5;0 0" dur={`${4 + i}s`} repeatCount="indefinite" />
        </path>
      ))}
    </svg>
  )
}

function OutskirtsAtmosphere() {
  return (
    <svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="700" height="400" fill="#1e2a16" />
      <radialGradient id="og1" cx="50%" cy="20%" r="60%">
        <stop offset="0%" stopColor="#2a4020" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#1e2a16" stopOpacity="0" />
      </radialGradient>
      <rect width="700" height="400" fill="url(#og1)" />
      {/* Hills */}
      <ellipse cx="150" cy="350" rx="250" ry="120" fill="#253018" />
      <ellipse cx="550" cy="360" rx="280" ry="110" fill="#223015" />
      <ellipse cx="350" cy="340" rx="220" ry="100" fill="#2a3820" />
      {/* Path */}
      <path d="M300,400 Q330,340 360,300 Q390,260 420,230" stroke="#4a3820" strokeWidth="12" fill="none" opacity="0.6" />
      <path d="M300,400 Q330,340 360,300 Q390,260 420,230" stroke="#5a4828" strokeWidth="5" fill="none" opacity="0.4" />
      {/* Scattered trees */}
      {[[50, 280], [120, 260], [180, 270], [560, 265], [620, 255], [650, 275]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 2} y={y} width="4" height="40" fill="#3a2a15" />
          <circle cx={x} cy={y - 5} r={18 + i % 3 * 5} fill={i % 2 === 0 ? '#1e3a16' : '#162e10'} />
          <circle cx={x + 5} cy={y - 15} r={14 + i % 2 * 4} fill={i % 3 === 0 ? '#234018' : '#1a3012'} />
        </g>
      ))}
      {/* Wind grass */}
      {[80, 160, 250, 400, 480, 580].map((x, i) => (
        <g key={i}>
          <path d={`M${x},360 Q${x - 5},345 ${x - 3},330`} stroke="#3a5020" strokeWidth="2" fill="none">
            <animate attributeName="d" values={`M${x},360 Q${x - 5},345 ${x - 3},330;M${x},360 Q${x + 5},345 ${x + 3},330;M${x},360 Q${x - 5},345 ${x - 3},330`} dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
          </path>
          <path d={`M${x + 8},362 Q${x + 3},347 ${x + 5},332`} stroke="#3a5020" strokeWidth="2" fill="none">
            <animate attributeName="d" values={`M${x + 8},362 Q${x + 3},347 ${x + 5},332;M${x + 8},362 Q${x + 13},347 ${x + 11},332;M${x + 8},362 Q${x + 3},347 ${x + 5},332`} dur={`${1.8 + i * 0.2}s`} repeatCount="indefinite" />
          </path>
        </g>
      ))}
      {/* Mountains in distance */}
      <polygon points="0,180 80,120 160,180" fill="#1e1e1e" opacity="0.5" />
      <polygon points="80,180 160,110 240,180" fill="#1a1a1a" opacity="0.4" />
      <polygon points="460,180 560,105 660,180" fill="#1e1e1e" opacity="0.5" />
      <polygon points="560,180 640,115 720,180" fill="#1a1a1a" opacity="0.4" />
    </svg>
  )
}

function DefaultAtmosphere() {
  return (
    <svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="700" height="400" fill="#0d0a07" />
      <radialGradient id="dg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#2a2010" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#0d0a07" stopOpacity="0" />
      </radialGradient>
      <rect width="700" height="400" fill="url(#dg)" />
    </svg>
  )
}