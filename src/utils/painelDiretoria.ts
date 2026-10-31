/**
 * Leitura do painel da diretoria.
 * Não recalcula a tarifa: usa o faturamento que a agregação de coleta já devolve
 * e esconde o fallback de R$ 80/t. Meta não existe no cadastro.
 */

export type LuzDiretoria = 'verde' | 'amarelo' | 'vermelho' | 'cinza' | 'sem-meta'

export interface TarifasColeta {
  geral: number | null
  mini: number | null
  truck: number | null
  toco: number | null
  basculante: number | null
  tem: boolean
}

export interface PontoCiclo {
  dia: number
  data: string
  valor: number
}

export interface CardDiretoria {
  id: string
  nome: string
  cicloLabel: string
  intervalo: string
  diasDecorridos: number
  diasCiclo: number
  temTarifa: boolean
  temPlanilha: boolean
  faturamento: number | null
  toneladas: number | null
  producaoTexto: string
  variacao: number | null
  variacaoProducao: number | null
  luz: LuzDiretoria
  serie: PontoCiclo[]
  tarifaUnica: number | null
  fatPorTipo: Record<string, number>
  tarifas: TarifasColeta
  erro?: string
}

const ORDEM_TIPO = ['MINI', 'TOCO', 'TRUCK', 'BASCULANTE']

export function numeroPositivo(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Serviço ativo manda. Senão, o contrato. R$ 80 não entra. */
export function tarifasColetaDe(
  config: Record<string, unknown> | null | undefined,
  contrato: {
    valorTonelada?: unknown
    valorMini?: unknown
    valorTruck?: unknown
    valorToco?: unknown
    valorBasculante?: unknown
  } | null | undefined,
): TarifasColeta {
  const fonte = config?.ativo === true ? config : (contrato || {})
  const geral = numeroPositivo(fonte.valorTonelada)
  let mini = numeroPositivo(fonte.valorMini)
  let truck = numeroPositivo(fonte.valorTruck)
  let toco = numeroPositivo(fonte.valorToco)
  let basculante = numeroPositivo(fonte.valorBasculante)
  if (geral) {
    mini = mini ?? geral
    truck = truck ?? geral
    toco = toco ?? geral
    basculante = basculante ?? geral
  }
  const tem = [geral, mini, truck, toco, basculante].some((v) => v != null)
  return { geral, mini, truck, toco, basculante, tem }
}

export function tarifaProducaoDe(config: Record<string, unknown> | null | undefined): number | null {
  if (config?.ativo !== true) return null
  return numeroPositivo(config.valorM2)
    ?? numeroPositivo(config.valorM2Manual)
    ?? numeroPositivo(config.valorM2Mecanizada)
    ?? numeroPositivo(config.valorKmLinear)
    ?? numeroPositivo(config.valorPorArvore)
    ?? numeroPositivo(config.valorPorEquipe)
    ?? numeroPositivo(config.valorPorUnidade)
}

/** Mesma escolha da agregação SQL, sem o fallback de R$ 80. */
export function tarifaUsadaNoTipo(tipo: string, tarifas: TarifasColeta): number | null {
  const t = tipo.toUpperCase()
  if (t.includes('MINI')) return tarifas.mini ?? tarifas.geral
  if (t.includes('TOCO')) return tarifas.toco ?? tarifas.geral
  if (t.includes('BASC')) return tarifas.basculante ?? tarifas.geral
  if (t.includes('TRUCK')) return tarifas.truck ?? tarifas.geral
  return tarifas.geral ?? tarifas.truck ?? tarifas.toco ?? tarifas.mini ?? tarifas.basculante
}

export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!(anterior > 0) || !Number.isFinite(atual)) return null
  return Math.round(((atual - anterior) / anterior) * 1000) / 10
}

/**
 * Verde só com meta cadastrada — hoje não existe, então não acende.
 * Cinza: sem tarifa. Vermelho: sem planilha ou variação pior que −15%.
 * Amarelo: variação entre −15% e −5%. Sem meta e variação melhor que −5%: semáforo apagado.
 */
