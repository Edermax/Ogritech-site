(() => {
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {enable:'Controle ativado',disable:'Controle desativado',entry:'Entrada',exit:'Saída',adjust:'Ajuste',order:'Baixa de pedido',return:'Devolução de pedido'};
  const date = new Intl.DateTimeFormat('pt-BR', {dateStyle:'short',timeStyle:'short'});
  let generation = 0, context = null, dialog = null;
  async function rpc(name, args) {
    const {data,error} = await supabaseClient.rpc(name,args);
    if (error) throw new Error(['22023','23514','42501','40001','23505'].includes(error.code) ? error.message : 'Não foi possível atualizar o estoque. Confira os dados antes de tentar novamente.');
    return data;
  }
  const active = ctx => context === ctx && ctx.tenant === BARBERSHOP_ID;
  const read = (ctx,item = null,before = null) => rpc('catalog_inventory',{target_barbershop_id:ctx.tenant,target_item_id:item,before_id:before});
  function notice(message) { const node = dialog?.querySelector('[data-stock-status]'); if(node) node.textContent = message; }
  function movementRows(rows) {
    return rows.map(row => `<article class="stock-movement"><strong data-catalog-user-content>${safe(row.item_name)}</strong><p>${safe(labels[row.kind] || row.kind)}${row.order_number ? ` · Pedido #${safe(row.order_number)}` : ''} · ${safe(date.format(new Date(row.created_at)))}</p><p>${Number(row.delta)>0?'+':''}${Number(row.delta)} unidades · ${Number(row.quantity_before)} → ${Number(row.quantity_after)}</p><p data-catalog-user-content>${safe(row.reason)}</p></article>`).join('');
  }
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog'); dialog.id = 'catalogStockDialog'; dialog.className = 'menu-operation-dialog catalog-stock-dialog';
    dialog.setAttribute('aria-labelledby','catalogStockTitle'); document.body.append(dialog);
    return dialog;
  }
  async function open(ctx,item = null) {
    if (!active(ctx)) return;
    const host = ensureDialog();
    host.innerHTML = '<h2 id="catalogStockTitle">Estoque</h2><p data-stock-status role="status" aria-live="polite">Carregando...</p><button type="button" data-stock-close class="table-button">Fechar</button>';
    host.querySelector('[data-stock-close]').onclick = () => host.close();
    if (!host.open) host.showModal();
    const token = Symbol(); ctx.dialogToken = token;
    try {
      const data = await read(ctx,item?.id);
      if (!active(ctx) || ctx.dialogToken !== token || !host.open) return;
      const stock = data.products.find(s => s.item_id === item?.id);
      const enabled = Boolean(stock?.enabled);
      const products = data.products;
      host.innerHTML = `<header><h2 id="catalogStockTitle">${item?'Estoque do produto':'Histórico de estoque'}</h2><button type="button" data-stock-close class="table-button">Fechar</button></header>
        ${item?`<h3 data-catalog-user-content>${safe(item.name)}</h3><p data-stock-balance><strong>Quantidade atual: ${Number(stock?.quantity || 0)} unidades</strong> · ${enabled?'Controle ativado':'Controle desativado'}</p><p>Saldo único para todas as opções deste produto. Pedidos recebidos na plataforma baixam o saldo; recusas e cancelamentos devolvem as unidades. Solicitações pelo WhatsApp precisam de baixa manual.</p>
        <form data-stock-form><label>Movimentação<select name="operation">${enabled?'<option value="entry">Adicionar estoque (entrada)</option><option value="exit">Retirar estoque (saída)</option><option value="adjust">Corrigir quantidade atual (ajuste)</option><option value="disable">Desativar controle</option>':'<option value="enable">Ativar controle de estoque</option>'}</select></label><label data-stock-quantity-label><span data-stock-quantity-title>${stock?'Quantidade':'Quantidade inicial'}</span><input name="quantity" type="number" min="0" max="1000000000" step="1" required></label><label>Motivo<textarea name="reason" required minlength="3" maxlength="300" rows="2"></textarea></label><p data-stock-hint></p><button type="submit" class="table-button edit">Salvar movimentação</button></form>`:
        `<p>Histórico preservado, inclusive de produtos excluídos.</p><ul>${products.map(s=>`<li data-catalog-user-content>${safe(s.item_name)}${s.archived?' (produto excluído)':''}: ${Number(s.quantity)} unidades · ${s.enabled?'controle ativado':'controle desativado'}</li>`).join('') || '<li>Nenhum estoque configurado.</li>'}</ul>`}
        <p data-stock-status role="status" aria-live="polite"></p><button type="button" data-stock-refresh class="table-button">Atualizar estoque</button><h3>Histórico de movimentações</h3><div data-stock-history>${movementRows(data.movements)||'<p>Nenhuma movimentação.</p>'}</div><button type="button" data-stock-more class="table-button" ${data.movements.length<50?'hidden':''}>Ver movimentações anteriores</button>`;
      host.querySelector('[data-stock-close]').onclick = () => host.close();
      host.scrollTop = 0;
      host.querySelector('[data-stock-close]').focus({preventScroll:true});
      host.querySelector('[data-stock-refresh]').onclick = () => open(ctx,item);
      let cursor = data.movements.at(-1)?.id;
      const more = host.querySelector('[data-stock-more]');
      more.onclick = async () => {
        more.disabled = true;
        try {
          const next = await read(ctx,item?.id,cursor);
          if(!active(ctx) || ctx.dialogToken !== token)return;
          host.querySelector('[data-stock-history]').insertAdjacentHTML('beforeend',movementRows(next.movements));
          cursor = next.movements.at(-1)?.id; more.hidden = next.movements.length<50;
        } catch(error) { if(active(ctx)) notice(error.message); }
        finally { more.disabled = false; }
      };
      const form = host.querySelector('[data-stock-form]');
      if(!form)return;
      const operation = form.elements.operation, quantity = form.elements.quantity;
      function update() {
        const omit = operation.value === 'disable' || (operation.value === 'enable' && stock);
        quantity.disabled = Boolean(omit); quantity.required = !omit;
        host.querySelector('[data-stock-quantity-label]').hidden = Boolean(omit);
        quantity.min = ['entry','exit'].includes(operation.value)?'1':'0';
        host.querySelector('[data-stock-quantity-title]').textContent = operation.value==='adjust'?'Nova quantidade atual':stock?'Quantidade':'Quantidade inicial';
        host.querySelector('[data-stock-hint]').textContent = operation.value==='disable'?'O saldo e o histórico serão preservados. Novos pedidos deixarão de baixar este estoque.':operation.value==='enable'&&stock?'O saldo anterior será mantido. Confira se ele continua correto.':operation.value==='adjust'?'Informe o saldo final contado. A diferença ficará registrada.':'';
      }
      operation.onchange = update; update();
      let pending = null, busy = false;
      form.onsubmit = async event => {
        event.preventDefault(); if(busy || !active(ctx) || !form.reportValidity())return;
        const amount = quantity.disabled?null:Number(quantity.value);
        if(amount!==null && (!Number.isSafeInteger(amount)||amount<Number(quantity.min)||amount>1000000000))return notice('Informe unidades inteiras válidas.');
        const args = {target_barbershop_id:ctx.tenant,target_item_id:item.id,operation:operation.value,supplied_quantity:amount,reason:form.elements.reason.value.trim(),expected_version:Number(stock?.version || 0)};
        const signature = JSON.stringify(args);
        if(!pending || pending.signature!==signature)pending={signature,id:crypto.randomUUID()};
        busy = true; const controls = [...form.elements]; controls.forEach(el=>el.disabled=true);
        host.querySelector('[data-stock-refresh]').disabled=true; notice('Salvando movimentação...');
        try {
          await rpc('catalog_stock_command',{...args,request_id:pending.id});
          if(!active(ctx))return;
          if(host.open && ctx.dialogToken===token){await open(ctx,item); notice('Movimentação salva. O histórico foi atualizado.');}
          const current = await read(ctx); if(active(ctx))renderButtons(ctx,current.products);
        } catch(error) { if(active(ctx) && ctx.dialogToken===token) notice(error.message); }
        finally {
          busy=false;controls.forEach(el=>el.disabled=false);
          if(ctx.dialogToken===token){update();host.querySelector('[data-stock-refresh]').disabled=false;}
        }
      };
    } catch(error) { if(active(ctx) && ctx.dialogToken===token) notice(error.message); }
  }
  function renderButtons(ctx,stocks) {
    if(!active(ctx))return;
    document.querySelectorAll('[data-stock-item]').forEach(el=>el.remove());
    document.querySelectorAll('#menuCatalogList [data-edit-menu-item]').forEach(edit=>{
      const id = edit.dataset.editMenuItem, item = ctx.items.find(i=>i.id===id);
      const button = document.createElement('button');button.type='button';button.className='table-button';button.dataset.stockItem=id;
      const stock = stocks.find(s=>s.item_id===id);
      button.textContent = stock?.enabled?`Estoque: ${Number(stock.quantity)} un.`:'Configurar estoque';
      button.disabled = !item;button.title = item?'Consultar saldo e movimentações':'Salve e publique o produto antes de configurar o estoque.';
      button.onclick = () => open(ctx,item);edit.after(button);
    });
  }
  globalThis.loadCatalogInventory = async (menu,status) => {
    const version = ++generation; dialog?.close();
    const root = document.getElementById('menuCatalogList'); if(!root)return;
    let host = document.getElementById('catalogStockSummary');
    if(!host){host=document.createElement('section');host.id='catalogStockSummary';host.className='commercial-form';root.before(host);}
    context = null;document.querySelectorAll('[data-stock-item]').forEach(el=>el.remove());
    if(typeof currentRole!=='undefined'&&!['owner','admin'].includes(currentRole)){host.hidden=true;return;}
    host.hidden=false;
    if(status?.inventory_enabled!==true){host.innerHTML='<h3>Estoque por produto</h3><p>Quantidade atual e histórico de entradas, saídas e ajustes estão disponíveis no plano Completo ativo, inclusive durante o teste de 14 dias.</p>';return;}
    const ctx={tenant:BARBERSHOP_ID,items:(menu?.menu_categories || []).flatMap(c=>c.menu_items || [])}; context=ctx;
    host.innerHTML='<h3>Estoque por produto</h3><p data-stock-summary-status role="status">Carregando estoque...</p><button type="button" class="table-button" data-stock-all>Ver histórico de estoque</button>';
    host.querySelector('[data-stock-all]').onclick=()=>open(ctx);
    try {
      const data=await read(ctx);if(version!==generation||!active(ctx))return;
      renderButtons(ctx,data.products);
      host.querySelector('[data-stock-summary-status]').textContent='Use o botão de estoque de cada produto para ativar o controle e registrar movimentações. Produtos sem controle continuam com a disponibilidade manual.';
    }catch(error){if(version===generation&&active(ctx))host.querySelector('[data-stock-summary-status]').textContent=error.message;}
  };
})();
