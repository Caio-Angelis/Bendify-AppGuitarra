import { useState } from 'react'
import {
  Coins,
  Guitar,
  ShieldCheck,
  ShoppingBag,
  Star,
  User,
} from 'lucide-react'
import { tryUnlockAchievement } from '../hooks/tryUnlockAchievement'
import {
  SHOP_CATALOG,
  isConsumableItemType,
  shopTypeToEquippedSlot,
  type ShopCatalogItem,
} from '../data/shopItems'
import { useStore } from '../store/useStore'
import { equipItemOnDb, purchaseUserItemOnDb } from '../utils/supabase'

function typeLabel(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function Shop() {
  const session = useStore((s) => s.session)
  const level = useStore((s) => s.userStats.level)
  const credits = useStore((s) => s.userStats.credits)
  const purchasedShopItemIds = useStore((s) => s.purchasedShopItemIds)
  const equippedItems = useStore((s) => s.equippedItems)
  const showGlobalToast = useStore((s) => s.showGlobalToast)
  const inventory = useStore((s) => s.inventory)
  const syncInventoryFromDb = useStore((s) => s.syncInventoryFromDb)
  const syncEquippedItemsFromDb = useStore((s) => s.syncEquippedItemsFromDb)
  const syncProfileEconomyFromDb = useStore((s) => s.syncProfileEconomyFromDb)

  const [toast, setToast] = useState<string | null>(null)
  const [equipLoadingId, setEquipLoadingId] = useState<string | null>(null)
  const [purchaseLoadingId, setPurchaseLoadingId] = useState<string | null>(
    null,
  )

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }

  function isItemEquipped(item: ShopCatalogItem): boolean {
    const slot = shopTypeToEquippedSlot(item.type)
    if (!slot) return false
    return equippedItems[slot] === item.id
  }

  const syncShopStateFromServer = async () => {
    await Promise.all([
      syncInventoryFromDb(),
      syncEquippedItemsFromDb(),
      syncProfileEconomyFromDb(),
    ])
  }

  const handleEquip = async (item: ShopCatalogItem) => {
    const slot = shopTypeToEquippedSlot(item.type)
    if (!slot) {
      showToast('Tipo de item não suportado para equipar.')
      return
    }
    if (!session?.user) {
      showToast('Inicie sessão para equipar itens.')
      return
    }
    setEquipLoadingId(item.id)
    const { error } = await equipItemOnDb(item.id, session.user.id)
    setEquipLoadingId(null)
    if (error) {
      showToast(error.message)
      return
    }
    await syncShopStateFromServer()
    showGlobalToast(`“${item.name}” equipado.`)
  }

  const handlePurchaseConsumable = async (item: ShopCatalogItem) => {
    if (!session?.user) {
      showToast('Inicie sessão para comprar.')
      return
    }
    if (level < item.min_level) {
      showToast(
        `Nível insuficiente. Este item exige nível ${item.min_level} (seu nível: ${level}).`,
      )
      return
    }
    if (item.price > 0 && credits < item.price) {
      showToast(
        `Créditos insuficientes. Preço: ${item.price}, saldo: ${credits}.`,
      )
      return
    }
    const hadAnyPurchase = purchasedShopItemIds.length > 0
    setPurchaseLoadingId(item.id)
    const { error } = await purchaseUserItemOnDb(item.id)
    setPurchaseLoadingId(null)
    if (error) {
      showToast(error.message)
      return
    }
    await syncShopStateFromServer()
    if (!hadAnyPurchase) {
      void tryUnlockAchievement(session.user.id, 'first_purchase')
    }
    showGlobalToast(`“${item.name}” adicionado ao inventário.`)
  }

  const handlePurchaseCosmetic = async (item: ShopCatalogItem) => {
    if (!session?.user) {
      showToast('Inicie sessão para comprar.')
      return
    }
    if (isConsumableItemType(item.type)) {
      return
    }
    const owned = purchasedShopItemIds.includes(item.id)
    if (owned) {
      if (isItemEquipped(item)) return
      void handleEquip(item)
      return
    }

    if (level < item.min_level) {
      showToast(
        `Nível insuficiente. Este item exige nível ${item.min_level} (seu nível: ${level}).`,
      )
      return
    }
    if (item.price > 0 && credits < item.price) {
      showToast(
        `Créditos insuficientes. Preço: ${item.price}, saldo: ${credits}.`,
      )
      return
    }

    const hadAnyPurchase = purchasedShopItemIds.length > 0
    setPurchaseLoadingId(item.id)
    const { error } = await purchaseUserItemOnDb(item.id)
    setPurchaseLoadingId(null)
    if (error) {
      showToast(error.message)
      return
    }
    await syncShopStateFromServer()
    if (!hadAnyPurchase) {
      void tryUnlockAchievement(session.user.id, 'first_purchase')
    }
    showGlobalToast(`“${item.name}” comprado com sucesso.`)
  }

  const handlePrimary = (item: ShopCatalogItem) => {
    if (isConsumableItemType(item.type)) {
      void handlePurchaseConsumable(item)
      return
    }
    void handlePurchaseCosmetic(item)
  }

  function inventoryQuantity(itemId: string): number {
    return inventory.find((i) => i.item_id === itemId)?.quantity ?? 0
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex flex-col gap-2 border-b border-[#333333] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F5F5] md:text-3xl">
            Loja
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#F5F5F5]/65">
            Itens cosméticos e coleções — use seus créditos e nível para
            desbloquear equipamentos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-medium text-[#FFB300] backdrop-blur-sm">
            <Star className="h-4 w-4" strokeWidth={2} aria-hidden />
            Nível {level}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-medium text-[#FFB300] backdrop-blur-sm">
            <Coins className="h-4 w-4" strokeWidth={2} aria-hidden />
            {credits} créditos
          </span>
        </div>
      </header>

      {toast && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-[#FFB300]/35 bg-white/5 px-4 py-3 text-sm text-[#F5F5F5] shadow-[0_0_20px_rgba(255,179,0,0.20)] backdrop-blur-sm"
        >
          {toast}
        </div>
      )}

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SHOP_CATALOG.map((item) => {
          const isConsumable = isConsumableItemType(item.type)
          const qty = inventoryQuantity(item.id)
          const ownedCosmetic =
            !isConsumable && purchasedShopItemIds.includes(item.id)
          const owned = ownedCosmetic || (isConsumable && qty > 0)
          const equipped = isItemEquipped(item)
          const levelOk = level >= item.min_level
          const creditsOk = item.price === 0 || credits >= item.price
          const canBuy =
            isConsumable
              ? levelOk && creditsOk
              : !ownedCosmetic && levelOk && creditsOk

          let disabledReason: string | null = null
          if (!isConsumable && !ownedCosmetic && !levelOk) {
            disabledReason = `Requer nível ${item.min_level}`
          } else if (
            !isConsumable &&
            !ownedCosmetic &&
            item.price > 0 &&
            !creditsOk
          ) {
            disabledReason = `Faltam ${item.price - credits} créditos`
          } else if (isConsumable && !levelOk) {
            disabledReason = `Requer nível ${item.min_level}`
          } else if (isConsumable && item.price > 0 && !creditsOk) {
            disabledReason = `Faltam ${item.price - credits} créditos`
          }

          return (
            <li key={item.id}>
              <article className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#FFB300]/10 hover:border-[#FFB300]/30">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm">
                    {item.type === 'instrumento' ? (
                      <Guitar className="h-6 w-6" strokeWidth={2} aria-hidden />
                    ) : item.type === 'avatar' || item.type === 'character' ? (
                      <User className="h-6 w-6" strokeWidth={2} aria-hidden />
                    ) : isConsumableItemType(item.type) ? (
                      <ShieldCheck
                        className="h-6 w-6"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : (
                      <ShoppingBag
                        className="h-6 w-6"
                        strokeWidth={2}
                        aria-hidden
                      />
                    )}
                  </div>
                  <span className="rounded-md bg-[#121212]/50 px-2 py-1 text-xs font-medium text-[#F5F5F5]/70 ring-1 ring-white/10 backdrop-blur-sm">
                    Nv. {item.min_level}+
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-[#F5F5F5]">
                  {item.name}
                </h2>
                <p className="mt-1 text-sm text-[#F5F5F5]/55">
                  {typeLabel(item.type)}
                  {isConsumable && qty > 0 ? (
                    <span className="ml-2 rounded-md bg-[#121212]/50 px-2 py-0.5 text-xs text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm">
                      No inventário: ×{qty}
                    </span>
                  ) : null}
                </p>
                <div
                  className={
                    item.price === 0
                      ? 'mt-4'
                      : 'mt-4 flex items-center gap-2 text-[#FFB300]'
                  }
                >
                  {item.price === 0 ? (
                    <span className="inline-flex rounded-md bg-[#1B3D2F] px-2.5 py-1 text-sm font-semibold text-[#A5D6A7] ring-1 ring-[#2E7D32]/60">
                      Grátis
                    </span>
                  ) : (
                    <>
                      <Coins className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="text-base font-semibold">{item.price}</span>
                      <span className="text-sm font-normal text-[#F5F5F5]/50">
                        créditos
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-auto pt-5">
                  <button
                    type="button"
                    disabled={
                      isConsumable
                        ? !canBuy || purchaseLoadingId === item.id
                        : (!owned && !canBuy) ||
                          equipped ||
                          (owned && equipLoadingId === item.id)
                    }
                    onClick={() => handlePrimary(item)}
                    className={[
                      'w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                      equipped
                        ? 'cursor-not-allowed border border-white/10 bg-white/5 text-[#F5F5F5]/55 backdrop-blur-sm'
                        : owned && !isConsumable
                          ? 'bg-[#FFB300] text-[#121212] hover:bg-[#ffc42e] disabled:opacity-60'
                          : canBuy
                            ? 'bg-[#FFB300] text-[#121212] hover:bg-[#ffc42e]'
                            : 'cursor-not-allowed bg-white/5 text-[#F5F5F5]/45 ring-1 ring-white/10 backdrop-blur-sm',
                    ].join(' ')}
                  >
                    {isConsumable
                      ? purchaseLoadingId === item.id
                        ? 'A processar…'
                        : qty > 0
                          ? 'Comprar mais'
                          : 'Comprar'
                      : equipped
                        ? 'Equipado'
                        : owned
                          ? equipLoadingId === item.id
                            ? 'A equipar…'
                            : 'Equipar'
                          : 'Comprar'}
                  </button>
                  {disabledReason ? (
                    <p className="mt-2 text-center text-xs text-[#F5F5F5]/45">
                      {disabledReason}
                    </p>
                  ) : null}
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
