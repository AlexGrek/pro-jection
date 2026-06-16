import { useEffect, useRef, useState } from 'react'
import { IconDeviceFloppy, IconFolderOpen, IconTrash } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/** Metadata returned by `GET /api/scenes` (no scene body). */
export interface SavedSceneMeta {
  id: string
  name: string
  saved_at: number
}

function formatSaved(savedAt: number): string {
  const diff = Date.now() - savedAt * 1000
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  return new Date(savedAt * 1000).toLocaleDateString()
}

interface SaveSceneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialName: string
  onSubmit: (name: string) => void
}

/** Name prompt used by the first save of a new scene and by "Save As". */
export function SaveSceneDialog({ open, onOpenChange, title, initialName, onSubmit }: SaveSceneDialogProps) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setTimeout(() => inputRef.current?.select(), 80)
    }
  }, [open, initialName])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <IconDeviceFloppy size={28} stroke={1} className="text-muted-foreground mb-1" />
          <DialogTitle className="font-light text-xl">{title}</DialogTitle>
          <DialogDescription className="font-light">
            Saved scenes live for 14 days; re-saving resets the clock.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            placeholder="Scene name"
            className="font-light"
          />
          <Button onClick={submit} disabled={!name.trim()} className="gap-1.5">
            <IconDeviceFloppy size={15} stroke={1.5} />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface OpenSceneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (meta: SavedSceneMeta) => void
}

/** Picker that lists saved scenes and opens or deletes them. */
export function OpenSceneDialog({ open, onOpenChange, onOpen }: OpenSceneDialogProps) {
  const [scenes, setScenes] = useState<SavedSceneMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    setError(null)
    fetch('/api/scenes')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((list: SavedSceneMeta[]) => setScenes(list))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (open) refresh() }, [open])

  const remove = async (id: string) => {
    try {
      const r = await fetch(`/api/scenes/${id}`, { method: 'DELETE' })
      if (!r.ok && r.status !== 204) throw new Error(`${r.status}`)
      setScenes((s) => s.filter((x) => x.id !== id))
    } catch {
      refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <IconFolderOpen size={28} stroke={1} className="text-muted-foreground mb-1" />
          <DialogTitle className="font-light text-xl">Open Scene</DialogTitle>
          <DialogDescription className="font-light">
            Saved scenes are removed automatically 14 days after their last save.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 max-h-80 overflow-y-auto flex flex-col gap-1">
          {loading && <p className="text-muted-foreground text-sm text-center py-4 font-light">Loading…</p>}
          {error && <p className="text-red-400 text-sm text-center py-4 font-light">{error}</p>}
          {!loading && !error && scenes.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-6 font-light">No saved scenes yet.</p>
          )}
          {scenes.map((s) => (
            <div
              key={s.id}
              className="group flex items-center gap-2 rounded-md px-3 py-2 hover:bg-slate-800/60 transition-colors"
            >
              <button
                onClick={() => { onOpen(s); onOpenChange(false) }}
                className="flex-1 min-w-0 text-left"
              >
                <span className="block truncate text-slate-200 font-light text-sm">{s.name}</span>
                <span className="block text-[11px] text-slate-500 font-light">{formatSaved(s.saved_at)}</span>
              </button>
              <button
                onClick={() => remove(s.id)}
                title="Delete scene"
                className="shrink-0 p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/40 opacity-0 group-hover:opacity-100 transition"
              >
                <IconTrash size={15} stroke={1.5} />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
