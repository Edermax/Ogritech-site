/* Guidance mirrors the loaded panel. Server permissions remain authoritative. */
(() => {
  const plans = { cardapio: "Ogritech Cardápio", encomendas: "Ogritech Encomendas" };
  const roles = { owner: "Proprietário", admin: "Administrador", employee: "Funcionário" };
  const topics = [
    { id: "produtos", label: "Produtos, fotos e opções", permission: "manage" },
    { id: "whatsapp", label: "WhatsApp e compartilhamento", permission: "manage" },
    { id: "pedidos", label: "Pedidos e atendimento", orders: true },
    { id: "vendas", label: "Vendas e relatórios", orders: true, permission: "manage" },
    { id: "entregas", label: "Entrega, retirada e agendamento", orders: true, permission: "manage" },
    { id: "pagamentos", label: "Pagamentos dos pedidos e Pix", orders: true, permission: "manage" },
    { id: "configuracoes", label: "Configurações e horários", permission: "manage" },
    { id: "publicacao", label: "Publicação do cardápio", permission: "manage" },
    { id: "notificacoes", label: "Notificações de pedidos", orders: true },
    { id: "assinatura", label: "Plano e assinatura", permission: "owner" },
    { id: "aplicativo", label: "Instalar aplicativo" },
    { id: "acesso", label: "Minha conta e permissões" }
  ];
  const actions = Object.freeze({
    orders: { section: "cardapio", workspace: "operation", label: "Abrir Pedidos" },
    sales: { section: "vendas", label: "Abrir Vendas" },
    products: { section: "produtos", workspace: "catalog", label: "Abrir Produtos" },
    settings: { section: "loja", workspace: "settings", label: "Abrir Atendimento" },
    publication: { section: "loja", workspace: "review", label: "Abrir Publicação" },
    start: { section: "loja", workspace: "start", label: "Começar meu cardápio" },
    account: { section: "configuracoes", selector: "#accountSettings", label: "Abrir minha conta" },
    app: { section: "configuracoes", selector: "#panelInstallApp", label: "Ver instalação do aplicativo" },
    plan: { section: "configuracoes", selector: "#subscriptionCenter", label: "Ver plano e assinatura" },
    upgrade: { section: "configuracoes", selector: '[data-alternative-plan="encomendas"]', label: "Ver troca para Ogritech Encomendas" }
  });
  const known = context => Boolean(context?.ready && Object.hasOwn(plans, context.offer) && Object.hasOwn(roles, context.role));
  const planTitle = context => typeof context.planName === "string" && context.planName.trim() ? (/^Ogritech\b/i.test(context.planName) ? context.planName : `Ogritech ${context.planName}`) : plans[context.offer];
  const manager = context => ["owner", "admin"].includes(context.role);
  const result = (text, ids = []) => ({ text, actions: ids.map(id => ({ id, ...actions[id] })) });

  function menu(context) {
    if (!known(context)) return { greeting: "Ainda não consegui confirmar seu plano e perfil. Aguarde o carregamento do painel. Se não carregar, use Atualizar dados e tente novamente.", topics: [] };
    const list = topics.map(topic => ({
      id: topic.id,
      label: topic.label + (topic.orders && context.offer === "cardapio" ? " (Encomendas)" : topic.permission === "manage" && !manager(context) ? " (gestão)" : topic.permission === "owner" && context.role !== "owner" ? " (proprietário)" : "")
    }));
    if (context.offer === "encomendas") list.unshift(...list.splice(list.findIndex(topic => topic.id === "pedidos"), 1));
    return { greeting: `Seu painel: ${planTitle(context)}. Perfil: ${roles[context.role]}. Como posso ajudar?`, topics: list };
  }

  function answer(id, context) {
    if (!known(context)) return result(menu(context).greeting);
    const topic = topics.find(item => item.id === id);
    if (!topic) return result("Escolha uma das dúvidas para receber uma orientação do seu painel.");
    if (topic.orders && context.offer === "cardapio") {
      const features = {
        pedidos: "recebimento e gestão de pedidos na aba Pedidos",
        vendas: "a aba Vendas e seus relatórios dos pedidos da plataforma",
        entregas: "configuração de entrega, retirada e agendamento de pedidos na plataforma",
        pagamentos: "gestão de pagamentos, comprovantes e opções de Pix dos pedidos na plataforma",
        notificacoes: "notificações automáticas de novos pedidos da plataforma"
      };
      const explanation = `Seu plano atual, ${planTitle(context)}, não inclui ${features[id]}. Nele, o cliente escolhe os produtos e continua o atendimento no WhatsApp; entrega e pagamento são combinados por lá. O Ogritech Encomendas inclui esses recursos.`;
      return context.role === "owner"
        ? result(`${explanation} Você pode avaliar a troca em Conta → Plano e assinatura. O atalho abaixo abre as opções; a troca só acontece após sua confirmação.`, ["upgrade"])
        : result(`${explanation} Peça ao proprietário para avaliar a mudança em Conta → Plano e assinatura. Seu perfil não pode alterar a assinatura.`);
    }
    if (topic.permission === "owner" && context.role !== "owner") return result("Somente o proprietário pode consultar e administrar a assinatura, trocar o plano, escolher o pagamento ou cancelar a renovação. Peça a ele para abrir Conta → Plano e assinatura. Você pode cuidar do seu acesso em Minha conta.", ["account"]);
    if (topic.permission === "manage" && !manager(context)) return result(`Esse recurso de gestão fica disponível para o proprietário e os administradores. Seu perfil de funcionário não permite ${id === "vendas" ? "abrir Vendas e consultar os relatórios" : "editar produtos, configurações ou publicação"}. Peça a um gestor para realizar a alteração ou revisar seu acesso.`, ["account"]);
    if (["produtos", "configuracoes", "whatsapp", "publicacao"].includes(id) && !context.published && context.next === "start") return result("Primeiro, abra Cardápio e escolha o modelo do seu negócio. Depois, conclua o atendimento, cadastre os produtos e siga as etapas indicadas até a primeira publicação.", ["start"]);
    if (id === "produtos" && !context.published && context.next === "settings") return result("Conclua e salve o atendimento antes de cadastrar os produtos. Depois, abra Produtos para adicionar fotos, preços, variações e grupos de opções, como sabores e recheios.", ["settings"]);
    switch (id) {
      case "pedidos": return manager(context)
        ? result("Abra Pedidos para consultar o que chegou. Use Atualizar pedidos para carregar os dados recentes. Confira os detalhes, confirme ou recuse o atendimento e atualize o andamento pelas ações exibidas em cada pedido.", ["orders"])
        : result("Seu perfil de funcionário pode consultar os pedidos e seus detalhes. Confirmar, recusar, concluir ou alterar pagamentos exige um proprietário ou administrador. Use Atualizar pedidos para conferir os dados recentes.", ["orders"]);
      case "vendas": return result("Abra Vendas para consultar os relatórios dos pedidos registrados no Ogritech Encomendas. As vendas combinadas fora da plataforma, como uma conversa no WhatsApp, não são incluídas automaticamente. Use a atualização disponível na tela para conferir os dados recentes.", ["sales"]);
      case "produtos": return result(context.published
        ? "Em Produtos, use Adicionar produto ou Editar. Cadastre fotos, preços, variações e grupos de opções, como sabores e recheios, indicando os limites de escolha. Salvar produto atualiza o catálogo online na mesma aba, incluindo alterações já salvas que estejam pendentes. Produtos ocultos ou indisponíveis continuam fora da vitrine. Se a publicação falhar, use Atualizar cardápio em Produtos."
        : "Em Produtos, use Adicionar produto ou Editar para cadastrar fotos, preços, variações e grupos de opções, como sabores e recheios. Salve cada produto e siga as etapas de revisão. O catálogo só ficará público quando você confirmar a primeira publicação.", ["products"]);
      case "whatsapp": return result(context.offer === "cardapio"
        ? "No Ogritech Cardápio, o cliente monta sua seleção e escolhe enviá-la pelo WhatsApp do estabelecimento. Cadastre o número público em Cardápio → Atendimento → Contato para pedidos. Confira o número com DDI e DDD. Após publicar, use Compartilhar cardápio na aba Cardápio para copiar o link ou o QR Code."
        : "O Ogritech Encomendas registra e acompanha os pedidos pela plataforma. O WhatsApp cadastrado serve como contato do estabelecimento. Você pode conferir o número em Cardápio → Atendimento → Contato para pedidos. Após publicar, use Compartilhar cardápio para copiar o link ou o QR Code.", ["settings", ...(context.published ? ["publication"] : [])]);
      case "configuracoes": return result(context.offer === "cardapio"
        ? "Em Cardápio → Atendimento, confira a identificação do negócio, o WhatsApp público e os horários. No seu plano, a entrega e o pagamento são combinados no WhatsApp. Algumas configurações ficam protegidas com o cardápio no ar: siga o aviso da tela para retirar do ar, salvar e publicar novamente quando necessário."
        : "Em Cardápio → Atendimento, confira identificação, horários, formas de pagamento, entrega e retirada. Salve cada formulário. Algumas configurações ficam protegidas enquanto o cardápio está no ar; siga o aviso da tela para retirar do ar e publicar novamente quando necessário.", ["settings"]);
      case "entregas": return result("Em Cardápio → Atendimento, configure retirada no local ou entrega. Se fizer entregas, informe as regiões atendidas, taxas e pedidos mínimos. Confira também a área atendida e os prazos dos produtos; eles orientam as opções de agendamento oferecidas ao cliente. Salve os formulários e siga os avisos de publicação da tela.", ["settings"]);
      case "pagamentos": return result("Em Cardápio → Atendimento, selecione as formas de pagamento e, se usar Pix, cadastre a chave nas opções de Pix. O recebimento é combinado com seu negócio; o painel não confirma dinheiro recebido automaticamente. Para um pedido, confira o pagamento e o comprovante pelas ações disponíveis em Pedidos. O pagamento da assinatura Ogritech fica separado, em Conta → Plano e assinatura.", ["settings", "orders", ...(context.role === "owner" ? ["plan"] : [])]);
      case "publicacao": return result(context.published
        ? "Seu cardápio está no ar. Salvar um produto em Produtos já atualiza a versão online; ocultos continuam ocultos. Se houver uma atualização pendente, use Atualizar cardápio na própria aba Produtos. Em Cardápio → Publicação você confere a versão pública e pode retirar o cardápio do ar quando precisar."
        : context.offer === "cardapio"
          ? "Confira o catálogo, o WhatsApp público, o atendimento e os horários. Em Cardápio → Publicação, conclua as etapas indicadas, confirme a revisão e use Publicar cardápio. No Ogritech Cardápio, a primeira publicação não exige pedido de teste nem configuração de pagamentos da plataforma."
          : "Confira os produtos, o atendimento, pagamentos e horários. Em Cardápio → Publicação, faça o pedido de teste, confirme a revisão e use Publicar cardápio quando as etapas estiverem concluídas.", [context.published ? "products" : "publication", ...(context.published ? ["publication"] : [])]);
      case "notificacoes": return result("Em Pedidos, abra Avisos de pedidos neste dispositivo, toque em Ativar neste dispositivo e confirme a permissão do navegador. Faça isso em cada aparelho compatível. No iPhone ou iPad, adicione a Ogritech à Tela de Início pelo Safari e abra pelo ícone antes de ativar. Os avisos dependem das permissões do dispositivo.", ["orders"]);
      case "assinatura": return result(`Seu plano atual é ${planTitle(context)}. Em Conta → Plano e assinatura, confira o status, os valores, a periodicidade, as opções de pagamento e os outros planos. Você também administra a renovação por lá. A troca de plano preserva o prazo de acesso, não reinicia o teste e apresenta as condições antes da confirmação.`, ["plan"]);
      case "aplicativo": return result("Abra Conta → Aplicativo e toque em Instalar o app. Confirme a instalação no navegador. Se a instalação direta não estiver disponível, o botão mostra as opções para o dispositivo. Instalar o app mantém os recursos do seu plano e as permissões do seu perfil.", ["app"]);
      case "acesso": return result(`${roles[context.role]} no ${planTitle(context)}. ${context.role === "owner" ? "Você administra o negócio e a assinatura." : context.role === "admin" ? "Você administra os recursos do negócio incluídos no plano. A assinatura fica com o proprietário." : context.offer === "encomendas" ? "Você consulta pedidos e pode configurar os avisos no seu dispositivo. Edição e decisões sobre pedidos ficam com a gestão." : "A edição do catálogo fica com os gestores; a assinatura fica com o proprietário."} Em Conta → Acesso e segurança, você pode alterar sua senha ou sair desta conta.`, ["account"]);
      default: return result("Escolha uma das dúvidas do seu painel.");
    }
  }
  globalThis.OgritechPanelHelp = Object.freeze({ menu, answer, known });
})();
