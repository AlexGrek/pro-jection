import { useState, useMemo, useCallback, useEffect } from 'react'
import { FONT_OPTIONS, FONT_CATEGORIES, type FontId, type FontCategory } from '@/lib/scene'

const FAVORITES_KEY = 'pro-jection:font-favorites'
const MAX_FAVORITES = 12

function loadFavorites(): FontId[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveFavorites(ids: FontId[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
  } catch {}
}

function FontTile({
  label,
  css,
  selected,
  onClick,
}: {
  label: string
  css: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg transition-colors text-left ${
        selected
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      <span style={{ fontFamily: css }} className="text-xl leading-tight truncate w-full">
        Aa
      </span>
      <span className="text-[10px] leading-tight truncate w-full opacity-70">{label}</span>
    </button>
  )
}

export interface FontPickerModalProps {
  currentFontId: FontId
  onSelect: (fontId: FontId) => void
  onClose: () => void
}

export function FontPickerModal({ currentFontId, onSelect, onClose }: FontPickerModalProps) {
  const [favorites, setFavorites] = useState<FontId[]>(loadFavorites)
  const [activeTab, setActiveTab] = useState<'favorites' | FontCategory>('favorites')

  const visibleFonts = useMemo(() => {
    if (activeTab === 'favorites') {
      return favorites.flatMap((id) => {
        const f = FONT_OPTIONS.find((o) => o.id === id)
        return f ? [f] : []
      })
    }
    return FONT_OPTIONS.filter((f) => f.category === activeTab)
  }, [activeTab, favorites])

  const handleSelect = useCallback(
    (fontId: FontId) => {
      setFavorites((prev) => {
        const next = [fontId, ...prev.filter((id) => id !== fontId)].slice(0, MAX_FAVORITES) as FontId[]
        saveFavorites(next)
        return next
      })
      onSelect(fontId)
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
      {/* Backdrop */}
      <div className="hidden sm:block absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal card */}
      <div className="relative z-10 flex flex-col bg-slate-900 w-full h-full sm:h-auto sm:max-h-[70vh] sm:max-w-lg sm:rounded-2xl sm:mx-4 overflow-hidden shadow-2xl border-0 sm:border sm:border-slate-700/60">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 shrink-0">
          <span className="font-semibold text-sm text-white">Pick a Font</span>
          <div className="ml-auto" />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
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

          {FONT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {cat.label}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                  activeTab === cat.id ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
                }`}
              >
                {FONT_OPTIONS.filter((f) => f.category === cat.id).length}
              </span>
            </button>
          ))}
        </div>

        {/* Font grid */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {visibleFonts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
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
              <span className="text-xs text-slate-600">Fonts you pick will appear here</span>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1.5">
              {visibleFonts.map((f) => (
                <FontTile
                  key={f.id}
                  label={f.label}
                  css={f.css}
                  selected={f.id === currentFontId}
                  onClick={() => handleSelect(f.id as FontId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
