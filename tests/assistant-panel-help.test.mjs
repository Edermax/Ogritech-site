import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const scope = {};
runInNewContext(await readFile(new URL('../assistant-panel-help.js', import.meta.url), 'utf8'), scope);
const help = scope.OgritechPanelHelp;
const context = (offer = 'encomendas', role = 'owner', extra = {}) => ({ offer, role, ready: true, published: true, next: 'operation', ...extra });
const ids = answer => Array.from(answer.actions, action => action.id);
const premium = ['pedidos', 'vendas', 'entregas', 'pagamentos', 'notificacoes'];

test('Cardápio explica recursos fora do plano e oferece a troca somente ao proprietário', () => {
  for (const role of ['owner', 'admin', 'employee']) for (const topic of premium) {
    const answer = help.answer(topic, context('cardapio', role));
    assert.match(answer.text, /plano atual, Ogritech Cardápio, não inclui/);
    assert.match(answer.text, /Ogritech Encomendas/);
    assert.match(answer.text, /WhatsApp/);
    assert.deepEqual(ids(answer), role === 'owner' ? ['upgrade'] : []);
    if (role !== 'owner') assert.match(answer.text, /Peça ao proprietário/);
  }
});

test('Encomendas orienta gestores para os recursos realmente disponíveis', () => {
  for (const role of ['owner', 'admin']) {
    assert.deepEqual(ids(help.answer('pedidos', context('encomendas', role))), ['orders']);
    assert.deepEqual(ids(help.answer('vendas', context('encomendas', role))), ['sales']);
    assert.deepEqual(ids(help.answer('entregas', context('encomendas', role))), ['settings']);
    assert.ok(ids(help.answer('pagamentos', context('encomendas', role))).includes('orders'));
    assert.deepEqual(ids(help.answer('notificacoes', context('encomendas', role))), ['orders']);
  }
});

test('funcionário recebe orientações de consulta e não ações de gestão ou assinatura', () => {
  const employee = context('encomendas', 'employee');
  assert.match(help.answer('pedidos', employee).text, /pode consultar os pedidos/);
  assert.match(help.answer('pedidos', employee).text, /exige um proprietário ou administrador/);
  for (const topic of ['vendas', 'produtos', 'whatsapp', 'configuracoes', 'entregas', 'pagamentos', 'publicacao']) {
    const answer = help.answer(topic, employee);
    assert.match(answer.text, /perfil de funcionário não permite/);
    assert.deepEqual(ids(answer), ['account']);
  }
  for (const offer of ['cardapio', 'encomendas']) for (const role of ['admin', 'employee']) {
    assert.match(help.answer('assinatura', context(offer, role)).text, /Somente o proprietário/);
    assert.deepEqual(ids(help.answer('assinatura', context(offer, role))), ['account']);
  }
});

test('plano ou perfil não confirmado nunca assume Encomendas ou proprietário', () => {
  for (const extra of [{ ready: false }, { offer: null }, { offer: 'outro' }, { role: null }, { role: 'client' }, { role: 'constructor' }, { offer: 'toString' }]) {
    const unknown = context('encomendas', 'owner', extra);
    assert.equal(help.menu(unknown).topics.length, 0);
    for (const topic of premium.concat(['produtos', 'assinatura'])) assert.deepEqual(ids(help.answer(topic, unknown)), []);
    assert.match(help.answer('pedidos', unknown).text, /confirmar seu plano e perfil/);
  }
});

test('publicação e cadastro acompanham o plano e a etapa atual', () => {
  for (const offer of ['cardapio', 'encomendas']) {
    const live = help.answer('produtos', context(offer));
    assert.match(live.text, /Salvar produto atualiza o catálogo online na mesma aba/);
    assert.match(live.text, /ocultos ou indisponíveis continuam fora/);
    assert.match(live.text, /alterações já salvas que estejam pendentes/);
    assert.deepEqual(ids(help.answer('produtos', context(offer, 'owner', { published: false, next: 'start' }))), ['start']);
    assert.deepEqual(ids(help.answer('produtos', context(offer, 'owner', { published: false, next: 'settings' }))), ['settings']);
    const draft = help.answer('publicacao', context(offer, 'owner', { published: false, next: 'review' }));
    assert.match(draft.text, offer === 'cardapio' ? /não exige pedido de teste/ : /faça o pedido de teste/);
  }
});

test('menus identificam plano, perfil e limites antes da resposta', () => {
  for (const offer of ['cardapio', 'encomendas']) for (const role of ['owner', 'admin', 'employee']) {
    const menu = help.menu(context(offer, role));
    assert.match(menu.greeting, /Seu painel: Ogritech/);
    assert.match(menu.greeting, /Perfil:/);
    assert.equal(new Set(menu.topics.map(topic => topic.id)).size, menu.topics.length);
    for (const topic of menu.topics) {
      assert.ok(help.answer(topic.id, context(offer, role)).text.length > 30);
      if (offer === 'cardapio' && premium.includes(topic.id)) assert.match(topic.label, /\(Encomendas\)/);
    }
  }
});

test('WhatsApp, assinatura e acesso usam as diferenças entre planos e perfis', () => {
  assert.match(help.answer('whatsapp', context('cardapio')).text, /monta sua seleção.*WhatsApp/);
  assert.match(help.answer('whatsapp', context('encomendas')).text, /registra e acompanha os pedidos pela plataforma/);
  assert.match(help.answer('configuracoes', context('cardapio')).text, /entrega e o pagamento são combinados no WhatsApp/);
  assert.deepEqual(ids(help.answer('assinatura', context('cardapio'))), ['plan']);
  assert.match(help.answer('acesso', context('encomendas', 'admin')).text, /assinatura fica com o proprietário/);
  assert.match(help.answer('acesso', context('cardapio', 'employee')).text, /edição do catálogo fica com os gestores/);
});
