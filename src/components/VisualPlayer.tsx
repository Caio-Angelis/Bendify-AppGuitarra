import { memo, useMemo } from 'react'
import { Guitar, User } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getShopCatalogItemById } from '../data/shopItems'

type Props = {
  className?: string
  /** Versão compacta para a sidebar. */
  compact?: boolean
}

function VisualPlayer({ className = '', compact = false }: Props) {
  const equippedItems = useStore((s) => s.equippedItems)

  const guitar = useMemo(
    () =>
      equippedItems.guitar ? getShopCatalogItemById(equippedItems.guitar) : null,
    [equippedItems.guitar],
  )
  const character = useMemo(
    () =>
      equippedItems.character
        ? getShopCatalogItemById(equippedItems.character)
        : null,
    [equippedItems.character],
  )

  const guitarLabel = guitar?.name ?? 'Nenhuma guitarra'
  const characterLabel = character?.name ?? 'Personagem padrão'

  const guitarVisual = guitar?.imageUrl ? (
    <img
      src={guitar.imageUrl}
      alt=""
      className={
        compact ? 'h-10 w-10 rounded-md object-cover' : 'h-14 w-14 rounded-lg object-cover'
      }
    />
  ) : (
    <div
      className={
        compact
          ? 'flex h-10 w-10 items-center justify-center rounded-md bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm'
          : 'flex h-14 w-14 items-center justify-center rounded-lg bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm'
      }
    >
      <Guitar className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={2} aria-hidden />
    </div>
  )

  const characterVisual = character?.imageUrl ? (
    <img
      src={character.imageUrl}
      alt=""
      className={
        compact ? 'h-10 w-10 rounded-md object-cover' : 'h-14 w-14 rounded-lg object-cover'
      }
    />
  ) : (
    <div
      className={
        compact
          ? 'flex h-10 w-10 items-center justify-center rounded-md bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm'
          : 'flex h-14 w-14 items-center justify-center rounded-lg bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm'
      }
    >
      <User className={compact ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={2} aria-hidden />
    </div>
  )

  return (
    <section
      className={`rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm ${className}`}
      aria-label="Equipamento visível"
    >
      <p
        className={`mb-2 font-medium text-[#F5F5F5]/70 ${compact ? 'text-[10px] uppercase tracking-wide' : 'text-xs uppercase tracking-wide'}`}
      >
        Seu visual
      </p>
      <div className={compact ? 'flex gap-2' : 'flex flex-wrap gap-4'}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {guitarVisual}
          <div className="min-w-0">
            <p className="text-[10px] text-[#F5F5F5]/45">Guitarra</p>
            <p
              className={`truncate font-medium text-[#F5F5F5] ${compact ? 'text-xs' : 'text-sm'}`}
            >
              {guitarLabel}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {characterVisual}
          <div className="min-w-0">
            <p className="text-[10px] text-[#F5F5F5]/45">Personagem</p>
            <p
              className={`truncate font-medium text-[#F5F5F5] ${compact ? 'text-xs' : 'text-sm'}`}
            >
              {characterLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default memo(VisualPlayer)
