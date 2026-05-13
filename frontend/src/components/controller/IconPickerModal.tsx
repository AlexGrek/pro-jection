import { useState, useMemo, useCallback, useEffect } from 'react'
import { ALL_PACKS, findIconDef } from '@/lib/icons'
import type { IconPack, IconDef } from '@/lib/icons'

const ICONS_PER_PAGE = 40
const FAVORITES_KEY = 'pro-jection:icon-favorites'
const MAX_FAVORITES = 24

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveFavorites(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
  } catch {}
}

interface IconEntry {
  iconId: string
  pack: IconPack
  def: IconDef
}

function IconTile({
  iconId,
  pack,
  def,
  selected,
  onClick,
}: IconEntry & { selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={def.label}
      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors ${
        selected
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      <svg
        viewBox={`0 0 ${pack.viewBox} ${pack.viewBox}`}
        className="w-8 h-8 shrink-0"
        stroke="currentColor"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {def.paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.fill ? 'currentColor' : 'none'}
            stroke={p.fill ? 'none' : 'currentColor'}
          />
        ))}
      </svg>
      <span className="text-[10px] leading-tight truncate w-full text-center">{def.label}</span>
    </button>
  )
}

export interface IconPickerModalProps {
  currentIconId: string
  onSelect: (iconId: string) => void
  onClose: () => void
}

export function IconPickerModal({ currentIconId, onSelect, onClose }: IconPickerModalProps) {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites)
  const [activeTab, setActiveTab] = useState<'favorites' | string>('favorites')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const allEntries = useMemo<IconEntry[]>(() => {
    if (activeTab === 'favorites') {
      return favorites.flatMap((iconId) => {
        const found = findIconDef(iconId)
        return found ? [{ iconId, pack: found.pack, def: found.def }] : []
      })
    }
    const pack = ALL_PACKS.find((p) => p.id === activeTab)
    if (!pack) return []
    return Object.entries(pack.icons).map(([key, def]) => ({
      iconId: `${pack.id}:${key}`,
      pack,
      def,
    }))
  }, [activeTab, favorites])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? allEntries.filter(({ def }) => def.label.toLowerCase().includes(q)) : allEntries
  }, [allEntries, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ICONS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageIcons = filtered.slice(currentPage * ICONS_PER_PAGE, (currentPage + 1) * ICONS_PER_PAGE)

  useEffect(() => setPage(0), [activeTab, search])

  const handleSelect = useCallback(
    (iconId: string) => {
      setFavorites((prev) => {
        const next = [iconId, ...prev.filter((id) => id !== iconId)].slice(0, MAX_FAVORITES)
        saveFavorites(next)
        return next
      })
      onSelect(iconId)
      onClose()
    },
    [onSelect, onClose],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 sm:flex sm:items-center sm:justify-center">
      {/* Backdrop – desktop only */}
      <div className="hidden sm:block absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal card */}
      <div className="relative z-10 flex flex-col bg-slate-900 w-full h-full sm:h-auto sm:max-h-[80vh] sm:max-w-xl sm:rounded-2xl sm:mx-4 overflow-hidden shadow-2xl border-0 sm:border sm:border-slate-700/60">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
          <span className="font-semibold text-sm text-white">Pick an Icon</span>
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
              <path d="M21 21l-6 -6" />
            </svg>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search icons…"
              className="w-full bg-slate-800 text-sm text-white placeholder:text-slate-500 pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors shrink-0"
            aria-label="Close"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6l-12 12" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-slate-700 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'favorites'
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill={activeTab === 'favorites' ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />
            </svg>
            Favorites
            {favorites.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                  activeTab === 'favorites'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {favorites.length}
              </span>
            )}
          </button>

          {ALL_PACKS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveTab(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === p.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {p.name}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                  activeTab === p.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {Object.keys(p.icons).length}
              </span>
            </button>
          ))}
        </div>

        {/* Icon grid */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {pageIcons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
              {activeTab === 'favorites' && favorites.length === 0 && !search ? (
                <>
                  <svg
                    className="w-8 h-8 opacity-40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />
                  </svg>
                  <span>No favorites yet</span>
                  <span className="text-xs text-slate-600">Icons you pick will appear here</span>
                </>
              ) : (
                <span>No icons match "{search}"</span>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1">
              {pageIcons.map(({ iconId, pack, def }) => (
                <IconTile
                  key={iconId}
                  iconId={iconId}
                  pack={pack}
                  def={def}
                  selected={iconId === currentIconId}
                  onClick={() => handleSelect(iconId)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 shrink-0">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12l14 0" />
                <path d="M5 12l6 6" />
                <path d="M5 12l6 -6" />
              </svg>
              Prev
            </button>
            <span className="text-xs text-slate-400">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12l14 0" />
                <path d="M13 18l6 -6" />
                <path d="M13 6l6 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
