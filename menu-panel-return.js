/* A return path for an authenticated team member previewing their own public menu. */
(() => {
  const navigation = document.getElementById("menuPanelReturn");
  const link = document.getElementById("menuPanelReturnLink");
  if (!navigation || !link) return;
  const url = new URL(location.href);
  const slug = url.pathname.match(/^\/cardapio\/([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\/?$/)?.[1]
    || url.searchParams.get("empresa") || "";
  const environment = window.OGRITECH_ENV || "production";
  const restored = history.state?.ogritechMenuPanelPreview;
  const fromPanel = url.searchParams.get("origem") === "painel"
    || (restored?.slug === slug && restored.environment === environment);
  if (!fromPanel || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(slug)) return;
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
      const { data: menu, error: menuError } = await client.from("online_menus")
        .select("barbershop_id").eq("slug", slug).maybeSingle();
      if (version !== generation || menuError || !menu?.barbershop_id) return false;
      const { data: allowed, error: accessError } = await client.rpc("is_business_team", { target_id: menu.barbershop_id });
      if (version !== generation || accessError || allowed !== true) return false;

      // This fixed destination is still protected by the panel's existing authentication checks.
      const destination = new URL(window.ogritechEnvironmentUrl?.("/painel/?secao=loja") || "/painel/?secao=loja", url.origin);
      if (destination.origin !== url.origin || destination.pathname !== "/painel/") return false;
      link.href = destination.href;
      navigation.hidden = false;
      try {
        const clean = new URL(location.href);
        clean.searchParams.delete("origem");
        history.replaceState({ ...history.state, ogritechMenuPanelPreview: { slug, environment } }, "", clean.href);
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
