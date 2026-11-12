/* Local exports: no customer/report data is sent to an external conversion service. */
(() => {
  const money = value => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value || 0));
  const date = value => new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
  const lastDay = value => new Date(Date.parse(`${value}T12:00:00Z`)-86400000).toISOString().slice(0,10);
  const period = data => `${date(data.period_start)} a ${date(lastDay(data.period_end))}`;
  function comparison(data) {
    const delta = Number(data.difference_amount || 0), percent = data.difference_percent;
    if (percent === null) return `Sem base percentual anterior · aumento de ${money(delta)}`;
    if (delta === 0) return `Sem variação · ${money(0)} (0%)`;
    return `${delta > 0 ? "Aumento" : "Queda"} de ${new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(Math.abs(percent))}% · ${money(Math.abs(delta))}`;
  }
  function pdfFromJpeg(bytes,width,height) {
    const encode = value => new TextEncoder().encode(value), chunks = [encode("%PDF-1.4\n% Ogritech sales report\n")];
    const offsets = [0]; let size = chunks[0].length;
    const add = part => { chunks.push(part); size += part.length; };
    const object = (id,parts) => { offsets[id] = size; add(encode(`${id} 0 obj\n`)); parts.forEach(part => add(typeof part === "string" ? encode(part) : part)); add(encode("\nendobj\n")); };
    object(1,["<< /Type /Catalog /Pages 2 0 R >>"]);
    object(2,["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
    const pageHeight=height>1754?Math.round(595.28*height/width*100)/100:841.89;
    object(3,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 ${pageHeight}] /Resources << /XObject << /Image 4 0 R >> >> /Contents 5 0 R >>`]);
    object(4,[`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,bytes,"\nendstream"]);
    const content = `q\n595.28 0 0 ${pageHeight} 0 0 cm\n/Image Do\nQ\n`;
    object(5,[`<< /Length ${encode(content).length} >>\nstream\n${content}endstream`]);
    object(6,["<< /Title (Ogritech - Relatorio de vendas) /Creator (Ogritech) >>"]);
    const xref = size;
    add(encode(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    const result = new Uint8Array(size); let position = 0;
    for (const chunk of chunks) { result.set(chunk,position); position += chunk.length; }
    return result;
  }
  function render(data) {
    const canvas=document.createElement("canvas");canvas.width=1240;canvas.height=1754;
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Não foi possível preparar o arquivo.");
    const ink="#172d3a",muted="#526875",line="#dce6ed";
    function lines(value,width,size) {
      ctx.font=`400 ${size}px Arial,sans-serif`;const rows=[];let row="";
      for(const word of String(value).trim().split(/\s+/)) {
        if(ctx.measureText(word).width>width) {
          if(row){rows.push(row);row="";}
          for(const char of word){if(ctx.measureText(row+char).width>width&&row){rows.push(row);row="";}row+=char;}
        } else if(ctx.measureText(`${row} ${word}`.trim()).width>width&&row){rows.push(row);row=word;}
        else row=`${row} ${word}`.trim();
      }
      if(row)rows.push(row);return rows.length?rows:[""];
    }
    const businessLines=lines(data.business_name,1096,30),shift=(businessLines.length-1)*36;
    const itemRows=data.current.top_items.slice(0,10).map(item=>({item,lines:lines(item.name,650,24)}));
    const itemEnd=901+shift+itemRows.reduce((sum,row)=>sum+Math.max(48,row.lines.length*30)+8,0);
    canvas.height=Math.max(1754,itemEnd+230);
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    const text=(value,x,y,size=28,color=ink,weight=400,align="left",maxWidth)=>{
      ctx.font=`${weight} ${size}px Arial,sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;
      if(maxWidth)while(ctx.measureText(String(value)).width>maxWidth&&size>14){size--;ctx.font=`${weight} ${size}px Arial,sans-serif`;}
      ctx.fillText(String(value),x,y);
    };
    ctx.fillStyle="#08b9d3";ctx.fillRect(72,72,12,64);
    text("OGRITECH",110,98,28,"#006b7e",700);
    text(data.kind==="weekly"?"Relatório semanal de vendas":"Relatório mensal de vendas",110,146,42,ink,700);
    businessLines.forEach((row,index)=>text(row,72,205+index*36,30));
    ctx.save();ctx.translate(0,shift);
    text(period(data),72,277,27,muted);text("Pagamentos recebidos · Horário de Brasília",72,319,23,muted);
    ctx.fillStyle="#e9fafd";ctx.fillRect(72,355,1096,162);
    text("TOTAL RECEBIDO",100,397,23,"#006b7e",700);text(money(data.current.total_amount),100,458,49,ink,700,"left",620);
    text(`${data.current.order_count} pedido(s) pago(s)`,780,444,29,ink,700,"left",355);
    text(comparison(data),72,565,27,"#006b7e",700,"left",1096);
    text(`Período anterior: ${money(data.previous.total_amount)} · ${data.previous.order_count} pedido(s)`,72,610,25,muted);
    const largest=Math.max(Number(data.current.total_amount),Number(data.previous.total_amount),1);
    for(const[index,label,amount,color]of[[0,"Atual",data.current.total_amount,"#08b9d3"],[1,"Anterior",data.previous.total_amount,"#a7bac5"]]){
      const y=642+index*53;text(label,72,y+28,24,muted);ctx.fillStyle=color;ctx.fillRect(208,y,660*Number(amount)/largest,32);text(money(amount),1168,y+27,25,ink,400,"right",280);
    }
    text("Itens mais comprados",72,805,34,ink,700);text("ITEM",72,860,22,muted,700);text("QUANTIDADE",764,860,22,muted,700);text("VALOR DOS ITENS",1168,860,22,muted,700,"right");
    let y=901;
    for(const row of itemRows){
      row.lines.forEach((value,index)=>text(value,72,y+index*30,24));text(row.item.quantity,850,y,26,ink,400,"right");text(money(row.item.amount),1168,y,26,ink,400,"right",270);
      y+=Math.max(48,row.lines.length*30)+8;ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(72,y-14);ctx.lineTo(1168,y-14);ctx.stroke();
    }
    if(!itemRows.length)text("Nenhum item vendido neste período.",72,y,27,muted);
    ctx.restore();
    text(`Produtos ${money(data.current.product_amount)} · Entrega ${money(data.current.delivery_amount)} · Descontos ${money(data.current.discount_amount)}`,72,canvas.height-122,22,muted,400,"left",1096);
    text("Exclui pedidos recusados, cancelados e de teste. Valores conferidos ao abrir o relatório.",72,canvas.height-80,20,muted);
    if(data.current.estimated_payment_dates)text("Pagamentos antigos sem data registrada usam a data do pedido.",72,canvas.height-47,19,muted);
    return canvas;
  }
  function files(data) {
    const canvas = render(data), jpeg = canvas.toDataURL("image/jpeg",0.95), png = canvas.toDataURL("image/png");
    const decode = value => Uint8Array.from(atob(value.split(",")[1]),char => char.charCodeAt(0));
    const bytes = decode(jpeg);
    return { jpeg:new Blob([bytes],{type:"image/jpeg"}),png:new Blob([decode(png)],{type:"image/png"}),
      pdf:new Blob([pdfFromJpeg(bytes,canvas.width,canvas.height)],{type:"application/pdf"}) };
  }
  globalThis.OgritechReportExport = { money,date,period,comparison,pdfFromJpeg,render,files };
})();