export function semaforoDiretoria(opts: {
  temTarifa: boolean
  temPlanilha: boolean
  variacao: number | null
}): LuzDiretoria {
  if (!opts.temTarifa) return 'cinza'
  if (!opts.temPlanilha) return 'vermelho'
  if (opts.variacao == null) return 'amarelo'
  if (opts.variacao < -15) return 'vermelho'
  if (opts.variacao <= -5) return 'amarelo'
  return 'sem-meta'
}

export function fmtRs(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtNum(valor: number, casas = 2): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

export function fmtPct(valor: number): string {
  const sinal = valor > 0 ? '+' : ''
  return `${sinal}${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function fmtDataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  if (!dia || !mes || !ano) return iso
  return `${dia}/${mes}`
}

export interface ParteComposicao {
  tipo: string
  toneladas: number
  tarifa: number
  reais: number
}

export function partesPorTipo(
  fatPorTipo: Record<string, number>,
  tarifas: TarifasColeta,
): ParteComposicao[] {
  const linhas: ParteComposicao[] = []
  for (const [tipo, reais] of Object.entries(fatPorTipo)) {
    if (!(reais > 0)) continue
    const tarifa = tarifaUsadaNoTipo(tipo, tarifas)
    if (tarifa == null) continue
    linhas.push({
      tipo,
      toneladas: Math.round((reais / tarifa) * 100) / 100,
      tarifa,
      reais,
    })
  }
  return linhas.sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || b.reais - a.reais)
}

function ordemTipo(tipo: string): number {
  const t = tipo.toUpperCase()
  const idx = ORDEM_TIPO.findIndex((nome) => t.includes(nome))
  return idx === -1 ? ORDEM_TIPO.length : idx
}

export function textoComposicao(partes: ParteComposicao[], toneladas: number): string | null {
  if (!(toneladas > 0) || partes.length === 0) return null
  const tarifas = [...new Set(partes.map((p) => p.tarifa.toFixed(2)))]
  if (tarifas.length === 1) {
    return `${fmtNum(toneladas)} t × ${fmtRs(partes[0].tarifa)}`
  }
  return partes
    .map((p) => `${rotuloTipo(p.tipo)} ${fmtNum(p.toneladas)} t × ${fmtRs(p.tarifa)}`)
    .join(' · ')
}

export function rotuloTipo(tipo: string): string {
  const t = tipo.toUpperCase()
  if (t.includes('MINI')) return 'Mini'
  if (t.includes('TOCO')) return 'Toco'
  if (t.includes('TRUCK')) return 'Truck'
  if (t.includes('BASC')) return 'Basculante'
  if (t.includes('NÃO') || t.includes('NAO') || t.includes('INFORM')) return 'Não informado'
  return tipo
}

export function tarifaUnicaDe(partes: ParteComposicao[]): number | null {
  if (partes.length === 0) return null
  const tarifas = [...new Set(partes.map((p) => p.tarifa.toFixed(2)))]
  return tarifas.length === 1 ? partes[0].tarifa : null
}

export function projetarFechamento(realizado: number, diasDecorridos: number, diasCiclo: number): number | null {
  if (!(realizado > 0) || !(diasDecorridos > 0) || !(diasCiclo > 0)) return null
  return Math.round((realizado / diasDecorridos) * diasCiclo * 100) / 100
}

export function ordenarRanking<T extends { nome: string; variacaoProducao: number | null }>(cards: T[]): T[] {
  const com = cards.filter((c) => c.variacaoProducao != null)
  const sem = cards.filter((c) => c.variacaoProducao == null)
  com.sort((a, b) => (b.variacaoProducao! - a.variacaoProducao!) || a.nome.localeCompare(b.nome, 'pt-BR'))
  sem.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return [...com, ...sem]
}

export const CORES_CONTRATO = [
  '#1a73e8',
  '#1e8e3e',
  '#e37400',
  '#9334e6',
  '#12b5cb',
  '#d93025',
  '#174ea6',
  '#188038',
  '#c5221f',
  '#7b1fa2',
  '#5f6368',
]
