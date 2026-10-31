import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import './MetasPrecosContrato.css'

interface ServicoMeta {
  id: string
  nome: string
  tipo: string
  configFaturamento?: Record<string, unknown> | null
}

interface Leitura {
  cicloInicio: string
  cicloLabel: string
  metaFaturamento: number | null
  metasProducao: Record<string, number>
  contrato: {
    valorTonelada: number | null
    valorMini: number | null
    valorTruck: number | null
    valorToco: number | null
    valorBasculante: number | null
  }
  servicos: ServicoMeta[]
}

const TIPOS_CAMINHAO = [
  ['valorMini', 'Mini'],
  ['valorToco', 'Toco'],
  ['valorTruck', 'Truck'],
  ['valorBasculante', 'Basculante'],
] as const

function texto(valor: unknown): string {
  if (valor == null || valor === '') return ''
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(n).replace('.', ',')
}

function numero(textoValor: string): number | null {
  const s = textoValor.trim()
  if (!s) return null
  let n: number
  if (s.includes(',') && s.includes('.')) {
    n = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(/,/g, ''))
  } else if (s.includes(',')) {
    n = Number(s.replace(',', '.'))
  } else {
    n = Number(s)
  }
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function camposDoServico(servico: ServicoMeta): Array<{ chave: string; rotulo: string }> {
  const nome = servico.nome || ''
  if (servico.tipo === 'coleta_caminhao') {
    return [
      { chave: 'valorMini', rotulo: 'R$/t mini' },
      { chave: 'valorToco', rotulo: 'R$/t toco' },
      { chave: 'valorTruck', rotulo: 'R$/t truck' },
      { chave: 'valorBasculante', rotulo: 'R$/t basculante' },
    ]
  }
  if (servico.tipo === 'rocadeira') {
    if (/manual/i.test(nome)) return [{ chave: 'valorM2Manual', rotulo: 'R$/m² manual' }]
    if (/mecan/i.test(nome)) return [{ chave: 'valorM2Mecanizada', rotulo: 'R$/m² mecanizada' }]
    return [
      { chave: 'valorM2Manual', rotulo: 'R$/m² manual' },
      { chave: 'valorM2Mecanizada', rotulo: 'R$/m² mecanizada' },
    ]
  }
  if (servico.tipo === 'poda') return [{ chave: 'valorPorArvore', rotulo: 'R$/árvore' }]
  if (servico.tipo === 'remocao') return [{ chave: 'valorPorEquipe', rotulo: 'R$/equipe' }]
  return [{ chave: 'valorKmLinear', rotulo: 'R$/km' }]
}

