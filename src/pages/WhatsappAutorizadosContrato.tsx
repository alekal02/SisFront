import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { isAdminOuSuper } from '../utils/homePath'
import wuzapiService, {
  type PessoaWhatsappAgenda,
  type WhatsappGrupoMapaItem,
} from '../services/wuzapiService'
import '../styles/WhatsappGrupos.css'

type AbaPessoa = 'contatos' | 'grupos' | 'digitar'

interface Props {
  contractId: string
}

function mensagemErro(error: unknown, fallback: string): string {
  const resposta = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
  return resposta || fallback
}

/** (62) 9****-8888 — o número completo não aparece na lista. */
export function mascararTelefoneLista(telefone: string): string {
  const d = String(telefone || '').replace(/\D/g, '')
  if (/^55\d{2}9\d{8}$/.test(d)) return `(${d.slice(2, 4)}) 9****-${d.slice(-4)}`
  if (/^55\d{2}\d{8}$/.test(d)) return `(${d.slice(2, 4)}) ****-${d.slice(-4)}`
  if (d.length >= 8) return `${d.slice(0, 2)}****${d.slice(-2)}`
  return '****'
}

function casaBusca(pessoa: PessoaWhatsappAgenda, termo: string): boolean {
  const texto = termo.trim().toLowerCase()
  if (!texto) return true
  if (pessoa.nome.toLowerCase().includes(texto)) return true
  const digitos = texto.replace(/\D/g, '')
  return !!digitos && pessoa.telefone.includes(digitos)
}

