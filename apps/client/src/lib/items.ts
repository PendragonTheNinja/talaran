/**
 * Art whose filename does not follow from the item's name.
 *
 * Icons are normally found by turning the name into a filename, which works
 * for almost everything and needs no bookkeeping. A few items are named one
 * thing and drawn as another, on purpose: the item is "Milk" because that is
 * what recipes ask for, while the picture is of the bucket it comes in.
 *
 * Without this the icon simply 404s and the item shows up blank everywhere it
 * appears, inventory and shops included, not only in the manual. Add a line
 * here rather than renaming an item that recipes refer to by name.
 */
const ICON_OVERRIDES: Record<string, string> = {
  'Milk': 'Bucket_of_Milk',
  'Boar Hide': 'Boarhide',
  'Deer Hide': 'Deerhide',
}

export function getItemIcon(itemName: string): string {
  const override = ICON_OVERRIDES[itemName]
  const filename = (override ?? itemName.replace(/ /g, '_').replace(/'/g, '')) + '.png'
  return `/images/items/${filename}`
}

export function getSlotIcon(slot: string): string {
  const map: Record<string, string> = {
    head: '/images/paper_doll/Head_Slot.png',
    neck: '/images/paper_doll/Neck_Slot.png',
    back: '/images/paper_doll/Back_Slot.png',
    chest: '/images/paper_doll/Chest_Slot.png',
    mainhand: '/images/paper_doll/Mainhand_Slot.png',
    offhand: '/images/paper_doll/Offhand_Slot.png',
    legs: '/images/paper_doll/Legs_Slot.png',
    hands: '/images/paper_doll/Hands_Slot.png',
    feet: '/images/paper_doll/Feet_Slot.png',
    finger: '/images/paper_doll/Ring_Slot.png',
    mount: '/images/paper_doll/Mount_Slot.png',
    trophy: '/images/paper_doll/Trophy_Slot.png',
  }
  return map[slot] || ''
}

export function getQualityColor(quality: string | null): string {
  switch (quality) {
    case 'poor': return '#8a7a6a'
    case 'fine': return '#c8922a'
    case 'excellent': return '#4fc3f7'
    default: return '#c8a96e'
  }
}