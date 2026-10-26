import type { ConferenciaImportacao } from '../../services/coletaService';

export default function ConferenciaImportacaoPainel({
  dados,
  baixando,
  onBaixar,
}: {
  dados: ConferenciaImportacao;
  baixando?: boolean;
  onBaixar: () => void;
}) {
  return (
    <div style={{
      marginTop: '0.55rem',
      background: '#fff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      padding: '0.65rem 0.75rem',
      color: '#0f172a',
    }}>
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        fontFamily: 'inherit',
        fontSize: '0.75rem',
        lineHeight: 1.45,
      }}>{dados.mensagem}</pre>

      {dados.ignoradas.length > 0 && (
        <div style={{ marginTop: '0.55rem' }}>
          <strong style={{ fontSize: '0.72rem' }}>Linhas ignoradas</strong>
          <div style={{ maxHeight: '220px', overflow: 'auto', marginTop: '0.25rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '2px 6px' }}>Linha</th>
                  <th style={{ padding: '2px 6px' }}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {dados.ignoradas.map((linha) => (
                  <tr key={`${linha.linhaExcel}-${linha.motivo}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '2px 6px' }}>{linha.linhaExcel}</td>
                    <td style={{ padding: '2px 6px' }}>{linha.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dados.alertas.length > 0 && (
        <div style={{ marginTop: '0.55rem', fontSize: '0.72rem' }}>
          <strong>Alertas</strong>
          <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
            {dados.alertas.map((alerta) => (
              <li key={`${alerta.codigo}-${alerta.placa || alerta.texto}`}>
                {alerta.texto}
                {alerta.linhas.length > 0 && (
                  <span style={{ color: '#475569' }}> — linhas {alerta.linhas.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onBaixar}
        disabled={baixando}
        style={{
          marginTop: '0.6rem',
          fontSize: '0.72rem',
          fontWeight: 700,
          padding: '0.35rem 0.7rem',
          borderRadius: '6px',
          border: '1px solid #0f766e',
          background: '#f0fdfa',
          color: '#0f766e',
          cursor: baixando ? 'wait' : 'pointer',
        }}
      >
        {baixando ? 'Baixando...' : 'Baixar conferência (Excel)'}
      </button>
    </div>
  );
}
