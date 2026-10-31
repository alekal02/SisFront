import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useBreadcrumbs } from '../contexts/BreadcrumbContext'
import { carregarPainelDiretoria } from '../services/painelDiretoriaService'
import {
  CORES_CONTRATO,
  fmtDataCurta,
  fmtPct,
  fmtRs,
  ordenarRanking,
  type CardDiretoria,
} from '../utils/painelDiretoria'
import './PainelDiretoria.css'

function dinheiro(card: CardDiretoria) {
  if (!card.temTarifa) return <span className="pd-dinheiro pd-muted">sem preço</span>
  if (!card.temPlanilha || card.faturamento == null) return <span className="pd-dinheiro pd-muted">—</span>
  return <span className="pd-dinheiro">{fmtRs(card.faturamento)}</span>
}

function variacao(card: CardDiretoria) {
  if (card.variacao == null) return <strong className="pd-muted">—</strong>
  const cls = card.variacao < 0 ? 'pd-var-neg' : 'pd-var-pos'
  return <strong className={cls}>{fmtPct(card.variacao)}</strong>
}

export default function PainelDiretoria() {
  const navigate = useNavigate()
  const { setBreadcrumbs } = useBreadcrumbs()
  const [cards, setCards] = useState<CardDiretoria[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setBreadcrumbs([{ label: 'Diretoria' }])
    return () => setBreadcrumbs([])
  }, [setBreadcrumbs])

  useEffect(() => {
    let vivo = true
    carregarPainelDiretoria()
      .then((lista) => { if (vivo) setCards(lista) })
      .catch(() => { if (vivo) setErro('Não foi possível ler os contratos.') })
    return () => { vivo = false }
  }, [])

  const ranking = useMemo(() => ordenarRanking(cards || []), [cards])
  const grafico = useMemo(() => montarGrafico(cards || []), [cards])

  return (
    <div className="pd">
      <header className="pd-topo">
        <div>
          <h2>Painel da Diretoria</h2>
          <p>Ciclo de medição de cada contrato</p>
        </div>
        <div className="pd-legenda" aria-label="Semáforo">
          <span><i className="pd-luz pd-luz-verde" /> Meta</span>
          <span><i className="pd-luz pd-luz-amarelo" /> −5% a −15%</span>
          <span><i className="pd-luz pd-luz-vermelho" /> Abaixo ou sem planilha</span>
          <span><i className="pd-luz pd-luz-cinza" /> Sem preço</span>
        </div>
      </header>

      {erro && <div className="pd-erro">{erro}</div>}

      {!cards && !erro && (
        <div className="pd-grid">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="pd-skel" />)}
        </div>
      )}

      {cards && (
        <div className="pd-grid">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`pd-card pd-card-${card.luz}`}
              onClick={() => navigate(`/painel/${card.id}`)}
            >
              <div className="pd-card-nome">
                <span>{card.nome}</span>
                <i className={`pd-luz pd-luz-${card.luz}`} aria-hidden="true" />
              </div>
              <div className="pd-card-ciclo">
                {card.diasCiclo > 0
                  ? `${fmtDataCurta(card.intervalo.split('–')[0] || '')} – ${fmtDataCurta(card.intervalo.split('–')[1] || '')} · ${card.diasDecorridos}/${card.diasCiclo} dias`
                  : 'Sem ciclo'}
              </div>
              {dinheiro(card)}
              <div className="pd-meta">
                <div>
                  <small>Produção</small>
                  <strong>{card.producaoTexto}</strong>
                </div>
                <div>
                  <small>Meta</small>
                  <strong className="pd-muted">sem meta</strong>
                </div>
                <div>
                  <small>Variação</small>
                  {variacao(card)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {cards && (
        <section className="pd-bloco">
          <h3>Faturamento por dia do ciclo</h3>
          <p className="pd-ajuda">Dia sem planilha fica em zero. Sem preço não desenha valor.</p>
          <div className="pd-grafico">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafico.linhas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e8eaed" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#5f6368' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#5f6368' }}
                  width={64}
                  tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)} mil` : String(v)}
                />
                <Tooltip
                  formatter={(valor, nome) => {
                    const serie = grafico.series.find((s) => s.nome === nome)
                    if (serie?.semPreco) return ['sem preço', nome]
                    const n = Number(valor)
                    return [Number.isFinite(n) ? fmtRs(n) : '—', nome]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {grafico.series.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.nome}
                    stroke={s.semPreco ? '#bdc1c6' : s.cor}
                    strokeWidth={2.4}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {cards && (
        <section className="pd-bloco">
          <h3>Ranking</h3>
          <p className="pd-ajuda">Sem meta financeira. Variação de toneladas contra os mesmos dias do ciclo anterior.</p>
          <div className="pd-ranking">
            {ranking.map((card, i) => {
              const sem = card.variacaoProducao == null
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`pd-rank ${sem ? 'pd-rank-cinza' : ''}`}
                  onClick={() => navigate(`/painel/${card.id}`)}
                >
                  <b>{sem ? '—' : i + 1}</b>
                  <span>{card.nome}</span>
                  <strong>{sem ? 'sem dado' : fmtPct(card.variacaoProducao!)}</strong>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function montarGrafico(cards: CardDiretoria[]) {
  const maxDia = cards.reduce((m, c) => Math.max(m, c.serie.length), 0)
  const series = cards.map((card, i) => ({
    id: card.id,
    nome: card.nome,
    cor: CORES_CONTRATO[i % CORES_CONTRATO.length],
    semPreco: !card.temTarifa,
  }))
  const linhas = Array.from({ length: maxDia }, (_, idx) => {
    const linha: Record<string, string | number | null> = { dia: String(idx + 1) }
    for (const card of cards) {
      const ponto = card.serie[idx]
      if (!ponto) linha[card.id] = null
      else if (!card.temTarifa) linha[card.id] = 0
      else linha[card.id] = ponto.valor
    }
    return linha
  })
  return { series, linhas }
}
