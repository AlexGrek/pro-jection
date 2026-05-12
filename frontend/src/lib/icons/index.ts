export interface IconPath {
  d: string
  fill?: boolean
}

export interface IconDef {
  label: string
  paths: IconPath[]
}

export interface IconPack {
  id: string
  name: string
  /** Square viewBox side length (24 for all Tabler icons). */
  viewBox: number
  icons: Record<string, IconDef>
}

export const TABLER_PACK: IconPack = {
  id: 'tabler',
  name: 'Tabler',
  viewBox: 24,
  icons: {
    'x': {
      label: 'X',
      paths: [
        { d: 'M18 6l-12 12' },
        { d: 'M6 6l12 12' },
      ],
    },
    'cross': {
      label: 'Cross',
      paths: [
        { d: 'M10 21h4v-9h5v-4h-5v-5h-4v5h-5v4h5l0 9' },
      ],
    },
    'cross-filled': {
      label: 'Cross Filled',
      paths: [
        { d: 'M10 2l-.117 .007a1 1 0 0 0 -.883 .993v4h-4a1 1 0 0 0 -1 1v4l.007 .117a1 1 0 0 0 .993 .883h4v8a1 1 0 0 0 1 1h4l.117 -.007a1 1 0 0 0 .883 -.993v-8h4a1 1 0 0 0 1 -1v-4l-.007 -.117a1 1 0 0 0 -.993 -.883h-4v-4a1 1 0 0 0 -1 -1h-4z', fill: true },
      ],
    },
    'tic-tac': {
      label: 'Tic Tac',
      paths: [
        { d: 'M4 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' },
        { d: 'M3 12h18' },
        { d: 'M12 3v18' },
        { d: 'M4 16l4 4' },
        { d: 'M4 20l4 -4' },
        { d: 'M16 4l4 4' },
        { d: 'M16 8l4 -4' },
        { d: 'M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' },
      ],
    },
    'crown': {
      label: 'Crown',
      paths: [
        { d: 'M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6' },
      ],
    },
    'crown-filled': {
      label: 'Crown Filled',
      paths: [
        { d: 'M19 19h-14c-.5 0 -.9 -.3 -1 -.8l-2 -10c0 -.4 .1 -.8 .5 -1.1c.4 -.2 .8 -.2 1.1 0l4.1 3.3l3.4 -5.1c.4 -.6 1.3 -.6 1.7 0l3.4 5.1l4.1 -3.3c.3 -.3 .8 -.3 1.1 0c.4 .2 .5 .6 .5 1.1l-2 10c0 .5 -.5 .8 -1 .8z', fill: true },
      ],
    },
    'brand-onedrive': {
      label: 'OneDrive',
      paths: [
        { d: 'M18.456 10.45a6.45 6.45 0 0 0 -12 -2.151a4.857 4.857 0 0 0 -4.44 5.241a4.856 4.856 0 0 0 5.236 4.444h10.751a3.771 3.771 0 0 0 3.99 -3.54a3.772 3.772 0 0 0 -3.538 -3.992l.001 -.002' },
      ],
    },
  },
}

/** All registered icon packs. Push additional packs here to extend the picker. */
export const ALL_PACKS: IconPack[] = [TABLER_PACK]

/** Looks up an icon by "packId:iconKey" format. Returns undefined if not found. */
export function findIconDef(iconId: string): { pack: IconPack; def: IconDef } | undefined {
  const sep = iconId.indexOf(':')
  if (sep === -1) return undefined
  const pack = ALL_PACKS.find((p) => p.id === iconId.slice(0, sep))
  const def = pack?.icons[iconId.slice(sep + 1)]
  return pack && def ? { pack, def } : undefined
}
