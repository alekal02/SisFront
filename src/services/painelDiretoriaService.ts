import api from './api'
import type { CardDiretoria } from '../utils/painelDiretoria'

export interface LinhaServicoFinanceiro {
  id: string
  nome: string
  quantidade: number | null
  unidade: string
  tarifa: number | null
  reais: number | null
  meta?: number | null
}

export interface LinhaTipoFinanceiro {
  tipo: string
  toneladas: number | null
  tarifa: number | null
  reais: number | null
}

export interface VisaoFinanceira {
  card: CardDiretoria
  projecao: number | null
  rsDia: number | null
  rsTon: number | null
  tarifaCadastrada: number | null
  servicos: LinhaServicoFinanceiro[]
  tipos: LinhaTipoFinanceiro[]
  custoGlosa: string
  divergencias: Array<{ campo: string; noContrato: number; noServico: number }>
}

export async function carregarPainelDiretoria(): Promise<CardDiretoria[]> {
  const { data } = await api.get<{ cards: CardDiretoria[] }>('/painel/diretoria')
  return data.cards || []
}

export async function carregarVisaoFinanceira(contractId: string): Promise<VisaoFinanceira> {
  const { data } = await api.get<VisaoFinanceira>(`/painel/contrato/${contractId}`)
  return data
}
