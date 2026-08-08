/**
 * Persistência da sessão de login (localStorage).
 *
 * Guarda quem está logado no painel, para não precisar logar de novo a
 * cada vez que o app é aberto. Segue o mesmo padrão do offline-store.ts.
 */

export interface Sessao {
  usuario: string // ex.: "FELIPE", "ADMINISTRACAO"
  responsavel: string // nome gravado na coluna RESPONSAVEL ao confirmar entregas
  isAdmin: boolean
  /** só vem preenchido pro usuário ADMINISTRACAO — outros responsáveis que pode escolher */
  responsaveisDisponiveis: string[] | null
}

const SESSAO_KEY = 'auth:sessao:v1'

export function salvarSessao(sessao: Sessao): void {
  try {
    localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao))
  } catch {
    // localStorage indisponível — não é crítico, só não persiste entre sessões
  }
}

export function lerSessao(): Sessao | null {
  try {
    const raw = localStorage.getItem(SESSAO_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Sessao
  } catch {
    return null
  }
}

export function limparSessao(): void {
  try {
    localStorage.removeItem(SESSAO_KEY)
  } catch {
    // ignora
  }
}
