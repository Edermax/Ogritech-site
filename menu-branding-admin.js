(() => {
  const $ = id => document.getElementById(id), form = $("menuBrandingForm"), api = globalThis.OgritechMenuBranding;
  if (!form || !api) return;
  let state = null, menu = null, busy = false;
  let pendingAction = null, dirty = false;
  let logoFile = null, logoPreview = "";
  const message = (text, error = false) => { $("menuBrandingMessage").textContent = text; $("menuBrandingMessage").classList.toggle("error", error); };
  const rpc = async (action, payload = {}) => {
    const result = await supabaseClient.rpc("menu_branding", {target_barbershop_id:BARBERSHOP_ID,action,payload});
    if (result.error) throw new Error(["22023","42501","23514"].includes(result.error.code) ? result.error.message : "Não foi possível salvar a aparência. Suas alterações publicadas foram preservadas.");
    return result.data;
  };
  function releasePreview() { if (logoPreview) URL.revokeObjectURL(logoPreview); logoPreview = ""; }
  function renderPreview() {
    if (!state) return;
    api.applyColors($("menuBrandingPreview"), {primary_color:$("menuBrandingPrimary").value,accent_color:$("menuBrandingAccent").value});
    $("menuBrandingPreviewTitle").textContent = menu?.title || "Seu cardápio";
    const image = $("menuBrandingPreviewLogo");
    const url = logoPreview || api.assetUrl(state.identity.logo_path, window.OGRITECH_SUPABASE_URL);
    image.hidden = !url;
    if (url) image.src = url; else image.removeAttribute("src");
  }
  function renderActions() {
    const canReview = state.has_draft && !dirty;
    $("menuBrandingSave").textContent = state.menu_published ? "1. Salvar alterações" : "Salvar aparência";
    $("menuBrandingSave").hidden = Boolean(pendingAction) || canReview;
    $("menuBrandingPublish").hidden = Boolean(pendingAction) || !canReview;
    $("menuBrandingDiscard").hidden = Boolean(pendingAction) || !state.has_draft;
    $("menuBrandingConfirm").hidden = !pendingAction;
  }
  function render() {
    if (!state) return;
    dirty = false;
    pendingAction = null;
    $("menuBrandingConfirm").hidden = true;
    $("menuBrandingPrimary").value = state.identity?.primary_color || "#111827";
    $("menuBrandingAccent").value = state.identity?.accent_color || "#08b9d3";
    renderActions();
    $("menuBrandingDraftNotice").textContent = state.has_draft ? "Aparência em rascunho. Seus clientes continuam vendo a versão publicada." : state.menu_published ? "Edite e salve um rascunho. A aparência pública só muda ao publicar." : "A aparência será exibida quando você publicar seu cardápio.";
    logoFile = null;
    releasePreview();
    $("menuBrandingLogo").value = "";
    $("menuPrimaryColor").value = state.published_identity?.primary_color || "#111827";
    $("menuAccentColor").value = state.published_identity?.accent_color || "#08b9d3";
    renderPreview();
  }
  async function run(action) {
    if (busy) return;
    busy = true; form.querySelectorAll("input,button").forEach(element => { element.disabled = true; });
    try { await action(); } catch(error) { message(error.message, true); }
    finally { busy = false; form.querySelectorAll("input,button").forEach(element => { element.disabled = false; }); }
  }
  $("menuBrandingPreviewLogo").addEventListener("error", () => {
    $("menuBrandingPreviewLogo").hidden = true;
    message("Não foi possível exibir o logo. Escolha outro arquivo ou tente carregar a prévia novamente.", true);
  });
  globalThis.loadMenuBranding = async currentMenu => {
    menu = currentMenu;
    const allowed = sessionStorage.getItem("japaRole") !== "employee";
    $("menuBrandingPanel").hidden = !menu || !allowed;
    if (!menu || !allowed) return;
    try { state = await rpc("get"); render(); message(""); if (!busy) form.querySelectorAll("input,button").forEach(element => { element.disabled = false; }); }
    catch(error) { state = null; message(error.message, true); form.querySelectorAll("input,button").forEach(element => { element.disabled = true; }); }
  };
  {
    const input = $("menuBrandingLogo");
    input.addEventListener("change", () => run(async () => {
      const file = input.files?.[0]; if (!file) return;
      try { await api.validateImage(file); } catch(error) { input.value = ""; throw error; }
      logoFile = file; dirty = true; pendingAction = null; renderActions(); releasePreview(); logoPreview = URL.createObjectURL(file); renderPreview(); message("Prévia atualizada. Salve para guardar a alteração.");
    }));
    $("menuBrandingRemoveLogo").addEventListener("click", () => {
      if (!state || busy) return;
      logoFile = null; dirty = true; pendingAction = null; renderActions(); releasePreview(); state.identity.logo_path = ""; input.value = ""; renderPreview(); message("Remoção preparada. Salve para confirmar.");
    });
  }
  for (const id of ["menuBrandingPrimary","menuBrandingAccent"]) $(id).addEventListener("input", () => { if (!state || busy) return; dirty = true; pendingAction = null; renderActions(); renderPreview(); message("Prévia atualizada. Salve para guardar a alteração."); });
  form.addEventListener("submit", event => {
    event.preventDefault(); if (!state) return;
    run(async () => {
      const uploaded = [];
      const payload = {primary_color:$("menuBrandingPrimary").value,accent_color:$("menuBrandingAccent").value,
        logo_path:state.identity.logo_path || "",cover_path:state.identity.cover_path || ""};
      try {
        if (logoFile) {
          await api.validateImage(logoFile);
          const ext = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[logoFile.type];
          const path = `${BARBERSHOP_ID}/${crypto.randomUUID()}.${ext}`;
          const result = await supabaseClient.storage.from("menu-images").upload(path,logoFile,{contentType:logoFile.type,cacheControl:"31536000",upsert:false});
          if (result.error) throw new Error("Não foi possível enviar a imagem. Tente novamente.");
          uploaded.push(path); payload.logo_path = path;
        }
        state = await rpc("save",payload);
        menu.visual_identity = state.published_identity;
        $("menuPrimaryColor").value = state.published_identity.primary_color;
        $("menuAccentColor").value = state.published_identity.accent_color;
        render(); message(state.has_draft ? "Rascunho salvo. Confira a prévia e selecione Revisar aparência." : "Aparência salva.");
      } catch(error) { if(uploaded.length) await supabaseClient.storage.from("menu-images").remove(uploaded); throw error; }
    });
  });
  function requestAction(action) {
    if (!state?.has_draft || busy) return;
    if (action === "publish" && dirty) { message("Salve as alterações da prévia antes de publicar.", true); return; }
    pendingAction = action;
    $("menuBrandingConfirmText").textContent = action === "publish" ? "Publicar esta aparência para todos os clientes?" : "Descartar o rascunho e manter a aparência publicada?";
    $("menuBrandingConfirmYes").textContent = action === "publish" ? "3. Publicar aparência" : "Descartar rascunho";
    renderActions();
    $("menuBrandingConfirmYes").focus();
  }
  $("menuBrandingPublish").addEventListener("click", () => requestAction("publish"));
  $("menuBrandingDiscard").addEventListener("click", () => requestAction("discard"));
  $("menuBrandingConfirmNo").addEventListener("click", () => { const trigger = pendingAction === "discard" ? "menuBrandingDiscard" : "menuBrandingPublish"; pendingAction = null; renderActions(); $(trigger).focus(); });
  $("menuBrandingConfirmYes").addEventListener("click", () => {
    const action = pendingAction; if (!action || busy) return;
    pendingAction = null; renderActions();
    run(async () => { state = await rpc(action); menu.visual_identity = state.published_identity; render(); message(action === "publish" ? "Aparência publicada. O cardápio já exibe a nova identidade." : "Rascunho descartado. Aparência publicada preservada."); });
  });
  addEventListener("pagehide", () => { releasePreview(); });
})();