export default function MetasPrecosContrato({ contractId }: { contractId: string }) {
  const { isAdmin } = useAuth()
  const { adicionarToast } = useToast()
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [metaFat, setMetaFat] = useState('')
  const [metasProd, setMetasProd] = useState<Record<string, string>>({})
  const [precos, setPrecos] = useState<Record<string, Record<string, string>>>({})
  const [contratoPrecos, setContratoPrecos] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    api.get<Leitura>(`/painel/contrato/${contractId}/metas`)
      .then(({ data }) => {
        if (!vivo) return
        setLeitura(data)
        setMetaFat(texto(data.metaFaturamento))
        const metas: Record<string, string> = {}
        const tabela: Record<string, Record<string, string>> = {}
        for (const servico of data.servicos) {
          metas[servico.id] = texto(data.metasProducao?.[servico.id])
          const cfg = servico.configFaturamento || {}
          const linha: Record<string, string> = {}
          for (const campo of camposDoServico(servico)) linha[campo.chave] = texto(cfg[campo.chave])
          tabela[servico.id] = linha
        }
        setMetasProd(metas)
        setPrecos(tabela)
        setContratoPrecos({
          valorMini: texto(data.contrato.valorMini),
          valorToco: texto(data.contrato.valorToco),
          valorTruck: texto(data.contrato.valorTruck),
          valorBasculante: texto(data.contrato.valorBasculante),
          valorTonelada: texto(data.contrato.valorTonelada),
        })
      })
      .catch(() => { if (vivo) setErro('Não foi possível ler metas e preços.') })
    return () => { vivo = false }
  }, [contractId])

  const coleta = leitura?.servicos.find((s) => s.tipo === 'coleta_caminhao')
  const divergencias = useMemo(() => {
    if (!coleta) return []
    const doServico = precos[coleta.id] || {}
    const avisos: string[] = []
    for (const [chave, rotulo] of TIPOS_CAMINHAO) {
      const a = numero(contratoPrecos[chave] || '')
      const b = numero(doServico[chave] || '')
      if (a != null && b != null && a !== b) {
        avisos.push(`${rotulo}: contrato ${a.toLocaleString('pt-BR')} e serviço ${b.toLocaleString('pt-BR')}`)
      }
    }
    return avisos
  }, [coleta, contratoPrecos, precos])

  async function salvar() {
    if (!leitura || !isAdmin) return
    setSalvando(true)
    try {
      const metasProducao: Record<string, number | null> = {}
      const servicos = leitura.servicos.map((servico) => {
        metasProducao[servico.id] = numero(metasProd[servico.id] || '')
        const patch: Record<string, number | null> = {}
        for (const campo of camposDoServico(servico)) {
          patch[campo.chave] = numero(precos[servico.id]?.[campo.chave] || '')
        }
        return { id: servico.id, configFaturamento: patch }
      })
      const { data } = await api.put<Leitura>(`/painel/contrato/${contractId}/metas`, {
        cicloInicio: leitura.cicloInicio,
        metaFaturamento: numero(metaFat),
        metasProducao,
        contrato: {
          valorMini: numero(contratoPrecos.valorMini || ''),
          valorToco: numero(contratoPrecos.valorToco || ''),
          valorTruck: numero(contratoPrecos.valorTruck || ''),
          valorBasculante: numero(contratoPrecos.valorBasculante || ''),
          valorTonelada: numero(contratoPrecos.valorTonelada || ''),
        },
        servicos,
      })
      setLeitura(data)
      adicionarToast('Metas e preços gravados', 'success')
    } catch {
      adicionarToast('Não foi possível gravar', 'error')
    } finally {
      setSalvando(false)
    }
  }

  if (erro) return <p className="mp-nota">{erro}</p>
  if (!leitura) return <p className="mp-nota">Lendo metas e preços…</p>

  return (
    <section className="mp">
      <header className="mp-topo">
        <div>
          <h2>Metas e preços</h2>
          <p>{leitura.cicloLabel}. Sem preço, o painel mostra “sem preço” e deixa o valor fora da soma.</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </header>

      {!isAdmin && <p className="mp-nota">Só o administrador edita. Esta leitura é do ciclo cadastrado.</p>}

      <label className="mp-campo">
        Meta de faturamento do ciclo (R$)
        <input
          inputMode="decimal"
          disabled={!isAdmin}
          value={metaFat}
          onChange={(e) => setMetaFat(e.target.value)}
          placeholder="sem meta"
        />
      </label>

      {divergencias.length > 0 && (
        <p className="mp-aviso">
          O preço do contrato e o do serviço de coleta estão diferentes. A tela usa o do serviço.
          {' '}{divergencias.join(' · ')}
        </p>
      )}

      <h3>R$/t da coleta no contrato</h3>
      <div className="mp-grade">
        {TIPOS_CAMINHAO.map(([chave, rotulo]) => (
          <label key={chave} className="mp-campo">
            {rotulo}
            <input
              inputMode="decimal"
              disabled={!isAdmin}
              value={contratoPrecos[chave] || ''}
              onChange={(e) => setContratoPrecos((atual) => ({ ...atual, [chave]: e.target.value }))}
              placeholder="sem preço"
            />
          </label>
        ))}
      </div>

      {leitura.servicos.map((servico) => (
        <article key={servico.id} className="mp-servico">
          <h3>{servico.nome}</h3>
          <div className="mp-grade">
            <label className="mp-campo">
              Meta de produção do ciclo
              <input
                inputMode="decimal"
                disabled={!isAdmin}
                value={metasProd[servico.id] || ''}
                onChange={(e) => setMetasProd((atual) => ({ ...atual, [servico.id]: e.target.value }))}
                placeholder="sem meta"
              />
            </label>
            {camposDoServico(servico).map((campo) => (
              <label key={campo.chave} className="mp-campo">
                {campo.rotulo}
                <input
                  inputMode="decimal"
                  disabled={!isAdmin}
                  value={precos[servico.id]?.[campo.chave] || ''}
                  onChange={(e) => setPrecos((atual) => ({
                    ...atual,
                    [servico.id]: { ...(atual[servico.id] || {}), [campo.chave]: e.target.value },
                  }))}
                  placeholder="sem preço"
                />
              </label>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}
