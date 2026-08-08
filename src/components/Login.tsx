import { useState, type FormEvent } from 'react'
import { LogIn, Loader2, AlertCircle, Lock, User } from 'lucide-react'
import { login, isConfigured, type LoginResult } from '../lib/pedidos-api'
import { salvarSessao, type Sessao } from '../lib/auth-store'

// Lista fixa de usuários da aba LOGIN — evita erro de digitação no campo usuário.
const USUARIOS = ['ADMINISTRACAO', 'JULIO', 'VICTOR', 'FELIPE', 'PAULO FELIPE', 'DADA']

interface LoginProps {
  onEntrar: (sessao: Sessao) => void
}

export default function Login({ onEntrar }: LoginProps) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!usuario || !senha) {
      setErro('Selecione o usuário e informe a senha.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const resultado: LoginResult = await login(usuario, senha)
      const sessao: Sessao = {
        usuario: resultado.usuario,
        responsavel: resultado.responsavel,
        isAdmin: resultado.isAdmin,
        responsaveisDisponiveis: resultado.responsaveisDisponiveis,
      }
      salvarSessao(sessao)
      onEntrar(sessao)
    } catch (err) {
      setErro((err as Error).message || 'Usuário ou senha inválidos.')
    } finally {
      setCarregando(false)
    }
  }

  if (!isConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-sm w-full rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/50 p-6 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>Backend não configurado. Verifique as variáveis de ambiente.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5"
      >
        <div className="text-center space-y-1">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-600 flex items-center justify-center">
            <LogIn className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">Painel de Entregas</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Nobre Lar — entre para continuar</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Usuário
          </label>
          <select
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          >
            <option value="">Selecione...</option>
            {USUARIOS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Senha
          </label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>

        {erro && (
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={carregando}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
        >
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
