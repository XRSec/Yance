import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [healthInfo, setHealthInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:8080/api/health')
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      setHealthInfo(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Yance AI Dashboard</h1>
      
      <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', marginTop: '1rem' }}>
        <h2>Server Health</h2>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: 'red' }}>Error connecting to server: {error}</p>}
        {healthInfo && (
          <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {JSON.stringify(healthInfo, null, 2)}
          </pre>
        )}
        <button onClick={fetchHealth} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Refresh
        </button>
      </div>
    </div>
  )
}

export default App
