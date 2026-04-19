export function getItemIcon(itemName: string): string | null {
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
    return `/images/items/${filename}`
  }

  return null
}

export function getSlotIcon(slot: string): string {
  const map: Record<string, string> = {
    head:     '/images/paper_doll/Head_Slot.png',
    neck:     '/images/paper_doll/Neck_Slot.png',
    back:     '/images/paper_doll/Back_Slot.png',
    chest:    '/images/paper_doll/Chest_Slot.png',
    mainhand: '/images/paper_doll/Mainhand_Slot.png',
    offhand:  '/images/paper_doll/Offhand_Slot.png',
    legs:     '/images/paper_doll/Legs_Slot.png',
    hands:    '/images/paper_doll/Hands_Slot.png',
    feet:     '/images/paper_doll/Feet_Slot.png',
    finger:   '/images/paper_doll/Ring_Slot.png',
    mount:    '/images/paper_doll/Mount_Slot.png',
    trophy:   '/images/paper_doll/Trophy_Slot.png',
  }
  return map[slot] || ''
}

export function getQualityColor(quality: string | null): string {
  switch (quality) {
    case 'poor':      return '#8a7a6a'
    case 'fine':      return '#c8922a'
    case 'excellent': return '#4fc3f7'
    default:          return '#c8a96e'
  }
}