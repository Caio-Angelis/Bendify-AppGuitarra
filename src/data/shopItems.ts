/** Catálogo da loja (alinhado a `shop_items.id` no Supabase). */
export type ShopCatalogItem = {
  id: string
  name: string
  /** Valor da coluna `type` em `shop_items` (ex.: instrumento, avatar, vestuário). */
  type: string
  price: number
  min_level: number
  /** URL opcional para `VisualPlayer` quando existir no painel. */
  imageUrl?: string
}

/** ID em `shop_items` / inventário para o consumível que protege a ofensiva (UUID no Supabase). */
export const STREAK_SHIELD_ITEM_ID =
  '5768a59c-7d82-4d4d-91df-f73a60404740' as const

/**
 * SVG 200×200 como data URL para a loja e o `AvatarViewer`.
 * Coordenadas calibradas ao tronco do paper doll (`AvatarViewer`: cabeça ~38% largura,
 * tronco ~48%×42% centrado, sobreposição ~8%) — decote e regata alinham-se ao peito.
 */
function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Regata sem mangas: decote em V suave, cavas curvas, barra inferior arredondada. */
const TANK_BODY_PATH =
  'M 46 184 ' +
  'C 46 184 44 128 44 112 ' +
  'C 44 96 52 88 62 84 ' +
  'C 72 80 84 90 94 98 ' +
  'C 97 100 99 102 100 104 ' +
  'C 101 102 103 100 106 98 ' +
  'C 116 90 128 80 138 84 ' +
  'C 148 88 156 96 156 112 ' +
  'C 156 128 154 184 154 184 ' +
  'C 154 191 128 196 100 198 ' +
  'C 72 196 46 191 46 184 Z'

function buildTankTopSvgWhite(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<defs>' +
    '<linearGradient id="twBase" x1="18%" y1="8%" x2="82%" y2="92%">' +
    '<stop offset="0%" stop-color="#fbfbfb"/>' +
    '<stop offset="45%" stop-color="#ececec"/>' +
    '<stop offset="100%" stop-color="#d8d8d8"/>' +
    '</linearGradient>' +
    '<linearGradient id="twFold" x1="0%" y1="40%" x2="100%" y2="60%">' +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>' +
    '<stop offset="50%" stop-color="#b0b0b0" stop-opacity="0.12"/>' +
    '<stop offset="100%" stop-color="#ffffff" stop-opacity="0.28"/>' +
    '</linearGradient>' +
    '<radialGradient id="twChest" cx="48%" cy="38%" r="55%">' +
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>' +
    '<stop offset="55%" stop-color="#e0e0e0" stop-opacity="0.15"/>' +
    '<stop offset="100%" stop-color="#808080" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="twShade" cx="72%" cy="78%" r="45%">' +
    '<stop offset="0%" stop-color="#404040" stop-opacity="0.18"/>' +
    '<stop offset="100%" stop-color="#404040" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<pattern id="twMesh" width="5" height="5" patternUnits="userSpaceOnUse">' +
    '<rect width="5" height="5" fill="none"/>' +
    '<path d="M0 2.5h5M2.5 0v5M0 0l5 5M5 0L0 5" stroke="#9a9a9a" stroke-width="0.22" opacity="0.22"/>' +
    '</pattern>' +
    '<clipPath id="twClip"><path d="' +
    TANK_BODY_PATH +
    '"/></clipPath>' +
    '</defs>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#twBase)"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#twChest)" style="mix-blend-mode:soft-light"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#twShade)" style="mix-blend-mode:multiply"/>' +
    '<rect width="200" height="200" fill="url(#twMesh)" clip-path="url(#twClip)" opacity="0.45"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#twFold)" opacity="0.5"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="none" stroke="#c8c8c8" stroke-width="0.9" opacity="0.85"/>' +
    '<path d="M 62 84 Q 100 118 138 84" fill="none" stroke="#a8a8a8" stroke-width="0.55" opacity="0.5"/>' +
    '</svg>'
  )
}

