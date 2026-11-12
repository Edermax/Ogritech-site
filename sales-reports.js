(() => {
  const $ = id => document.getElementById(id), dialog = $("salesReportDialog");
  if (!dialog) return;
  const format = globalThis.OgritechReportExport;
  let generation = 0, urls = [], opener = null;
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
    const identity=node("div",undefined,"sales-report-identity");
    identity.append(node("p",data.business_name,"sales-report-business"),node("p",format.period(data),"sales-report-period"));
    content.append(identity);
    const summary=node("div",undefined,"sales-report-summary");
    for (const [label,value] of [["Total recebido",format.money(data.current.total_amount)],["Pedidos pagos",data.current.order_count]]) {
      const card=node("article"); card.append(node("span",label),node("strong",value)); summary.append(card);
    }
    content.append(summary);
    const comparison=node("section",undefined,"sales-report-section");
    comparison.append(node("h3","Comparativo de vendas"));
    const noPreviousRevenue=data.difference_percent===null;
    const comparisonText=noPreviousRevenue
      ? Number(data.difference_amount)>0 ? `${format.money(data.difference_amount)} a mais no período` : "Sem variação no período"
      : format.comparison(data);
    comparison.append(node("p",comparisonText,"sales-report-comparison"));
    if(noPreviousRevenue)comparison.append(node("p","O período anterior não teve valores recebidos para calcular uma variação percentual.","sales-report-note"));
    const chart=node("div",undefined,"sales-report-chart"),largest=Math.max(Number(data.current.total_amount),Number(data.previous.total_amount),1);
    for (const [label,period,previous] of [["Período atual",data.current,false],["Período anterior",data.previous,true]]) {
      const row=node("div",undefined,"sales-report-bar-row"),track=node("span",undefined,"sales-report-bar-track"),bar=node("span",undefined,"sales-report-bar");
      bar.style.width=`${100*Number(period.total_amount)/largest}%`; if(previous)bar.classList.add("is-previous"); track.append(bar);
      track.setAttribute("aria-hidden","true");
      const labelGroup=node("div",undefined,"sales-report-bar-label"),count=Number(period.order_count);
      labelGroup.append(node("span",label),node("small",`${count} ${count===1?"pedido pago":"pedidos pagos"}`));
      row.append(labelGroup,node("strong",format.money(period.total_amount)),track); chart.append(row);
    }
    comparison.append(chart); content.append(comparison);
    const items=node("section",undefined,"sales-report-section"),itemsTitle=node("h3","Itens mais comprados");
    itemsTitle.id="salesReportItemsTitle"; items.append(itemsTitle);
    const table=node("table"),columns=node("colgroup"),head=node("thead"),headRow=node("tr");
    table.setAttribute("aria-labelledby",itemsTitle.id);
    for (const [label,description] of [["Item","Item"],["Qtd.","Quantidade"],["Total","Valor dos itens"]]) {
      const heading=node("th",label); heading.scope="col"; heading.setAttribute("aria-label",description); headRow.append(heading); columns.append(node("col"));
    }
    head.append(headRow); const body=node("tbody");
    for (const item of data.current.top_items) { const row=node("tr"); row.append(node("td",String(item.name).slice(0,150)),node("td",item.quantity),node("td",format.money(item.amount))); body.append(row); }
    table.append(columns,head,body);
    if (data.current.top_items.length) items.append(table); else items.append(node("p","Nenhum item vendido neste período.","sales-report-note"));
    content.append(items);
    const breakdown=node("dl",undefined,"sales-report-breakdown");
    for(const [label,amount] of [["Produtos",data.current.product_amount],["Entrega",data.current.delivery_amount],["Descontos",data.current.discount_amount]]) {
      const entry=node("div"); entry.append(node("dt",label),node("dd",format.money(amount))); breakdown.append(entry);
    }
    const methodology=node("details",undefined,"sales-report-methodology");
    methodology.append(node("summary","Sobre este relatório"),node("p","Somente pagamentos recebidos. Pedidos recusados, cancelados e de teste não entram no relatório.","sales-report-note"),
      node("p","O período considera a data em que o pagamento foi marcado como recebido, no horário de Brasília. Os valores são conferidos ao abrir o relatório.","sales-report-note"));
    if(data.current.estimated_payment_dates)methodology.append(node("p","Pagamentos antigos sem data de recebimento registrada usam a data do pedido.","sales-report-note"));
    content.append(breakdown,methodology);
    revoke(); const files=format.files(data);
    for(const [kind,id] of [["jpeg","salesReportJpeg"],["png","salesReportPng"],["pdf","salesReportPdf"]]) {
      const url=URL.createObjectURL(files[kind]); urls.push(url); $(id).href=url;
      $(id).setAttribute("aria-label",`Abrir relatório ${data.kind==="weekly"?"semanal":"mensal"} em ${kind.toUpperCase()}`);
    }
    $("salesReportExports").hidden=false;
  }
  async function open(reportId,businessId) {
    opener = document.activeElement;
    const version=++generation; revoke(); $("salesReportContent").replaceChildren(); $("salesReportExports").hidden=true;
    $("salesReportTitle").textContent="Relatório de vendas"; $("salesReportStatus").textContent="Conferindo os pagamentos do período...";
    $("salesReportStatus").dataset.state="loading"; $("salesReportContent").setAttribute("aria-busy","true");
    if(!dialog.open)dialog.showModal();
    try {
      const result=await supabaseClient.rpc("menu_sales_report",{target_barbershop_id:businessId,target_report_id:reportId});
      if(version!==generation)return;
      if(result.error)throw result.error;
      const data=validate(result.data); render(data);
      $("salesReportTitle").textContent=data.kind==="weekly"?"Relatório semanal":"Relatório mensal";
      $("salesReportStatus").textContent="Valores atualizados"; $("salesReportStatus").dataset.state="ready";
    }catch {if(version===generation){$("salesReportStatus").textContent="Não foi possível abrir o relatório. Feche e tente novamente em instantes.";$("salesReportStatus").dataset.state="error";}}
    finally {if(version===generation)$("salesReportContent").setAttribute("aria-busy","false");}
  }
  $("salesReportClose").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("close",()=>{generation++;(opener?.isConnected && opener.checkVisibility() ? opener : $("panelNotificationButton"))?.focus();});
  globalThis.OgritechSalesReports={list,open,stop};
})();
