import api from './api'

export interface WuzapiStatus {
  configurado: boolean
  url: string | null
  tokenExiste: boolean
  webhookSecretExiste: boolean
  webhookUrl?: string
  conectado?: boolean
  logado?: boolean
  qrCode?: string | null
  nomeInstancia?: string | null
  instanciaPropria?: boolean
  statusConexao?: 'conectado' | 'deslogado'
  numeroMascarado?: string
  alertaWebhook?: string | null
  sessao?: {
    connected?: boolean
    loggedIn?: boolean
    jid?: string
    webhook?: string
    events?: string
  } | null
  mensagem?: string
  erroSessao?: string
  wuzapiOffline?: boolean
  wuzapiOnline?: boolean
}

export interface WhatsappGrupoMapaItem {
  id: string
  grupoJid: string
  nomeGrupo: string | null
  servicoId: string
  servicoNome: string | null
  contratoNome: string | null
  contractId?: string | null
  ativo: boolean
  estrategia: string
  responderPdf: boolean
  criadoEm: string
}

export interface PessoaWhatsappAgenda {
  nome: string
  telefone: string
  jaAutorizado?: boolean
}

export interface PessoaWhatsappLote {
  nome: string
  telefone: string
  podeEnviarPlanilha: boolean
  podePedirRelatorio: boolean
}

export interface ResultadoLoteWhatsapp {
  criados: Array<PessoaWhatsappLote & { id?: string }>
  ignorados: Array<{ nome: string; telefone: string; motivo: string }>
}

export interface WhatsappGrupoWhatsAppItem {
  jid: string
  nome: string
  participantes: number
  jaMapeado?: boolean
}

export interface RecebimentoWhatsapp {
  em: string
  grupoJid: string
  nomeGrupo: string | null
  tipo: 'relatorio' | 'planilha' | 'ignorado'
  resumo: string
}

export interface WhatsappGrupoPayload {
  grupoJid: string
  nomeGrupo?: string | null
  servicoId: string
  estrategia?: string
  responderPdf?: boolean
  ativo?: boolean
}

const wuzapiService = {
  async status(): Promise<WuzapiStatus> {
    const { data } = await api.get<WuzapiStatus>('/wuzapi/status')
    return data
  },

  async connect(): Promise<{
    sucesso: boolean
    message?: string
    qrCode?: string | null
    erro?: string
    conectado?: boolean
    logado?: boolean
    nomeInstancia?: string | null
    numeroMascarado?: string
    statusConexao?: 'conectado' | 'deslogado'
    alertaWebhook?: string | null
  }> {
    const { data } = await api.post('/wuzapi/connect', {})
    return data
  },

  async novaConexao(): Promise<{
    sucesso: boolean
    message?: string
    qrCode?: string | null
    erro?: string
    nomeInstancia?: string | null
    numeroMascarado?: string
    statusConexao?: 'conectado' | 'deslogado'
    alertaWebhook?: string | null
    conectado?: boolean
    logado?: boolean
  }> {
    const { data } = await api.post('/wuzapi/nova-conexao', { confirmacao: 'NOVA CONEXAO' })
    return data
  },

  async disconnect(): Promise<{ sucesso: boolean; message?: string; erro?: string }> {
    const { data } = await api.post('/wuzapi/disconnect', {})
    return data
  },

  async qr(): Promise<{ sucesso: boolean; qrCode?: string | null }> {
    const { data } = await api.get('/wuzapi/qr')
    return data
  },

  async listarGruposWhatsApp(): Promise<WhatsappGrupoWhatsAppItem[]> {
    const { data } = await api.get<{ grupos: WhatsappGrupoWhatsAppItem[] }>('/wuzapi/grupos-whatsapp')
    return data.grupos || []
  },

  async listarRecebimentos(): Promise<RecebimentoWhatsapp[]> {
    const { data } = await api.get<{ recebimentos: RecebimentoWhatsapp[] }>('/wuzapi/recebimentos')
    return data.recebimentos || []
  },

  async listarGrupos(): Promise<WhatsappGrupoMapaItem[]> {
    const { data } = await api.get<WhatsappGrupoMapaItem[]>('/wuzapi/grupos')
    return Array.isArray(data) ? data : []
  },

  async criarGrupo(payload: WhatsappGrupoPayload): Promise<WhatsappGrupoMapaItem> {
    const { data } = await api.post<WhatsappGrupoMapaItem>('/wuzapi/grupos', payload)
    return data
  },

  async atualizarGrupo(id: string, payload: Partial<WhatsappGrupoPayload>): Promise<WhatsappGrupoMapaItem> {
    const { data } = await api.put<WhatsappGrupoMapaItem>(`/wuzapi/grupos/${id}`, payload)
    return data
  },

  async excluirGrupo(id: string): Promise<void> {
    await api.delete(`/wuzapi/grupos/${id}`)
  },

  async listarContatos(contractId: string): Promise<PessoaWhatsappAgenda[]> {
    const { data } = await api.get<PessoaWhatsappAgenda[] | { contatos?: PessoaWhatsappAgenda[] }>(
      '/wuzapi/contatos',
      { params: { contractId } },
    )
    if (Array.isArray(data)) return data
    return data?.contatos || []
  },

  async listarParticipantes(contractId: string, grupoJid: string): Promise<PessoaWhatsappAgenda[]> {
    const { data } = await api.get<PessoaWhatsappAgenda[] | { participantes?: PessoaWhatsappAgenda[] }>(
      `/wuzapi/grupos/${encodeURIComponent(grupoJid)}/participantes`,
      { params: { contractId } },
    )
    if (Array.isArray(data)) return data
    return data?.participantes || []
  },

  async autorizarLote(contractId: string, pessoas: PessoaWhatsappLote[]): Promise<ResultadoLoteWhatsapp> {
    const { data } = await api.post<ResultadoLoteWhatsapp>(
      `/contracts/${contractId}/whatsapp-autorizados/lote`,
      { pessoas },
    )
    return data
  },
}

export default wuzapiService