function buildTankTopSvgBlack(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<defs>' +
    '<linearGradient id="tbBase" x1="22%" y1="6%" x2="78%" y2="94%">' +
    '<stop offset="0%" stop-color="#2e2e2e"/>' +
    '<stop offset="40%" stop-color="#181818"/>' +
    '<stop offset="100%" stop-color="#0a0a0a"/>' +
    '</linearGradient>' +
    '<linearGradient id="tbFold" x1="0%" y1="35%" x2="100%" y2="65%">' +
    '<stop offset="0%" stop-color="#5a5a5a" stop-opacity="0.25"/>' +
    '<stop offset="50%" stop-color="#1a1a1a" stop-opacity="0.45"/>' +
    '<stop offset="100%" stop-color="#3a3a3a" stop-opacity="0.2"/>' +
    '</linearGradient>' +
    '<radialGradient id="tbChest" cx="45%" cy="36%" r="52%">' +
    '<stop offset="0%" stop-color="#4a4a4a" stop-opacity="0.45"/>' +
    '<stop offset="70%" stop-color="#121212" stop-opacity="0.12"/>' +
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="tbRim" cx="50%" cy="88%" r="38%">' +
    '<stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>' +
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<pattern id="tbMesh" width="5" height="5" patternUnits="userSpaceOnUse">' +
    '<rect width="5" height="5" fill="none"/>' +
    '<path d="M0 2.5h5M2.5 0v5M0 0l5 5M5 0L0 5" stroke="#666" stroke-width="0.2" opacity="0.14"/>' +
    '</pattern>' +
    '<clipPath id="tbClip"><path d="' +
    TANK_BODY_PATH +
    '"/></clipPath>' +
    '</defs>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#tbBase)"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#tbChest)" style="mix-blend-mode:screen"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#tbRim)" style="mix-blend-mode:multiply"/>' +
    '<rect width="200" height="200" fill="url(#tbMesh)" clip-path="url(#tbClip)" opacity="0.55"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="url(#tbFold)" opacity="0.65"/>' +
    '<path d="' +
    TANK_BODY_PATH +
    '" fill="none" stroke="#3a3a3a" stroke-width="0.85" opacity="0.95"/>' +
    '<path d="M 62 84 Q 100 118 138 84" fill="none" stroke="#505050" stroke-width="0.5" opacity="0.45"/>' +
    '</svg>'
  )
}

function buildHairBrownSvg(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<defs>' +
    '<linearGradient id="hbMain" x1="30%" y1="0%" x2="70%" y2="100%">' +
    '<stop offset="0%" stop-color="#8b5a2b"/>' +
    '<stop offset="45%" stop-color="#5c3d1e"/>' +
    '<stop offset="100%" stop-color="#3d2814"/>' +
    '</linearGradient>' +
    '<linearGradient id="hbStrand" x1="0%" y1="20%" x2="100%" y2="80%">' +
    '<stop offset="0%" stop-color="#a07040" stop-opacity="0.6"/>' +
    '<stop offset="100%" stop-color="#2a1a0c" stop-opacity="0.5"/>' +
    '</linearGradient>' +
    '<radialGradient id="hbTop" cx="50%" cy="28%" r="48%">' +
    '<stop offset="0%" stop-color="#c49a6c" stop-opacity="0.7"/>' +
    '<stop offset="100%" stop-color="#654321" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<clipPath id="hbClip">' +
    '<path d="M 42 102 C 40 58 160 58 158 102 C 156 112 150 118 140 122 C 120 108 80 108 60 122 C 50 118 44 112 42 102 Z"/>' +
    '</clipPath>' +
    '</defs>' +
    '<path d="M 42 102 C 40 58 160 58 158 102 C 156 112 150 118 140 122 C 120 108 80 108 60 122 C 50 118 44 112 42 102 Z" fill="url(#hbMain)"/>' +
    '<path d="M 42 102 C 40 58 160 58 158 102 C 156 112 150 118 140 122 C 120 108 80 108 60 122 C 50 118 44 112 42 102 Z" fill="url(#hbTop)" style="mix-blend-mode:soft-light"/>' +
    '<g clip-path="url(#hbClip)" opacity="0.85">' +
    '<path d="M 48 72 Q 72 88 100 68 Q 128 88 152 72" fill="none" stroke="url(#hbStrand)" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M 52 82 Q 78 98 100 78 Q 122 98 148 82" fill="none" stroke="url(#hbStrand)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>' +
    '<path d="M 56 92 Q 82 106 100 90 Q 118 106 144 92" fill="none" stroke="url(#hbStrand)" stroke-width="4" stroke-linecap="round" opacity="0.65"/>' +
    '</g>' +
    '<path d="M 42 102 C 40 58 160 58 158 102" fill="none" stroke="#2a1a0c" stroke-width="0.75" opacity="0.4"/>' +
    '</svg>'
  )
}

