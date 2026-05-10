import type { ReactNode } from 'react'

export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 text-[10px] w-10 shrink-0">{label}</span>
      {children}
    </div>
  )
}
