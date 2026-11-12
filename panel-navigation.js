/* Stable destinations for the customer's daily work. Existing controllers own data/actions. */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('menuView') || !window.OgritechMenuWorkspace) return;
  const aliases = { cardapio: 'orders', produtos: 'products', loja: 'menu', vendas: 'sales', configuracoes: 'account' };
  const titles = { orders: 'Pedidos', products: 'Produtos', menu: 'Cardápio', sales: 'Vendas', account: 'Conta' };
  let route = 'orders', state = window.OgritechMenuWorkspace.state(), pending = null;
  let editorDirty = false, editorTrigger = null;
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };

  // Keep one support launcher in the same place on every screen.
  document.querySelector('.topbar').id = 'panelPageHeader';
  const help = $('panelAssistantOpen');
  help.querySelector('strong').textContent = 'Ajuda';
  help.querySelector('small').hidden = true;
  help.setAttribute('aria-label', 'Abrir ajuda do painel');
  document.querySelector('.topbar-actions').prepend(help);

  // Shared actions belong to Cardápio, rather than preceding every task.
  const sharing = node('details', '', 'panel-sharing'); sharing.id = 'panelShareTools';
  sharing.append(node('summary', 'Compartilhar cardápio'), $('menuShareLink'), $('menuSharePanel'));
  $('menuWorkspaceTabs').before(sharing);
  const orders = $('menuOrdersPanel');
  $('menuView').append(orders);
  $('panelSalesReports').after($('menuPilotMetricsPanel'));
  const notices = orders.querySelector('[data-order-notifications]');
  const preferences = node('details', '', 'panel-order-preferences');
  preferences.append(node('summary', 'Avisos de pedidos neste dispositivo'), notices);
  orders.append(preferences);
  $('menuSettingsPanel').after($('menuAssistantSettingsPanel'));
  $('menuSettingsPanel').querySelector('.clients-toolbar h2').textContent = 'Atendimento do negócio';
  $('menuSettingsPanel').querySelector('.clients-toolbar .section-description').textContent = 'Configure retirada, entrega, pagamentos e horários.';

  // Existing products come before a deliberately opened editor.
  const form = $('menuItemForm'), list = $('menuCatalogList'), catalog = form.closest('article');
  catalog.querySelector('.panel-header .section-description').textContent = 'Cadastre itens e mantenha preços e fotos atualizados.';
  catalog.querySelector('.panel-header .eyebrow').hidden = true;
  catalog.querySelector('.panel-header h2').hidden = true;
  catalog.setAttribute('aria-label', 'Produtos cadastrados');
  const add = node('button', 'Adicionar produto', 'gold-button'); add.type = 'button'; add.id = 'panelAddProduct';
  add.setAttribute('aria-controls', 'panelProductEditor'); add.setAttribute('aria-expanded', 'false');
  catalog.querySelector('.panel-header').append(add);
  const editor = node('section', '', 'panel-product-editor'); editor.id = 'panelProductEditor'; editor.hidden = true;
  const editorTitle = node('h3', 'Adicionar produto'); editorTitle.id = 'panelProductEditorTitle';
  editor.setAttribute('aria-labelledby', editorTitle.id); editor.append(editorTitle, form);
  catalog.append(list, editor);
  form.querySelector('.commercial-actions').classList.add('panel-editor-actions');
  form.addEventListener('input', () => { editorDirty = true; });
  form.addEventListener('change', () => { editorDirty = true; });
  form.addEventListener('click', event => {
    if (event.target.closest('button') && !event.target.closest('#menuItemSubmit,#menuItemCancel')) editorDirty = true;
  });
  add.addEventListener('click', () => {
    if (!confirmDiscard()) return;
    editorTrigger = add; window.OgritechMenuWorkspace.newProduct();
  });
  catalog.addEventListener('click', event => {
    const trigger = event.target.closest('[data-edit-menu-item]');
    if (trigger && !confirmDiscard()) { event.preventDefault(); event.stopPropagation(); return; }
    if (trigger) editorTrigger = trigger;
  }, true);

  // Account actions are grouped by purpose; signing out stays at the end.
  document.querySelector('#accountSettings>.section-description').textContent = 'Atualize sua senha e escolha a aparência do painel.';
  const account = $('settingsView');
  function accountCard(title, description) {
    const card = node('article', '', 'panel settings-panel panel-account-card');
    card.append(node('h2', title), node('p', description, 'section-description'));
    account.append(card); return card;
  }
  const device = accountCard('Aplicativo', 'Tenha um acesso direto ao painel na tela inicial do seu dispositivo.');
  device.append($('panelInstallApp'));
  const data = accountCard('Seus dados', 'Exporte os dados do seu negócio quando precisar.');
  data.hidden = typeof currentRole === 'undefined' || currentRole !== 'owner';
  data.append($('exportBusinessData'));
  const session = accountCard('Sessão', 'Encerre o acesso neste dispositivo.'); session.append($('logoutButton'));
  $('panelSalesRefresh').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await window.OgritechPanelNotifications?.refreshReports(); }
    finally { button.disabled = false; }
  });

  function confirmDiscard() {
    if (!editorDirty) return true;
    if (!window.confirm('Descartar as alterações do produto que ainda não foram salvas?')) return false;
    editorDirty = false; window.OgritechMenuWorkspace.newProduct(); closeEditor(); return true;
  }
  function canLeave(section) {
    const target = aliases[section] || section;
    if (target === route) return true;
    if (state.busy && target !== 'account') return false;
    if (state.dirtySettings && !['account', 'menu'].includes(target)) {
      $('menuWorkspaceMessage').textContent = 'Salve as configurações de atendimento antes de mudar de área.';
      return false;
    }
    return confirmDiscard();
  }
  function canLeaveWorkspace(workspace) {
    return workspace === 'catalog' || confirmDiscard();
  }
  function openEditor(editing) {
    editorDirty = false; editor.hidden = false;
    editorTitle.textContent = editing ? 'Editar produto' : 'Adicionar produto';
    $('menuItemCancel').classList.remove('hidden');
    $('menuItemCancel').textContent = 'Cancelar';
    add.setAttribute('aria-expanded', 'true');
    list.hidden = true; add.hidden = true;
    editor.scrollIntoView({ block: 'start', behavior: 'instant' });
    $('menuItemName').focus({ preventScroll: true });
  }
  function closeEditor() {
    const wasOpen = !editor.hidden;
    editorDirty = false; editor.hidden = true; list.hidden = false;
    add.hidden = !state.canManage; add.setAttribute('aria-expanded', 'false');
    if (wasOpen) {
      const target = editorTrigger?.isConnected ? editorTrigger : add;
      target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }
  function paint() {
    document.body.dataset.panelRoute = route;
    document.body.dataset.panelPublished = String(state.published);
    document.body.dataset.panelManager = String(state.canManage);
    $('page-title').textContent = titles[route];
    sharing.hidden = route !== 'menu' || !state.published;
    document.querySelectorAll('.menu-item[data-panel-route]').forEach(link => {
      const key = link.dataset.panelRoute, active = key === route;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      if (link.hasAttribute('data-manager-only')) link.classList.toggle('hidden', !state.canManage);
    });
    add.hidden = !state.canManage || !editor.hidden;
    add.disabled = !state.ready || state.busy;
    list.querySelectorAll('.menu-catalog-editor-item>.commercial-actions').forEach(actions => {
      if (actions.querySelector('.panel-product-more')) return;
      const edit = actions.querySelector('[data-edit-menu-item]');
      if (!edit) return;
      const more = node('details', '', 'panel-product-more'), tools = node('div', '', 'panel-product-tools');
      more.append(node('summary', 'Mais ações'), tools);
      [...actions.children].filter(el => el !== edit).forEach(el => tools.append(el));
      actions.append(edit, more);
    });
  }
  function sync(next) {
    state = next;
    if (route !== 'account' && state.ready) {
      route = state.workspace === 'operation' ? 'orders' : state.workspace === 'catalog' ? 'products' : state.workspace === 'sales' ? 'sales' : 'menu';
    }
    paint();
    if (state.ready && pending) { const target = pending; pending = null; queueMicrotask(() => show(target)); }
  }
  function show(section) {
    let target = aliases[section] || 'orders';
    if (!state.canManage && !['orders', 'account'].includes(target)) target = 'orders';
    route = target;
    if (target !== 'menu') sharing.open = false;
    $('settingsView').classList.toggle('hidden', target !== 'account');
    $('menuView').classList.toggle('hidden', target === 'account');
    if (target === 'account') { paint(); return; }
    if (!state.ready) { pending = section; paint(); return; }
    let workspace = { orders: 'operation', products: 'catalog', menu: state.published ? 'review' : state.next, sales: 'sales' }[target];
    if (target === 'menu' && state.dirtySettings) workspace = 'settings';
    if (!state.published && state.next === 'start' && target !== 'sales') {
      workspace = 'start';
      if (target === 'products') $('menuWorkspaceMessage').textContent = 'Crie seu cardápio para começar a cadastrar os produtos.';
    }
    const accepted = window.OgritechMenuWorkspace.select(workspace);
    if (accepted === false) sync(window.OgritechMenuWorkspace.state());
    paint();
  }
  window.addEventListener('beforeunload', event => {
    if (!editorDirty && !state.dirtySettings) return;
    event.preventDefault(); event.returnValue = '';
  });
  window.OgritechPanelNavigation = { show, sync, canLeave, canLeaveWorkspace, openEditor, closeEditor };
  const initial = new URL(location.href).searchParams.get('secao');
  // The page controller remains responsible for exposing the authenticated view.
  paint();
  if (initial && aliases[initial]) {
    const link = document.querySelector(`[data-section="${initial}"]`);
    if (link && state.ready) link.click(); else pending = initial;
  } else if (state.ready) sync(state);
})();
