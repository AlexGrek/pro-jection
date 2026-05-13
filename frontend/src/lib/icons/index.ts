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
    'home': {
      label: 'Home',
      paths: [
        { d: 'M5 12l-2 0l9 -9l9 9l-2 0' },
        { d: 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7' },
        { d: 'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6' },
      ],
    },
    'star': {
      label: 'Star',
      paths: [
        { d: 'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z' },
      ],
    },
    'star-filled': {
      label: 'Star Filled',
      paths: [
        { d: 'M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.798 0l-2.853 5.78z', fill: true },
      ],
    },
    'heart': {
      label: 'Heart',
      paths: [
        { d: 'M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572' },
      ],
    },
    'heart-filled': {
      label: 'Heart Filled',
      paths: [
        { d: 'M6.979 3.074a6 6 0 0 1 4.988 1.425l.037 .033l.034 -.03a6 6 0 0 1 4.733 -1.44l.246 .036a6 6 0 0 1 3.364 10.008l-.18 .185l-.048 .041l-7.45 7.379a1 1 0 0 1 -1.313 .082l-.094 -.082l-7.493 -7.422a6 6 0 0 1 .927 -9.215z', fill: true },
      ],
    },
    'check': {
      label: 'Check',
      paths: [
        { d: 'M5 12l5 5l10 -10' },
      ],
    },
    'alert-triangle': {
      label: 'Alert Triangle',
      paths: [
        { d: 'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z' },
        { d: 'M12 9v4' },
        { d: 'M12 17h.01' },
      ],
    },
    'info-circle': {
      label: 'Info Circle',
      paths: [
        { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0' },
        { d: 'M12 9h.01' },
        { d: 'M11 12h1v4h1' },
      ],
    },
    'circle-check': {
      label: 'Circle Check',
      paths: [
        { d: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0' },
        { d: 'M9 12l2 2l4 -4' },
      ],
    },
    'arrow-right': {
      label: 'Arrow Right',
      paths: [
        { d: 'M5 12l14 0' },
        { d: 'M13 18l6 -6' },
        { d: 'M13 6l6 6' },
      ],
    },
    'arrow-left': {
      label: 'Arrow Left',
      paths: [
        { d: 'M5 12l14 0' },
        { d: 'M5 12l6 6' },
        { d: 'M5 12l6 -6' },
      ],
    },
    'arrow-up': {
      label: 'Arrow Up',
      paths: [
        { d: 'M12 5l0 14' },
        { d: 'M18 11l-6 -6' },
        { d: 'M6 11l6 -6' },
      ],
    },
    'arrow-down': {
      label: 'Arrow Down',
      paths: [
        { d: 'M12 5l0 14' },
        { d: 'M18 13l-6 6' },
        { d: 'M6 13l6 6' },
      ],
    },
    'player-play-filled': {
      label: 'Play',
      paths: [
        { d: 'M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z', fill: true },
      ],
    },
    'settings': {
      label: 'Settings',
      paths: [
        { d: 'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z' },
        { d: 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0' },
      ],
    },
    'search': {
      label: 'Search',
      paths: [
        { d: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0' },
        { d: 'M21 21l-6 -6' },
      ],
    },
    'user': {
      label: 'User',
      paths: [
        { d: 'M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0' },
        { d: 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2' },
      ],
    },
    'bell': {
      label: 'Bell',
      paths: [
        { d: 'M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6' },
        { d: 'M9 17v1a3 3 0 0 0 6 0v-1' },
      ],
    },
    'mail': {
      label: 'Mail',
      paths: [
        { d: 'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z' },
        { d: 'M3 7l9 6l9 -6' },
      ],
    },
    'trash': {
      label: 'Trash',
      paths: [
        { d: 'M4 7l16 0' },
        { d: 'M10 11l0 6' },
        { d: 'M14 11l0 6' },
        { d: 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12' },
        { d: 'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3' },
      ],
    },
    'camera': {
      label: 'Camera',
      paths: [
        { d: 'M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2' },
        { d: 'M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0' },
      ],
    },
    'photo': {
      label: 'Photo',
      paths: [
        { d: 'M15 8h.01' },
        { d: 'M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z' },
        { d: 'M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5' },
        { d: 'M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3' },
      ],
    },
    'focus': {
      label: 'Focus',
      paths: [
        { d: 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
        { d: 'M3 7v-2a2 2 0 0 1 2 -2h2' },
        { d: 'M17 3h2a2 2 0 0 1 2 2v2' },
        { d: 'M21 17v2a2 2 0 0 1 -2 2h-2' },
        { d: 'M7 21h-2a2 2 0 0 1 -2 -2v-2' },
      ],
    },
    'zoom-in': {
      label: 'Zoom In',
      paths: [
        { d: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0' },
        { d: 'M7 10l6 0' },
        { d: 'M10 7l0 6' },
        { d: 'M21 21l-6 -6' },
      ],
    },
    'zoom-out': {
      label: 'Zoom Out',
      paths: [
        { d: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0' },
        { d: 'M7 10l6 0' },
        { d: 'M21 21l-6 -6' },
      ],
    },
    'presentation': {
      label: 'Presentation',
      paths: [
        { d: 'M3 4l18 0' },
        { d: 'M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10' },
        { d: 'M12 16l0 4' },
        { d: 'M9 20l6 0' },
        { d: 'M8 12l3 -3l2 2l3 -3' },
      ],
    },
    'video': {
      label: 'Video',
      paths: [
        { d: 'M15 10l4.553 -2.069a1 1 0 0 1 1.447 .894v6.35a1 1 0 0 1 -1.447 .894l-4.553 -2.069v-4z' },
        { d: 'M3 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-8z' },
      ],
    },
    'movie': {
      label: 'Movie',
      paths: [
        { d: 'M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z' },
        { d: 'M8 4l0 16' },
        { d: 'M16 4l0 16' },
        { d: 'M4 8l4 0' },
        { d: 'M4 16l4 0' },
        { d: 'M4 12l16 0' },
        { d: 'M16 8l4 0' },
        { d: 'M16 16l4 0' },
      ],
    },
    'microphone': {
      label: 'Microphone',
      paths: [
        { d: 'M9 2m0 3a3 3 0 0 1 6 0v5a3 3 0 0 1 -6 0z' },
        { d: 'M5 10a7 7 0 0 0 14 0' },
        { d: 'M8 21l8 0' },
        { d: 'M12 17l0 4' },
      ],
    },
    'palette': {
      label: 'Palette',
      paths: [
        { d: 'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25' },
        { d: 'M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
        { d: 'M12 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
        { d: 'M15.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0' },
      ],
    },
    'layers': {
      label: 'Layers',
      paths: [
        { d: 'M12 2l8 4l-8 4l-8 -4z' },
        { d: 'M4 10l8 4l8 -4' },
        { d: 'M4 14l8 4l8 -4' },
      ],
    },
    'sun': {
      label: 'Sun',
      paths: [
        { d: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0' },
        { d: 'M3 12h1' },
        { d: 'M20 12h1' },
        { d: 'M12 3v1' },
        { d: 'M12 20v1' },
        { d: 'M5.636 5.636l.707 .707' },
        { d: 'M17.657 5.636l-.707 .707' },
        { d: 'M17.657 18.364l-.707 -.707' },
        { d: 'M5.636 18.364l.707 -.707' },
      ],
    },
    'eye': {
      label: 'Eye',
      paths: [
        { d: 'M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0' },
        { d: 'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6' },
      ],
    },
    'maximize': {
      label: 'Maximize',
      paths: [
        { d: 'M4 8v-2a2 2 0 0 1 2 -2h2' },
        { d: 'M4 16v2a2 2 0 0 0 2 2h2' },
        { d: 'M16 4h2a2 2 0 0 1 2 2v2' },
        { d: 'M16 20h2a2 2 0 0 0 2 -2v-2' },
      ],
    },
    'device-tv': {
      label: 'Screen',
      paths: [
        { d: 'M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z' },
        { d: 'M16 3l-4 4l-4 -4' },
        { d: 'M15 20l1 1' },
        { d: 'M9 20l-1 1' },
      ],
    },
    'bolt': {
      label: 'Flash',
      paths: [
        { d: 'M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11' },
      ],
    },
    'rotate-clockwise': {
      label: 'Rotate',
      paths: [
        { d: 'M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5' },
      ],
    },
    'adjustments-horizontal': {
      label: 'Adjustments',
      paths: [
        { d: 'M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' },
        { d: 'M4 6l8 0' },
        { d: 'M16 6l4 0' },
        { d: 'M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' },
        { d: 'M4 12l2 0' },
        { d: 'M10 12l10 0' },
        { d: 'M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0' },
        { d: 'M4 18l11 0' },
        { d: 'M19 18l1 0' },
      ],
    },
    'ruler-2': {
      label: 'Ruler',
      paths: [
        { d: 'M17 3l4 4l-14 14l-4 -4z' },
        { d: 'M7 7l1 -1' },
        { d: 'M10 10l1 -1' },
        { d: 'M13 13l1 -1' },
        { d: 'M16 16l1 -1' },
      ],
    },
    'crop': {
      label: 'Crop',
      paths: [
        { d: 'M8 5h-3' },
        { d: 'M5 8v-3' },
        { d: 'M16 5h3' },
        { d: 'M19 8v-3' },
        { d: 'M8 19h-3' },
        { d: 'M5 16v3' },
        { d: 'M16 19h3' },
        { d: 'M19 16v3' },
        { d: 'M5 9v6' },
        { d: 'M19 9v6' },
        { d: 'M9 5h6' },
        { d: 'M9 19h6' },
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
