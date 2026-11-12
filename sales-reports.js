(() => {
  const $ = id => document.getElementById(id), dialog = $("salesReportDialog");
  if (!dialog) return;
  const format = globalThis.OgritechReportExport;
  let generation = 0, urls = [];
  const node = (tag,text,className) => { const el=document.createElement(tag); if (text !== undefined) el.textContent=String(text); if (className) el.className=className; return el; };
  function revoke() { urls.forEach(url=>URL.revokeObjectURL(url)); urls=[]; }
  function stop() { generation++; if (dialog.open) dialog.close(); revoke(); $("salesReportContent").replaceChildren(); $("salesReportExports").hidden=true; }
  async function list(businessId) {
    const result = await supabaseClient.rpc("menu_sales_reports",{target_barbershop_id:businessId});
    if (result.error || !Array.isArray(result.data)) throw new Error("reports_unavailable");
    return result.data.filter(report=>report && ["weekly","monthly"].includes(report.kind) && /^[a-f0-9-]{36}$/i.test(report.id)
      && /^\d{4}-\d{2}-\d{2}$/.test(report.period_start) && /^\d{4}-\d{2}-\d{2}$/.test(report.period_end)).slice(0,24).map(report=>({
      id:`report:${report.id}`,reportId:report.id,kind:"report",date:report.created_at,
      title:`Relatório ${report.kind === "weekly" ? "semanal" : "mensal"} · ${format.period(report)}`,
      body:"Pedidos pagos, valores recebidos, itens mais comprados e comparação com o período anterior. Abrir em JPEG, PNG ou PDF."
    }));
  }
  function validate(data) {
    if (!data || !["weekly","monthly"].includes(data.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(data.period_start)
      || !/^\d{4}-\d{2}-\d{2}$/.test(data.period_end) || !Array.isArray(data.current?.top_items) || data.current.top_items.length>10) throw new Error("invalid_report");
    for (const period of [data.current,data.previous]) for (const key of ["order_count","total_amount","product_amount","delivery_amount","discount_amount"])
      if (!Number.isFinite(Number(period?.[key])) || Number(period[key])<0) throw new Error("invalid_report");
    if (!Number.isFinite(Number(data.difference_amount)) || data.difference_percent!==null && !Number.isFinite(Number(data.difference_percent))) throw new Error("invalid_report");
    return data;
  }
  function render(data) {
    const content = $("salesReportContent"); content.replaceChildren();
    content.append(node("p",data.business_name,"sales-report-business"),node("p",format.period(data),"sales-report-period"));
    const summary=node("div",undefined,"sales-report-summary");
    for (const [label,value] of [["Total recebido",format.money(data.current.total_amount)],["Pedidos pagos",data.current.order_count]]) {
      const card=node("article"); card.append(node("span",label),node("strong",value)); summary.append(card);
    }
    content.append(summary,node("p",format.comparison(data),"sales-report-comparison"),node("p",`Período anterior: ${format.money(data.previous.total_amount)} · ${data.previous.order_count} pedido(s).`,"sales-report-note"));
    const chart=node("div",undefined,"sales-report-chart"),largest=Math.max(Number(data.current.total_amount),Number(data.previous.total_amount),1);
    for (const [label,amount] of [["Atual",data.current.total_amount],["Anterior",data.previous.total_amount]]) {
      const row=node("div",undefined,"sales-report-bar-row"),track=node("span",undefined,"sales-report-bar-track"),bar=node("span",undefined,"sales-report-bar");
      bar.style.width=`${100*Number(amount)/largest}%`; if(label==="Anterior")bar.classList.add("is-previous"); track.append(bar);
      row.append(node("span",label),track,node("strong",format.money(amount))); chart.append(row);
    }
    content.append(chart,node("h3","Itens mais comprados"));
    const table=node("table"),head=node("thead"),headRow=node("tr");
    for (const label of ["Item","Quantidade","Valor dos itens"]) headRow.append(node("th",label));
    head.append(headRow); const body=node("tbody");
    for (const item of data.current.top_items) { const row=node("tr"); row.append(node("td",String(item.name).slice(0,150)),node("td",item.quantity),node("td",format.money(item.amount))); body.append(row); }
    table.append(head,body);
    if (data.current.top_items.length) content.append(table); else content.append(node("p","Nenhum item vendido neste período."));
    content.append(node("p",`Produtos: ${format.money(data.current.product_amount)} · Entrega: ${format.money(data.current.delivery_amount)} · Descontos: ${format.money(data.current.discount_amount)}.`),
      node("p","Somente pagamentos recebidos, excluindo pedidos recusados, cancelados e de teste. O período considera a data em que o pagamento foi marcado como recebido, no horário de Brasília. Os valores são conferidos ao abrir o relatório.","sales-report-note"));
    if(data.current.estimated_payment_dates)content.append(node("p","Pagamentos antigos sem data de recebimento registrada usam a data do pedido.","sales-report-note"));
    revoke(); const files=format.files(data);
    for(const [kind,id] of [["jpeg","salesReportJpeg"],["png","salesReportPng"],["pdf","salesReportPdf"]]) {
      const url=URL.createObjectURL(files[kind]); urls.push(url); $(id).href=url;
      $(id).setAttribute("aria-label",`Abrir relatório ${data.kind==="weekly"?"semanal":"mensal"} em ${kind.toUpperCase()}`);
    }
    $("salesReportExports").hidden=false;
  }
  async function open(reportId,businessId) {
    const version=++generation; revoke(); $("salesReportContent").replaceChildren(); $("salesReportExports").hidden=true;
    $("salesReportTitle").textContent="Relatório de vendas"; $("salesReportStatus").textContent="Conferindo os pagamentos do período...";
    if(!dialog.open)dialog.showModal();
    try {
      const result=await supabaseClient.rpc("menu_sales_report",{target_barbershop_id:businessId,target_report_id:reportId});
      if(version!==generation)return;
      if(result.error)throw result.error;
      const data=validate(result.data); render(data);
      $("salesReportTitle").textContent=data.kind==="weekly"?"Relatório semanal de vendas":"Relatório mensal de vendas";
      $("salesReportStatus").textContent="Relatório atualizado. Escolha JPEG, PNG ou PDF para abrir o arquivo.";
    }catch {if(version===generation)$("salesReportStatus").textContent="Não foi possível abrir o relatório. Feche e tente novamente em instantes.";}
  }
  $("salesReportClose").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("close",()=>{generation++;$("panelNotificationButton")?.focus();});
  globalThis.OgritechSalesReports={list,open,stop};
})();
