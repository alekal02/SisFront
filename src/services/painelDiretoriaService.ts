import api from './api'
import contractService, { type ContratoDetalhe, type ContratoSaude } from './contractService'
import servicoService from './servicoService'
import {
  calcularCicloMensalContrato,
  inferirMesReferenciaAtual,
  listarDatasIntervalo,
  montarJanelasComparativoCiclo,
} from '@sistemma/shared'
import {
  partesPorTipo,
  semaforoDiretoria,
  tarifasColetaDe,
  tarifaProducaoDe,
  tarifaUnicaDe,
  variacaoPercentual,
  type CardDiretoria,
  type PontoCiclo,
} from '../utils/painelDiretoria'

interface ServicoLista {
  id: string
  nome: string
  tipo: string
  configFaturamento?: unknown
}

interface ResumoAgg {
  registros: number
  pesoTotalTon: number
  faturamento: number
  fatPorTipo?: Record<string, number>
}

let cacheCards: CardDiretoria[] | null = null
let cacheEm = 0
const TTL_MS = 60_000

export function lerCachePainel(): CardDiretoria[] | null {
  if (!cacheCards || Date.now() - cacheEm > TTL_MS) return null
  return cacheCards
}

async function mapaLimite<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length)
  let cursor = 0
  async function worker() {
    while (cursor < itens.length) {
      const i = cursor
      cursor += 1
      saida[i] = await fn(itens[i])
    }
  }
  const n = Math.max(1, Math.min(limite, itens.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return saida
}

function comoConfig(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object') return null
  return valor as Record<string, unknown>
}

function cardVazio(
  saude: ContratoSaude,
  extra: Partial<CardDiretoria> = {},
): CardDiretoria {
  return {
    id: saude.id,
    nome: saude.numeroContrato,
    cicloLabel: '',
    intervalo: '',
    diasDecorridos: 0,
    diasCiclo: 0,
    temTarifa: false,
    temPlanilha: false,
    faturamento: null,
    toneladas: null,
    producaoTexto: '—',
    variacao: null,
    variacaoProducao: null,
    luz: 'cinza',
    serie: [],
    tarifaUnica: null,
    fatPorTipo: {},
    tarifas: { geral: null, mini: null, truck: null, toco: null, basculante: null, tem: false },
    ...extra,
  }
}

async function agregar(
  contractId: string,
  servicoId: string,
  dataInicio: string,
  dataFim: string,
): Promise<ResumoAgg | null> {
  const { data } = await api.get(
    `/contracts/${contractId}/servicos/${servicoId}/coleta/agregacao`,
    { params: { dataInicio, dataFim, topN: 5 } },
  )
  return (data?.resumo || null) as ResumoAgg | null
}

async function resumoPorDia(
  contractId: string,
  servicoId: string,
  dataInicio: string,
  dataFim: string,
): Promise<{ dias: Array<{ data: string; pesoTotalTon?: number }>; totais: Record<string, number> }> {
  const { data } = await api.get(
    `/contracts/${contractId}/servicos/${servicoId}/resumo-ciclo-por-dia`,
    { params: { dataInicio, dataFim } },
  )
  return {
    dias: data?.dias || [],
    totais: data?.totais || {},
  }
}

function serieDoCiclo(
  diasApi: Array<{ data: string; pesoTotalTon?: number }>,
  datas: string[],
  faturamento: number | null,
  toneladas: number | null,
): PontoCiclo[] {
  const porData = new Map(diasApi.map((d) => [d.data, Number(d.pesoTotalTon || 0)]))
  const fator = faturamento != null && toneladas != null && toneladas > 0
    ? faturamento / toneladas
    : 0
  return datas.map((data, i) => {
    const ton = porData.get(data) || 0
    const valor = fator > 0 ? Math.round(ton * fator * 100) / 100 : 0
    return { dia: i + 1, data, valor }
  })
}

async function montarCard(saude: ContratoSaude): Promise<CardDiretoria> {
  try {
    const [detalhe, servicos] = await Promise.all([
      contractService.buscar(saude.id),
      servicoService.listarServicosContrato(saude.id) as Promise<ServicoLista[]>,
    ])
    const dia = detalhe.diaInicioCiclo ?? saude.diaInicioCiclo ?? 1
    const ref = inferirMesReferenciaAtual(dia)
    const ciclo = calcularCicloMensalContrato(ref.ano, ref.mes, dia)
    const janela = montarJanelasComparativoCiclo(ciclo)
    const datas = listarDatasIntervalo(janela.atual.dataInicio, janela.atual.dataFim)
    const coleta = servicos.find((s) => s.tipo === 'coleta_caminhao')
    const tarifas = coleta
      ? tarifasColetaDe(comoConfig(coleta.configFaturamento), detalhe)
      : { geral: null, mini: null, truck: null, toco: null, basculante: null, tem: false }
    const base = cardVazio(saude, {
      cicloLabel: ciclo.label,
      intervalo: `${janela.atual.dataInicio}–${ciclo.dataFim}`,
      diasDecorridos: janela.diasDecorridos,
      diasCiclo: janela.diasCicloCompleto,
      temTarifa: tarifas.tem,
      tarifas,
    })

    if (!coleta || janela.diasDecorridos <= 0) {
      base.luz = semaforoDiretoria({
        temTarifa: tarifas.tem,
        temPlanilha: false,
        variacao: null,
      })
      base.serie = datas.map((data, i) => ({ dia: i + 1, data, valor: 0 }))
      return base
    }

    const [atual, anterior, resumo] = await Promise.all([
      agregar(saude.id, coleta.id, janela.atual.dataInicio, janela.atual.dataFim),
      agregar(saude.id, coleta.id, janela.anterior.dataInicio, janela.anterior.dataFim),
      resumoPorDia(saude.id, coleta.id, janela.atual.dataInicio, janela.atual.dataFim),
    ])

    const toneladas = Number(atual?.pesoTotalTon || 0)
    const toneladasAnt = Number(anterior?.pesoTotalTon || 0)
    const temPlanilha = Number(atual?.registros || 0) > 0 || toneladas > 0
    const fatApi = Number(atual?.faturamento || 0)
    const fatAnt = Number(anterior?.faturamento || 0)
    const faturamento = tarifas.tem && temPlanilha ? fatApi : null
    const variacaoFat = faturamento != null ? variacaoPercentual(fatApi, fatAnt) : null
    const variacaoTon = variacaoPercentual(toneladas, toneladasAnt)
    const variacao = tarifas.tem ? variacaoFat : variacaoTon
    const fatPorTipo = atual?.fatPorTipo || {}
    const partes = partesPorTipo(fatPorTipo, tarifas)

    return {
      ...base,
      temPlanilha,
      faturamento,
      toneladas: temPlanilha ? toneladas : null,
      producaoTexto: temPlanilha
        ? `${toneladas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t`
        : '—',
      variacao,
      variacaoProducao: temPlanilha && toneladas > 0 ? variacaoTon : null,
      luz: semaforoDiretoria({ temTarifa: tarifas.tem, temPlanilha, variacao }),
      serie: serieDoCiclo(resumo.dias || [], datas, faturamento, toneladas),
      tarifaUnica: tarifaUnicaDe(partes),
      fatPorTipo,
    }
  } catch (error) {
    return cardVazio(saude, {
      erro: error instanceof Error ? error.message : 'Falha ao ler o contrato',
      luz: 'cinza',
    })
  }
}

export async function carregarPainelDiretoria(forcar = false): Promise<CardDiretoria[]> {
  if (!forcar) {
    const cache = lerCachePainel()
    if (cache) return cache
  }
  const saude = await contractService.listarSaude({ force: forcar })
  const cards = await mapaLimite(saude, 4, montarCard)
  cacheCards = cards
  cacheEm = Date.now()
  return cards
}

export async function carregarCardDiretoria(contractId: string): Promise<CardDiretoria | null> {
  const cache = lerCachePainel()
  const pronto = cache?.find((c) => c.id === contractId)
  if (pronto) return pronto
  const saude = await contractService.listarSaude()
  const item = saude.find((c) => c.id === contractId)
  if (!item) return null
  const card = await montarCard(item)
  cacheCards = (cacheCards || []).filter((c) => c.id !== contractId).concat(card)
  cacheEm = Date.now()
  return card
}

export interface LinhaServicoFinanceiro {
  id: string
  nome: string
  quantidade: number | null
  unidade: string
  tarifa: number | null
  reais: number | null
}

export interface LinhaTipoFinanceiro {
  tipo: string
  toneladas: number | null
  tarifa: number | null
  reais: number | null
}

function quantidadeDoResumo(
  tipo: string,
  totais: {
    pesoTotalTon?: number
    areaM2?: number
    metroLinear?: number
    kmLinear?: number
    qtdArvore?: number
    quantitativo?: number
  },
): { quantidade: number; unidade: string } {
  if (tipo === 'coleta_caminhao') return { quantidade: Number(totais.pesoTotalTon || 0), unidade: 't' }
  if (tipo === 'rocadeira') return { quantidade: Number(totais.areaM2 || 0), unidade: 'm²' }
  if (tipo === 'poda') return { quantidade: Number(totais.qtdArvore || 0), unidade: 'árvore' }
  if (tipo === 'remocao') return { quantidade: Number(totais.quantitativo || totais.qtdArvore || 0), unidade: 'equipe' }
  const km = Number(totais.kmLinear || 0)
  const metros = Number(totais.metroLinear || 0)
  if (km > 0) return { quantidade: km, unidade: 'km' }
  if (metros > 0) return { quantidade: metros, unidade: 'm' }
  return { quantidade: Number(totais.quantitativo || 0), unidade: 'un' }
}

export async function carregarLinhasFinanceiras(
  card: CardDiretoria,
): Promise<{ servicos: LinhaServicoFinanceiro[]; tipos: LinhaTipoFinanceiro[] }> {
  const detalhe: ContratoDetalhe = await contractService.buscar(card.id)
  const servicos = await servicoService.listarServicosContrato(card.id) as ServicoLista[]
  const dia = detalhe.diaInicioCiclo ?? 1
  const ref = inferirMesReferenciaAtual(dia)
  const ciclo = calcularCicloMensalContrato(ref.ano, ref.mes, dia)
  const janela = montarJanelasComparativoCiclo(ciclo)

  const linhas = await mapaLimite(servicos, 4, async (servico): Promise<LinhaServicoFinanceiro | null> => {
    if (janela.diasDecorridos <= 0) return null
    try {
      const resumo = await resumoPorDia(
        card.id,
        servico.id,
        janela.atual.dataInicio,
        janela.atual.dataFim,
      )
      const q = quantidadeDoResumo(servico.tipo, resumo.totais || {})
      if (!(q.quantidade > 0)) return null
      if (servico.tipo === 'coleta_caminhao') {
        return {
          id: servico.id,
          nome: servico.nome,
          quantidade: q.quantidade,
          unidade: 't',
          tarifa: card.tarifaUnica,
          reais: card.temTarifa ? card.faturamento : null,
        }
      }
      const tarifa = tarifaProducaoDe(comoConfig(servico.configFaturamento))
      return {
        id: servico.id,
        nome: servico.nome,
        quantidade: q.quantidade,
        unidade: q.unidade,
        tarifa,
        reais: tarifa != null ? Math.round(q.quantidade * tarifa * 100) / 100 : null,
      }
    } catch {
      return null
    }
  })

  const tipos: LinhaTipoFinanceiro[] = partesPorTipo(card.fatPorTipo, card.tarifas).map((p) => ({
    tipo: p.tipo,
    toneladas: p.toneladas,
    tarifa: p.tarifa,
    reais: p.reais,
  }))
  return {
    servicos: linhas.filter((l): l is LinhaServicoFinanceiro => l != null),
    tipos,
  }
}
