import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ehGestor, homePath } from './utils/homePath'
import { ToastProvider } from './contexts/ToastContext'
import { BreadcrumbProvider } from './contexts/BreadcrumbContext'
import ToastContainer from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Layout from './components/Layout'
import './App.css'

const VisaoGeral = lazy(() => import('./pages/VisaoGeral'))
const Contratos = lazy(() => import('./pages/Contratos'))
const ContratoDetalhe = lazy(() => import('./pages/ContratoDetalhe'))
const ServicoVisao = lazy(() => import('./pages/ServicoVisao'))
const ServicoDiaDetalhe = lazy(() => import('./pages/ServicoDiaDetalhe'))
const ConfiguracaoServico = lazy(() => import('./pages/ConfiguracaoServico'))
const BibliotecaKpisUniversais = lazy(() => import('./pages/BibliotecaKpisUniversais'))
const DashboardExecutivo = lazy(() => import('./pages/DashboardExecutivo'))
const BibliotecaGraficosPadrao = lazy(() => import('./pages/BibliotecaGraficosPadrao'))
const Login = lazy(() => import('./pages/Login'))

function CarregandoPagina() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Carregando…</p>
    </div>
  )
}

/* ─── Componente de redirecionamento para rotas antigas ─── */
function RedirectServico() {
  const { contractId, servicoId } = useParams();
  return <Navigate to={`/contratos/${contractId}/servicos/${servicoId}`} replace />;
}

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <CarregandoPagina />
  return <Navigate to={homePath(user)} replace />
}

function GestorOnlyRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!ehGestor(user) || user?.contractId) return <Navigate to={homePath(user)} replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <ToastContainer />
          <BreadcrumbProvider>
        <Suspense fallback={<CarregandoPagina />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/acesso" element={<Navigate to="/login" replace />} />

      {/* Rotas protegidas com Layout (sidebar + logout) */}
          <Route
            path="/visao-geral"
            element={
              <ProtectedRoute>
                <Layout>
                  <VisaoGeral />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/visao-gestor" element={<Navigate to="/visao-geral" replace />} />

          <Route
            path="/contratos"
            element={
              <ProtectedRoute>
                <Layout>
                  <Contratos />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contratos/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <ContratoDetalhe />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/kpis-universais"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Layout>
                    <BibliotecaKpisUniversais />
                  </Layout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          {/* ═══ NOVA ESTRUTURA: Serviço (visão pura) e Configuração do Serviço ═══ */}
          <Route
            path="/contratos/:contractId/servicos/:servicoId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ServicoVisao />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/dia/:data"
            element={
              <ProtectedRoute>
                <Layout>
                  <ServicoDiaDetalhe />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/configurar"
            element={
              <ProtectedRoute>
                <Layout>
                  <ConfiguracaoServico />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/executivo"
            element={
              <ProtectedRoute>
                <GestorOnlyRoute>
                  <Layout>
                    <DashboardExecutivo />
                  </Layout>
                </GestorOnlyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/graficos-padrao"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <Layout>
                    <BibliotecaGraficosPadrao />
                  </Layout>
                </AdminRoute>
              </ProtectedRoute>
            }
          />
          <Route path="/whatsapp-grupos" element={<Navigate to="/visao-geral?aba=whatsapp" replace />} />

          <Route path="/dashboard" element={<Navigate to="/visao-geral" replace />} />
          <Route path="/dashboard/*" element={<Navigate to="/visao-geral" replace />} />

          {/* ═══ ROTAS ANTIGAS — REDIRECIONAM PARA A NOVA ESTRUTURA ═══ */}
          <Route
            path="/contratos/:contractId/servicos/:servicoId/dashboard"
            element={<RedirectServico />}
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/dados"
            element={<RedirectServico />}
          />
          <Route
            path="/contratos/:contractId/servicos/:servicoId/detalhes"
            element={<RedirectServico />}
          />

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
        </Suspense>
          </BreadcrumbProvider>
      </Router>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
