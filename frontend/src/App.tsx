import { Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ControllerPage } from './pages/ControllerPage'
import { ProjectorPage } from './pages/ProjectorPage'
import HealthPage from './pages/HealthPage'
import WsTestPage from './pages/WsTestPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/controller/:code" element={<ControllerPage />} />
      <Route path="/projector/:code" element={<ProjectorPage />} />
      <Route path="/health" element={<HealthPage />} />
      <Route path="/ws-test" element={<WsTestPage />} />
    </Routes>
  )
}

export default App
