import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'

const ControllerPage = lazy(() =>
  import('./pages/ControllerPage').then((m) => ({ default: m.ControllerPage })),
)
const ProjectorPage = lazy(() =>
  import('./pages/ProjectorPage').then((m) => ({ default: m.ProjectorPage })),
)
const HealthPage = lazy(() => import('./pages/HealthPage'))
const WsTestPage = lazy(() => import('./pages/WsTestPage'))

function PageFallback() {
  return <div className="w-full h-dvh bg-slate-950" />
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/controller/:code" element={<ControllerPage />} />
        <Route path="/projector/:code" element={<ProjectorPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/ws-test" element={<WsTestPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
