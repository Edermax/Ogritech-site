import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../report-export.js',import.meta.url),'utf8');
const context={TextEncoder,Uint8Array,Intl,Date};runInNewContext(source,context);
const api=context.OgritechReportExport;
test('sales comparison handles increases, decreases and an empty prior period honestly',()=>{
 assert.match(api.comparison({difference_amount:50,difference_percent:25}),/Aumento de 25%.*50,00/);
 assert.match(api.comparison({difference_amount:-50,difference_percent:-25}),/Queda de 25%.*50,00/);
 assert.match(api.comparison({difference_amount:100,difference_percent:null}),/Sem base percentual anterior/);
 assert.doesNotMatch(api.comparison({difference_amount:100,difference_percent:null}),/100%|Infinity|NaN/);
 assert.match(api.comparison({difference_amount:0,difference_percent:0}),/Sem variação/);
});
test('calendar report end is exclusive and labels use the actual last included date',()=>{
 assert.equal(api.period({period_start:'2026-11-01',period_end:'2026-12-01'}),'01/11/2026 a 30/11/2026');
 assert.equal(api.period({period_start:'2026-11-02',period_end:'2026-11-09'}),'02/11/2026 a 08/11/2026');
});
test('PDF byte offsets remain valid with binary JPEG bytes, rather than string offsets',()=>{
 const jpeg=new Uint8Array([255,216,255,226,128,0,10,255,217]);
 const bytes=api.pdfFromJpeg(jpeg,1240,1754),text=new TextDecoder('latin1').decode(bytes);
 assert.ok(text.startsWith('%PDF-1.4'));
 const start=Number(/startxref\n(\d+)/.exec(text)[1]);
 assert.equal(new TextDecoder().decode(bytes.slice(start,start+4)),'xref');
 const offsets=text.slice(start).split('\n').slice(3,9).map(line=>Number(line.slice(0,10)));
 offsets.forEach((offset,index)=>assert.equal(new TextDecoder().decode(bytes.slice(offset,offset+7)),`${index+1} 0 obj`));
 assert.match(text,/\/Filter \/DCTDecode/);assert.match(text,/\/Count 1/);
});
