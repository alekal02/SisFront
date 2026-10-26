import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deveEncerrarSessao } from './sessaoHttp.ts';

describe('deveEncerrarSessao', () => {
  it('encerra quando me, refresh ou entrar-contrato respondem 401 ou 404', () => {
    assert.equal(deveEncerrarSessao(401, '/auth/me'), true);
    assert.equal(deveEncerrarSessao(404, '/api/auth/me', 'Usuário não encontrado'), true);
    assert.equal(deveEncerrarSessao(401, '/auth/refresh'), true);
    assert.equal(deveEncerrarSessao(404, '/auth/entrar-contrato', 'Usuário não encontrado'), true);
    assert.equal(deveEncerrarSessao(404, '/auth/sair-contrato', 'Usuário não encontrado'), true);
  });

  it('não encerra a sessão por contrato ausente nem por senha errada', () => {
    assert.equal(
      deveEncerrarSessao(404, '/auth/entrar-contrato', 'Contrato não encontrado no catálogo'),
      false,
    );
    assert.equal(deveEncerrarSessao(401, '/auth/login', 'Email ou senha inválidos'), false);
    assert.equal(deveEncerrarSessao(404, '/contracts/abc', 'Contrato não encontrado'), false);
    assert.equal(deveEncerrarSessao(500, '/auth/me'), false);
  });
});
