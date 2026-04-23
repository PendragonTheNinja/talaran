export interface ExitZone {
  connectionName: string
  x: number  // % from left
  y: number  // % from top
  w: number  // % width
  h: number  // % height
}

export const LOCATION_EXITS: Record<string, ExitZone[]> = {
  'Talador': [
    { connectionName: 'Emberra',   x: 65, y: 0,  w: 25, h: 20 }, // north-west road
    { connectionName: 'Origrund',  x: 0, y: 20,  w: 25, h: 25 }, // north road
    { connectionName: 'Phoenwick', x: 0,  y: 55, w: 20, h: 30 }, // west road
  ],
  'Emberra': [
    { connectionName: 'Talador',   x: 5, y: 80, w: 30, h: 20 }, // south-east
    { connectionName: 'Origrund',  x: 0, y: 45,  w: 25, h: 20 }, // north-east
    { connectionName: 'Grundagr',  x: 40, y: 0,  w: 30, h: 25 }, // north
  ],
  'Grundagr': [
    { connectionName: 'Emberra',   x: 28, y: 75, w: 25, h: 25 }, // south
    { connectionName: 'Talar Rift',x: 75, y: 0, w: 20, h: 20 }, // east
    { connectionName: 'Novita',    x: 0,  y: 8, w: 20, h: 25 }, // west
  ],
  'Origrund': [
    { connectionName: 'Talador',   x: 75, y: 60, w: 25, h: 20 }, // south
    { connectionName: 'Emberra',   x: 75, y: 20,  w: 25, h: 20 }, // north-west
    { connectionName: 'Phoenwick', x: 20,  y: 75, w: 25, h: 25 }, // west
  ],
  'Novita': [
    { connectionName: 'Grundagr',  x: 75, y: 40, w: 25, h: 20 }, // south-east
    { connectionName: 'Eld Grove', x: 5, y: 56, w: 30, h: 20 }, // south-west
  ],
  'Eld Grove': [
    { connectionName: 'Novita',    x: 75, y: 22,  w: 25, h: 20 }, // north-east
    { connectionName: 'Caliwen',   x: 0, y: 60, w: 25, h: 20 }, // south-west
  ],
  'Caliwen': [
    { connectionName: 'Eld Grove', x: 80, y: 20,  w: 25, h: 20 }, // north-east
    { connectionName: 'Verdale',   x: 30, y: 80, w: 25, h: 20 }, // south-west
  ],
  'Verdale': [
    { connectionName: 'Caliwen',   x: 42, y: 0,  w: 25, h: 20 }, // north
    { connectionName: 'Lanaivale', x: 5, y: 70, w: 25, h: 20 }, // south
  ],
  'Lanaivale': [
    { connectionName: 'Verdale',   x: 70, y: 15,  w: 25, h: 20 }, // north
    { connectionName: 'Phoenwick', x: 75, y: 75, w: 25, h: 25 }, // south-east
    { connectionName: 'Luxmere',   x: 30,  y: 75, w: 20, h: 25 }, // west
  ],
  'Phoenwick': [
    { connectionName: 'Talador',   x: 75, y: 7,  w: 25, h: 20 }, // north-east
    { connectionName: 'Origrund',  x: 45, y: 0, w: 25, h: 20 }, // east
    { connectionName: 'Lanaivale', x: 0,  y: 50, w: 25, h: 20 }, // west
    { connectionName: 'Dawncrest', x: 75, y: 70, w: 25, h: 20 }, // south-east
    { connectionName: 'Luxmere',   x: 0, y: 80, w: 25, h: 20 }, // south-west
  ],
  'Dawncrest': [
    { connectionName: 'Phoenwick', x: 0, y: 10,  w: 25, h: 25 }, // north
    { connectionName: 'Luxmere',   x: 0,  y: 45, w: 20, h: 25 }, // west
  ],
  'Luxmere': [
    { connectionName: 'Lanaivale', x: 33, y: 0,  w: 25, h: 20 }, // north
    { connectionName: 'Phoenwick', x: 75, y: 20,  w: 25, h: 20 }, // north-east
    { connectionName: 'Dawncrest', x: 75, y: 45, w: 25, h: 20 }, // east
  ],
  'Talar Rift': [
    { connectionName: 'Grundagr',  x: 33, y: 80, w: 20, h: 25 }, // south-west
  ],
}