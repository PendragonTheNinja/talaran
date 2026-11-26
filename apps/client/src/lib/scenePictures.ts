/**
 * Place pictures behind the scene text (Nathan, 2026-11-19): a wide picture
 * per place, found by name as the minimap's are, at
 * /images/scenes/<Island_Folder>/<Place_Name>.webp. A place with no picture
 * keeps the theme's own background, so they can arrive one at a time.
 *
 * On or off per device, like chat text size (lib/chatSize.ts): a slow phone
 * may want them off while a desk keeps them.
 */

/**
 * Off for now (Nathan, 2026-11-26): no place pictures are shown and the
 * setting is hidden, so nobody sees them. Set true to bring them back; the
 * pictures in images/scenes stay where they are.
 */
export const SCENE_PICTURES_ENABLED = false

const STORAGE_KEY = 'talaran-scene-pictures'
export const SCENE_PICTURES_EVENT = 'talaran:scene-pictures'

export function scenePicturesOn(): boolean {
    if (!SCENE_PICTURES_ENABLED) return false
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'off'
    } catch { return true }
}

export function setScenePictures(on: boolean) {
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off') } catch { /* private mode: this visit only */ }
    window.dispatchEvent(new CustomEvent(SCENE_PICTURES_EVENT, { detail: on }))
}

/** Where a place's picture would be, or null without a place. */
export function scenePictureSrc(region: string | null | undefined, name: string | null | undefined): string | null {
    if (!name) return null
    const folder = (region || 'Taiar Island').replace(/ /g, '_')
    return `/images/scenes/${folder}/${name.replace(/ /g, '_').replace(/'/g, '')}.webp`
}
