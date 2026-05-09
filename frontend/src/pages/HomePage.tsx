import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconDeviceGamepad2, IconPresentation } from '@tabler/icons-react'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { CodeInput } from '@/components/CodeInput'

type Mode = 'controller' | 'projector' | null

const modes = [
  {
    id: 'controller' as const,
    label: 'Controller',
    description: 'Control the projection session',
    icon: IconDeviceGamepad2,
    hoverClass: 'hover:border-blue-500 hover:bg-blue-950/30 hover:shadow-[inset_0_0_40px_rgba(59,130,246,0.06),0_0_16px_rgba(59,130,246,0.12)]',
  },
  {
    id: 'projector' as const,
    label: 'Projector',
    description: 'Display the projection output',
    icon: IconPresentation,
    hoverClass: 'hover:border-purple-500 hover:bg-purple-950/30 hover:shadow-[inset_0_0_40px_rgba(168,85,247,0.06),0_0_16px_rgba(168,85,247,0.12)]',
  },
]

export function HomePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(null)

  const handleCodeComplete = (code: string) => {
    navigate(`/${mode}/${code}`)
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-950 to-slate-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <p className="text-slate-500 text-sm font-light tracking-widest uppercase">welcome to</p>
            <h1 className="text-6xl font-thin text-white tracking-tight">pro-jection</h1>
            <p className="text-slate-400 font-light">Select your mode to get started</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {modes.map(({ id, label, description, icon: Icon, hoverClass }) => (
              <Card
                key={id}
                role="button"
                tabIndex={0}
                className={`cursor-pointer border-slate-800 bg-slate-900/60 backdrop-blur transition-all duration-300 ${hoverClass}`}
                onClick={() => setMode(id)}
                onKeyDown={(e) => e.key === 'Enter' && setMode(id)}
              >
                <div className="flex items-center gap-4 px-6 py-2">
                  <Icon size={36} stroke={1} className="text-slate-300 shrink-0" />
                  <div>
                    <CardTitle className="text-white font-light text-xl">{label}</CardTitle>
                    <CardDescription className="text-slate-500 font-light mt-0.5">{description}</CardDescription>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <footer className="bg-black px-6 py-3 text-center">
        <span className="text-slate-500 text-xs tracking-[0.25em]" style={{ fontVariant: 'small-caps' }}>
          alexgr studios
        </span>
      </footer>

      <CodeInput
        open={mode !== null}
        onOpenChange={(open) => { if (!open) setMode(null) }}
        onCodeComplete={handleCodeComplete}
        title={mode === 'controller' ? 'Controller Code' : 'Projector Code'}
      />
    </main>
  )
}
