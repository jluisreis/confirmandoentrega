import { useState } from 'react'
import Header from './components/Header'
import DataTable from './components/DataTable'
import Login from './components/Login'
import { lerSessao, limparSessao, type Sessao } from './lib/auth-store'

function App() {
  const [isDark, setIsDark] = useState(true)
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao())

  function handleLogout() {
    limparSessao()
    setSessao(null)
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300">
        {!sessao ? (
          <Login onEntrar={setSessao} />
        ) : (
          <>
            <Header
              isDark={isDark}
              onToggleTheme={() => setIsDark(!isDark)}
              sessao={sessao}
              onLogout={handleLogout}
            />
            <main className="p-4 lg:p-6 max-w-7xl mx-auto">
              <DataTable sessao={sessao} />
            </main>
          </>
        )}
      </div>
    </div>
  )
}

export default App
