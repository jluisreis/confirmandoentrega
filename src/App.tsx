import { useState } from 'react'
import Header from './components/Header'
import DataTable from './components/DataTable'
<<<<<<< HEAD
import Login from './components/Login'
import { lerSessao, limparSessao, type Sessao } from './lib/auth-store'

function App() {
  const [isDark, setIsDark] = useState(true)
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao())

  function handleLogout() {
    limparSessao()
    setSessao(null)
  }
=======

function App() {
  const [isDark, setIsDark] = useState(true)
>>>>>>> 52a6073d71e3acf843ec724f9fd5cb1555860101

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300">
<<<<<<< HEAD
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
=======
        <Header
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
        />
        <main className="p-4 lg:p-6 max-w-7xl mx-auto">
          <DataTable />
        </main>
>>>>>>> 52a6073d71e3acf843ec724f9fd5cb1555860101
      </div>
    </div>
  )
}

export default App
