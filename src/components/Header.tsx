import { Moon, Sun, LogOut, UserCircle2 } from 'lucide-react'
import type { Sessao } from '../lib/auth-store'

interface HeaderProps {
  isDark: boolean
  onToggleTheme: () => void
  sessao: Sessao
  onLogout: () => void
}

export default function Header({ isDark, onToggleTheme, sessao, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-800 dark:text-white leading-tight">Pedidos</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Gerencie as entregas</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 🔥 NOVO: mostra quem está logado */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300">
          <UserCircle2 className="w-4 h-4" />
          {sessao.usuario}
        </div>

        <button
          onClick={onToggleTheme}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Alternar tema"
        >
          {isDark ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-slate-600" />
          )}
        </button>

        {/* 🔥 NOVO: sair da sessão */}
        <button
          onClick={onLogout}
          className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  )
}
