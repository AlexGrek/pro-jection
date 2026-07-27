import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconDeviceFloppy,
  IconFileZip,
  IconFolderOpen,
  IconPackageImport,
  IconTrash,
} from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { savedSceneArchiveUrl } from '@/lib/sceneArchive'

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
        {/* Mounted only while the dialog is open, so the field re-seeds itself
            from `initialName` on every open without an effect resetting it. */}
        <SaveSceneForm
          initialName={initialName}
          onSubmit={(name) => { onSubmit(name); onOpenChange(false) }}
        />
      </DialogContent>
    </Dialog>
  )
}

function SaveSceneForm({ initialName, onSubmit }: { initialName: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.select(), 80)
    return () => clearTimeout(id)
  }, [])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
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
  )
}

interface OpenSceneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpen: (meta: SavedSceneMeta) => void
  /** Restore a ZIP archive. Resolves once the imported scene is on the canvas. */
  onImport: (file: File) => Promise<void>
}

/** Picker that lists saved scenes and opens, exports, imports or deletes them. */
export function OpenSceneDialog({ open, onOpenChange, onOpen, onImport }: OpenSceneDialogProps) {
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
        {/* Mounted only while the dialog is open, so each open starts a fresh
            load instead of an effect re-seeding the list. */}
        <SceneList
          onOpen={(s) => { onOpen(s); onOpenChange(false) }}
          onImport={async (file) => { await onImport(file); onOpenChange(false) }}
        />
      </DialogContent>
    </Dialog>
  )
}

function SceneList({
  onOpen,
  onImport,
}: {
  onOpen: (meta: SavedSceneMeta) => void
  onImport: (file: File) => Promise<void>
}) {
  const [scenes, setScenes] = useState<SavedSceneMeta[]>([])
  // Starts true: this component only mounts when the dialog opens, and the
  // load below fires immediately — so the effect never sets state synchronously.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/scenes')
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((list: SavedSceneMeta[]) => { setScenes(list); setError(null) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id: string) => {
    try {
      const r = await fetch(`/api/scenes/${id}`, { method: 'DELETE' })
      if (!r.ok && r.status !== 204) throw new Error(`${r.status}`)
      setScenes((s) => s.filter((x) => x.id !== id))
    } catch {
      load()
    }
  }

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setError(null)
    try {
      await onImport(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
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
            <button onClick={() => onOpen(s)} className="flex-1 min-w-0 text-left">
              <span className="block truncate text-slate-200 font-light text-sm">{s.name}</span>
              <span className="block text-[11px] text-slate-500 font-light">{formatSaved(s.saved_at)}</span>
            </button>
            {/* Plain link: the browser downloads it straight from the endpoint,
                naming the file from the response's Content-Disposition. */}
            <a
              href={savedSceneArchiveUrl(s.id)}
              download
              title="Export as ZIP (scene + assets)"
              className="shrink-0 p-1.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-950/40 opacity-0 group-hover:opacity-100 transition"
            >
              <IconFileZip size={15} stroke={1.5} />
            </a>
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

      <div className="border-t border-slate-800/70 pt-3">
        <Button
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="w-full gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 font-light"
        >
          <IconPackageImport size={15} stroke={1.5} />
          {importing ? 'Importing…' : 'Import from ZIP…'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={importFile}
        />
      </div>
    </>
  )
}
