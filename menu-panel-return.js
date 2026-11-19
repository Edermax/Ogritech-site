/* Return to the verified team panel or Ogritech administration after a menu preview. */
(() => {
  const navigation = document.getElementById("menuPanelReturn");
  const link = document.getElementById("menuPanelReturnLink");
  if (!navigation || !link) return;
  const url = new URL(location.href);
  const slug = url.pathname.match(/^\/cardapio\/([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\/?$/)?.[1]
    || url.searchParams.get("empresa") || "";
  const environment = window.OGRITECH_ENV || "production";
  const restored = history.state?.ogritechMenuPanelPreview;
  const hint = url.searchParams.get("origem");
  const source = ["painel", "administracao"].includes(hint) ? hint
    : restored?.slug === slug && restored.environment === environment ? restored.source || "painel" : null;
  if (!["painel", "administracao"].includes(source) || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(slug)) return;
  const client = typeof supabaseClient === "undefined" ? null : supabaseClient;
  if (!client?.auth?.getUser) return;

  let generation = 0, currentUserId = null;
  function hide() {
    generation++;
    navigation.hidden = true;
    link.removeAttribute("href");
  }
  async function refresh() {
    hide();
    const version = generation;
    try {
      // A URL flag is only a navigation hint. The server validates identity and team membership.
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (version !== generation || identityError || !identity?.user?.id) return false;
      currentUserId = identity.user.id;
      if (source === "administracao") {
        const { data: allowed, error: accessError } = await client.rpc("is_platform_admin");
        if (version !== generation || accessError || allowed !== true) return false;
      } else {
        const { data: menu, error: menuError } = await client.from("online_menus")
          .select("barbershop_id").eq("slug", slug).maybeSingle();
        if (version !== generation || menuError || !menu?.barbershop_id) return false;
        const { data: allowed, error: accessError } = await client.rpc("is_business_team", { target_id: menu.barbershop_id });
        if (version !== generation || accessError || allowed !== true) return false;
      }

      // This fixed destination is still protected by the panel's existing authentication checks.
      const target = source === "administracao" ? "/admin.html#businesses" : "/painel/?secao=loja";
      const destination = new URL(window.ogritechEnvironmentUrl?.(target) || target, url.origin);
      if (destination.origin !== url.origin || destination.pathname !== (source === "administracao" ? "/admin.html" : "/painel/")) return false;
      link.href = destination.href;
      link.textContent = source === "administracao" ? "← Voltar à Ogritech" : "← Voltar ao painel";
      navigation.hidden = false;
      try {
        const clean = new URL(location.href);
        clean.searchParams.delete("origem");
        history.replaceState({ ...history.state, ogritechMenuPanelPreview: { slug, environment, source } }, "", clean.href);
      } catch { /* The authenticated return link also works if history updates are unavailable. */ }
      return true;
    } catch { return false; }
  }
  client.auth.onAuthStateChange?.((event, session) => {
    if (event === "SIGNED_OUT" || (currentUserId && session?.user?.id !== currentUserId)) hide();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) void refresh(); });
  return refresh();
})();
