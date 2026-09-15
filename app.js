/* Em produção, runtime-config.js aponta para a API HTTPS do painel. No modo
   local continuamos usando o servidor de testes sem mudar a experiência. */
const ORDERING_API = String(window.__TWENY_MENU_API__ || '/api/v1/menu').replace(/\/+$/, '');
const state = { store: null, catalog: [], activeCategory: 'all', catalogHomeScrollY: 0, searchQuery: '', cart: [], fulfillment: 'pickup', deliveryLocation: null, deliveryMap: null, deliveryMapMarker: null, deliveryMapPoint: null, pendingProduct: null, reorderQueue: [], reorderActive: null, lockedScrollY: null, ticketCode: '', ticketTrackingToken: '', ticketPoll: null, ticketStatus: 'pending', ticketFulfillment: 'pickup', orderAttempt: null, onlinePayment: null, mercadoBrickController: null };
const ORDER_HISTORY_STORAGE_KEY = 'tweny_menu_order_history_v1';
const CUSTOMER_PROFILE_STORAGE_KEY = 'tweny_menu_customer_profile_v1';
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const ui = {
  storeName: document.querySelector('#store-name'), storeDescription: document.querySelector('#store-description'),
  status: document.querySelector('#catalog-status'), catalogTitle: document.querySelector('#catalog-title'), catalogSearch: document.querySelector('#catalog-search-input'), grid: document.querySelector('#catalog-grid'), categories: document.querySelector('#category-bar'),
  cartCount: document.querySelector('#cart-count'), cartDock: document.querySelector('#cart-dock'), cartDockLabel: document.querySelector('#cart-dock-label'), cartDockTotal: document.querySelector('#cart-dock-total'), cartSheet: document.querySelector('#cart-sheet'), optionsSheet: document.querySelector('#options-sheet'), checkoutSheet: document.querySelector('#checkout-sheet'), myOrdersSheet: document.querySelector('#my-orders-sheet'), myOrdersActive: document.querySelector('#my-orders-active-list'), myOrdersHistory: document.querySelector('#my-orders-history-list'), myOrdersActiveCount: document.querySelector('#my-orders-active-count'), myOrdersHistoryCount: document.querySelector('#my-orders-history-count'),
  cartItems: document.querySelector('#cart-items'), cartTotal: document.querySelector('#cart-total'), checkoutButton: document.querySelector('#checkout-button'),
  deliveryFields: document.querySelector('#delivery-fields'), useCurrentLocation: document.querySelector('#use-current-location'), deliveryLocationStatus: document.querySelector('#delivery-location-status'), deliveryMapPicker: document.querySelector('#delivery-map-picker'), deliveryMapCanvas: document.querySelector('#delivery-map-canvas'), deliveryMapStatus: document.querySelector('#delivery-map-status'), closeDeliveryMap: document.querySelector('#close-delivery-map'), confirmDeliveryLocation: document.querySelector('#confirm-delivery-location'), paymentOptions: document.querySelector('#payment-options'), cashPaymentDetails: document.querySelector('#cash-payment-details'), cashAmountReceived: document.querySelector('#cash-amount-received'), cashPaymentSummary: document.querySelector('#cash-payment-summary'), feedback: document.querySelector('#checkout-feedback'), checkoutForm: document.querySelector('#checkout-form'), orderSent: document.querySelector('#order-sent'), orderStatusCopy: document.querySelector('#order-status-copy'), orderTicketCode: document.querySelector('#order-ticket-code'), orderSending: document.querySelector('#order-sending-overlay'), trackingModal: document.querySelector('#order-tracking-modal'), trackingStatus: document.querySelector('#order-tracking-status'), trackingLabel: document.querySelector('#order-tracking-label'), trackingCopy: document.querySelector('#order-tracking-copy'), trackingTicketCode: document.querySelector('#tracking-ticket-code'), trackingSteps: document.querySelector('#order-tracking-steps'), trackingReason: document.querySelector('#order-tracking-reason'), copyTrackingTicket: document.querySelector('#copy-tracking-ticket'), trackingStep4Title: document.querySelector('#tracking-step-4-title'), trackingStep4Copy: document.querySelector('#tracking-step-4-copy'), trackingStep5Title: document.querySelector('#tracking-step-5-title'), trackingStep5Copy: document.querySelector('#tracking-step-5-copy'),
  optionsTitle: document.querySelector('#options-title'), optionsSubtitle: document.querySelector('#options-subtitle'), variationGroups: document.querySelector('#variation-groups'), quickAdd: document.querySelector('#options-quick-add'),
  onlinePaymentModal: document.querySelector('#online-payment-modal'), mercadoPagoBrick: document.querySelector('#mercado-pago-brick'), pixPaymentDetails: document.querySelector('#pix-payment-details'), pixPaymentQr: document.querySelector('#pix-payment-qr'), pixPaymentCopyCode: document.querySelector('#pix-payment-copy-code'), copyPixCode: document.querySelector('#copy-pix-code')
};
function appSheets() { return [ui.cartSheet, ui.optionsSheet, ui.checkoutSheet, ui.myOrdersSheet].filter(Boolean); }

function safeText(value) { return String(value || '').trim(); }
function priceOf(product) { return Number(product.priceCents ?? product.price_cents ?? 0) / 100; }
function menuPriceOf(product) { return Number(product.menuPriceCents ?? product.menu_price_cents ?? product.priceCents ?? product.price_cents ?? 0) / 100; }
function productId(product) { return safeText(product.id ?? product.productId ?? product.product_id); }
function productName(product) { return safeText(product.name ?? product.nome ?? product.description) || 'Produto'; }
function productCategory(product) { return safeText(product.category ?? product.categoria ?? 'Cardápio'); }
function productTone(name) { const palette = ['#ffb11a', '#ff7c70', '#ffadcf', '#8ed7d0', '#b29bff', '#ffcf5c']; return palette[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]; }
function isCoffeeSize(variation) { return /caf[eé]/i.test(safeText(variation?.name)); }
function splitCoffeeMilkShakes(catalog) {
  return catalog.flatMap((product) => {
    if (!/milk\s*shake/i.test(productName(product))) return [product];
    const sizes = (product.variations || []).filter((variation) => variationCategoryKey(variation.type) === 'tamanho');
    const coffeeSizes = sizes.filter(isCoffeeSize); const regularSizes = sizes.filter((variation) => !isCoffeeSize(variation));
    if (!coffeeSizes.length || !regularSizes.length) return [product];
    const createView = (name, description, selectedSizes, view) => ({
      ...product,
      id: productId(product),
      menuView: view,
      name,
      description,
      priceCents: 0,
      menuPriceCents: Math.min(...selectedSizes.map((variation) => Number(variation.priceAdditionalCents || 0))),
      variations: (product.variations || []).filter((variation) => {
        const category = variationCategoryKey(variation.type);
        if (category === 'tamanho') return selectedSizes.includes(variation);
        if (category === 'sabor') return view === 'milk-shake-cafe' ? isCoffeeSize(variation) : !isCoffeeSize(variation);
        return true;
      }).map((variation) => (
        view === 'milk-shake-cafe' && variationCategoryKey(variation.type) === 'tamanho'
          ? { ...variation, name: safeText(variation.name).replace(/\s*caf[eé]\s*$/i, '').trim() }
          : variation
      ))
    });
    return [
      createView(productName(product), 'Tamanhos tradicionais e especiais.', regularSizes, 'milk-shake'),
      createView('MILK SHAKE DE CAFÉ UP', 'Tamanhos especiais de café.', coffeeSizes, 'milk-shake-cafe')
    ];
  });
}

