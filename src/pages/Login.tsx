import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { homePath } from '../utils/homePath'
import { STORAGE_EMAIL } from '../utils/storage'
import { useAppVersion } from '../hooks/useAppVersion'
import '../styles/Login.css'

function mensagemErro(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    if (status === 429) return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
    if (status === 502 || status === 503 || status === 504 || err.code === 'ERR_NETWORK') {
      return 'Não foi possível falar com o servidor. Tente de novo em instantes.'
    }
    const data = err.response?.data as { error?: string } | undefined
    if (data?.error) return data.error
  }
  return 'Não foi possível entrar.'
}

export default function Login() {
  const { user, loading, login } = useAuth()
  const versaoLabel = useAppVersion()
  const emailRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState(() => localStorage.getItem(STORAGE_EMAIL) || '')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(() => Boolean(localStorage.getItem(STORAGE_EMAIL)))
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!loading && !user) emailRef.current?.focus()
  }, [loading, user])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Carregando…</p>
      </div>
    )
  }

  if (user) return <Navigate to={homePath(user)} replace />

  const enviar = async (event: FormEvent) => {
    event.preventDefault()
    setErro('')
    const emailLimpo = email.trim()
    if (!emailLimpo || !senha) {
      setErro('Informe o e-mail e a senha.')
      return
    }
    setCarregando(true)
    try {
      await login(emailLimpo, senha)
      if (lembrar) localStorage.setItem(STORAGE_EMAIL, emailLimpo)
      else localStorage.removeItem(STORAGE_EMAIL)
    } catch (err) {
      setErro(mensagemErro(err))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={(event) => { void enviar(event) }} noValidate>
        <div className="login-header">
          <div className="login-logo" aria-hidden="true">S</div>
          <h1>Sistemma</h1>
          <p>Entre com seu e-mail e senha.</p>
        </div>

        {erro && <p className="login-erro" role="alert">{erro}</p>}

        <label className="login-field" htmlFor="email">
          E-mail
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={carregando}
            required
          />
        </label>

        <label className="login-field" htmlFor="senha">
          Senha
          <span className="login-senha">
            <input
              id="senha"
              name="senha"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              disabled={carregando}
              required
            />
            <button
              type="button"
              className="login-mostrar"
              onClick={() => setMostrarSenha((atual) => !atual)}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? 'Ocultar' : 'Mostrar'}
            </button>
          </span>
        </label>

        <label className="login-lembrar">
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(event) => setLembrar(event.target.checked)}
            disabled={carregando}
          />
          Lembrar e-mail neste aparelho
        </label>

        <button type="submit" className="login-btn" disabled={carregando}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="login-footer">{versaoLabel}</p>
      </form>
    </div>
  )
}