function buildHairSpikySvg(): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
    '<defs>' +
    '<linearGradient id="hsEdge" x1="0%" y1="0%" x2="100%" y2="100%">' +
    '<stop offset="0%" stop-color="#2a2a2a"/>' +
    '<stop offset="50%" stop-color="#0a0a0a"/>' +
    '<stop offset="100%" stop-color="#1f1f1f"/>' +
    '</linearGradient>' +
    '<linearGradient id="hsSpike" x1="50%" y1="0%" x2="50%" y2="100%">' +
    '<stop offset="0%" stop-color="#4a4a4a"/>' +
    '<stop offset="100%" stop-color="#000000"/>' +
    '</linearGradient>' +
    '<radialGradient id="hsCrown" cx="50%" cy="40%" r="50%">' +
    '<stop offset="0%" stop-color="#555" stop-opacity="0.5"/>' +
    '<stop offset="100%" stop-color="#000" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    '<path d="M 52 108 L 58 44 L 72 92 L 88 38 L 100 88 L 112 36 L 128 92 L 142 46 L 148 108 C 128 118 72 118 52 108 Z" fill="url(#hsEdge)"/>' +
    '<path d="M 52 108 L 58 44 L 72 92 L 88 38 L 100 88 L 112 36 L 128 92 L 142 46 L 148 108 C 128 118 72 118 52 108 Z" fill="url(#hsCrown)" style="mix-blend-mode:screen" opacity="0.45"/>' +
    '<path d="M 58 52 L 62 96" stroke="url(#hsSpike)" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M 88 42 L 92 96" stroke="url(#hsSpike)" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M 100 40 L 100 94" stroke="url(#hsSpike)" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M 112 42 L 108 96" stroke="url(#hsSpike)" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M 142 52 L 136 98" stroke="url(#hsSpike)" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M 52 108 C 72 118 128 118 148 108" fill="none" stroke="#222" stroke-width="0.8" opacity="0.5"/>' +
    '</svg>'
  )
}

const SVG_SHIRT_WHITE = svgDataUrl(buildTankTopSvgWhite())
const SVG_SHIRT_BLACK = svgDataUrl(buildTankTopSvgBlack())
const SVG_HAIR_BROWN = svgDataUrl(buildHairBrownSvg())
const SVG_HAIR_SPIKY = svgDataUrl(buildHairSpikySvg())

export const SHOP_CATALOG: ShopCatalogItem[] = [
  {
    id: '11111111-1111-4111-a111-111111111111',
    name: 'Camiseta Branca',
    type: 'clothes',
    price: 0,
    min_level: 1,
    imageUrl: SVG_SHIRT_WHITE,
  },
  {
    id: '22222222-2222-4222-a222-222222222222',
    name: 'Camiseta Preta',
    type: 'clothes',
    price: 0,
    min_level: 1,
    imageUrl: SVG_SHIRT_BLACK,
  },
  {
    id: '33333333-3333-4333-a333-333333333333',
    name: 'Cabelo Castanho',
    type: 'character',
    price: 0,
    min_level: 1,
    imageUrl: SVG_HAIR_BROWN,
  },
  {
    id: '44444444-4444-4444-a444-444444444444',
    name: 'Cabelo Espetado',
    type: 'character',
    price: 0,
    min_level: 1,
    imageUrl: SVG_HAIR_SPIKY,
  },
  {
    id: 'avatar-rocker',
    name: 'Avatar Rocker',
    type: 'avatar',
    price: 120,
    min_level: 1,
  },
  {
    id: 'tee-vintage',
    name: 'Camiseta Vintage',
    type: 'vestuário',
    price: 80,
    min_level: 3,
  },
  {
    id: 'lp-michael',
    name: 'Guitarra Les Paul Michael',
    type: 'instrumento',
    price: 450,
    min_level: 5,
  },
  {
    id: STREAK_SHIELD_ITEM_ID,
    name: 'Escudo de Ofensiva',
    type: 'consumable',
    price: 150,
    min_level: 1,
  },
]

export function isConsumableItemType(type: string): boolean {
  return type.trim().toLowerCase() === 'consumable'
}

const byId = new Map(SHOP_CATALOG.map((i) => [i.id, i]))

export function getShopCatalogItemById(id: string): ShopCatalogItem | undefined {
  return byId.get(id)
}

/** Slots persistidos em `equippedItems` (Zustand). */
export type EquippedSlot = 'guitar' | 'clothes' | 'character'

export function shopTypeToEquippedSlot(type: string): EquippedSlot | null {
  const t = type.trim().toLowerCase()
  if (t === 'instrumento' || t === 'guitar' || t === 'guitarra') return 'guitar'
  if (
    t === 'vestuário' ||
    t === 'vestuario' ||
    t === 'clothes' ||
    t === 'roupa'
  ) {
    return 'clothes'
  }
  if (t === 'avatar' || t === 'character' || t === 'personagem') return 'character'
  return null
}
