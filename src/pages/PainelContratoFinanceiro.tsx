import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../contexts/BreadcrumbContext'
import {
  carregarCardDiretoria,
  carregarLinhasFinanceiras,
  type LinhaServicoFinanceiro,
  type LinhaTipoFinanceiro,
} from '../services/painelDiretoriaService'
import {
  fmtDataCurta,
  fmtNum,
  fmtPct,
  fmtRs,
  projetarFechamento,
  rotuloTipo,
  textoComposicao,
  partesPorTipo,
  type CardDiretoria,
} from '../utils/painelDiretoria'
import './PainelDiretoria.css'

function dinheiroOuVazio(card: CardDiretoria | null, valor: number | null) {
  if (!card?.temTarifa) return <strong className="pd-muted">sem preço</strong>
  if (!card.temPlanilha || valor == null) return <strong className="pd-muted">—</strong>
  return <strong>{fmtRs(valor)}</strong>
}

export default function PainelContratoFinanceiro() {
  const { contractId = '' } = useParams()
  const navigate = useNavigate()
  const { setBreadcrumbs } = useBreadcrumbs()
  const [card, setCard] = useState<CardDiretoria | null>(null)
  const [servicos, setServicos] = useState<LinhaServicoFinanceiro[] | null>(null)
  const [tipos, setTipos] = useState<LinhaTipoFinanceiro[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Diretoria', href: '/painel' },
      { label: 'Contrato' },
    ])
    return () => setBreadcrumbs([])
  }, [setBreadcrumbs])

  useEffect(() => {
    let vivo = true
    setCard(null)
    setServicos(null)
    setTipos(null)
    setErro('')
    carregarCardDiretoria(contractId)
      .then(async (lido) => {
        if (!vivo) return
        if (!lido) {
          setErro('Contrato não encontrado.')
          return
        }
        setCard(lido)
        setBreadcrumbs([
          { label: 'Diretoria', href: '/painel' },
          { label: lido.nome },
        ])
        const linhas = await carregarLinhasFinanceiras(lido)
        if (!vivo) return
        setServicos(linhas.servicos)
        setTipos(linhas.tipos)
      })
      .catch(() => { if (vivo) setErro('Não foi possível ler o contrato.') })
    return () => { vivo = false }
  }, [contractId, setBreadcrumbs])

  const partes = card ? partesPorTipo(card.fatPorTipo, card.tarifas) : []
  const composicao = card?.toneladas ? textoComposicao(partes, card.toneladas) : null
  const rsTon = card?.faturamento != null && card.toneladas && card.toneladas > 0
    ? card.faturamento / card.toneladas
    : null
  const mediaDia = card?.faturamento != null && card.diasDecorridos > 0
    ? card.faturamento / card.diasDecorridos
    : null
  const projecao = card?.faturamento != null
    ? projetarFechamento(card.faturamento, card.diasDecorridos, card.diasCiclo)
    : null
  const [inicio, fim] = (card?.intervalo || '').split('–')

  return (
    <div className="pd">
      <button type="button" className="pd-voltar" onClick={() => navigate('/painel')}>
        ← Diretoria
      </button>

      {erro && <div className="pd-erro">{erro}</div>}
      {!card && !erro && <div className="pd-skel" />}

      {card && (
        <>
          <header className="pd-topo">
            <div>
              <h2>{card.nome}</h2>
              <p>
                {card.cicloLabel || 'Ciclo'}
                {inicio && fim ? ` · ${fmtDataCurta(inicio)} – ${fmtDataCurta(fim)}` : ''}
                {card.diasCiclo > 0 ? ` · ${card.diasDecorridos}/${card.diasCiclo} dias` : ''}
              </p>
            </div>
            <div className="pd-legenda">
              <span><i className={`pd-luz pd-luz-${card.luz}`} /> {rotuloLuz(card.luz)}</span>
              <span>
                Variação {card.variacao == null
                  ? <b className="pd-muted">—</b>
                  : <b className={card.variacao < 0 ? 'pd-var-neg' : 'pd-var-pos'}>{fmtPct(card.variacao)}</b>}
              </span>
            </div>
          </header>

          <section className="pd-nums">
            <article className="pd-num">
              <small>Faturamento realizado</small>
              {dinheiroOuVazio(card, card.faturamento)}
            </article>
            <article className="pd-num">
              <small>Projeção de fechamento</small>
              {dinheiroOuVazio(card, projecao)}
            </article>
            <article className="pd-num">
              <small>R$/dia</small>
              {dinheiroOuVazio(card, mediaDia)}
            </article>
            <article className="pd-num">
              <small>R$/t da coleta</small>
              {!card.temTarifa || rsTon == null
                ? <strong className="pd-muted">sem preço</strong>
                : <strong>{fmtRs(rsTon)}</strong>}
              {composicao && <em>{composicao}</em>}
            </article>
          </section>

          <section className="pd-bloco">
            <h3>Por serviço</h3>
            {!servicos && <p className="pd-ajuda">Lendo serviços…</p>}
            {servicos && servicos.length === 0 && <p className="pd-nota">Nenhum serviço com quantidade neste ciclo.</p>}
            {servicos && servicos.length > 0 && (
              <div className="pd-tabela-wrap">
                <table className="pd-tabela">
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      <th>Quantidade</th>
                      <th>Unidade</th>
                      <th>Tarifa</th>
                      <th>R$ estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicos.map((linha) => (
                      <tr key={linha.id}>
                        <td data-label="Serviço">{linha.nome}</td>
                        <td data-label="Quantidade">{linha.quantidade == null ? '—' : fmtNum(linha.quantidade)}</td>
                        <td data-label="Unidade">{linha.unidade}</td>
                        <td data-label="Tarifa" className={linha.tarifa == null ? 'pd-muted' : undefined}>
                          {linha.tarifa == null
                            ? (linha.reais != null ? 'por tipo' : 'sem preço')
                            : fmtRs(linha.tarifa)}
                        </td>
                        <td data-label="R$ estimado" className={linha.reais == null ? 'pd-muted' : undefined}>
                          {linha.reais == null ? '' : fmtRs(linha.reais)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="pd-bloco">
            <h3>Por tipo de caminhão</h3>
            {!tipos && <p className="pd-ajuda">Lendo coleta…</p>}
            {tipos && tipos.length === 0 && <p className="pd-nota">Sem toneladas de coleta neste ciclo.</p>}
            {tipos && tipos.length > 0 && (
              <div className="pd-tabela-wrap">
                <table className="pd-tabela">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Toneladas</th>
                      <th>R$/t usado</th>
                      <th>R$ estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tipos.map((linha) => (
                      <tr key={linha.tipo}>
                        <td data-label="Tipo">{rotuloTipo(linha.tipo)}</td>
                        <td data-label="Toneladas">{linha.toneladas == null ? '—' : fmtNum(linha.toneladas)}</td>
                        <td data-label="R$/t usado" className={linha.tarifa == null ? 'pd-muted' : undefined}>
                          {linha.tarifa == null ? 'sem preço' : fmtRs(linha.tarifa)}
                        </td>
                        <td data-label="R$ estimado">{linha.reais == null ? '' : fmtRs(linha.reais)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="pd-nota">Custo e glosa: não cadastrado</p>

          <div className="pd-acoes">
            <Link className="pd-link" to={`/contratos/${card.id}`}>Operação do contrato</Link>
          </div>
        </>
      )}
    </div>
  )
}

function rotuloLuz(luz: CardDiretoria['luz']): string {
  if (luz === 'verde') return 'Na meta'
  if (luz === 'amarelo') return 'Atenção'
  if (luz === 'vermelho') return 'Abaixo'
  if (luz === 'cinza') return 'Sem preço'
  return 'Sem meta'
}
