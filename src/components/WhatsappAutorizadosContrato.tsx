import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import { useToast } from '../contexts/ToastContext'
import wuzapiService, {
  type PessoaWhatsappAgenda,
  type WhatsappAutorizadoItem,
  type WhatsappGrupoMapaItem,
} from '../services/wuzapiService'
import '../styles/WhatsappGrupos.css'

function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function telefoneComDdiValido(valor: string): boolean {
  return /^55[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(soDigitos(valor))
}

function formatarTelefone(digitos: string): string {
  if (digitos.length === 13) {
    return `+${digitos.slice(0, 2)} (${digitos.slice(2, 4)}) ${digitos.slice(4, 9)}-${digitos.slice(9)}`
  }
  if (digitos.length === 12) {
    return `+${digitos.slice(0, 2)} (${digitos.slice(2, 4)}) ${digitos.slice(4, 8)}-${digitos.slice(8)}`
  }
  return digitos
}

interface FormPessoa {
  nome: string
  telefone: string
  podeEnviarPlanilha: boolean
  podePedirRelatorio: boolean
  ativo: boolean
}

type AbaPessoa = 'contatos' | 'grupos' | 'digitar'

function mensagemErro(error: unknown, fallback: string): string {
  const resposta = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
  return resposta || fallback
}

/** (62) 9****-8888 — o número completo não aparece na lista. */
function mascararTelefoneLista(telefone: string): string {
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

const formVazio: FormPessoa = {
  nome: '',
  telefone: '',
  podeEnviarPlanilha: true,
  podePedirRelatorio: true,
  ativo: true,
}

export default function WhatsappAutorizadosContrato({ contractId }: { contractId: string }) {
  const { adicionarToast } = useToast()
  const [lista, setLista] = useState<WhatsappAutorizadoItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormPessoa>(formVazio)
  const [salvando, setSalvando] = useState(false)
  const [erroTelefone, setErroTelefone] = useState('')
  const [aba, setAba] = useState<AbaPessoa>('contatos')
  const [busca, setBusca] = useState('')
  const [contatos, setContatos] = useState<PessoaWhatsappAgenda[]>([])
  const [participantes, setParticipantes] = useState<PessoaWhatsappAgenda[]>([])
  const [grupos, setGrupos] = useState<WhatsappGrupoMapaItem[]>([])
  const [grupoJid, setGrupoJid] = useState('')
  const [carregandoAgenda, setCarregandoAgenda] = useState(false)
  const [avisoAgenda, setAvisoAgenda] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [lotePlanilha, setLotePlanilha] = useState(false)
  const [loteRelatorio, setLoteRelatorio] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setLista(await wuzapiService.listarAutorizados(contractId))
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao carregar pessoas do WhatsApp', 'error')
    } finally {
      setCarregando(false)
    }
  }, [adicionarToast, contractId])

  useEffect(() => { void carregar() }, [carregar])

  const carregarContatos = useCallback(async () => {
    setCarregandoAgenda(true)
    setAvisoAgenda('')
    try {
      setContatos(await wuzapiService.listarContatos(contractId))
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      const msg = mensagemErro(error, 'Não foi possível listar os contatos.')
      setContatos([])
      setAvisoAgenda(msg)
      if (status !== 409) adicionarToast(msg, 'error')
    } finally {
      setCarregandoAgenda(false)
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
    setCarregandoAgenda(true)
    setAvisoAgenda('')
    try {
      setParticipantes(await wuzapiService.listarParticipantes(contractId, jid))
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      const msg = mensagemErro(error, 'Não foi possível listar os participantes.')
      setParticipantes([])
      setAvisoAgenda(msg)
      if (status !== 409) adicionarToast(msg, 'error')
    } finally {
      setCarregandoAgenda(false)
    }
  }, [adicionarToast, contractId])

  useEffect(() => {
    if (!modal || editandoId || aba !== 'contatos') return
    void carregarContatos()
  }, [aba, carregarContatos, editandoId, modal])

  useEffect(() => {
    if (!modal || editandoId || aba !== 'grupos') return
    void carregarGrupos()
  }, [aba, carregarGrupos, editandoId, modal])

  useEffect(() => {
    if (!modal || editandoId || aba !== 'grupos' || !grupoJid) return
    void carregarParticipantes(grupoJid)
  }, [aba, carregarParticipantes, editandoId, grupoJid, modal])

  const origemAgenda = aba === 'grupos' ? participantes : contatos
  const visiveis = useMemo(
    () => origemAgenda.filter((pessoa) => casaBusca(pessoa, busca)),
    [origemAgenda, busca],
  )

  const abrirNovo = () => {
    setEditandoId(null)
    setForm(formVazio)
    setErroTelefone('')
    setAba('contatos')
    setBusca('')
    setSelecionados([])
    setAvisoAgenda('')
    setLotePlanilha(false)
    setLoteRelatorio(false)
    setModal(true)
  }

  const trocarAba = (proxima: AbaPessoa) => {
    setAba(proxima)
    setBusca('')
    setSelecionados([])
    setAvisoAgenda('')
  }

  const alternarSelecao = (telefonePessoa: string, jaAutorizado: boolean) => {
    if (jaAutorizado) return
    setSelecionados((atual) => (
      atual.includes(telefonePessoa)
        ? atual.filter((item) => item !== telefonePessoa)
        : [...atual, telefonePessoa]
    ))
  }

  const autorizarSelecionados = async () => {
    const pessoas = origemAgenda.filter((pessoa) => selecionados.includes(pessoa.telefone) && !pessoa.jaAutorizado)
    if (!pessoas.length) return
    setSalvando(true)
    try {
      const resultado = await wuzapiService.autorizarLote(contractId, pessoas.map((pessoa) => ({
        nome: pessoa.nome,
        telefone: pessoa.telefone,
        podeEnviarPlanilha: lotePlanilha,
        podePedirRelatorio: loteRelatorio,
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
      await carregar()
      if (aba === 'contatos') await carregarContatos()
      if (aba === 'grupos' && grupoJid) await carregarParticipantes(grupoJid)
    } catch (error: unknown) {
      adicionarToast(mensagemErro(error, 'Não foi possível autorizar as pessoas.'), 'error')
    } finally {
      setSalvando(false)
    }
  }

  const abrirEditar = (pessoa: WhatsappAutorizadoItem) => {
    setEditandoId(pessoa.id)
    setForm({
      nome: pessoa.nome,
      telefone: pessoa.telefone,
      podeEnviarPlanilha: pessoa.podeEnviarPlanilha,
      podePedirRelatorio: pessoa.podePedirRelatorio,
      ativo: pessoa.ativo,
    })
    setErroTelefone('')
    setModal(true)
  }

  const alternar = async (pessoa: WhatsappAutorizadoItem, campo: 'podeEnviarPlanilha' | 'podePedirRelatorio' | 'ativo') => {
    try {
      await wuzapiService.atualizarAutorizado(pessoa.id, { [campo]: !pessoa[campo] })
      setLista((atual) => atual.map((item) => (item.id === pessoa.id ? { ...item, [campo]: !item[campo] } : item)))
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao atualizar', 'error')
    }
  }

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (!form.nome.trim()) {
      adicionarToast('Informe o nome', 'warning')
      return
    }
    if (!telefoneComDdiValido(form.telefone)) {
      setErroTelefone('Use DDI + DDD + número. Ex.: 5562999998888.')
      return
    }
    setSalvando(true)
    try {
      const payload = {
        contractId,
        nome: form.nome.trim(),
        telefone: soDigitos(form.telefone),
        podeEnviarPlanilha: form.podeEnviarPlanilha,
        podePedirRelatorio: form.podePedirRelatorio,
        ativo: form.ativo,
      }
      if (editandoId) await wuzapiService.atualizarAutorizado(editandoId, payload)
      else await wuzapiService.criarAutorizado(payload)
      adicionarToast(editandoId ? 'Pessoa atualizada' : 'Pessoa autorizada', 'success')
      setModal(false)
      await carregar()
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao salvar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  const remover = async (pessoa: WhatsappAutorizadoItem) => {
    if (!window.confirm(`Remover ${pessoa.nome} deste contrato?`)) return
    try {
      await wuzapiService.removerAutorizado(pessoa.id)
      adicionarToast('Pessoa removida', 'success')
      await carregar()
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao remover', 'error')
    }
  }

  return (
    <section className="wa-grupos-container">
      <div className="wa-grupos-top">
        <div>
          <h2>WhatsApp deste contrato</h2>
          <p className="wa-subtitle">
            O chatbot só responde em conversa privada com o número do chatbot.
            Cadastre quem pode enviar planilha e quem pode pedir relatório.
          </p>
        </div>
        <button type="button" className="btn-novo" onClick={abrirNovo}>
          <FiPlus size={16} /> Adicionar pessoa
        </button>
      </div>

      {carregando ? (
        <p className="wa-empty">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="wa-empty-box">
          <p>Nenhuma pessoa autorizada neste contrato.</p>
          <button type="button" className="btn-novo" onClick={abrirNovo}>
            <FiPlus size={16} /> Cadastrar a primeira
          </button>
        </div>
      ) : (
        <div className="wa-tabela-wrap">
          <table className="wa-tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Envia planilha</th>
                <th>Pede relatório</th>
                <th>Ativo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((pessoa) => (
                <tr key={pessoa.id} className={!pessoa.ativo ? 'inativo' : ''}>
                  <td><strong>{pessoa.nome}</strong></td>
                  <td><code className="wa-jid">{formatarTelefone(pessoa.telefone)}</code></td>
                  <td>
                    <input type="checkbox" checked={pessoa.podeEnviarPlanilha} aria-label="Envia planilha" onChange={() => void alternar(pessoa, 'podeEnviarPlanilha')} />
                  </td>
                  <td>
                    <input type="checkbox" checked={pessoa.podePedirRelatorio} aria-label="Pede relatório" onChange={() => void alternar(pessoa, 'podePedirRelatorio')} />
                  </td>
                  <td>
                    <input type="checkbox" checked={pessoa.ativo} aria-label="Ativo" onChange={() => void alternar(pessoa, 'ativo')} />
                  </td>
                  <td className="wa-acoes">
                    <button type="button" title="Editar" onClick={() => abrirEditar(pessoa)}><FiEdit2 size={14} /></button>
                    <button type="button" title="Remover" className="danger" onClick={() => void remover(pessoa)}><FiTrash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="wa-modal-overlay" onClick={() => setModal(false)}>
          <div className={`wa-modal ${editandoId ? '' : 'wa-modal-larga'}`} onClick={(e) => e.stopPropagation()}>
            <div className="wa-modal-hd">
              <h3>{editandoId ? 'Editar pessoa' : 'Autorizar pessoa'}</h3>
              <button type="button" onClick={() => setModal(false)} aria-label="Fechar"><FiX size={16} /></button>
            </div>
            {!editandoId && (
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
            )}
            {!editandoId && aba !== 'digitar' && (
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
                {avisoAgenda && <p className="wa-autorizar-aviso">{avisoAgenda}</p>}
                {carregandoAgenda && <p className="wa-autorizar-aviso">Carregando…</p>}
                {!carregandoAgenda && !avisoAgenda && visiveis.length === 0 && (
                  <p className="wa-autorizar-aviso">Nenhuma pessoa encontrada.</p>
                )}
                <ul className="wa-autorizar-pessoas">
                  {visiveis.map((pessoa) => (
                    <li key={pessoa.telefone}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selecionados.includes(pessoa.telefone)}
                          disabled={!!pessoa.jaAutorizado}
                          onChange={() => alternarSelecao(pessoa.telefone, !!pessoa.jaAutorizado)}
                        />
                        <span className="wa-autorizar-nome">{pessoa.nome}</span>
                        <span className="wa-autorizar-fone">{mascararTelefoneLista(pessoa.telefone)}</span>
                        {pessoa.jaAutorizado && <span className="wa-autorizar-selo">já autorizado</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="wa-autorizar-permissoes">
                  <label>
                    <input type="checkbox" checked={lotePlanilha} onChange={(evento) => setLotePlanilha(evento.target.checked)} />
                    Envia planilha
                  </label>
                  <label>
                    <input type="checkbox" checked={loteRelatorio} onChange={(evento) => setLoteRelatorio(evento.target.checked)} />
                    Pede relatório
                  </label>
                  <button type="button" className="btn-novo" disabled={salvando || selecionados.length === 0} onClick={() => { void autorizarSelecionados() }}>
                    Autorizar selecionados ({selecionados.length})
                  </button>
                </div>
              </div>
            )}
            {(editandoId || aba === 'digitar') && (
            <form onSubmit={(e) => void salvar(e)}>
              <label>Nome
                <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required />
              </label>
              <label>Telefone com DDI
                <input
                  value={form.telefone}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, telefone: e.target.value }))
                    setErroTelefone('')
                  }}
                  placeholder="5562999998888"
                  inputMode="numeric"
                  required
                />
              </label>
              {erroTelefone && <p className="wa-erro-telefone">{erroTelefone}</p>}
              <label className="wa-check">
                <input
                  type="checkbox"
                  checked={form.podeEnviarPlanilha}
                  onChange={(e) => setForm((f) => ({ ...f, podeEnviarPlanilha: e.target.checked }))}
                />
                Envia planilha
              </label>
              <label className="wa-check">
                <input
                  type="checkbox"
                  checked={form.podePedirRelatorio}
                  onChange={(e) => setForm((f) => ({ ...f, podePedirRelatorio: e.target.checked }))}
                />
                Pede relatório
              </label>
              <label className="wa-check">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                />
                Ativo
              </label>
              <div className="wa-modal-ft">
                <button type="button" className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-novo" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
