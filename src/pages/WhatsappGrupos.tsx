import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  FiCheckCircle, FiAlertTriangle, FiRefreshCw,
  FiWifi, FiWifiOff, FiX,
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { ehGestor } from '../utils/homePath'
import { useToast } from '../contexts/ToastContext'
import wuzapiService, {
  type WhatsappTentativaItem,
  type WuzapiStatus,
} from '../services/wuzapiService'
import contractService from '../services/contractService'
import { telefoneComDdiValido } from '../components/WhatsappAutorizadosContrato'
import '../styles/WhatsappGrupos.css'

function mensagemErro(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: string; erro?: string } } })?.response?.data
  return data?.erro || data?.error || fallback
}

export default function WhatsappGrupos() {
  const { user } = useAuth()
  const { adicionarToast } = useToast()
  const gestor = ehGestor(user)
  const [status, setStatus] = useState<WuzapiStatus | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [conectando, setConectando] = useState(false)
  const [gerandoNova, setGerandoNova] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [tentativas, setTentativas] = useState<WhatsappTentativaItem[]>([])
  const [contratos, setContratos] = useState<{ id: string; numeroContrato: string }[]>([])
  const [autorizando, setAutorizando] = useState<WhatsappTentativaItem | null>(null)
  const [contractId, setContractId] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [podeEnviarPlanilha, setPodeEnviarPlanilha] = useState(true)
  const [podePedirRelatorio, setPodePedirRelatorio] = useState(true)
  const [erroTelefone, setErroTelefone] = useState('')
  const [salvando, setSalvando] = useState(false)

  const atualizarStatus = useCallback(async (silencioso = false) => {
    try {
      setStatus(await wuzapiService.status())
    } catch (error: unknown) {
      if (!silencioso) adicionarToast(mensagemErro(error, 'Erro ao verificar status WhatsApp'), 'error')
    }
  }, [adicionarToast])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [st, listaContratos] = await Promise.all([
        wuzapiService.status(),
        contractService.listar(),
      ])
      setStatus(st)
      setContratos(listaContratos.map((c) => ({ id: c.id, numeroContrato: c.numeroContrato })))
      if (gestor) setTentativas(await wuzapiService.listarTentativas())
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Erro ao carregar o WhatsApp'), 'error')
    } finally {
      setCarregando(false)
    }
  }, [adicionarToast, gestor])

  useEffect(() => { void carregar() }, [carregar])

  const logado = !!(status?.logado ?? status?.sessao?.loggedIn)
  useEffect(() => {
    if (!status?.configurado || logado) return
    const id = setInterval(() => atualizarStatus(true), 4000)
    return () => clearInterval(id)
  }, [status?.configurado, logado, atualizarStatus])

  useEffect(() => {
    if (!gestor) return
    const id = window.setInterval(() => {
      wuzapiService.listarTentativas().then(setTentativas).catch(() => undefined)
    }, 15000)
    return () => window.clearInterval(id)
  }, [gestor])

  const webhookUrl = useMemo(() => {
    if (status?.webhookUrl) return status.webhookUrl
    const vite = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
    let apiBase: string
    if (/^https?:\/\//i.test(vite)) apiBase = vite
    else if (window.location.port === '5175' || window.location.port === '5173') {
      apiBase = `${window.location.protocol}//${window.location.hostname}:3200/api`
    } else apiBase = `${window.location.origin}${vite.startsWith('/') ? vite : `/${vite}`}`
    return `${apiBase.replace(/\/+$/, '').replace(/\/api\/api$/i, '/api')}/wuzapi/webhook`
  }, [status?.webhookUrl])

  const handleConectar = async () => {
    setConectando(true)
    try {
      const r = await wuzapiService.connect()
      if (r.sucesso === false) adicionarToast(r.erro || 'Falha ao conectar', 'error')
      else {
        adicionarToast(r.message || 'Conexão iniciada — escaneie o QR', 'success')
        setStatus((prev) => (prev ? {
          ...prev,
          qrCode: r.qrCode ?? prev.qrCode,
          conectado: r.conectado ?? true,
          logado: r.logado ?? false,
          nomeInstancia: r.nomeInstancia ?? prev.nomeInstancia,
          numeroMascarado: r.numeroMascarado ?? prev.numeroMascarado,
          statusConexao: r.statusConexao ?? prev.statusConexao,
          alertaWebhook: r.alertaWebhook ?? null,
        } : prev))
        setTimeout(() => atualizarStatus(true), 2000)
      }
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Erro ao conectar WhatsApp'), 'error')
    } finally {
      setConectando(false)
    }
  }

  const aplicarRespostaConexao = (r: {
    qrCode?: string | null
    conectado?: boolean
    logado?: boolean
    nomeInstancia?: string | null
    numeroMascarado?: string
    statusConexao?: 'conectado' | 'deslogado'
    alertaWebhook?: string | null
  }) => {
    setStatus((prev) => (prev ? {
      ...prev,
      qrCode: r.qrCode ?? null,
      conectado: r.conectado ?? prev.conectado,
      logado: r.logado ?? false,
      nomeInstancia: r.nomeInstancia ?? prev.nomeInstancia,
      numeroMascarado: r.numeroMascarado ?? prev.numeroMascarado,
      statusConexao: r.statusConexao ?? prev.statusConexao,
      alertaWebhook: r.alertaWebhook ?? null,
    } : prev))
  }

  const handleNovaConexao = async () => {
    const digitado = window.prompt(
      'Isso cria outra instância deste projeto e encerra só a anterior dele. Digite NOVA CONEXAO para confirmar.',
    )
    if (digitado === null) return
    if (digitado !== 'NOVA CONEXAO') {
      adicionarToast('Confirmação não confere. Nada foi alterado.', 'error')
      return
    }
    setGerandoNova(true)
    try {
      const r = await wuzapiService.novaConexao()
      if (r.sucesso === false) {
        adicionarToast(r.erro || 'Falha ao gerar nova conexão', 'error')
      } else {
        adicionarToast(r.message || 'Nova conexão criada. Escaneie o QR.', 'success')
        aplicarRespostaConexao(r)
        setTimeout(() => atualizarStatus(true), 2000)
      }
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { erro?: string; error?: string } } })?.response?.data?.erro
        || (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao gerar nova conexão', 'error')
    } finally {
      setGerandoNova(false)
    }
  }

  const handleDesconectar = async () => {
    if (!window.confirm('Desconectar o WhatsApp deste sistema? Será preciso escanear o QR de novo.')) return
    setDesconectando(true)
    try {
      const r = await wuzapiService.disconnect()
      if (r.sucesso === false) adicionarToast(r.erro || 'Falha ao desconectar', 'error')
      else {
        adicionarToast(r.message || 'WhatsApp desconectado', 'success')
        setStatus((prev) => (prev ? { ...prev, conectado: false, logado: false, qrCode: null } : prev))
        setTimeout(() => atualizarStatus(true), 800)
      }
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Erro ao desconectar WhatsApp'), 'error')
    } finally {
      setDesconectando(false)
    }
  }

  const abrirAutorizar = (tentativa: WhatsappTentativaItem) => {
    setAutorizando(tentativa)
    setContractId(contratos[0]?.id || '')
    setNome(tentativa.nomePerfil || '')
    setTelefone(tentativa.telefone)
    setPodeEnviarPlanilha(tentativa.tipo === 'planilha')
    setPodePedirRelatorio(tentativa.tipo === 'relatorio')
    setErroTelefone('')
  }

  const confirmarAutorizar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!autorizando) return
    if (!contractId) {
      adicionarToast('Escolha o contrato', 'warning')
      return
    }
    if (!telefoneComDdiValido(telefone)) {
      setErroTelefone('Use DDI + DDD + número. Ex.: 5562999998888.')
      return
    }
    setSalvando(true)
    try {
      await wuzapiService.autorizarTentativa(autorizando.id, {
        contractId,
        nome: nome.trim() || autorizando.nomePerfil || 'WhatsApp',
        telefone: telefone.replace(/\D/g, ''),
        podeEnviarPlanilha,
        podePedirRelatorio,
      })
      adicionarToast('Pessoa autorizada no contrato', 'success')
      setAutorizando(null)
      setTentativas(await wuzapiService.listarTentativas())
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Erro ao autorizar'), 'error')
    } finally {
      setSalvando(false)
    }
  }

  const conectado = !!(status?.conectado ?? status?.sessao?.connected)
  const sessaoOk = conectado && logado
  const wuzapiOffline = !!(status?.wuzapiOffline)
  const aguardandoQr = !!(status?.configurado && conectado && !logado && !wuzapiOffline)
  const qrCode = status?.qrCode || null

  return (
    <div className="wa-grupos-container">
      <div className="wa-grupos-top">
        <div>
          <h2>WhatsApp do gestor</h2>
          <p className="wa-subtitle">
            O chatbot só atende em conversa privada com o número do chatbot.
            Quem não está autorizado no contrato não recebe resposta. A tentativa fica nesta lista.
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void carregar()} title="Recarregar">
          <FiRefreshCw size={14} />
        </button>
      </div>

      <p className="wa-aviso-exclusivo">Use um número de WhatsApp exclusivo deste projeto.</p>

      <div className={`wa-status-card ${status?.configurado ? (sessaoOk ? 'ok' : 'warn') : 'off'}`}>
        <div className="wa-status-icon">
          {sessaoOk ? <FiCheckCircle size={18} /> : <FiAlertTriangle size={18} />}
        </div>
        <div className="wa-status-body">
          <strong>
            {!status?.configurado
              ? 'WuzAPI não configurada'
              : wuzapiOffline
                ? 'WuzAPI offline'
                : status?.statusConexao === 'conectado' || sessaoOk
                  ? 'WhatsApp conectado e logado'
                  : aguardandoQr
                    ? 'Aguardando leitura do QR Code'
                    : 'WhatsApp deslogado'}
          </strong>
          <div className="wa-status-meta">
            {!status?.configurado
              ? 'Conecte o número do chatbot para a conversa privada.'
              : wuzapiOffline
                ? 'A WuzAPI está offline. Suba o serviço e clique em Conectar.'
                : (
                <>
                  {status?.nomeInstancia ? `Instância: ${status.nomeInstancia}` : 'Sem instância própria'}
                  {' · '}
                  {status?.statusConexao === 'conectado' || sessaoOk ? 'conectado' : 'deslogado'}
                  {status?.numeroMascarado ? ` · ${status.numeroMascarado}` : ''}
                  {status?.erroSessao && !wuzapiOffline ? ` · ${status.erroSessao}` : ''}
                </>
              )}
          </div>
          {status?.alertaWebhook && (
            <p className="wa-alerta-webhook">{status.alertaWebhook}</p>
          )}
          {status?.configurado && (
            <div className="wa-webhook">
              Webhook: <code>{webhookUrl}</code>
            </div>
          )}
          {status?.configurado && !wuzapiOffline && (
            <div className="wa-connect-row">
              <button
                type="button"
                className="btn-conectar"
                onClick={() => void handleConectar()}
                disabled={conectando || desconectando || gerandoNova}
              >
                <FiWifi size={15} />
                {conectando ? 'Conectando…' : 'Conectar'}
              </button>
              <button
                type="button"
                className="btn-nova-conexao"
                onClick={() => void handleNovaConexao()}
                disabled={conectando || desconectando || gerandoNova}
              >
                {gerandoNova ? 'Gerando…' : 'Gerar nova conexão'}
              </button>
              {(conectado || logado) && (
                <button
                  type="button"
                  className="btn-desconectar"
                  onClick={() => void handleDesconectar()}
                  disabled={conectando || desconectando || gerandoNova}
                  title="Encerrar sessão WhatsApp neste sistema"
                >
                  <FiWifiOff size={15} />
                  {desconectando ? 'Desconectando…' : 'Desconectar'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {aguardandoQr && (
        <div className="wa-qr-box">
          <h3>Escaneie o QR Code</h3>
          <p>No celular: <strong>WhatsApp → Aparelhos conectados → Conectar um aparelho</strong></p>
          {qrCode ? (
            <img src={qrCode} alt="QR Code WhatsApp" className="wa-qr-img" />
          ) : (
            <p className="wa-qr-wait">Gerando QR… clique em “Conectar” se não aparecer.</p>
          )}
          <p className="wa-qr-hint">O código atualiza sozinho a cada poucos segundos. Não feche esta página.</p>
        </div>
      )}

      {sessaoOk && (
        <div className="wa-ok-banner">
          <FiCheckCircle size={16} /> Número do chatbot logado. A conversa privada já pode receber planilha e pedido de relatório de quem estiver autorizado.
        </div>
      )}

      <div className="wa-recebimentos">
        <div className="wa-picker-hd">
          <strong>Tentativas não autorizadas</strong>
          <span>Conversa privada com o número do chatbot</span>
        </div>
        {carregando ? (
          <p className="wa-picker-empty">Carregando…</p>
        ) : tentativas.length === 0 ? (
          <p className="wa-picker-empty">Nenhuma tentativa de planilha ou relatório sem autorização.</p>
        ) : (
          <div className="wa-tabela-wrap">
            <table className="wa-tabela">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Telefone</th>
                  <th>Nome do perfil</th>
                  <th>Tipo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tentativas.map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.criadoEm).toLocaleString('pt-BR')}</td>
                    <td><code className="wa-jid">{t.telefone}</code></td>
                    <td>{t.nomePerfil || '—'}</td>
                    <td><span className="wa-pill on">{t.tipo === 'planilha' ? 'Planilha' : 'Relatório'}</span></td>
                    <td>
                      <button type="button" className="btn-novo" onClick={() => abrirAutorizar(t)}>Autorizar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {autorizando && (
        <div className="wa-modal-overlay" onClick={() => setAutorizando(null)}>
          <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wa-modal-hd">
              <h3>Autorizar pessoa</h3>
              <button type="button" onClick={() => setAutorizando(null)} aria-label="Fechar"><FiX size={16} /></button>
            </div>
            <form onSubmit={(e) => void confirmarAutorizar(e)}>
              <label>Contrato
                <select value={contractId} onChange={(e) => setContractId(e.target.value)} required>
                  <option value="">Selecione</option>
                  {contratos.map((c) => <option key={c.id} value={c.id}>{c.numeroContrato}</option>)}
                </select>
              </label>
              <label>Nome
                <input value={nome} onChange={(e) => setNome(e.target.value)} />
              </label>
              <label>Telefone com DDI
                <input value={telefone} onChange={(e) => { setTelefone(e.target.value); setErroTelefone('') }} inputMode="numeric" required />
              </label>
              {erroTelefone && <p className="wa-erro-telefone">{erroTelefone}</p>}
              <label className="wa-check">
                <input type="checkbox" checked={podeEnviarPlanilha} onChange={(e) => setPodeEnviarPlanilha(e.target.checked)} />
                Envia planilha
              </label>
              <label className="wa-check">
                <input type="checkbox" checked={podePedirRelatorio} onChange={(e) => setPodePedirRelatorio(e.target.checked)} />
                Pede relatório
              </label>
              <div className="wa-modal-ft">
                <button type="button" className="btn-ghost" onClick={() => setAutorizando(null)}>Cancelar</button>
                <button type="submit" className="btn-novo" disabled={salvando}>{salvando ? 'Salvando…' : 'Autorizar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
