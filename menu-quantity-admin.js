(() => {
  const $ = id => document.getElementById(id), model = globalThis.OgritechMenuQuantity;
  const escape = value => String(value || "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let mounted = false, hadRules = false;
  function names() { return [...$("menuQuantityOptions").querySelectorAll("[data-quantity-option]")].map(input => input.value.trim()); }
  function add(name = "") {
    if (names().length >= 50) return;
    const row = document.createElement("div"); row.className = "quantity-option-editor";
    row.innerHTML = `<label><span>Sabor ou opção</span><input data-quantity-option maxlength="80" placeholder="Ex.: Chocolate branco" value="${escape(name)}" required></label><button type="button" class="table-button" data-remove-quantity-option aria-label="Remover opção">×</button>`;
    $("menuQuantityOptions").append(row); refresh(); return row;
  }
  function current() {
    if (!$("menuQuantityRulesEnabled").checked) return null;
    const step = Number($("menuQuantityStep").value);
    return {step, distribution_step: $("menuQuantityDistributionEnabled").checked ? Number($("menuQuantityDistributionStep").value) : step, options: $("menuQuantityDistributionEnabled").checked ? names() : []};
  }
  function refresh() {
    if (!mounted) return;
    const locked = $("menuQuantityRulesEnabled").disabled, enabled = $("menuQuantityRulesEnabled").checked, distribution = enabled && $("menuQuantityDistributionEnabled").checked;
    $("menuQuantityLotFields").hidden = !enabled; $("menuQuantityDistributionFields").hidden = !distribution;
    $("menuQuantityLotFields").querySelectorAll("input,button,textarea").forEach(input => input.disabled = !enabled || locked);
    $("menuQuantityDistributionFields").querySelectorAll("input,button,textarea").forEach(input => input.disabled = !distribution || locked);
    $("menuQuantityAddOption").disabled = locked || !distribution || names().length >= 50;
    $("menuQuantityOptionCount").textContent = `${names().length} de 50 opções`;
    const rule = current(), minimum = Number($("menuItemMinimum").value), maximum = $("menuItemMaximum").value === "" ? null : Number($("menuItemMaximum").value);
    const nativeStep = enabled ? (Number.isSafeInteger(rule.step) && rule.step > 0 ? rule.step : 1) : .001;
    $("menuItemMinimum").step = nativeStep; $("menuItemMinimum").min = nativeStep;
    $("menuItemMaximum").step = nativeStep; $("menuItemMaximum").min = enabled && minimum > 0 ? minimum : .001;
    const error = model.validateRules(rule, minimum, maximum);
    $("menuQuantityPreview").classList.toggle("quantity-preview-error", Boolean(error));
    $("menuQuantityPreview").textContent = error || (rule ? `O cliente poderá comprar ${[minimum, minimum + rule.step, minimum + rule.step * 2].filter(value => value <= (maximum || model.LIMIT)).join(", ")} unidades${maximum ? `, até ${maximum}` : ""}.${distribution ? ` A quantidade será dividida entre as opções, de ${rule.distribution_step} em ${rule.distribution_step}, sem acréscimo por sabor.` : ""} O preço informado é por unidade de venda.` : "Venda atual: a quantidade mínima continua aplicada. Ative os múltiplos para vender em lotes.");
    $("menuItemMinimum").setCustomValidity(error ? "Revise as regras de quantidade indicadas abaixo." : "");
  }
  function setup() {
    if (mounted || !model || !$("menuQuantityRulesEditor") || typeof document.createElement !== "function") return;
    $("menuQuantityRulesEditor").innerHTML = `<label class="settings-toggle"><input id="menuQuantityRulesEnabled" type="checkbox"><span>Vender em quantidades múltiplas</span></label><div id="menuQuantityLotFields" hidden><label>Comprar de quantas em quantas?<input id="menuQuantityStep" type="number" min="1" max="10000" step="1" value="25" required><small>Ex.: mínimo 100 e múltiplo 25 permite comprar 100, 125, 150…</small></label><div class="quantity-step-presets" aria-label="Sugestões de múltiplos">${[5,10,25,50].map(value => `<button type="button" class="table-button" data-quantity-preset="${value}">De ${value} em ${value}</button>`).join("")}</div><label class="settings-toggle"><input id="menuQuantityDistributionEnabled" type="checkbox"><span>Dividir o total entre sabores ou opções do mesmo preço</span></label><div id="menuQuantityDistributionFields" hidden><label>Quantidade por sabor ou opção<input id="menuQuantityDistributionStep" type="number" min="1" max="10000" step="1" value="25" required><small>O cliente poderá escolher zero ou múltiplos deste valor para cada opção. A soma deve fechar o total comprado.</small></label><div class="quantity-options-heading"><strong>Sabores ou opções</strong><small id="menuQuantityOptionCount"></small></div><div id="menuQuantityOptions"></div><button id="menuQuantityAddOption" type="button" class="table-button edit">+ Adicionar opção</button><details class="quantity-bulk"><summary>Adicionar várias opções de uma vez</summary><label>Nomes, um por linha<textarea id="menuQuantityBulk" maxlength="5000" rows="4" placeholder="Chocolate&#10;Chocolate branco&#10;Morango&#10;Banana"></textarea></label><button id="menuQuantityImportOptions" type="button" class="table-button">Adicionar nomes à lista</button><p id="menuQuantityImportMessage" role="status"></p></details></div></div><p id="menuQuantityPreview" class="quantity-rule-preview" role="status" aria-live="polite"></p>`;
    mounted = true;
    $("menuQuantityRulesEditor").addEventListener("input", refresh);
    $("menuQuantityRulesEditor").addEventListener("change", refresh);
    $("menuQuantityRulesEditor").addEventListener("click", event => {
      const preset = event.target.closest("[data-quantity-preset]");
      if (preset) { $("menuQuantityStep").value = preset.dataset.quantityPreset; refresh(); }
      if (event.target.closest("[data-remove-quantity-option]")) { event.target.closest(".quantity-option-editor").remove(); refresh(); }
    });
    $("menuQuantityAddOption").addEventListener("click", () => add()?.querySelector("input").focus());
    $("menuQuantityImportOptions").addEventListener("click", () => {
      const existing = new Set(names().map(name => name.toLowerCase())); let added = 0;
      for (const name of $("menuQuantityBulk").value.split(/[\n;]+/).map(name => name.trim()).filter(Boolean)) {
        if (existing.has(name.toLowerCase()) || [...name].length > 80 || names().length >= 50) continue;
        add(name); existing.add(name.toLowerCase()); added++;
      }
      $("menuQuantityImportMessage").textContent = `${added} opções adicionadas. Nomes repetidos, longos ou além do limite foram ignorados.`;
      $("menuQuantityBulk").value = ""; refresh();
    });
    for (const id of ["menuItemMinimum", "menuItemMaximum"]) $(id).addEventListener("input", refresh);
    $("menuItemForm").addEventListener("invalid", event => {
      if (!$("menuQuantityRulesEnabled").checked || !event.target.closest("#menuQuantitySection")) return;
      $("menuQuantitySection").scrollIntoView({block:"center",behavior:"smooth"});
    }, true);
    load(null);
  }
  function load(item) {
    if (!mounted) return;
    const rule = model.rules(item); hadRules = Boolean(rule);
    $("menuQuantityRulesEnabled").checked = Boolean(rule);
    $("menuQuantityDistributionEnabled").checked = Boolean(rule?.options?.length);
    $("menuQuantityStep").value = rule?.step || 25; $("menuQuantityDistributionStep").value = rule?.distribution_step || rule?.step || 25;
    $("menuQuantityOptions").innerHTML = "";
    for (const name of rule?.options || []) add(name);
    $("menuQuantityBulk").value = ""; $("menuQuantityImportMessage").textContent = ""; refresh();
  }
  function read() {
    if (!mounted) return {};
    const rule = current(), error = model.validateRules(rule, Number($("menuItemMinimum").value), $("menuItemMaximum").value === "" ? null : Number($("menuItemMaximum").value));
    if (error) throw new Error(error);
    if (rule && $("menuQuantityDistributionEnabled").checked && !rule.options.length) throw new Error("Adicione pelo menos um sabor ou opção, ou desative a distribuição.");
    return rule || hadRules ? {quantity_rules: rule} : {};
  }
  globalThis.OgritechQuantityEditor = {setup, load, read, refresh};
})();
