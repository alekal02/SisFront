/** 401/404 de sessão: token antigo ou usuário que não existe mais. */
export function deveEncerrarSessao(
  status: number | undefined | null,
  url: string,
  mensagem?: string,
): boolean {
  const alvo = url.includes('/auth/me')
    || url.includes('/auth/refresh')
    || url.includes('/auth/entrar-contrato')
    || url.includes('/auth/sair-contrato')
  if (!alvo) return false
  if (status === 401) return true
  if (status !== 404) return false
  if (url.includes('/auth/entrar-contrato') && mensagem && /contrato não encontrado/i.test(mensagem)) {
    return false
  }
  return true
}