export default function WhatsappAutorizadosContrato({ contractId }: Props) {
  const { user } = useAuth()
  const { adicionarToast } = useToast()
  const navigate = useNavigate()
  const [aba, setAba] = useState<AbaPessoa>('contatos')
  const [busca, setBusca] = useState('')
  const [contatos, setContatos] = useState<PessoaWhatsappAgenda[]>([])
  const [participantes, setParticipantes] = useState<PessoaWhatsappAgenda[]>([])
  const [grupos, setGrupos] = useState<WhatsappGrupoMapaItem[]>([])
  const [grupoJid, setGrupoJid] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [podeEnviarPlanilha, setPodeEnviarPlanilha] = useState(false)
  const [podePedirRelatorio, setPodePedirRelatorio] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')

  const podeAutorizar = isAdminOuSuper(user)

  const carregarContatos = useCallback(async () => {
    setCarregando(true)
    setAviso('')
    try {
      const lista = await wuzapiService.listarContatos(contractId)
      setContatos(lista)
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      const msg = mensagemErro(error, 'Não foi possível listar os contatos.')
      setContatos([])
      setAviso(msg)
      if (status !== 409) adicionarToast(msg, 'error')
    } finally {
      setCarregando(false)
    }
  }, [adicionarToast, contractId])

  const carregarGrupos = useCallback(async () => {
    try {
      const lista = await wuzapiService.listarGrupos()
      const doContrato = lista.filter((grupo) => grupo.contractId === contractId)
      setGrupos(doContrato)
      setGrupoJid((atual) => atual || doContrato[0]?.grupoJid || '')
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Não foi possível listar os grupos do contrato.'), 'error')
    }
  }, [adicionarToast, contractId])

  const carregarParticipantes = useCallback(async (jid: string) => {
    if (!jid) {
      setParticipantes([])
      return
    }
    setCarregando(true)
    setAviso('')
    try {
      const lista = await wuzapiService.listarParticipantes(contractId, jid)
      setParticipantes(lista)
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      const msg = mensagemErro(error, 'Não foi possível listar os participantes.')
      setParticipantes([])
      setAviso(msg)
      if (status !== 409) adicionarToast(msg, 'error')
    } finally {
      setCarregando(false)
    }
  }, [adicionarToast, contractId])

  useEffect(() => {
    if (!podeAutorizar || aba !== 'contatos') return
    void carregarContatos()
  }, [aba, carregarContatos, podeAutorizar])

  useEffect(() => {
    if (!podeAutorizar || aba !== 'grupos') return
    void carregarGrupos()
  }, [aba, carregarGrupos, podeAutorizar])

  useEffect(() => {
    if (!podeAutorizar || aba !== 'grupos' || !grupoJid) return
    void carregarParticipantes(grupoJid)
  }, [aba, carregarParticipantes, grupoJid, podeAutorizar])

  const origem = aba === 'grupos' ? participantes : contatos
  const visiveis = useMemo(
    () => origem.filter((pessoa) => casaBusca(pessoa, busca)),
    [origem, busca],
  )

  const alternar = (telefonePessoa: string, jaAutorizado: boolean) => {
    if (jaAutorizado) return
    setSelecionados((atual) => (
      atual.includes(telefonePessoa)
        ? atual.filter((item) => item !== telefonePessoa)
        : [...atual, telefonePessoa]
    ))
  }

  const trocarAba = (proxima: AbaPessoa) => {
    setAba(proxima)
    setBusca('')
    setSelecionados([])
    setAviso('')
  }

  const autorizarSelecionados = async () => {
    const pessoas = origem.filter((pessoa) => selecionados.includes(pessoa.telefone) && !pessoa.jaAutorizado)
    if (!pessoas.length) return
    setEnviando(true)
    try {
      const resultado = await wuzapiService.autorizarLote(contractId, pessoas.map((pessoa) => ({
        nome: pessoa.nome,
        telefone: pessoa.telefone,
        podeEnviarPlanilha,
        podePedirRelatorio,
      })))
      const criados = resultado.criados?.length || 0
      const ignorados = resultado.ignorados?.length || 0
      adicionarToast(
        criados
          ? `${criados} pessoa(s) autorizada(s)${ignorados ? `. ${ignorados} já estavam na lista` : ''}.`
          : 'Nenhuma pessoa nova. As selecionadas já estavam autorizadas.',
        criados ? 'success' : 'warning',
      )
      setSelecionados([])
      if (aba === 'contatos') await carregarContatos()
      if (aba === 'grupos' && grupoJid) await carregarParticipantes(grupoJid)
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Não foi possível autorizar as pessoas.'), 'error')
    } finally {
      setEnviando(false)
    }
  }

  const autorizarDigitado = async () => {
    const nomeLimpo = nome.trim()
    const telefoneLimpo = telefone.trim()
    if (!nomeLimpo || !telefoneLimpo) {
      adicionarToast('Informe o nome e o telefone com DDI.', 'warning')
      return
    }
    setEnviando(true)
    try {
      const resultado = await wuzapiService.autorizarLote(contractId, [{
        nome: nomeLimpo,
        telefone: telefoneLimpo,
        podeEnviarPlanilha,
        podePedirRelatorio,
      }])
      if (resultado.criados?.length) {
        adicionarToast(`${nomeLimpo} autorizado.`, 'success')
        setNome('')
        setTelefone('')
      } else {
        adicionarToast(resultado.ignorados?.[0]?.motivo || 'Esta pessoa já está autorizada.', 'warning')
      }
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Não foi possível autorizar a pessoa.'), 'error')
    } finally {
      setEnviando(false)
    }
  }

  if (!podeAutorizar) {
    return (
      <section className="wa-autorizar">
        <h2>Autorizar pessoa</h2>
        <p>Somente gestor ou administrador autoriza pessoas neste contrato.</p>
      </section>
    )
  }

  return (
    <section className="wa-autorizar">
      <header className="wa-autorizar-head">
        <div>
          <h2>Autorizar pessoa</h2>
          <p>Escolha na agenda ou no grupo. O número aparece mascarado.</p>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('/visao-geral?aba=whatsapp')}>
          Conexão e grupos
        </button>
      </header>

      <h3 className="wa-autorizar-sub">Adicionar pessoa</h3>
      <div className="wa-autorizar-abas" role="tablist" aria-label="Adicionar pessoa">
        <button type="button" role="tab" aria-selected={aba === 'contatos'} className={aba === 'contatos' ? 'is-on' : ''} onClick={() => trocarAba('contatos')}>
          Contatos do WhatsApp
        </button>
        <button type="button" role="tab" aria-selected={aba === 'grupos'} className={aba === 'grupos' ? 'is-on' : ''} onClick={() => trocarAba('grupos')}>
          Participantes do grupo
        </button>
        <button type="button" role="tab" aria-selected={aba === 'digitar'} className={aba === 'digitar' ? 'is-on' : ''} onClick={() => trocarAba('digitar')}>
          Digitar
        </button>
      </div>

      {aba !== 'digitar' && (
        <div className="wa-autorizar-lista">
          {aba === 'grupos' && (
            <label className="wa-autorizar-grupo">
              Grupo deste contrato
              <select
                value={grupoJid}
                onChange={(evento) => {
                  setGrupoJid(evento.target.value)
                  setSelecionados([])
                }}
              >
                {grupos.length === 0 && <option value="">Nenhum grupo mapeado</option>}
                {grupos.map((grupo) => (
                  <option key={grupo.id} value={grupo.grupoJid}>
                    {grupo.nomeGrupo || grupo.grupoJid}
                  </option>
                ))}
              </select>
            </label>
          )}

          <input
            className="wa-autorizar-busca"
            type="search"
            value={busca}
            placeholder="Buscar por nome ou número"
            onChange={(evento) => setBusca(evento.target.value)}
          />

          {aviso && <p className="wa-autorizar-aviso">{aviso}</p>}
          {carregando && <p className="wa-autorizar-aviso">Carregando…</p>}

          {!carregando && !aviso && visiveis.length === 0 && (
            <p className="wa-autorizar-aviso">Nenhuma pessoa encontrada.</p>
          )}

          <ul className="wa-autorizar-pessoas">
            {visiveis.map((pessoa) => {
              const marcado = selecionados.includes(pessoa.telefone)
              return (
                <li key={pessoa.telefone}>
                  <label>
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={!!pessoa.jaAutorizado}
                      onChange={() => alternar(pessoa.telefone, !!pessoa.jaAutorizado)}
                    />
                    <span className="wa-autorizar-nome">{pessoa.nome}</span>
                    <span className="wa-autorizar-fone">{mascararTelefoneLista(pessoa.telefone)}</span>
                    {pessoa.jaAutorizado && <span className="wa-autorizar-selo">já autorizado</span>}
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="wa-autorizar-permissoes">
            <label>
              <input type="checkbox" checked={podeEnviarPlanilha} onChange={(evento) => setPodeEnviarPlanilha(evento.target.checked)} />
              Envia planilha
            </label>
            <label>
              <input type="checkbox" checked={podePedirRelatorio} onChange={(evento) => setPodePedirRelatorio(evento.target.checked)} />
              Pede relatório
            </label>
            <button type="button" className="btn btn-primary" disabled={enviando || selecionados.length === 0} onClick={() => { void autorizarSelecionados() }}>
              Autorizar selecionados ({selecionados.length})
            </button>
          </div>
        </div>
      )}

      {aba === 'digitar' && (
        <form className="wa-autorizar-digitar" onSubmit={(evento) => { evento.preventDefault(); void autorizarDigitado() }}>
          <label>
            Nome
            <input value={nome} onChange={(evento) => setNome(evento.target.value)} autoComplete="name" />
          </label>
          <label>
            Telefone com DDI
            <input value={telefone} onChange={(evento) => setTelefone(evento.target.value)} inputMode="tel" placeholder="5562999998888" autoComplete="tel" />
          </label>
          <div className="wa-autorizar-permissoes">
            <label>
              <input type="checkbox" checked={podeEnviarPlanilha} onChange={(evento) => setPodeEnviarPlanilha(evento.target.checked)} />
              Envia planilha
            </label>
            <label>
              <input type="checkbox" checked={podePedirRelatorio} onChange={(evento) => setPodePedirRelatorio(evento.target.checked)} />
              Pede relatório
            </label>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              Autorizar
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
