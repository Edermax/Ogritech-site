import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const source = await readFile(new URL("../menu-order-actions.js", import.meta.url), "utf8");
function fixture() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { value:"",textContent:"",hidden:false,href:"",opened:false,events:{},
      addEventListener(name, handler) { this.events[name] = handler; }, querySelectorAll() { return []; },
      showModal() { this.opened = true; }, close() { this.opened = false; this.events.close?.(); },
      focus() {}, removeAttribute(name) { this[name] = ""; } });
    return elements.get(id);
  };
  const context = { document:{getElementById:get,activeElement:{focus(){}}},window:{},Intl,URL,
    supabaseClient:{rpc(){throw Error("Unexpected database mutation");},functions:{invoke(){throw Error("Unexpected provider request");}}} };
  runInNewContext(source, context);
  return {get,open:context.window.OgritechOrderActions.openReady};
}
const order = {id:"order",order_number:42,public_reference:"REF",customer_name:"Ana",customer_phone:"(11) 99999-9999",status:"confirmed",fulfillment_type:"pickup",payment_status:"pending"};
test("ready notice targets the customer and includes the order, business and pickup", () => {
  const {get,open} = fixture(); open(order,"Doces da Maria");
  assert.equal(get("menuReadyDialog").opened,true);
  const url = new URL(get("menuReadyWhatsApp").href);
  assert.equal(url.origin,"https://wa.me");assert.equal(url.pathname,"/5511999999999");
  for (const text of ["Ana","#42","Doces da Maria","pronta para retirada"]) assert.ok(url.searchParams.get("text").includes(text));
  assert.equal(order.status,"confirmed");assert.equal(order.payment_status,"pending");
});
test("delivery notice does not claim that the order has been dispatched", () => {
  const {get,open} = fixture();open({...order,fulfillment_type:"delivery"},"Loja");
  assert.match(get("menuReadyText").value,/combinar a entrega/);assert.doesNotMatch(get("menuReadyText").value,/retirada|saiu para entrega/);
});
test("Brazilian local and international phones map to the same WhatsApp recipient", () => {
  for(const phone of ["11999999999","+55 (11) 99999-9999","5511999999999"]){const {get,open}=fixture();open({...order,customer_phone:phone},"Loja");assert.equal(new URL(get("menuReadyWhatsApp").href).pathname,"/5511999999999");}
  const {get,open}=fixture();open({...order,customer_phone:"55999999999"},"Loja");assert.equal(new URL(get("menuReadyWhatsApp").href).pathname,"/5555999999999");
});
test("invalid customer contact clears the previous recipient and offers no send link", () => {
  for(const phone of [null,"","javascript:alert(1)","5511999999999?text=wrong","0000","+1 212 555 1234"]){
    const {get,open}=fixture();open(order,"Loja");get("menuReadyDialog").close();open({...order,customer_phone:phone},"Loja");
    assert.equal(get("menuReadyWhatsApp").hidden,true);assert.equal(get("menuReadyWhatsApp").href,"");assert.match(get("menuReadyMessage").textContent,/telefone válido/);
  }
});
test("message can be reviewed and edited without opening or sending WhatsApp automatically", () => {
  const {get,open}=fixture();open({...order,customer_name:"<script>alert(1)</script>"},"Loja & Cia");
  get("menuReadyText").value="Olá! A encomenda está pronta & disponível.";get("menuReadyText").events.input();assert.equal(new URL(get("menuReadyWhatsApp").href).searchParams.get("text"),get("menuReadyText").value);
  get("menuReadyText").value=" ";get("menuReadyText").events.input();assert.equal(get("menuReadyWhatsApp").hidden,true);
  get("menuReadyDialog").close();assert.equal(get("menuReadyText").value,"");assert.equal(get("menuReadyWhatsApp").href,"");
});
test("test orders and orders outside the confirmed stage cannot open a ready notice", () => {
  for(const overrides of [{is_test:true},...['received','rejected','cancelled','completed'].map(status=>({status}))]){const {get,open}=fixture();open({...order,...overrides},"Loja");assert.equal(get("menuReadyDialog").opened,false);}
});
