/* Administrative layout; existing controllers remain responsible for all actions. */
(() => {
  if (!document.body.classList.contains('platform-admin-page')) return;
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };

  // Give the primary task its own place above clearly labeled filters.
  for (const [section, action, fields] of [
    ['businesses', 'newBusinessButton', [['businessSearch', 'Buscar negócio'], ['segmentFilter', 'Segmento'], ['businessScope', 'Cadastros']]],
    ['users', 'newUserButton', [['userBusinessFilter', 'Negócio']]],
    ['billing', 'newInvoiceButton', [['billingStatusFilter', 'Status da cobrança']]],
    ['products', null, [['productBusinessFilter', 'Negócio']]]
  ]) {
    const panel = $(section), header = panel.querySelector('.platform-section-title');
    const filters = panel.querySelector('.business-controls');
    if (action) header.append($(action));
    filters.classList.add('admin-filters');
    for (const [id, label] of fields) {
      const field = node('label', '', 'admin-filter-field');
      field.append(node('span', label), $(id)); filters.append(field);
    }
    header.after(filters);
  }
  // Keep everyday search visible; less frequent scope/segment filters stay together.
  const businessFilters = $('businesses').querySelector('.admin-filters');
  const advanced = node('details', '', 'admin-business-advanced'); advanced.id = 'adminAdvancedFilters';
  const advancedTitle = node('summary', 'Mais filtros'), advancedFields = node('div', '', 'admin-advanced-fields');
  advancedFields.append($('segmentFilter').closest('label'), $('businessScope').closest('label'));
  advanced.append(advancedTitle, advancedFields); businessFilters.append(advanced);
  const wide = matchMedia('(min-width:1001px)');
  advanced.open = wide.matches; wide.addEventListener('change', event => { advanced.open = event.matches; });
  const filterLabel = () => { advancedTitle.textContent = $('segmentFilter').value !== 'all' || $('businessScope').value !== 'menu' ? 'Mais filtros · ativos' : 'Mais filtros'; };
  $('segmentFilter').addEventListener('change', filterLabel); $('businessScope').addEventListener('change', filterLabel);
  $('businesses').querySelector('.demo-notice').textContent = 'Consulte o cadastro pelo nome. Use Abrir painel para atender o negócio.';
  $('billing').querySelector('.demo-notice').textContent = 'Valores cobrados pela Ogritech: assinatura, implantação e serviços.';

  // Save and Cancel occupy the same place in every administrative form.
  for (const form of document.querySelectorAll('.platform-modal form')) {
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) continue;
    const actions = node('div', '', 'admin-modal-actions');
    const cancel = node('button', 'Cancelar', 'admin-cancel-action'); cancel.type = 'button';
    cancel.addEventListener('click', () => closeModals());
    actions.append(submit, cancel); form.append(actions);
  }
  const trialActions = $('trialReviewForm').querySelector('.admin-row-actions');
  trialActions.classList.add('admin-modal-actions');
  $('saveTrialReview').classList.add('cyan-button');
  trialActions.append($('saveTrialReview'), $('closeTrialReview'));

  function organizeActions() {
    for (const [id, keep] of [
      ['businessTableBody', button => ['operate', 'edit'].includes(button.dataset.action)],
      ['usersTableBody', button => button.dataset.userAction === 'edit'],
      ['billingTableBody', button => button.dataset.billingAction === 'pay']]
    ) {
      for (const actions of $(id).querySelectorAll('.admin-row-actions')) {
        if (actions.querySelector('.admin-more-actions')) continue;
        const secondary = [...actions.children].filter(el => el.tagName === 'BUTTON' && !keep(el));
        if (!secondary.length) continue;
        const more = node('details', '', 'admin-more-actions'), tools = node('div', '', 'admin-secondary-actions');
        const summary = node('summary', 'Mais ações');
        const name = actions.closest('tr').querySelector('strong')?.textContent.trim();
        if (name) summary.setAttribute('aria-label', `Mais ações para ${name}`);
        secondary.forEach(button => tools.append(button));
        more.append(summary, tools); actions.append(more);
      }
    }
  }
  window.OgritechAdminLayout = { organizeActions };
  organizeActions();
})();
