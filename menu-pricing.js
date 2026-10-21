(() => {
  // Match the database: included choices consume the cheapest options first.
  function unitPrice(base, selections = [], groups = []) {
    let total = Number(base);
    for (const group of groups) {
      let included = Number(group.free_selections) || 0;
      const selected = (group.options || []).filter(option => selections.some(choice => choice.menu_option_id === option.id))
        .sort((a, b) => Number(a.price_delta) - Number(b.price_delta) || a.id.localeCompare(b.id));
      for (const option of selected) {
        const quantity = selections.filter(choice => choice.menu_option_id === option.id).reduce((sum, choice) => sum + Number(choice.quantity), 0);
        const free = Math.min(included, quantity);
        included -= free;
        total += (quantity - free) * Number(option.price_delta);
      }
    }
    return Math.round(total * 100) / 100;
  }
  globalThis.OgritechMenuPricing = {unitPrice};
})();
