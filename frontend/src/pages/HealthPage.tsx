import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type HealthResponse = {
  status: string
  storage: boolean
  timestamp: string
  version: string
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main className="p-8 font-sans max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Health</h1>
      {error && <pre className="text-red-600">{error}</pre>}
      {data && (
        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
      <p className="mt-4">
        <Link className="text-blue-600 underline" to="/">← back</Link>
      </p>
    </main>
  )
}
