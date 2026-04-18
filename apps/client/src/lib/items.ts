// Maps item names to their image paths in /public/items/
export function getItemIcon(itemName: string): string | null {
  // Convert "Poor Lanai Log" -> "Poor_Lanai_Log.png"
  const filename = itemName.replace(/ /g, '_') + '.png'
  const known = [
    'Poor_Lanai_Log.png',
    'Fine_Lanai_Log.png',
    'Excellent_Lanai_Log.png',
    'Poor_Hatch_Log.png',
    'Fine_Hatch_Log.png',
    'Excellent_Hatch_Log.png',
  ]

  if (known.includes(filename)) {
    return `/items/${filename}`
  }

  return null
}

export function getQualityColor(quality: string | null): string {
  switch (quality) {
    case 'poor':      return '#8a7a6a'
    case 'fine':      return '#c8922a'
    case 'excellent': return '#4fc3f7'
    default:          return '#c8a96e'
  }
}