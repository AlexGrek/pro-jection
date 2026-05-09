import { Link } from 'react-router-dom'

function App() {
  return (
    <main className="p-8 max-w-2xl mx-auto font-sans">
      <h1 className="text-3xl font-semibold mb-2">pro-jection</h1>
      <p className="text-gray-600 mb-6">
        React SPA served by the Rust/axum backend.
      </p>
      <ul className="space-y-2">
        <li>
          <Link className="text-blue-600 underline" to="/health">
            Health
          </Link>
        </li>
        <li>
          <Link className="text-blue-600 underline" to="/ws-test">
            WebSocket echo test
          </Link>
        </li>
      </ul>
    </main>
  )
}

export default App