function setStatus(message, type = 'is-loading') {
  ui.status.hidden = false;
  ui.status.className = `catalog-status ${type}`;
  ui.status.innerHTML = type === 'is-loading'
    ? '<span class="spinner" aria-hidden="true"></span><span></span>'
    : '<span></span>';
  ui.status.lastElementChild.textContent = message;
}
function setPageScrollLocked(isLocked) {
  const root = document.documentElement; const body = document.body;
  if (isLocked && state.lockedScrollY === null) {
    state.lockedScrollY = window.scrollY; root.classList.add('has-open-sheet'); body.classList.add('has-open-sheet'); body.style.top = `-${state.lockedScrollY}px`; body.style.position = 'fixed'; body.style.width = '100%';
  } else if (!isLocked && state.lockedScrollY !== null) {
    const scrollY = state.lockedScrollY; state.lockedScrollY = null; root.classList.remove('has-open-sheet'); body.classList.remove('has-open-sheet'); body.style.top = ''; body.style.position = ''; body.style.width = ''; window.scrollTo(0, scrollY);
  }
}
function focusModalControl(container) {
  window.requestAnimationFrame(() => {
    const target = container?.querySelector('[data-autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled])');
    target?.focus?.({ preventScroll: true });
  });
}
function toggleSheet(sheet, isOpen) {
  sheet.setAttribute('aria-hidden', String(!isOpen)); sheet.inert = !isOpen; if (sheet === ui.optionsSheet && !isOpen) ui.quickAdd.hidden = true;
  if (sheet === ui.checkoutSheet && !isOpen) closeDeliveryMapPicker();
  const hasOpenSheet = appSheets().some((item) => item.getAttribute('aria-hidden') === 'false'); setPageScrollLocked(hasOpenSheet);
  if (isOpen) focusModalControl(sheet);
}
function normalizeDeliveryLocation(raw) {
  const latitude = Number(String(raw?.latitude ?? raw?.lat ?? '').replace(',', '.'));
  const longitude = Number(String(raw?.longitude ?? raw?.lng ?? '').replace(',', '.'));
  const accuracy = Number(String(raw?.accuracy ?? '').replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001)) return null;
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.min(100000, accuracy) : null,
    source: String(raw?.source || '').toLowerCase() === 'map' ? 'map' : 'browser',
    capturedAt: new Date().toISOString()
  };
}
function setDeliveryLocationStatus(message, type = '') {
  if (!ui.deliveryLocationStatus) return;
  ui.deliveryLocationStatus.textContent = message;
  ui.deliveryLocationStatus.dataset.state = type;
}
function renderDeliveryLocation() {
  const point = normalizeDeliveryLocation(state.deliveryLocation);
  if (!point) {
    setDeliveryLocationStatus('Obrigatório: confirme no mapa a localização exata da entrega.', 'warning');
    return;
  }
  const accuracy = point.accuracy != null ? ` Precisão aproximada: ${Math.round(point.accuracy)} m.` : '';
  const source = point.source === 'map' ? 'Ponto confirmado manualmente no mapa.' : 'Localização atual obtida pelo GPS do aparelho.';
  setDeliveryLocationStatus(`${source} Confira o endereço e o número antes de enviar.${accuracy}`, 'success');
}
function setDeliveryMapStatus(message, type = '') {
  if (!ui.deliveryMapStatus) return;
  ui.deliveryMapStatus.textContent = message;
  ui.deliveryMapStatus.dataset.state = type;
}
function setDeliveryMapMarker(latitude, longitude, accuracy = null, source = 'browser') {
  if (!window.L || !state.deliveryMap || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;
  const point = { latitude: Number(latitude), longitude: Number(longitude), accuracy, source: source === 'map' ? 'map' : 'browser' };
  if (!state.deliveryMapMarker) {
    state.deliveryMapMarker = window.L.marker([point.latitude, point.longitude], { draggable: true }).addTo(state.deliveryMap);
    state.deliveryMapMarker.on('dragend', () => {
      const position = state.deliveryMapMarker.getLatLng();
      state.deliveryMapPoint = { latitude: position.lat, longitude: position.lng, accuracy: state.deliveryMapPoint?.accuracy ?? null, source: state.deliveryMapPoint?.source === 'browser' ? 'browser' : 'map' };
      setDeliveryMapStatus('Ponto ajustado. Confirme quando estiver correto.', 'success');
    });
  } else {
    state.deliveryMapMarker.setLatLng([point.latitude, point.longitude]);
  }
  state.deliveryMapPoint = point;
  state.deliveryMap.setView([point.latitude, point.longitude], Math.max(state.deliveryMap.getZoom() || 16, 16));
  if (ui.confirmDeliveryLocation) ui.confirmDeliveryLocation.disabled = false;
}
async function centerDeliveryMapOnStore() {
  const map = state.deliveryMap;
  const query = safeText(state.store?.locationQuery);
  if (!map || state.deliveryMapPoint || state.deliveryMapStoreCentered) return false;
  state.deliveryMapStoreCentered = true;
  const configuredCenter = normalizeDeliveryLocation(state.store?.locationCenter);
  if (configuredCenter) {
    map.setView([configuredCenter.latitude, configuredCenter.longitude], 16);
    setDeliveryMapStatus('Mapa aberto na região da loja. Toque no ponto correto da entrega ou use o GPS.', 'warning');
    return true;
  }
  if (!query) return false;
  const fallbackQuery = safeText(state.store?.locationFallbackQuery);
  const queries = [...new Set([query, fallbackQuery].filter(Boolean))];
  const cacheKey = `tweny_menu_store_geocode_${queries.join('|').toLocaleLowerCase('pt-BR')}`;
  try {
    let result = null;
    try { result = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (_) { result = null; }
    if (!result || !Number.isFinite(Number(result.lat)) || !Number.isFinite(Number(result.lng))) {
      for (const searchQuery of queries) {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(searchQuery)}`, { headers: { Accept: 'application/json' } });
        const rows = await response.json();
        result = Array.isArray(rows) ? rows[0] : null;
        if (result && Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon))) break;
      }
      if (result && Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon))) {
        try { localStorage.setItem(cacheKey, JSON.stringify({ lat: Number(result.lat), lng: Number(result.lon) })); } catch (_) {}
      }
    }
    if (state.deliveryMapPoint || !result) return false;
    const lat = Number(result.lat);
    const lng = Number(result.lng ?? result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    map.setView([lat, lng], 16);
    setDeliveryMapStatus('Mapa aberto na região da loja. Toque no ponto correto da entrega ou use o GPS.', 'warning');
    return true;
  } catch (_) {
    return false;
  }
}
function ensureDeliveryMap() {
  if (!window.L || !ui.deliveryMapCanvas) return false;
  if (state.deliveryMap) return true;
  const configuredCenter = normalizeDeliveryLocation(state.store?.locationCenter);
  const initialCenter = configuredCenter ? [configuredCenter.latitude, configuredCenter.longitude] : [-15.7801, -47.9292];
  state.deliveryMap = window.L.map(ui.deliveryMapCanvas, { zoomControl: true, attributionControl: true }).setView(initialCenter, configuredCenter ? 16 : 5);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(state.deliveryMap);
  state.deliveryMap.on('click', (event) => {
    setDeliveryMapMarker(event.latlng.lat, event.latlng.lng, null, 'map');
    setDeliveryMapStatus('Ponto escolhido. Arraste o marcador se precisar ajustar.', 'success');
  });
  void centerDeliveryMapOnStore();
  return true;
}
function closeDeliveryMapPicker() {
  if (!ui.deliveryMapPicker) return;
  ui.deliveryMapPicker.hidden = true;
  ui.deliveryMapPicker.setAttribute('aria-hidden', 'true');
  if (state.deliveryMap) window.requestAnimationFrame(() => state.deliveryMap.invalidateSize());
}
function confirmDeliveryMapPoint() {
  const point = normalizeDeliveryLocation(state.deliveryMapPoint);
  if (!point) {
    setDeliveryMapStatus('Escolha um ponto no mapa antes de confirmar.', 'warning');
    return;
  }
  state.deliveryLocation = point;
  closeDeliveryMapPicker();
  renderDeliveryLocation();
}
function openDeliveryMapPicker(initialPoint = null, gpsWasRequested = false) {
  if (!ui.deliveryMapPicker) return;
  ui.deliveryMapPicker.hidden = false;
  ui.deliveryMapPicker.setAttribute('aria-hidden', 'false');
  if (!ensureDeliveryMap()) {
    closeDeliveryMapPicker();
    setDeliveryLocationStatus('Não foi possível abrir o mapa. Atualize a página para confirmar a localização da entrega.', 'warning');
    return;
  }
  // The GPS reading is only a suggestion for the marker. It becomes part of
  // the order only after the customer explicitly confirms it in the map.
  state.deliveryMapPoint = normalizeDeliveryLocation(initialPoint) || normalizeDeliveryLocation(state.deliveryLocation);
  if (state.deliveryMapPoint) {
    setDeliveryMapMarker(state.deliveryMapPoint.latitude, state.deliveryMapPoint.longitude, state.deliveryMapPoint.accuracy, state.deliveryMapPoint.source);
    setDeliveryMapStatus('GPS encontrado. Confira ou arraste o marcador e toque em “Confirmar localização”.', 'success');
  } else {
    if (state.deliveryMapMarker) {
      state.deliveryMap.removeLayer(state.deliveryMapMarker);
      state.deliveryMapMarker = null;
    }
    if (ui.confirmDeliveryLocation) ui.confirmDeliveryLocation.disabled = true;
    if (gpsWasRequested) {
      void centerDeliveryMapOnStore();
      setDeliveryMapStatus('Não foi possível usar o GPS. Toque no ponto correto no mapa e confirme a localização.', 'warning');
      window.requestAnimationFrame(() => state.deliveryMap.invalidateSize());
      return;
    }
    setDeliveryMapStatus('Buscando sua localização… permita o acesso quando o navegador perguntar.', 'loading');
    state.deliveryMap.once('locationfound', (event) => {
      setDeliveryMapMarker(event.latlng.lat, event.latlng.lng, event.accuracy, 'browser');
      setDeliveryMapStatus('Localização encontrada. Arraste o marcador se precisar ajustar.', 'success');
    });
    state.deliveryMap.once('locationerror', () => {
      const storeCity = safeText(state.store?.locationFallbackQuery).replace(/,\s*Brasil$/i, '');
      const message = normalizeDeliveryLocation(state.store?.locationCenter)
        ? `GPS indisponível. O mapa já está aberto em ${storeCity || 'na região da loja'}; toque no ponto correto da entrega.`
        : 'Não foi possível obter o GPS. Toque no mapa para escolher o ponto manualmente.';
      setDeliveryMapStatus(message, 'warning');
    });
    // Leaflet delegates to navigator.geolocation. maximumAge: 0 asks the
    // browser for a fresh position from the current device, not a cached one.
    state.deliveryMap.locate({ enableHighAccuracy: true, setView: true, maxZoom: 18, timeout: 10000, maximumAge: 0 });
  }
  window.requestAnimationFrame(() => state.deliveryMap.invalidateSize());
}
function geolocationErrorMessage(error) {
  if (error?.code === 1) return 'A localização foi bloqueada para este site. Libere a permissão nas configurações do navegador ou marque o ponto manualmente no mapa.';
  if (error?.code === 2) return 'O aparelho não conseguiu determinar a localização agora. Verifique GPS e internet ou marque o ponto no mapa.';
  return 'A localização demorou para responder. Tente novamente ou marque o ponto correto no mapa.';
}
function captureDeliveryLocationDirect() {
  if (!ui.useCurrentLocation || ui.useCurrentLocation.disabled) return;
  if (!window.isSecureContext || !navigator.geolocation) {
    setDeliveryLocationStatus('Este navegador não liberou o GPS neste ambiente. Atualize a página em HTTPS para confirmar a localização.', 'warning');
    return;
  }
  ui.useCurrentLocation.disabled = true;
  ui.useCurrentLocation.classList.add('is-loading');
  setDeliveryLocationStatus('Pedindo acesso à localização do seu aparelho… permita quando o navegador perguntar.', 'loading');
  navigator.geolocation.getCurrentPosition((position) => {
    const point = normalizeDeliveryLocation(position.coords);
    ui.useCurrentLocation.disabled = false;
    ui.useCurrentLocation.classList.remove('is-loading');
    if (!point) {
      setDeliveryLocationStatus('O GPS retornou uma localização inválida. Escolha o ponto correto no mapa.', 'warning');
      openDeliveryMapPicker(null, true);
      return;
    }
    setDeliveryLocationStatus('Localização do aparelho encontrada. Confirme o ponto no mapa para continuar.', 'success');
    openDeliveryMapPicker(point, true);
  }, (error) => {
    ui.useCurrentLocation.disabled = false;
    ui.useCurrentLocation.classList.remove('is-loading');
    setDeliveryLocationStatus(geolocationErrorMessage(error), 'warning');
    openDeliveryMapPicker(null, true);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}
function captureDeliveryLocation() { captureDeliveryLocationDirect(); }
function setDeliveryFieldRequirements(isDelivery) {
  ui.deliveryFields?.querySelectorAll('input[name="address"], input[name="reference"]').forEach((input) => {
    input.disabled = !isDelivery;
    input.required = isDelivery;
  });
}
function setFulfillment(type) {
  state.fulfillment = type === 'delivery' ? 'delivery' : 'pickup';
  document.querySelectorAll('input[name="fulfillment"]').forEach((input) => { input.checked = input.value === state.fulfillment; });
  ui.deliveryFields.hidden = state.fulfillment !== 'delivery';
  setDeliveryFieldRequirements(state.fulfillment === 'delivery');
  renderDeliveryLocation();
}
const MENU_SECTION_ORDER = ['CASQUINHAS E CASCÕES TRADICIONAIS', 'CASQUINHAS E CASCÕES RECHEADOS', 'MILK SHAKES', 'MILK SHAKES DE CAFÉ', 'SUNDAES', 'UP MAX TRADICIONAL', 'UP MAX GOURMET', 'OUTROS'];
function catalogSection(product) {
  const name = productName(product).toLocaleUpperCase('pt-BR');
  if (/CASQUINHA|CASCÃO|CASCAO/.test(name)) return /RECHEAD/.test(name) ? 'CASQUINHAS E CASCÕES RECHEADOS' : 'CASQUINHAS E CASCÕES TRADICIONAIS';
  if (product.menuView === 'milk-shake-cafe' || (/MILK\s*SHAKE/.test(name) && /CAF[EÉ]/.test(name))) return 'MILK SHAKES DE CAFÉ';
  if (/MILK\s*SHAKE/.test(name)) return 'MILK SHAKES';
  if (/SUNDAE/.test(name)) return 'SUNDAES';
  if (/UP\s*MAX\s*330\s*ML/.test(name)) return 'UP MAX TRADICIONAL';
  if (/UP\s*(CASADINHO|CHOCOTINO|DA\s*FELICIDADE|DELEITE|OREO|PRECIOSO)/.test(name)) return 'UP MAX GOURMET';
  return productCategory(product) === 'Cardápio' ? 'OUTROS' : productCategory(product).toLocaleUpperCase('pt-BR');
}
function categories() { return [...new Set(state.catalog.map(catalogSection))].sort((left, right) => (MENU_SECTION_ORDER.indexOf(left) === -1 ? 99 : MENU_SECTION_ORDER.indexOf(left)) - (MENU_SECTION_ORDER.indexOf(right) === -1 ? 99 : MENU_SECTION_ORDER.indexOf(right)) || left.localeCompare(right, 'pt-BR')); }
function catalogSectionDescription(section, count) {
  const descriptions = {
    'CASQUINHAS E CASCÕES TRADICIONAIS': 'Casquinhas e cascões no sabor que você gosta.',
    'CASQUINHAS E CASCÕES RECHEADOS': 'Escolha seu recheio e deixe ainda mais gostoso.',
    'MILK SHAKES': 'Sabores tradicionais e especiais para refrescar.',
    'MILK SHAKES DE CAFÉ': 'Milk shakes com sabores especiais de café.',
    'SUNDAES': 'Sobremesas cremosas para completar seu pedido.',
    'UP MAX TRADICIONAL': 'O clássico UP MAX 330 ML.',
    'UP MAX GOURMET': 'Sabores especiais, caprichados e cheios de complemento.'
  };
  return descriptions[section] || `${count} opção${count === 1 ? '' : 'ões'} disponíveis.`;
}
function searchKey(value) { return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
function matchesCatalogSearch(product, query = state.searchQuery) {
  const needle = searchKey(query); if (!needle) return true;
  const text = [productName(product), product.description, product.descricao, productCategory(product), ...(product.variations || []).flatMap((variation) => [variation.name, variation.type])].map(searchKey).join(' ');
  return text.includes(needle);
}
function openCatalogSection(section) {
  state.catalogHomeScrollY = window.scrollY;
  state.activeCategory = section; renderCategories(); renderCatalog();
}
function returnToCatalogSections() {
  const restoreY = Math.max(0, Number(state.catalogHomeScrollY || 0));
  state.activeCategory = 'all'; renderCategories(); renderCatalog();
  window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: 'auto' }));
}
function renderCategories() {
  ui.categories.innerHTML = '';
  if (state.searchQuery) { ui.categories.hidden = true; if (ui.catalogTitle) ui.catalogTitle.textContent = `Resultado da busca`; return; }
  const showingSections = state.activeCategory === 'all';
  if (ui.catalogTitle) ui.catalogTitle.textContent = showingSections ? 'Escolha uma categoria' : state.activeCategory;
  if (showingSections) { ui.categories.hidden = true; return; }
  ui.categories.hidden = false;
  const back = document.createElement('button'); back.type = 'button'; back.className = 'category-back'; back.innerHTML = '<span aria-hidden="true">←</span> Ver todas as categorias';
  back.addEventListener('click', returnToCatalogSections); ui.categories.append(back);
}
function isStuffedCone(name) { return searchKey(name).includes('casquinha recheada'); }
function isTraditionalBigCone(name) { return searchKey(name).includes('cascao tradicional'); }
function isTraditionalThinCone(name) { return searchKey(name).includes('casquinha tradicional'); }
function isTraditionalConesSection(section) { return safeText(section).toLocaleUpperCase('pt-BR') === 'CASQUINHAS E CASCÕES TRADICIONAIS'; }
function menuPhotoAssets(product) {
  if (/sundae/i.test(productName(product))) return ['assets/sundae-cutout.png'];
  if (product.menuView === 'up-max-gourmet') return [
    'assets/upmax-oreo-cutout.png',
    'assets/up-deleite-cutout-v2.png'
  ];
  if (product.menuView === 'milk-shake') return [
    'assets/milkshake-menta-cutout.png',
    'assets/milkshake-maracuja-cutout.png',
    'assets/milkshake-morango-cutout.png'
  ];
  if (product.menuView === 'milk-shake-cafe') return [
    'assets/milkshake-cafe-leite-ninho-cutout.png',
    'assets/milkshake-cafe-ovomaltine-cutout.png'
  ];
  const name = searchKey(productName(product));
  if (name === 'up oreo') return ['assets/upmax-oreo-cutout.png'];
  if (name === 'up deleite') return ['assets/up-deleite-cutout-v2.png'];
  return [];
}
function normalizeMenuPhotoFrame(photo) {
  try {
    const container = photo.parentElement;
    const box = container?.getBoundingClientRect();
    if (!box?.width || !box?.height || !photo.naturalWidth || !photo.naturalHeight) return;
    const longestSide = 180;
    const sourceRatio = photo.naturalWidth / photo.naturalHeight;
    const sampleWidth = sourceRatio >= 1 ? longestSide : Math.max(1, Math.round(longestSide * sourceRatio));
    const sampleHeight = sourceRatio >= 1 ? Math.max(1, Math.round(longestSide / sourceRatio)) : longestSide;
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth; canvas.height = sampleHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(photo, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let left = sampleWidth; let top = sampleHeight; let right = -1; let bottom = -1;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        if (pixels[(y * sampleWidth + x) * 4 + 3] < 22) continue;
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return;
    const rendered = sourceRatio > box.width / box.height
      ? { width: box.width, height: box.width / sourceRatio }
      : { width: box.height * sourceRatio, height: box.height };
    const visibleWidth = rendered.width * ((right - left + 1) / sampleWidth);
    const visibleHeight = rendered.height * ((bottom - top + 1) / sampleHeight);
    const targetWidth = box.width * .76;
    const targetHeight = box.height * .84;
    const scale = Math.min(targetWidth / visibleWidth, targetHeight / visibleHeight);
    photo.style.setProperty('--menu-photo-scale', String(Math.max(.86, Math.min(1.85, scale))));
  } catch (_) {
    // Se um navegador bloquear a leitura de pixels, a imagem continua com o tamanho padrão.
  }
}
function addMenuPhotoVisual(node, product) {
  const assets = menuPhotoAssets(product);
  if (!assets.length) return;
  const image = node.querySelector('.product-image'); const initial = image.querySelector('.product-initial');
  image.classList.add('product-image--menu-photo');
  const showcase = document.createElement('div'); showcase.className = 'menu-photo-showcase'; showcase.setAttribute('aria-hidden', 'true');
  let loaded = 0;
  const showInitialWhenEmpty = () => {
    if (!showcase.querySelector('img')) { showcase.remove(); initial.classList.remove('is-hidden'); }
  };
  assets.forEach((source, index) => {
    const photo = document.createElement('img');
    photo.className = 'menu-photo-showcase-image';
    photo.src = source; photo.alt = '';
    photo.addEventListener('load', () => {
      normalizeMenuPhotoFrame(photo);
      loaded += 1;
      initial.classList.add('is-hidden');
      if (loaded === 1) photo.classList.add('is-visible');
    }, { once: true });
    photo.addEventListener('error', () => { photo.remove(); window.setTimeout(showInitialWhenEmpty, 0); }, { once: true });
    showcase.append(photo);
  });
  image.append(showcase);
  if (assets.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let current = 0;
  const timer = window.setInterval(() => {
    if (!showcase.isConnected) { window.clearInterval(timer); return; }
    const available = [...showcase.querySelectorAll('img')];
    if (available.length < 2) return;
    current = (current + 1) % available.length;
    available.forEach((photo, index) => photo.classList.toggle('is-visible', index === current));
  }, 4200);
}
function addStuffedConeVisual(node, name) {
  if (!isStuffedCone(name)) return;
  const image = node.querySelector('.product-image'); const initial = image.querySelector('.product-initial');
  image.classList.add('product-image--stuffed-cone'); initial.remove();
  const showcase = document.createElement('div'); showcase.className = 'stuffed-cone-showcase'; showcase.setAttribute('aria-hidden', 'true');
  const chocolate = document.createElement('img'); chocolate.className = 'stuffed-cone-showcase-image stuffed-cone-showcase-image--chocolate'; chocolate.src = 'assets/casquinha-recheada-chocolate.webp'; chocolate.alt = '';
  const vanilla = document.createElement('img'); vanilla.className = 'stuffed-cone-showcase-image stuffed-cone-showcase-image--vanilla'; vanilla.src = 'assets/casquinha-recheada-baunilha.webp'; vanilla.alt = '';
  [chocolate, vanilla].forEach((photo) => photo.addEventListener('load', () => normalizeMenuPhotoFrame(photo), { once: true }));
  showcase.append(chocolate, vanilla); image.append(showcase);
}
function addTraditionalBigConeVisual(node, name) {
  if (!isTraditionalBigCone(name)) return;
  const image = node.querySelector('.product-image');
  image.classList.add('product-image--traditional-big-cone');
  image.querySelector('.product-initial').remove();
  const photo = document.createElement('img');
  photo.className = 'traditional-big-cone-image';
  photo.src = 'assets/cascao-tradicional.webp';
  photo.alt = '';
  photo.setAttribute('aria-hidden', 'true');
  image.append(photo);
}
function addTraditionalThinConeVisual(node, name) {
  if (!isTraditionalThinCone(name)) return;
  const image = node.querySelector('.product-image');
  image.classList.add('product-image--traditional-thin-cone');
  image.querySelector('.product-initial').remove();
  const photo = document.createElement('img');
  photo.className = 'traditional-thin-cone-image';
  photo.src = 'assets/casquinha-tradicional.webp';
  photo.alt = '';
  photo.setAttribute('aria-hidden', 'true');
  image.append(photo);
}
function addTraditionalConesSectionVisual(node, section) {
  if (!isTraditionalConesSection(section)) return;
  const image = node.querySelector('.product-image');
  image.classList.add('product-image--traditional-cones-category');
  image.querySelector('.product-initial').remove();
  const showcase = document.createElement('div');
  showcase.className = 'traditional-cones-category-showcase';
  showcase.setAttribute('aria-hidden', 'true');
  const bigCone = document.createElement('img');
  bigCone.className = 'traditional-cones-category-image traditional-cones-category-image--big';
  bigCone.src = 'assets/cascao-tradicional.webp';
  bigCone.alt = '';
  const thinCone = document.createElement('img');
  thinCone.className = 'traditional-cones-category-image traditional-cones-category-image--thin';
  thinCone.src = 'assets/casquinha-tradicional.webp';
  thinCone.alt = '';
  showcase.append(bigCone, thinCone); image.append(showcase);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let showThinCone = false;
    const timer = window.setInterval(() => {
      if (!showcase.isConnected) { window.clearInterval(timer); return; }
      showThinCone = !showThinCone;
      showcase.classList.toggle('is-showing-thin-cone', showThinCone);
    }, 4000);
  }
}
function appendProductCard(product, index, categoryLabel = productCategory(product)) {
  const node = document.querySelector('#product-template').content.cloneNode(true); const name = productName(product); const id = productId(product); const card = node.querySelector('.product-card'); card.style.setProperty('--card-tone', productTone(name)); card.style.setProperty('--enter-delay', `${Math.min(420, index * 52)}ms`);
  node.querySelector('.product-initial').textContent = name.slice(0, 1); node.querySelector('.product-category').textContent = categoryLabel; node.querySelector('h3').textContent = name;
  node.querySelector('.product-description').textContent = safeText(product.description ?? product.descricao ?? ''); node.querySelector('.product-price').textContent = money.format(menuPriceOf(product));
  addStuffedConeVisual(node, name);
  addTraditionalBigConeVisual(node, name);
  addTraditionalThinConeVisual(node, name);
  addMenuPhotoVisual(node, product);
  node.querySelector('.add-button').addEventListener('click', () => { const next = { ...product, id }; Array.isArray(next.variations) && next.variations.length ? openOptions(next) : addToCart(next); }); ui.grid.append(node);
}
function renderCatalog() {
  ui.grid.innerHTML = '';
  if (state.searchQuery) {
    const results = state.catalog.filter((item) => matchesCatalogSearch(item));
    if (!results.length) { ui.grid.innerHTML = '<p class="catalog-search-empty">Não encontramos esse item. Tente outro nome ou sabor.</p>'; return; }
    results.forEach((product, index) => appendProductCard(product, index, catalogSection(product))); return;
  }
  if (state.activeCategory === 'all') {
    categories().forEach((section, index) => {
      const productsInSection = state.catalog.filter((item) => catalogSection(item) === section); if (!productsInSection.length) return;
      const distinctProducts = new Set(productsInSection.map((item) => productId(item))).size;
      if (distinctProducts <= 1) { appendProductCard(productsInSection[0], index, section); return; }
      const node = document.querySelector('#product-template').content.cloneNode(true); const card = node.querySelector('.product-card'); card.classList.add('catalog-section-card'); card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `Ver produtos de ${section}`); card.style.setProperty('--card-tone', productTone(section)); card.style.setProperty('--enter-delay', `${Math.min(420, index * 52)}ms`);
      node.querySelector('.product-initial').textContent = section.startsWith('MILK') ? 'M' : section.startsWith('SUNDAE') ? 'S' : section.startsWith('UP') ? 'U' : 'C'; node.querySelector('.product-category').textContent = 'CARDÁPIO'; node.querySelector('h3').textContent = section;
      node.querySelector('.product-description').textContent = catalogSectionDescription(section, productsInSection.length); node.querySelector('.product-price').textContent = `${productsInSection.length} ITEM${productsInSection.length === 1 ? '' : 'S'}`;
      addTraditionalConesSectionVisual(node, section);
      if (section === 'CASQUINHAS E CASCÕES RECHEADOS') addStuffedConeVisual(node, 'casquinha recheada');
      if (section === 'UP MAX GOURMET') addMenuPhotoVisual(node, { menuView: 'up-max-gourmet' });
      const openSection = () => openCatalogSection(section);
      card.addEventListener('click', openSection); card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSection(); } }); node.querySelector('.add-button').remove(); ui.grid.append(node);
    });
    return;
  }
  const products = state.catalog.filter((item) => catalogSection(item) === state.activeCategory);
  if (!products.length) return;
  products.forEach((product, index) => appendProductCard(product, index, state.activeCategory));
}
function lineKey(product, selectedVariations = []) { return `${productId(product)}:${selectedVariations.map((item) => item.id).sort((a, b) => a - b).join(',')}`; }
function lineUnitPrice(item) {
  const selected = item.selectedVariations || [];
  const selectedSize = selected.filter((variation) => variationCategoryKey(variation.type) === 'tamanho' && Number(variation.priceAdditionalCents || 0) > 0);
  const extras = selected.filter((variation) => variationCategoryKey(variation.type) !== 'tamanho').reduce((sum, variation) => sum + Number(variation.priceAdditionalCents || 0) / 100, 0);
  if (item.product?.priceBySize && selectedSize.length === 1) return Number(selectedSize[0].priceAdditionalCents || 0) / 100 + extras;
  return priceOf(item.product) + selected.reduce((sum, variation) => sum + Number(variation.priceAdditionalCents || 0) / 100, 0);
}
function addToCart(product, selectedVariations = []) { const key = lineKey(product, selectedVariations); const line = state.cart.find((item) => item.key === key); if (line) line.quantity += 1; else state.cart.push({ key, product, selectedVariations, quantity: 1 }); renderCart(); }
function cartTotal() { return state.cart.reduce((sum, item) => sum + lineUnitPrice(item) * item.quantity, 0); }
function variationCategoryKey(value) { return safeText(value).toLocaleLowerCase('pt-BR'); }
function variationRule(product, type) {
  const source = (product.variationRules || []).find((rule) => variationCategoryKey(rule.category ?? rule.categoria) === variationCategoryKey(type)) || {};
  const required = source.required === true || source.obrigatorio === true;
  const selectionMode = safeText(source.selectionMode ?? source.modo_selecao ?? source.modoSelecao) === 'unica' ? 'unica' : 'multipla';
  let minSelections = Math.max(0, Number(source.minSelections ?? source.min_selecoes ?? source.minSelecoes ?? 0) || 0);
  let maxSelections = source.maxSelections ?? source.max_selecoes ?? source.maxSelecoes;
  maxSelections = maxSelections === null || maxSelections === undefined || maxSelections === '' ? null : Math.max(1, Number(maxSelections) || 1);
  const displayOrder = Math.max(1, Number(source.displayOrder ?? source.ordem_exibicao ?? source.ordemExibicao ?? 100) || 100);
  if (selectionMode === 'unica') return { required, selectionMode, minSelections: required ? 1 : 0, maxSelections: 1, displayOrder };
  if (required && minSelections === 0) minSelections = 1;
  return { required, selectionMode, minSelections, maxSelections, displayOrder };
}
function variationRuleHint(rule) {
  if (rule.selectionMode === 'unica') return rule.required ? 'Escolha 1 opção' : 'Escolha até 1 opção';
  if (rule.maxSelections) return rule.minSelections ? `Escolha de ${rule.minSelections} a ${rule.maxSelections}` : `Escolha até ${rule.maxSelections}`;
  return rule.minSelections ? `Escolha ao menos ${rule.minSelections}` : 'Opcional';
}

function variationChoiceGroup(rule) { return variationCategoryKey(rule?.choiceGroup ?? rule?.grupoEscolha ?? rule?.grupo_escolha); }
function sharedChoiceGroups(product) {
  const variationsByType = new Map();
  (product?.variations || []).forEach((variation) => {
    const type = variationCategoryKey(variation.type) || 'opção';
    if (!variationsByType.has(type)) variationsByType.set(type, []);
    variationsByType.get(type).push(variation);
  });
  const grouped = new Map();
  (product?.variationRules || []).forEach((source) => {
    const key = variationChoiceGroup(source);
    const category = variationCategoryKey(source.category ?? source.categoria);
    if (!key || !category || !variationsByType.has(category)) return;
    if (!grouped.has(key)) grouped.set(key, { key, label: safeText(source.choiceGroup ?? source.grupoEscolha ?? source.grupo_escolha) || key, categories: new Set(), rule: variationRule(product, category), variations: [] });
    grouped.get(key).categories.add(category);
  });
  return [...grouped.values()].map((group) => {
    group.variations = [...group.categories].flatMap((category) => variationsByType.get(category) || []);
    group.displayOrder = Math.min(...[...group.categories].map((category) => variationRule(product, category).displayOrder));
    return group;
  }).filter((group) => group.variations.length).sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label, 'pt-BR'));
}
function selectedVariationCount(variations) { return variations.filter((variation) => document.querySelector(`#options-form input[value="${variation.id}"]`)?.checked).length; }
function selectionFollowsRule(variations, rule) { const selectedCount = selectedVariationCount(variations); return selectedCount >= rule.minSelections && (rule.maxSelections === null || selectedCount <= rule.maxSelections); }
function sharedChoiceDescription(group) { return [...group.categories].map((category) => category.toLocaleUpperCase('pt-BR')).join(' OU '); }
function optionsAreReady(product) {
  if (!product) return false;
  const sharedGroups = sharedChoiceGroups(product);
  const sharedCategories = new Set(sharedGroups.flatMap((group) => [...group.categories]));
  const groups = new Map(); (product.variations || []).forEach((variation) => { const type = variationCategoryKey(variation.type) || 'opção'; if (sharedCategories.has(type)) return; if (!groups.has(type)) groups.set(type, []); groups.get(type).push(variation); });
  return sharedGroups.every((group) => selectionFollowsRule(group.variations, group.rule)) && [...groups].every(([type, variations]) => selectionFollowsRule(variations, variationRule(product, type)));
}
function updateQuickAddButton() { ui.quickAdd.hidden = !optionsAreReady(state.pendingProduct); }
function openOptions(product, options = {}) {
  const preselectedVariationIds = new Set((options.preselectedVariationIds || []).map((value) => String(value)));
  state.pendingProduct = product; ui.optionsTitle.textContent = productName(product); ui.optionsSubtitle.textContent = state.reorderActive ? 'Revise ou altere as opções antes de adicionar este item novamente.' : 'Escolha as opções que deseja neste pedido.'; ui.variationGroups.innerHTML = '';
  const sharedGroups = sharedChoiceGroups(product);
  const sharedCategories = new Set(sharedGroups.flatMap((group) => [...group.categories]));
  if (sharedGroups.length) ui.optionsSubtitle.textContent = `Escolha uma opção em cada grupo obrigatório. No SUNDAE: COMPLEMENTO OU CALDA DE FRUTA; os adicionais pagos continuam opcionais.`;
  const groups = new Map(); (product.variations || []).forEach((variation) => { const normalizedType = variationCategoryKey(variation.type) || 'opção'; if (sharedCategories.has(normalizedType)) return; const type = safeText(variation.type) || 'Opção'; if (!groups.has(type)) groups.set(type, []); groups.get(type).push(variation); });
  const orderedGroups = [...groups.entries()].sort(([typeA], [typeB]) => {
    const orderDiff = variationRule(product, typeA).displayOrder - variationRule(product, typeB).displayOrder;
    return orderDiff || safeText(typeA).localeCompare(safeText(typeB), 'pt-BR');
  });
  const testRecheioLayout = ['recheio da borda', 'recheio de dentro', 'sabor'].every((type) => groups.has(type));
  ui.variationGroups.classList.toggle('variation-groups--recheios-top', testRecheioLayout);
  const choiceEntries = [
    ...sharedGroups.map((group) => ({ kind: 'shared', group, order: group.displayOrder })),
    ...orderedGroups.map(([type, variations]) => ({ kind: 'category', type, variations, order: variationRule(product, type).displayOrder }))
  ].sort((a, b) => a.order - b.order || (a.kind === 'shared' ? a.group.label : a.type).localeCompare(b.kind === 'shared' ? b.group.label : b.type, 'pt-BR'));
  let groupIndex = 0;
  choiceEntries.forEach((entry) => {
    if (entry.kind === 'shared') {
      const { group: shared } = entry; const group = document.createElement('section'); group.className = 'variation-group variation-group--shared-choice'; group.dataset.variationType = `shared-${shared.key}`;
      if (shared.variations.length > 1) group.classList.add('variation-group--grid');
      const title = document.createElement('h3'); title.textContent = `Escolha 1: ${sharedChoiceDescription(shared)}`;
      const hint = document.createElement('p'); hint.className = 'variation-rule-hint'; hint.textContent = [variationRuleHint(shared.rule), `Uma opção entre ${sharedChoiceDescription(shared).toLocaleLowerCase('pt-BR')}`, 'Incluso'].join(' • ');
      const list = document.createElement('div'); list.className = 'variation-list';
      shared.variations.forEach((variation) => {
        const choice = document.createElement('label'); choice.className = 'variation-choice'; const price = Number(variation.priceAdditionalCents || 0) / 100;
        const input = document.createElement('input'); input.type = shared.rule.selectionMode === 'unica' ? 'radio' : 'checkbox'; input.value = variation.id; input.name = `variation-group-${groupIndex}`; input.dataset.variationType = variationCategoryKey(variation.type); input.checked = preselectedVariationIds.has(String(variation.id));
        const content = document.createElement('span'); content.className = 'variation-choice-content'; const label = document.createElement('span'); label.textContent = `${safeText(variation.type)}: ${variation.name}`; content.append(label); if (price) { const priceLabel = document.createElement('small'); priceLabel.textContent = money.format(price); content.append(priceLabel); } choice.append(input, content); list.append(choice);
      });
      group.append(title, hint, list); ui.variationGroups.append(group); groupIndex += 1; return;
    }
    const { type, variations } = entry;
    const rule = variationRule(product, type);
    const group = document.createElement('section'); group.className = 'variation-group'; group.dataset.variationType = variationCategoryKey(type);
    const title = document.createElement('h3'); title.textContent = type;
    const hasIncludedChoice = variations.some((variation) => !Number(variation.priceAdditionalCents || 0));
    const hint = document.createElement('p'); hint.className = 'variation-rule-hint'; hint.textContent = [variationRuleHint(rule), hasIncludedChoice ? 'Incluso' : ''].filter(Boolean).join(' • ');
    if (variations.length > 1) group.classList.add('variation-group--grid');
    if (variations.length > 12) {
      group.classList.add('variation-group--searchable');
      const search = document.createElement('input'); search.className = 'variation-search'; search.type = 'search'; search.placeholder = `Buscar em ${type}`; search.setAttribute('aria-label', `Buscar opção em ${type}`);
      search.addEventListener('input', () => {
        const query = variationCategoryKey(search.value);
        group.querySelectorAll('.variation-choice').forEach((choice) => {
          choice.hidden = !!query && !variationCategoryKey(choice.textContent).includes(query);
        });
      });
      group.append(search);
    }
    const renderChoices = (list, choices) => choices.forEach((variation) => {
      const choice = document.createElement('label'); choice.className = 'variation-choice'; const price = Number(variation.priceAdditionalCents || 0) / 100;
      const input = document.createElement('input'); input.type = rule.selectionMode === 'unica' ? 'radio' : 'checkbox'; input.value = variation.id; input.name = `variation-group-${groupIndex}`; input.dataset.variationType = variationCategoryKey(type); input.checked = preselectedVariationIds.has(String(variation.id));
      const content = document.createElement('span'); content.className = 'variation-choice-content'; const label = document.createElement('span'); label.textContent = variation.name; content.append(label); if (price) { const priceLabel = document.createElement('small'); priceLabel.textContent = `${variationCategoryKey(type) === 'adicional' ? '+ ' : ''}${money.format(price)}`; content.append(priceLabel); } choice.append(input, content); list.append(choice);
    });
    group.prepend(title, hint);
    const list = document.createElement('div'); list.className = 'variation-list'; renderChoices(list, variations); group.append(list);
    ui.variationGroups.append(group); groupIndex += 1;
  });
  ui.quickAdd.textContent = state.reorderActive ? 'Confirmar e continuar' : 'Adicionar à sacola'; updateQuickAddButton(); toggleSheet(ui.optionsSheet, true);
}
function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0); const total = cartTotal(); ui.cartCount.textContent = count; ui.cartDock.hidden = !count; ui.cartDockLabel.textContent = `${count} ${count === 1 ? 'item' : 'itens'}`; ui.cartDockTotal.textContent = money.format(total); ui.cartItems.innerHTML = '';
  if (!state.cart.length) ui.cartItems.innerHTML = '<p class="cart-empty">Sua sacola está vazia.<br>Escolha um item do cardápio para começar.</p>';
  state.cart.forEach((item) => { const row = document.createElement('article'); row.className = 'cart-item'; row.innerHTML = `<div><h3></h3><p></p></div><div class="cart-item-actions"><button type="button" aria-label="Remover">−</button><span></span><button type="button" aria-label="Adicionar">+</button></div>`; row.querySelector('h3').textContent = productName(item.product); const detail = [(item.selectedVariations || []).map((variation) => variation.name).join(', '), money.format(lineUnitPrice(item))].filter(Boolean).join(' • '); row.querySelector('p').textContent = detail; row.querySelector('span').textContent = item.quantity; const [remove, add] = row.querySelectorAll('button'); remove.onclick = () => { item.quantity -= 1; if (!item.quantity) state.cart = state.cart.filter((line) => line !== item); renderCart(); }; add.onclick = () => { item.quantity += 1; renderCart(); }; ui.cartItems.append(row); });
  ui.cartTotal.textContent = money.format(total); ui.checkoutButton.disabled = !state.cart.length;
}
function configureCheckout(store) {
  const methods = Array.isArray(store?.paymentMethods) ? store.paymentMethods : ['pix', 'dinheiro', 'credito', 'debito'];
  const normalized = methods.map((method) => safeText(method).toLocaleLowerCase('pt-BR'));
  const configured = new Set(normalized);
  const has = (...values) => values.some((value) => configured.has(value));
  const labels = { dinheiro: 'Dinheiro', transferencia: 'Transferência' };
  const choices = [];

  // Online is deliberately a distinct option. Credit/debit selected below are
  // charged by the store's card machine at handoff, never by Mercado Pago.
  if (has('pix', 'credito', 'crédito', 'debito', 'débito')) choices.push({ value: 'mercado_pago', title: 'PIX ou cartão online', hint: 'Pague agora via PIX ou cartão' });
  if (has('credito', 'crédito')) choices.push({ value: 'credito_maquininha', title: 'Crédito na maquininha', hint: 'Pagar na entrega ou retirada' });
  if (has('debito', 'débito')) choices.push({ value: 'debito_maquininha', title: 'Débito na maquininha', hint: 'Pagar na entrega ou retirada' });
  normalized.filter((method) => !['pix', 'credito', 'crédito', 'debito', 'débito'].includes(method)).forEach((method) => {
    choices.push({ value: method, title: labels[method] || safeText(method), hint: '' });
  });
  if (!choices.length) choices.push({ value: 'dinheiro', title: 'Dinheiro', hint: '' });
  ui.paymentOptions.innerHTML = '';
  choices.forEach((choice, index) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="payment" value="${choice.value}" ${index === 0 ? 'checked' : ''}><span><b>${choice.title}</b>${choice.hint ? `<small>${choice.hint}</small>` : ''}</span>`;
    ui.paymentOptions.append(label);
  });
  updateCashPaymentDetails();
}
function paymentMethodIsCash(value) { return safeText(value).toLocaleLowerCase('pt-BR') === 'dinheiro'; }
function paymentMethodIsMercadoPago(value) { return safeText(value).toLocaleLowerCase('pt-BR') === 'mercado_pago'; }
function fullNameIsValid(value) {
  const words = safeText(value).split(/\s+/).filter((word) => word.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2);
  return words.length >= 2;
}
function currencyInputToCents(value) {
  const raw = safeText(value).replace(/R\$\s*/gi, '').replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const amount = Number(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : null;
}
function selectedCheckoutPaymentMethod() { return safeText(ui.checkoutForm?.querySelector('input[name="payment"]:checked')?.value); }
function updateCashPaymentDetails() {
  if (!ui.cashPaymentDetails || !ui.cashAmountReceived || !ui.cashPaymentSummary) return;
  const isCash = paymentMethodIsCash(selectedCheckoutPaymentMethod());
  ui.cashPaymentDetails.hidden = !isCash;
  ui.cashAmountReceived.required = isCash;
  if (!isCash) { ui.cashPaymentSummary.textContent = ''; ui.cashPaymentSummary.className = 'cash-payment-summary'; return; }
  const totalCents = Math.round(cartTotal() * 100);
  const receivedCents = currencyInputToCents(ui.cashAmountReceived.value);
  ui.cashPaymentSummary.className = 'cash-payment-summary';
  if (receivedCents === null) { ui.cashPaymentSummary.textContent = `Informe o valor recebido. Total do pedido: ${money.format(totalCents / 100)}.`; return; }
  if (receivedCents < totalCents) { ui.cashPaymentSummary.classList.add('is-missing'); ui.cashPaymentSummary.textContent = `Faltam ${money.format((totalCents - receivedCents) / 100)} para completar o pedido.`; return; }
  const changeCents = receivedCents - totalCents;
  if (changeCents > 0) { ui.cashPaymentSummary.classList.add('is-change'); ui.cashPaymentSummary.textContent = `Troco para o cliente: ${money.format(changeCents / 100)}.`; return; }
  ui.cashPaymentSummary.textContent = 'Valor exato — sem troco.';
}
async function loadCatalog() {
  setStatus('Atualizando cardápio...', 'is-loading'); ui.grid.innerHTML = ''; ui.categories.hidden = true;
  try {
    const response = await fetch(`${ORDERING_API}/catalog`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`status ${response.status}`); const payload = await response.json(); const catalog = Array.isArray(payload.catalog) ? payload.catalog : [];
    state.store = payload.store || {}; state.catalog = splitCoffeeMilkShakes(catalog.filter((item) => item && productId(item) && priceOf(item) >= 0 && item.active !== false)); state.activeCategory = 'all';
    ui.storeName.textContent = safeText(state.store.name) || 'Cardápio'; ui.storeDescription.textContent = safeText(state.store.description) || 'Escolha seus produtos e envie seu pedido.'; configureCheckout(state.store);
    if (!state.catalog.length) { setStatus('Ainda não há produtos de venda disponíveis neste cardápio.', 'is-empty'); return; }
    ui.status.hidden = true; renderCategories(); renderCatalog();
  } catch (_) { setStatus('Este cardápio ainda não está conectado à loja. Assim que a integração for ativada, os produtos de venda aparecerão aqui automaticamente.', 'is-error'); }
}
function showFeedback(message) { ui.feedback.hidden = false; ui.feedback.textContent = message; }
function readCustomerProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_STORAGE_KEY) || '{}');
    return profile && typeof profile === 'object' ? { name: safeText(profile.name), phone: safeText(profile.phone) } : { name: '', phone: '' };
  } catch (_) { return { name: '', phone: '' }; }
}
function saveCustomerProfile(form = ui.checkoutForm) {
  const name = safeText(form?.querySelector('[name="name"]')?.value); const phone = safeText(form?.querySelector('[name="phone"]')?.value);
  try {
    if (!name && !phone) localStorage.removeItem(CUSTOMER_PROFILE_STORAGE_KEY);
    else localStorage.setItem(CUSTOMER_PROFILE_STORAGE_KEY, JSON.stringify({ name, phone }));
  } catch (_) {}
}
function applyCustomerProfile(form = ui.checkoutForm) {
  const profile = readCustomerProfile(); const name = form?.querySelector('[name="name"]'); const phone = form?.querySelector('[name="phone"]');
  if (name && !safeText(name.value) && profile.name) name.value = profile.name;
  if (phone && !safeText(phone.value) && profile.phone) phone.value = profile.phone;
}
function setOrderSending(isSending) { ui.orderSending.hidden = !isSending; }
function stopTicketPolling() { if (state.ticketPoll) window.clearInterval(state.ticketPoll); state.ticketPoll = null; }
function setTrackingModal(isOpen) {
  ui.trackingModal.hidden = !isOpen; ui.trackingModal.setAttribute('aria-hidden', String(!isOpen));
  const hasOpenLayer = appSheets().some((item) => item.getAttribute('aria-hidden') === 'false') || isOpen;
  setPageScrollLocked(hasOpenLayer);
  if (isOpen) focusModalControl(ui.trackingModal);
}
function readOrderHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY) || '[]');
    // Mantém acessíveis os tickets antigos TW e aceita os novos UP.
    return Array.isArray(raw) ? raw.filter((order) => /^(?:UP|TW)-[A-Z0-9-]{8,}$/i.test(safeText(order.ticketCode))).slice(0, 50) : [];
  } catch (_) { return []; }
}
function writeOrderHistory(orders) { try { localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(orders.slice(0, 50))); } catch (_) {} }
function rememberOrder(order = {}) {
  const ticketCode = safeText(order.ticketCode).toLocaleUpperCase('pt-BR'); if (!ticketCode) return;
  const current = readOrderHistory(); const existing = current.find((entry) => safeText(entry.ticketCode).toLocaleUpperCase('pt-BR') === ticketCode);
  const normalized = { ticketCode, createdAt: order.createdAt || existing?.createdAt || new Date().toISOString(), totalCents: Number(order.totalCents ?? existing?.totalCents ?? 0), fulfillment: safeText(order.fulfillment || existing?.fulfillment || 'pickup'), status: safeText(order.status || existing?.status || 'pending') || 'pending', reason: safeText(order.reason || existing?.reason), trackingToken: safeText(order.trackingToken || existing?.trackingToken), items: Array.isArray(order.items) ? order.items : (Array.isArray(existing?.items) ? existing.items : []) };
  writeOrderHistory([normalized, ...current.filter((entry) => safeText(entry.ticketCode).toLocaleUpperCase('pt-BR') !== ticketCode)]);
}
function updateRememberedOrder(ticketCode, changes = {}) {
  const normalizedTicket = safeText(ticketCode).toLocaleUpperCase('pt-BR'); const current = readOrderHistory();
  if (!current.some((entry) => safeText(entry.ticketCode).toLocaleUpperCase('pt-BR') === normalizedTicket)) return;
  writeOrderHistory(current.map((entry) => safeText(entry.ticketCode).toLocaleUpperCase('pt-BR') === normalizedTicket ? { ...entry, ...changes, ticketCode: normalizedTicket } : entry));
}
function trackingTokenForTicket(ticketCode) { return safeText(readOrderHistory().find((entry) => safeText(entry.ticketCode).toLocaleUpperCase('pt-BR') === safeText(ticketCode).toLocaleUpperCase('pt-BR'))?.trackingToken); }
function trackingHeaders(trackingToken = '') { return trackingToken ? { Accept: 'application/json', 'x-order-tracking-token': trackingToken } : { Accept: 'application/json' }; }
function makeOrderAttempt() {
  const id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const trackingToken = typeof crypto?.randomUUID === 'function'
    ? `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/gi, '').padEnd(32, 'x');
  return { id, trackingToken };
}
function historyStatusLabel(status) { return ({ payment_pending: 'Aguardando pagamento', payment_rejected: 'Pagamento não aprovado', payment_cancelled: 'Pagamento cancelado', pending: 'Aguardando confirmação', accepted: 'Aceito · em preparo', in_cart: 'Em preparo', on_hold: 'Pedido reservado', ready_for_pickup: 'Pronto para retirada', ready_for_delivery: 'Preparado · aguardando entrega', out_for_delivery: 'Saiu para entrega', picked_up: 'Retirado', delivered: 'Entregue', completed: 'Concluído', rejected: 'Recusado', cancelled: 'Cancelado' })[status] || 'Em atualização'; }
function historyFulfillmentLabel(fulfillment) { return fulfillment === 'delivery' ? 'Entrega' : 'Retirada na loja'; }
function historyDateLabel(value) { try { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (_) { return 'Data indisponível'; } }
function renderHistoryItems(items = []) {
  const list = document.createElement('ul'); list.className = 'my-order-items';
  (Array.isArray(items) ? items : []).forEach((item) => {
    const line = document.createElement('li'); const quantity = Math.max(1, Number(item?.quantity || 1)); const name = safeText(item?.productName || item?.product_name || item?.name) || 'Produto';
    const variations = Array.isArray(item?.variations) ? item.variations : [];
    const byCategory = new Map(); variations.forEach((variation) => { const category = safeText(variation?.type) || 'Opção'; if (!byCategory.has(category)) byCategory.set(category, []); byCategory.get(category).push(safeText(variation?.name)); });
    const choices = [...byCategory.entries()].map(([category, names]) => `${category}: ${names.filter(Boolean).join(', ')}`).filter(Boolean).join(' • ');
    line.textContent = `${quantity}x ${name}${choices ? ` — ${choices}` : ''}`; list.append(line);
  });
  return list;
}
function normalizedProductSearchKey(value) { return safeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
function resolveReorderProduct(item = {}) {
  const savedId = productId(item);
  const byId = savedId ? state.catalog.filter((product) => productId(product) === savedId) : [];
  const byName = state.catalog.filter((product) => normalizedProductSearchKey(productName(product)) === normalizedProductSearchKey(item.productName || item.product_name || item.name));
  const candidates = byId.length ? byId : byName;
  if (!candidates.length) return null;
  const oldVariations = Array.isArray(item.variations) ? item.variations : [];
  return candidates.find((product) => oldVariations.every((saved) => (product.variations || []).some((current) => {
    if (saved.id != null && String(current.id) === String(saved.id)) return true;
    return normalizedProductSearchKey(current.type) === normalizedProductSearchKey(saved.type) && normalizedProductSearchKey(current.name) === normalizedProductSearchKey(saved.name);
  }))) || candidates[0];
}
function resolveReorderVariationIds(product, item = {}) {
  const savedVariations = Array.isArray(item.variations) ? item.variations : [];
  return savedVariations.map((saved) => {
    const byId = (product.variations || []).find((current) => String(current.id) === String(saved.id));
    if (byId) return byId.id;
    const savedType = normalizedProductSearchKey(saved.type); const savedName = normalizedProductSearchKey(saved.name);
    return (product.variations || []).find((current) => normalizedProductSearchKey(current.type) === savedType && normalizedProductSearchKey(current.name) === savedName)?.id || null;
  }).filter(Boolean);
}
function clearReorderFlow() { state.reorderQueue = []; state.reorderActive = null; ui.quickAdd.textContent = 'Adicionar à sacola'; }
function addReorderEntryToCart(entry, selectedVariations = []) {
  const quantity = Math.max(1, Number(entry?.quantity || 1));
  for (let index = 0; index < quantity; index += 1) addToCart(entry.product, selectedVariations);
}
function continueReorderFlow() {
  const next = state.reorderQueue.shift();
  if (!next) {
    state.reorderActive = null;
    ui.quickAdd.textContent = 'Adicionar à sacola';
    renderCart();
    toggleSheet(ui.optionsSheet, false);
    toggleSheet(ui.cartSheet, true);
    return;
  }
  state.reorderActive = next;
  if (Array.isArray(next.product.variations) && next.product.variations.length) {
    openOptions(next.product, { preselectedVariationIds: next.preselectedVariationIds });
    return;
  }
  addReorderEntryToCart(next, []);
  continueReorderFlow();
}
async function reorderFromHistory(order = {}) {
  if (!state.catalog.length) await loadCatalog();
  const items = Array.isArray(order.items) ? order.items : [];
  const queue = items.map((item) => {
    const product = resolveReorderProduct(item);
    return product ? { product, quantity: Math.max(1, Number(item.quantity || 1)), preselectedVariationIds: resolveReorderVariationIds(product, item) } : null;
  });
  const missing = items.filter((item, index) => !queue[index]).map((item) => safeText(item.productName || item.product_name || item.name) || 'Produto');
  if (missing.length) {
    window.alert(`Não foi possível reencontrar no cardápio: ${missing.join(', ')}. Atualize os produtos antes de repetir o pedido.`);
    return;
  }
  if (!queue.length) { window.alert('Este pedido não possui itens para repetir.'); return; }
  if (state.cart.length && !window.confirm('Sua sacola atual será substituída pelo pedido anterior. Deseja continuar?')) return;
  state.cart = [];
  setFulfillment(order.fulfillment || 'pickup');
  state.reorderQueue = queue;
  state.reorderActive = null;
  toggleSheet(ui.myOrdersSheet, false);
  continueReorderFlow();
}
function historyCard(order) {
  const card = document.createElement('article'); card.className = 'my-order-card';
  const main = document.createElement('div'); main.className = 'my-order-card-main';
  const badge = document.createElement('span'); badge.className = 'my-order-status'; badge.dataset.status = order.status || 'pending'; badge.textContent = historyStatusLabel(order.status);
  const ticket = document.createElement('strong'); ticket.className = 'my-order-ticket'; ticket.textContent = order.ticketCode;
  const meta = document.createElement('span'); meta.className = 'my-order-meta'; meta.textContent = `${historyDateLabel(order.createdAt)} · ${historyFulfillmentLabel(order.fulfillment)}`;
  main.append(badge, ticket, meta);
  if (Array.isArray(order.items) && order.items.length) main.append(renderHistoryItems(order.items));
  const side = document.createElement('div'); side.className = 'my-order-side';
  const total = document.createElement('strong'); total.className = 'my-order-total'; total.textContent = money.format(Number(order.totalCents || 0) / 100);
  const isFinished = !new Set(['payment_pending', 'pending', 'accepted', 'in_cart', 'on_hold', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery']).has(order.status);
  const action = document.createElement('button'); action.type = 'button'; action.className = 'my-order-track'; action.textContent = isFinished ? 'Pedir novamente' : 'Acompanhar'; action.addEventListener('click', () => {
    if (isFinished) { void reorderFromHistory(order); return; }
    toggleSheet(ui.myOrdersSheet, false); watchTicket(order.ticketCode, order.status || 'pending', order.fulfillment || 'pickup');
  });
  side.append(total, action); card.append(main, side); return card;
}
function renderMyOrders(orders = []) {
  const activeStatuses = new Set(['payment_pending', 'pending', 'accepted', 'in_cart', 'on_hold', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery']); const active = orders.filter((order) => activeStatuses.has(order.status)); const history = orders.filter((order) => !activeStatuses.has(order.status));
  const renderList = (target, records, emptyText) => { target.replaceChildren(); if (!records.length) { const empty = document.createElement('p'); empty.className = 'my-orders-empty'; empty.textContent = emptyText; target.append(empty); return; } records.forEach((order) => target.append(historyCard(order))); };
  ui.myOrdersActiveCount.textContent = String(active.length); ui.myOrdersHistoryCount.textContent = String(history.length);
  renderList(ui.myOrdersActive, active, 'Nenhum pedido em andamento neste celular.'); renderList(ui.myOrdersHistory, history, 'Quando um pedido for finalizado, ele aparecerá aqui.');
}
async function loadMyOrders() {
  const legacyTicket = safeText(localStorage.getItem('tweny_menu_last_ticket')); if (legacyTicket && !readOrderHistory().some((order) => safeText(order.ticketCode).toLocaleUpperCase('pt-BR') === legacyTicket.toLocaleUpperCase('pt-BR'))) rememberOrder({ ticketCode: legacyTicket });
  const records = readOrderHistory(); renderMyOrders(records);
  const refreshed = await Promise.all(records.map(async (record) => {
    try { const response = await fetch(`${ORDERING_API}/orders/${encodeURIComponent(record.ticketCode)}`, { headers: trackingHeaders(safeText(record.trackingToken)), cache: 'no-store' }); const result = await response.json().catch(() => ({})); if (!response.ok || !result.success) return record; return { ...record, ticketCode: result.ticketCode || record.ticketCode, status: result.status || record.status, reason: result.reason || '', fulfillment: result.fulfillmentType || record.fulfillment, totalCents: Number(result.totalCents ?? record.totalCents ?? 0), items: Array.isArray(result.items) ? result.items : record.items, createdAt: result.createdAt || record.createdAt }; } catch (_) { return record; }
  }));
  refreshed.forEach((order) => updateRememberedOrder(order.ticketCode, order)); renderMyOrders(readOrderHistory());
}
function openMyOrders() { toggleSheet(ui.myOrdersSheet, true); void loadMyOrders(); }
function normalizeTicketFulfillment(fulfillment) { return safeText(fulfillment).toLocaleLowerCase('pt-BR') === 'delivery' ? 'delivery' : 'pickup'; }
function ticketMessage(status, reason = '', fulfillment = state.ticketFulfillment) {
  const delivery = normalizeTicketFulfillment(fulfillment) === 'delivery';
  if (status === 'payment_pending') return 'Aguardando a confirmação do pagamento. Assim que ele for aprovado, a loja receberá seu pedido.';
  if (status === 'payment_rejected') return 'O pagamento não foi aprovado. Você pode tentar novamente com outro meio de pagamento.';
  if (status === 'payment_cancelled') return 'Este pagamento foi cancelado. Faça um novo pedido para tentar novamente.';
  if (status === 'accepted') return 'Pedido aceito! Ele já está sendo preparado para você.';
  if (status === 'in_cart') return delivery ? 'Seu pedido está sendo preparado para envio.' : 'Seu pedido está sendo preparado para retirada.';
  if (status === 'on_hold') return 'Seu pedido está confirmado e reservado. A loja vai retomar o preparo em breve.';
  if (status === 'ready_for_pickup') return 'Seu pedido está pronto! Você já pode retirar na loja.';
  if (status === 'ready_for_delivery') return 'Seu pedido foi preparado e está aguardando a saída do entregador.';
  if (status === 'out_for_delivery') return 'Seu pedido saiu para entrega. Aguarde no endereço informado.';
  if (status === 'picked_up') return 'Retirada concluída. Obrigado por escolher a gente!';
  if (status === 'delivered') return 'Pedido entregue. Obrigado por escolher a gente!';
  if (status === 'completed') return 'Pedido concluído. Obrigado por escolher a gente!';
  if (status === 'rejected') return reason ? `Pedido recusado: ${reason}` : 'O pedido foi recusado pela loja.';
  if (status === 'cancelled') return 'Este pedido foi cancelado pela loja.';
  return 'Pedido enviado com sucesso. Aguarde a confirmação da loja.';
}
function ticketLabel(status) {
  if (status === 'payment_pending') return 'Aguardando pagamento';
  if (status === 'payment_rejected') return 'Pagamento não aprovado';
  if (status === 'payment_cancelled') return 'Pagamento cancelado';
  if (status === 'accepted') return 'Pedido aceito!';
  if (status === 'in_cart') return 'Pedido em preparo';
  if (status === 'on_hold') return 'Pedido reservado';
  if (status === 'ready_for_pickup') return 'Pronto para retirada';
  if (status === 'ready_for_delivery') return 'Preparado · aguardando entrega';
  if (status === 'out_for_delivery') return 'Saiu para entrega';
  if (status === 'picked_up') return 'Retirada concluída';
  if (status === 'delivered') return 'Pedido entregue';
  if (status === 'completed') return 'Pedido concluído';
  if (status === 'rejected') return 'Pedido recusado';
  if (status === 'cancelled') return 'Pedido cancelado';
  return 'Pedido enviado com sucesso!';
}
function ticketStep(status) { return ({ payment_pending: 1, pending: 1, accepted: 2, in_cart: 3, on_hold: 3, ready_for_pickup: 4, ready_for_delivery: 4, out_for_delivery: 4, picked_up: 5, delivered: 5, completed: 5 })[status] || 1; }
function updateTrackingSteps(fulfillment, status = state.ticketStatus) {
  const delivery = normalizeTicketFulfillment(fulfillment) === 'delivery';
  const outForDelivery = status === 'out_for_delivery';
  if (ui.trackingStep4Title) ui.trackingStep4Title.textContent = delivery ? (outForDelivery ? 'Saiu para entrega' : 'Preparado para entrega') : 'Pronto para retirada';
  if (ui.trackingStep4Copy) ui.trackingStep4Copy.textContent = delivery ? (outForDelivery ? 'O entregador está a caminho do endereço informado' : 'Seu pedido está pronto e aguarda a saída do entregador') : 'Você já pode ir à loja buscar seu pedido';
  if (ui.trackingStep5Title) ui.trackingStep5Title.textContent = delivery ? 'Pedido entregue' : 'Retirada concluída';
  if (ui.trackingStep5Copy) ui.trackingStep5Copy.textContent = delivery ? 'Entrega concluída no endereço informado' : 'Atendimento finalizado na loja';
}
function renderTicketStatus(ticketCode, status = 'pending', reason = '', fulfillment = '') {
  state.ticketCode = safeText(ticketCode); state.ticketStatus = safeText(status) || 'pending'; state.ticketFulfillment = normalizeTicketFulfillment(fulfillment || state.ticketFulfillment);
  updateTrackingSteps(state.ticketFulfillment, state.ticketStatus);
  ui.orderTicketCode.textContent = state.ticketCode || '—'; ui.orderStatusCopy.textContent = ticketMessage(state.ticketStatus, reason, state.ticketFulfillment);
  ui.trackingTicketCode.textContent = state.ticketCode || '—'; ui.trackingStatus.dataset.status = state.ticketStatus; ui.trackingLabel.textContent = ticketLabel(state.ticketStatus); ui.trackingCopy.textContent = ticketMessage(state.ticketStatus, reason, state.ticketFulfillment);
  const rejected = ['rejected', 'payment_rejected', 'payment_cancelled'].includes(state.ticketStatus); const currentStep = ticketStep(state.ticketStatus);
  ui.trackingSteps.classList.toggle('is-rejected', rejected);
  ui.trackingSteps.querySelectorAll('[data-step]').forEach((step) => {
    const number = Number(step.dataset.step || 0); step.classList.toggle('is-done', !rejected && number < currentStep); step.classList.toggle('is-current', !rejected && number === currentStep);
  });
  ui.trackingReason.hidden = !rejected; ui.trackingReason.textContent = rejected ? `Motivo: ${safeText(reason) || 'Pagamento não aprovado ou cancelado.'}` : '';
  ui.checkoutForm.hidden = true; ui.orderSent.hidden = true;
  updateRememberedOrder(state.ticketCode, { status: state.ticketStatus, reason: safeText(reason), fulfillment: state.ticketFulfillment });
}
async function refreshTicketStatus() {
  if (!state.ticketCode) return;
  try {
    const response = await fetch(`${ORDERING_API}/orders/${encodeURIComponent(state.ticketCode)}`, { headers: trackingHeaders(state.ticketTrackingToken), cache: 'no-store' });
    const result = await response.json().catch(() => ({})); if (!response.ok || !result.success) return;
    const previous = state.ticketStatus; renderTicketStatus(result.ticketCode || state.ticketCode, result.status, result.reason, result.fulfillmentType || state.ticketFulfillment);
    if (previous === 'payment_pending' && result.status !== 'payment_pending' && ui.onlinePaymentModal && !ui.onlinePaymentModal.hidden) { setOnlinePaymentModal(false); setTrackingModal(true); }
    if (['rejected', 'cancelled', 'picked_up', 'delivered', 'completed'].includes(result.status)) stopTicketPolling();
  } catch (_) {}
}
function watchTicket(ticketCode, status = 'pending', fulfillment = 'pickup', trackingToken = '') {
  stopTicketPolling(); state.ticketTrackingToken = safeText(trackingToken || trackingTokenForTicket(ticketCode)); renderTicketStatus(ticketCode, status, '', fulfillment); setTrackingModal(true);
  state.ticketPoll = window.setInterval(refreshTicketStatus, 5000); refreshTicketStatus();
}
function resetOrderSent() { ui.checkoutForm.hidden = false; ui.orderSent.hidden = true; }
async function copyTrackingTicket() {
  const ticket = state.ticketCode; if (!ticket) return;
  try { await navigator.clipboard.writeText(ticket); } catch (_) { const field = document.createElement('textarea'); field.value = ticket; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select(); document.execCommand('copy'); field.remove(); }
  const button = ui.copyTrackingTicket; button.textContent = 'Ticket copiado!'; window.setTimeout(() => { button.textContent = 'Copiar ticket'; }, 1800);
}
function setOnlinePaymentModal(isOpen) {
  if (!ui.onlinePaymentModal) return;
  ui.onlinePaymentModal.hidden = !isOpen; ui.onlinePaymentModal.setAttribute('aria-hidden', String(!isOpen));
  const hasOpenLayer = appSheets().some((item) => item.getAttribute('aria-hidden') === 'false') || !ui.trackingModal.hidden || isOpen;
  setPageScrollLocked(hasOpenLayer);
  if (isOpen) focusModalControl(ui.onlinePaymentModal);
}
function closeOnlinePayment() {
  const hasPendingPix = state.ticketCode && state.ticketStatus === 'payment_pending';
  setOnlinePaymentModal(false); state.mercadoBrickController?.unmount?.(); state.mercadoBrickController = null;
  if (hasPendingPix) { state.onlinePayment = null; setTrackingModal(true); return; }
  const checkoutForm = state.onlinePayment?.checkoutForm;
  state.onlinePayment = null;
  if (checkoutForm) {
    toggleSheet(ui.checkoutSheet, true);
    checkoutForm.querySelector('[type="submit"]').disabled = false;
  }
}
async function loadMercadoPagoSdk() {
  if (window.MercadoPago) return window.MercadoPago;
  const script = [...document.scripts].find((item) => item.src.includes('sdk.mercadopago.com/js/v2'));
  if (!script) throw new Error('Não foi possível carregar o pagamento seguro.');
  await new Promise((resolve, reject) => { script.addEventListener('load', resolve, { once: true }); script.addEventListener('error', reject, { once: true }); window.setTimeout(() => reject(new Error('timeout')), 12000); });
  if (!window.MercadoPago) throw new Error('O Mercado Pago não respondeu. Verifique sua conexão e tente novamente.');
  return window.MercadoPago;
}
function submittedCartItems() { return state.cart.map((item) => ({ productName: productName(item.product), quantity: item.quantity, variations: (item.selectedVariations || []).map((variation) => ({ type: variation.type, name: variation.name })) })); }
function completeSubmittedOrder(result, payload, attempt, items) {
  const trackingToken = safeText(result.trackingToken || attempt.trackingToken);
  rememberOrder({ ticketCode: result.ticketCode, status: result.status || 'pending', totalCents: result.totalCents ?? payload.totalCents, fulfillment: payload.fulfillment.type, trackingToken, items });
  state.orderAttempt = null; state.cart = []; renderCart(); ui.checkoutForm.reset(); applyCustomerProfile(); state.deliveryLocation = null; setFulfillment('pickup');
  try { localStorage.setItem('tweny_menu_last_ticket', result.ticketCode); } catch (_) {}
  return trackingToken;
}
async function submitMercadoPayment(formData) {
  const online = state.onlinePayment; if (!online) throw new Error('A sessão de pagamento expirou. Tente novamente.');
  setOrderSending(true);
  try {
    const response = await fetch(`${ORDERING_API}/payments`, { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'application/json', 'idempotency-key': online.attempt.id, 'x-order-tracking-token': online.attempt.trackingToken }, body: JSON.stringify({ order: online.payload, formData }) });
    const result = await response.json().catch(() => ({})); if (!response.ok || !result.success || !result.ticketCode) throw new Error(result.error || 'Não foi possível iniciar o pagamento.');
    const trackingToken = completeSubmittedOrder(result, online.payload, online.attempt, online.items);
    const qrCode = safeText(result.payment?.qrCode); const qrImage = safeText(result.payment?.qrCodeBase64);
    if (qrCode && qrImage) {
      ui.mercadoPagoBrick.hidden = true; ui.pixPaymentDetails.hidden = false; ui.pixPaymentQr.src = `data:image/png;base64,${qrImage}`; ui.pixPaymentCopyCode.value = qrCode;
      state.ticketCode = result.ticketCode; state.ticketTrackingToken = trackingToken; state.ticketStatus = result.status || 'payment_pending'; state.ticketFulfillment = online.payload.fulfillment.type;
      stopTicketPolling(); state.ticketPoll = window.setInterval(refreshTicketStatus, 5000); void refreshTicketStatus();
    } else { setOnlinePaymentModal(false); watchTicket(result.ticketCode, result.status || 'pending', online.payload.fulfillment.type, trackingToken); }
    state.onlinePayment = null;
  } catch (error) { throw error; } finally { setOrderSending(false); }
}
async function startMercadoPayment(payload, attempt, checkoutForm) {
  setOnlinePaymentModal(true); ui.pixPaymentDetails.hidden = true; ui.mercadoPagoBrick.hidden = false; ui.mercadoPagoBrick.replaceChildren();
  const items = submittedCartItems(); state.onlinePayment = { payload, attempt, items, checkoutForm };
  try {
    const response = await fetch(`${ORDERING_API}/payment-config`, { headers: { Accept: 'application/json' }, cache: 'no-store' }); const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.enabled || !safeText(config.publicKey)) throw new Error(config.error || 'Pagamento online indisponível no momento.');
    const MercadoPago = await loadMercadoPagoSdk(); const mp = new MercadoPago(config.publicKey, { locale: 'pt-BR' }); const bricks = mp.bricks();
    state.mercadoBrickController = await bricks.create('payment', 'mercado-pago-brick', {
      initialization: { amount: Number((payload.totalCents / 100).toFixed(2)) },
      // Mercado Pago expects payment method filters as strings. In particular,
      // Pix is `bankTransfer: 'pix'`, not an array. Passing the array made the
      // SDK fail while searching the available payment methods.
      customization: { paymentMethods: { creditCard: 'all', debitCard: 'all', bankTransfer: 'pix' } },
      callbacks: {
        onReady: () => {},
        onError: (error) => { console.error('[Mercado Pago Brick]', error); },
        // The Brick wraps its actual form fields in `{ selectedPaymentMethod,
        // formData }`; only formData belongs in our server-side payment call.
        onSubmit: ({ formData }) => submitMercadoPayment(formData),
      }
    });
  } catch (error) { setOnlinePaymentModal(false); toggleSheet(ui.checkoutSheet, true); showFeedback(error.message || 'Não foi possível abrir o pagamento seguro.'); checkoutForm.querySelector('[type="submit"]').disabled = false; }
}
async function submitOrder(event) {
  event.preventDefault(); if (!state.cart.length) return; ui.feedback.hidden = true; const checkoutForm = event.currentTarget; const form = new FormData(checkoutForm); const submit = checkoutForm.querySelector('[type="submit"]'); const totalCents = Math.round(cartTotal() * 100); const paymentMethod = safeText(form.get('payment')); const cashAmountReceivedCents = currencyInputToCents(form.get('cashAmountReceived'));
  const customerName = safeText(form.get('name')); const customerPhone = safeText(form.get('phone')); const deliveryAddress = safeText(form.get('address')); const deliveryReference = safeText(form.get('reference'));
  const locationPoint = state.fulfillment === 'delivery' ? normalizeDeliveryLocation(state.deliveryLocation) : null;
  if (!fullNameIsValid(customerName)) { showFeedback('Informe seu nome completo para identificar o pedido.'); checkoutForm.querySelector('[name="name"]')?.focus(); return; }
  if (customerPhone.replace(/\D/g, '').length < 10) { showFeedback('Informe um WhatsApp válido para retorno da loja.'); checkoutForm.querySelector('[name="phone"]')?.focus(); return; }
  if (state.fulfillment === 'delivery' && deliveryAddress.length < 5) { showFeedback('Informe o endereço completo da entrega.'); checkoutForm.querySelector('[name="address"]')?.focus(); return; }
  if (state.fulfillment === 'delivery' && deliveryReference.length < 2) { showFeedback('Informe um ponto de referência para a entrega.'); checkoutForm.querySelector('[name="reference"]')?.focus(); return; }
  if (state.fulfillment === 'delivery' && !locationPoint) { showFeedback('Confirme a localização da entrega no mapa antes de enviar.'); ui.useCurrentLocation?.focus(); return; }
  if (paymentMethodIsCash(paymentMethod) && (cashAmountReceivedCents === null || cashAmountReceivedCents <= 0)) { showFeedback('Informe o valor que o cliente vai entregar em dinheiro.'); ui.cashAmountReceived?.focus(); return; }
  if (paymentMethodIsCash(paymentMethod) && cashAmountReceivedCents < totalCents) { showFeedback(`O valor em dinheiro não cobre o pedido. Faltam ${money.format((totalCents - cashAmountReceivedCents) / 100)}.`); ui.cashAmountReceived?.focus(); return; }
  submit.disabled = true;
  const payload = { fulfillment: { type: state.fulfillment }, customer: { name: customerName, phone: customerPhone }, location: { address: deliveryAddress, reference: deliveryReference, coordinates: locationPoint }, payment: { method: paymentMethod, cashAmountReceivedCents: paymentMethodIsCash(paymentMethod) ? cashAmountReceivedCents : null }, note: safeText(form.get('note')), items: state.cart.map(({ product, quantity, selectedVariations }) => ({ productId: productId(product), quantity, variationIds: (selectedVariations || []).map((variation) => variation.id) })), totalCents };
  toggleSheet(ui.checkoutSheet, false);
  saveCustomerProfile(checkoutForm);
  const attempt = state.orderAttempt || makeOrderAttempt(); state.orderAttempt = attempt;
  if (paymentMethodIsMercadoPago(paymentMethod)) { await startMercadoPayment(payload, attempt, checkoutForm); return; }
  setOrderSending(true);
  try { const response = await fetch(`${ORDERING_API}/orders`, { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'application/json', 'idempotency-key': attempt.id, 'x-order-tracking-token': attempt.trackingToken }, body: JSON.stringify(payload) }); const result = await response.json().catch(() => ({})); if (!response.ok || !result.success || !result.ticketCode) throw new Error(result.error || 'Não foi possível enviar agora.'); const trackingToken = completeSubmittedOrder(result, payload, attempt, submittedCartItems()); watchTicket(result.ticketCode, result.status || 'pending', payload.fulfillment.type, trackingToken); } catch (error) { toggleSheet(ui.checkoutSheet, true); showFeedback(error.message || 'Não foi possível enviar agora. Tente novamente.'); } finally { setOrderSending(false); submit.disabled = false; }
}
document.addEventListener('click', (event) => { const action = event.target.closest('[data-action]')?.dataset.action; if (action === 'open-cart') toggleSheet(ui.cartSheet, true); if (action === 'close-cart') toggleSheet(ui.cartSheet, false); if (action === 'close-options') { clearReorderFlow(); toggleSheet(ui.optionsSheet, false); } if (action === 'close-checkout') { toggleSheet(ui.checkoutSheet, false); resetOrderSent(); } if (action === 'open-my-orders') openMyOrders(); if (action === 'close-my-orders') toggleSheet(ui.myOrdersSheet, false); if (action === 'close-tracking') setTrackingModal(false); if (action === 'close-delivery-map') closeDeliveryMapPicker(); if (action === 'close-online-payment') closeOnlinePayment(); });
document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (ui.deliveryMapPicker && !ui.deliveryMapPicker.hidden) { closeDeliveryMapPicker(); return; } if (ui.onlinePaymentModal && !ui.onlinePaymentModal.hidden) { closeOnlinePayment(); return; } if (!ui.trackingModal.hidden) { setTrackingModal(false); return; } if (ui.optionsSheet.getAttribute('aria-hidden') === 'false') { clearReorderFlow(); toggleSheet(ui.optionsSheet, false); } else if (ui.checkoutSheet.getAttribute('aria-hidden') === 'false') { toggleSheet(ui.checkoutSheet, false); resetOrderSent(); } else if (ui.myOrdersSheet.getAttribute('aria-hidden') === 'false') toggleSheet(ui.myOrdersSheet, false); else if (ui.cartSheet.getAttribute('aria-hidden') === 'false') toggleSheet(ui.cartSheet, false); });
document.querySelectorAll('input[name="fulfillment"]').forEach((input) => input.addEventListener('change', () => setFulfillment(input.value)));
ui.copyPixCode?.addEventListener('click', async () => { const value = safeText(ui.pixPaymentCopyCode?.value); if (!value) return; try { await navigator.clipboard.writeText(value); } catch (_) { ui.pixPaymentCopyCode?.select(); document.execCommand('copy'); } ui.copyPixCode.textContent = 'Código PIX copiado!'; window.setTimeout(() => { ui.copyPixCode.textContent = 'Copiar código PIX'; }, 1800); });
ui.useCurrentLocation?.addEventListener('click', captureDeliveryLocation);
ui.closeDeliveryMap?.addEventListener('click', closeDeliveryMapPicker);
ui.confirmDeliveryLocation?.addEventListener('click', confirmDeliveryMapPoint);
document.querySelector('#reload-catalog').addEventListener('click', loadCatalog); ui.catalogSearch?.addEventListener('input', () => { state.searchQuery = safeText(ui.catalogSearch.value); renderCategories(); renderCatalog(); }); ui.variationGroups.addEventListener('change', updateQuickAddButton); document.querySelector('#options-form').addEventListener('submit', (event) => { event.preventDefault(); const product = state.pendingProduct; if (!product) return; const sharedGroups = sharedChoiceGroups(product); const sharedCategories = new Set(sharedGroups.flatMap((group) => [...group.categories])); for (const shared of sharedGroups) { if (!selectionFollowsRule(shared.variations, shared.rule)) { ui.optionsSubtitle.textContent = `Revise ${sharedChoiceDescription(shared)}: ${variationRuleHint(shared.rule).toLocaleLowerCase('pt-BR')}.`; return; } } const groups = new Map(); (product.variations || []).forEach((variation) => { const type = variationCategoryKey(variation.type) || 'opção'; if (sharedCategories.has(type)) return; if (!groups.has(type)) groups.set(type, []); groups.get(type).push(variation); }); for (const [type, variations] of groups) { const rule = variationRule(product, type); if (!selectionFollowsRule(variations, rule)) { ui.optionsSubtitle.textContent = `Revise ${type}: ${variationRuleHint(rule).toLocaleLowerCase('pt-BR')}.`; return; } } const selected = (product.variations || []).filter((variation) => document.querySelector(`#options-form input[value="${variation.id}"]`)?.checked); const reorderEntry = state.reorderActive; if (reorderEntry) { addReorderEntryToCart(reorderEntry, selected); state.reorderActive = null; toggleSheet(ui.optionsSheet, false); continueReorderFlow(); return; } addToCart(product, selected); toggleSheet(ui.optionsSheet, false); toggleSheet(ui.cartSheet, true); }); ui.checkoutButton.addEventListener('click', () => { resetOrderSent(); applyCustomerProfile(); updateCashPaymentDetails(); toggleSheet(ui.cartSheet, false); toggleSheet(ui.checkoutSheet, true); }); ui.checkoutForm.addEventListener('input', () => { state.orderAttempt = null; saveCustomerProfile(); updateCashPaymentDetails(); }); ui.checkoutForm.addEventListener('change', () => { state.orderAttempt = null; saveCustomerProfile(); updateCashPaymentDetails(); }); document.querySelector('#checkout-form').addEventListener('submit', submitOrder); ui.copyTrackingTicket.addEventListener('click', copyTrackingTicket);
appSheets().forEach((sheet) => { sheet.inert = sheet.getAttribute('aria-hidden') !== 'false'; });
setFulfillment('pickup'); applyCustomerProfile(); renderCart(); loadCatalog();
