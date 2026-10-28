import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import { useToast } from '../contexts/ToastContext'
import wuzapiService, { type WhatsappAutorizadoItem } from '../services/wuzapiService'
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

  const abrirNovo = () => {
    setEditandoId(null)
    setForm(formVazio)
    setErroTelefone('')
    setModal(true)
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
          <div className="wa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wa-modal-hd">
              <h3>{editandoId ? 'Editar pessoa' : 'Autorizar pessoa'}</h3>
              <button type="button" onClick={() => setModal(false)} aria-label="Fechar"><FiX size={16} /></button>
            </div>
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
          </div>
        </div>
      )}
    </section>
  )
}
