/**
 * UGent Studentenrestaurants — Live Menu Applicatie
 * Haalt het actuele menu van alle UGent resto's rechtstreeks op via de officiële UGent / Zeus WPI Hydra API.
 */

const HYDRA_BASE = 'https://hydra.ugent.be/api/2.0/resto';

// Default known locations in case meta.json is slow or needs enrichment
const DEFAULT_RESTOS = [
  {
    name: 'Resto De Brug',
    endpoint: 'nl-debrug',
    address: 'Sint-Pietersnieuwstraat 45, 9000 Gent',
    type: 'resto',
    open: { resto: [['08:30', '15:00'], ['17:30', '21:00']], cafetaria: [['08:00', '16:00']] },
    campus: 'Campus Boekentoren / Ufo (ook avondresto)'
  },
  {
    name: 'Resto Campus Sterre',
    endpoint: 'nl-sterre',
    address: 'Krijgslaan 281 (Gebouw S5), 9000 Gent',
    type: 'resto',
    open: { resto: [['08:30', '14:00']] },
    campus: 'Campus Sterre'
  },
  {
    name: 'Resto Campus Coupure',
    endpoint: 'nl-coupure',
    address: 'Coupure Links 653, 9000 Gent',
    type: 'resto',
    open: { resto: [['08:30', '15:00']] },
    campus: 'Campus Coupure'
  },
  {
    name: 'Resto Ardoyen',
    endpoint: 'nl-ardoyen',
    address: 'Technologiepark-Zwijnaarde 75, 9052 Zwijnaarde',
    type: 'resto',
    open: { resto: [['08:30', '15:00']] },
    campus: 'Tech Lane Ghent Science Park / Campus Ardoyen'
  },
  {
    name: 'Resto Merelbeke',
    endpoint: 'nl-merelbeke',
    address: 'Salisburylaan 133, 9820 Merelbeke',
    type: 'resto',
    open: { resto: [['11:15', '14:00']] },
    campus: 'Campus Merelbeke (Diergeneeskunde)'
  },
  {
    name: 'English Menu (De Brug / Sterre)',
    endpoint: 'en',
    address: 'Sint-Pietersnieuwstraat 45, 9000 Gent',
    type: 'resto',
    open: { resto: [['08:30', '15:00']] },
    campus: 'English Overview'
  }
];

const KIND_META = {
  vegan: { label: 'Vegan', icon: '🌱', className: 'kind-vegan' },
  vegetarian: { label: 'Vegetarisch', icon: '🥕', className: 'kind-vegetarian' },
  meat: { label: 'Vlees', icon: '🍖', className: 'kind-meat' },
  fish: { label: 'Vis', icon: '🐟', className: 'kind-fish' },
  soup: { label: 'Soep', icon: '🥣', className: 'kind-soup' }
};

const state = {
  view: 'daily', // 'daily' | 'compare' | 'sandwiches' | 'locations'
  activeEndpoint: 'nl-debrug',
  activeDate: null,
  availableDates: [],
  dietFilter: 'all',
  searchQuery: '',
  lang: 'nl',
  locations: [],
  menusByEndpoint: {}, // endpoint -> { dateString -> dayMenuObj }
  sandwiches: [],
  salads: []
};

// DOM References
const dom = {
  loadingState: document.getElementById('loading-state'),
  errorState: document.getElementById('error-state'),
  errorMessage: document.getElementById('error-message'),
  retryBtn: document.getElementById('retry-btn'),
  restoTabs: document.getElementById('resto-tabs'),
  activeRestoHours: document.getElementById('active-resto-hours'),
  restoSelectorGroup: document.getElementById('resto-selector-group'),
  dateTabs: document.getElementById('date-tabs'),
  prevDayBtn: document.getElementById('prev-day-btn'),
  nextDayBtn: document.getElementById('next-day-btn'),
  controlsBar: document.getElementById('controls-bar'),
  searchInput: document.getElementById('search-input'),
  langToggle: document.getElementById('lang-toggle'),
  restoInfoBanner: document.getElementById('resto-info-banner'),
  dailyMenuContainer: document.getElementById('daily-menu-container'),
  compareGrid: document.getElementById('compare-grid'),
  compareDateLabel: document.getElementById('compare-date-label'),
  sandwichesList: document.getElementById('sandwiches-list'),
  saladsList: document.getElementById('salads-list'),
  locationsGrid: document.getElementById('locations-grid'),
  views: {
    daily: document.getElementById('view-daily'),
    compare: document.getElementById('view-compare'),
    sandwiches: document.getElementById('view-sandwiches'),
    locations: document.getElementById('view-locations')
  }
};

/**
 * Format YYYY-MM-DD into Dutch readable parts
 */
function formatDateParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const todayStr = getTodayISO();

  const shortDay = dateObj.toLocaleDateString('nl-BE', { weekday: 'short' }).replace('.', '');
  const fullDay = dateObj.toLocaleDateString('nl-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const shortNum = dateObj.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' });

  return {
    shortDay: dateStr === todayStr ? 'Vandaag' : shortDay,
    shortNum,
    fullDay: fullDay.charAt(0).toUpperCase() + fullDay.slice(1)
  };
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatOpeningHours(openObj) {
  if (!openObj) return 'Openingsuren op ugent.be';
  const parts = [];
  if (Array.isArray(openObj.resto) && openObj.resto.length > 0) {
    const intervals = openObj.resto.map(pair => `${pair[0]} – ${pair[1]}`).join(' & ');
    parts.push(`Resto: ${intervals}`);
  }
  if (Array.isArray(openObj.cafetaria) && openObj.cafetaria.length > 0) {
    const intervals = openObj.cafetaria.map(pair => `${pair[0]} – ${pair[1]}`).join(' & ');
    parts.push(`Cafetaria: ${intervals}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'Ma – Vr tijdens middaguren';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fetch all live data from UGent Hydra API
 */
async function loadAllData() {
  dom.loadingState.classList.remove('hidden');
  dom.errorState.classList.add('hidden');

  try {
    // 1. Fetch meta locations, sandwiches, salads in parallel
    const [metaRes, sandwichesRes, saladsRes] = await Promise.all([
      fetch(`${HYDRA_BASE}/meta.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${HYDRA_BASE}/sandwiches.json`).then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${HYDRA_BASE}/salads.json`).then(r => (r.ok ? r.json() : [])).catch(() => [])
    ]);

    state.sandwiches = Array.isArray(sandwichesRes) ? sandwichesRes : [];
    state.salads = Array.isArray(saladsRes) ? saladsRes : [];

    // Merge API locations with our enriched default metadata
    if (metaRes && Array.isArray(metaRes.locations)) {
      state.locations = metaRes.locations;
    } else {
      state.locations = [...DEFAULT_RESTOS];
    }

    // 2. Fetch menu overview for all 6 restaurant endpoints in parallel
    const endpointsToFetch = DEFAULT_RESTOS.map(r => r.endpoint);
    const menuResults = await Promise.all(
      endpointsToFetch.map(async ep => {
        const res = await fetch(`${HYDRA_BASE}/menu/${ep}/overview.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status} voor ${ep}`);
        const days = await res.json();
        return { ep, days: Array.isArray(days) ? days : [] };
      })
    );

    const dateSet = new Set();
    menuResults.forEach(({ ep, days }) => {
      state.menusByEndpoint[ep] = {};
      days.forEach(dayObj => {
        if (dayObj && dayObj.date) {
          state.menusByEndpoint[ep][dayObj.date] = dayObj;
          dateSet.add(dayObj.date);
        }
      });
    });

    state.availableDates = Array.from(dateSet).sort();

    // Pick today or first upcoming available date
    const today = getTodayISO();
    if (state.availableDates.includes(today)) {
      state.activeDate = today;
    } else {
      const upcoming = state.availableDates.find(d => d >= today);
      state.activeDate = upcoming || state.availableDates[0] || today;
    }

    dom.loadingState.classList.add('hidden');
    renderAll();
  } catch (err) {
    console.error('Fout bij ophalen UGent menu:', err);
    dom.loadingState.classList.add('hidden');
    dom.errorState.classList.remove('hidden');
    dom.errorMessage.textContent = `Kon de actuele menu's niet ophalen van hydra.ugent.be (${err.message}). Controleer je internetverbinding.`;
  }
}

/**
 * Render everything according to current state
 */
function renderAll() {
  renderRestoTabs();
  renderDateTabs();
  renderDailyView();
  renderCompareView();
  renderSandwichesView();
  renderLocationsView();
  updateActiveViewVisibility();
}

function getActiveRestoMeta() {
  const fromDefault = DEFAULT_RESTOS.find(r => r.endpoint === state.activeEndpoint);
  const fromApi = state.locations.find(l => l.endpoint === state.activeEndpoint);
  return {
    ...(fromDefault || {}),
    ...(fromApi || {}),
    name: fromDefault ? fromDefault.name : (fromApi ? fromApi.name : state.activeEndpoint)
  };
}

function renderRestoTabs() {
  // Ordered list of main Dutch restos + English toggle
  const restos = DEFAULT_RESTOS;
  dom.restoTabs.innerHTML = restos
    .map(r => {
      const isActive = r.endpoint === state.activeEndpoint;
      return `
        <button
          class="resto-pill ${isActive ? 'active' : ''}"
          data-endpoint="${escapeHtml(r.endpoint)}"
          role="tab"
          aria-selected="${isActive}"
          type="button"
        >
          ${isActive ? '<span class="pill-dot"></span>' : ''}
          <span>${escapeHtml(r.name)}</span>
        </button>
      `;
    })
    .join('');

  const activeMeta = getActiveRestoMeta();
  dom.activeRestoHours.textContent = `🕒 ${formatOpeningHours(activeMeta.open)}`;

  dom.restoTabs.querySelectorAll('.resto-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeEndpoint = btn.dataset.endpoint;
      state.lang = state.activeEndpoint === 'en' ? 'en' : 'nl';
      updateLangButtonUI();
      renderRestoTabs();
      renderDailyView();
    });
  });
}

function renderDateTabs() {
  if (!state.availableDates.length) {
    dom.dateTabs.innerHTML = '';
    return;
  }

  dom.dateTabs.innerHTML = state.availableDates
    .map(dateStr => {
      const isActive = dateStr === state.activeDate;
      const parts = formatDateParts(dateStr);
      return `
        <button
          class="date-pill ${isActive ? 'active' : ''}"
          data-date="${escapeHtml(dateStr)}"
          role="tab"
          aria-selected="${isActive}"
          type="button"
        >
          <span class="day-name">${escapeHtml(parts.shortDay)}</span>
          <span class="day-num">${escapeHtml(parts.shortNum)}</span>
        </button>
      `;
    })
    .join('');

  const idx = state.availableDates.indexOf(state.activeDate);
  dom.prevDayBtn.disabled = idx <= 0;
  dom.nextDayBtn.disabled = idx === -1 || idx >= state.availableDates.length - 1;

  dom.dateTabs.querySelectorAll('.date-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeDate = btn.dataset.date;
      renderDateTabs();
      renderDailyView();
      renderCompareView();
    });
  });
}

function matchesSearchAndDiet(meal, forceKind) {
  const kind = forceKind || meal.kind || '';
  if (state.dietFilter !== 'all' && kind !== state.dietFilter) {
    return false;
  }
  if (!state.searchQuery) return true;
  const q = state.searchQuery.toLowerCase();
  const inName = (meal.name || '').toLowerCase().includes(q);
  const inAllergens = Array.isArray(meal.allergens) && meal.allergens.some(a => a.toLowerCase().includes(q));
  return inName || inAllergens;
}

function renderKindBadge(kind) {
  const meta = KIND_META[kind] || { label: kind || 'Gerecht', icon: '🍽️', className: 'kind-fish' };
  return `<span class="kind-badge ${meta.className}">${meta.icon} ${escapeHtml(meta.label)}</span>`;
}

function renderMealCard(meal, fallbackKind) {
  const kind = meal.kind || fallbackKind || 'meat';
  const allergens = Array.isArray(meal.allergens)
    ? meal.allergens.filter(a => a && a.toLowerCase() !== 'geen allergenen')
    : [];
  const hasNoAllergens =
    Array.isArray(meal.allergens) &&
    meal.allergens.some(a => a.toLowerCase() === 'geen allergenen');

  return `
    <article class="meal-item">
      <div class="meal-info">
        <div class="meal-top-row">
          ${renderKindBadge(kind)}
        </div>
        <div class="meal-name">${escapeHtml(meal.name)}</div>
        ${
          allergens.length > 0
            ? `<div class="allergens-row">
                <span class="allergen-label">Allergenen / info:</span>
                ${allergens.map(a => `<span class="allergen-tag">${escapeHtml(a)}</span>`).join('')}
              </div>`
            : hasNoAllergens
            ? `<div class="allergens-row"><span class="allergen-tag">Geen meldingsplichtige allergenen</span></div>`
            : ''
        }
      </div>
      ${meal.price ? `<div class="meal-price">${escapeHtml(meal.price)}</div>` : ''}
    </article>
  `;
}

function renderDailyView() {
  const restoMeta = getActiveRestoMeta();
  const dateParts = state.activeDate ? formatDateParts(state.activeDate) : { fullDay: '' };
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${restoMeta.name} ${restoMeta.address || 'Gent'}`
  )}`;

  dom.restoInfoBanner.innerHTML = `
    <div class="banner-title-area">
      <h2>
        <span>${escapeHtml(restoMeta.name)}</span>
        ${state.activeDate ? `<span class="banner-date-chip">${escapeHtml(dateParts.fullDay)}</span>` : ''}
      </h2>
      <div class="banner-meta">
        <span>📍 ${escapeHtml(restoMeta.address || 'Gent')}</span>
        <span>🕒 ${escapeHtml(formatOpeningHours(restoMeta.open))}</span>
      </div>
    </div>
    <div class="banner-actions">
      <a href="${mapUrl}" target="_blank" rel="noopener" class="banner-btn">
        🗺️ Route op Kaart
      </a>
      <a href="https://www.ugent.be/student/nl/studentenleven/resto/menu/weekmenu" target="_blank" rel="noopener" class="banner-btn">
        🔗 UGent Weekmenu
      </a>
    </div>
  `;

  const restoMenus = state.menusByEndpoint[state.activeEndpoint] || {};
  const dayData = restoMenus[state.activeDate];

  if (!dayData || dayData.open === false) {
    dom.dailyMenuContainer.innerHTML = `
      <div class="status-box" style="grid-column: span 12;">
        <h3>Geen menu beschikbaar voor deze datum</h3>
        <p>Dit studentenrestaurant is op deze dag gesloten of het menu is nog niet gepubliceerd.</p>
      </div>
    `;
    return;
  }

  const allMeals = Array.isArray(dayData.meals) ? dayData.meals : [];

  // Separate main dishes and soups
  const mainDishes = allMeals.filter(
    m => m.type === 'main' && m.name && !m.name.toLowerCase().includes('ontdek extra gerechten')
  );
  const extraNotices = allMeals.filter(
    m => m.name && m.name.toLowerCase().includes('ontdek extra gerechten')
  );
  const soups = allMeals.filter(m => m.kind === 'soup' || m.type === 'side');

  // Parse vegetables (prefer vegetables2 array with allergen info, fallback to vegetables string list)
  let vegetables = [];
  if (Array.isArray(dayData.vegetables2) && dayData.vegetables2.length > 0) {
    vegetables = dayData.vegetables2.map(v => ({
      name: v.name,
      kind: v.kind || 'vegetarian',
      allergens: v.allergens || [],
      price: 'Inbegrepen'
    }));
  } else if (Array.isArray(dayData.vegetables)) {
    vegetables = dayData.vegetables.map(vStr => {
      const isVegan = vStr.toLowerCase().startsWith('vegan:');
      const cleanName = vStr.replace(/^(veggie|vegan):\s*/i, '');
      return {
        name: cleanName,
        kind: isVegan ? 'vegan' : 'vegetarian',
        allergens: [],
        price: 'Inbegrepen'
      };
    });
  }

  const filteredMains = mainDishes.filter(m => matchesSearchAndDiet(m));
  const filteredSoups = soups.filter(m => matchesSearchAndDiet(m, 'soup'));
  const filteredVeggies = vegetables.filter(v => matchesSearchAndDiet(v));

  if (!filteredMains.length && !filteredSoups.length && !filteredVeggies.length) {
    dom.dailyMenuContainer.innerHTML = `
      <div class="status-box" style="grid-column: span 12;">
        <h3>Geen gerechten gevonden voor je huidige filter</h3>
        <p>Pas je zoekopdracht of categoriefilter aan om alle gerechten te tonen.</p>
      </div>
    `;
    return;
  }

  let html = '';

  // Main Dishes Card
  if (filteredMains.length > 0) {
    html += `
      <div class="menu-category-card ${filteredSoups.length > 0 || filteredVeggies.length > 0 ? 'span-8' : 'span-12'}">
        <div class="category-header">
          <h3>🍽️ Warme Hoofdgerechten</h3>
          <span class="category-count">${filteredMains.length} gerechten</span>
        </div>
        <div class="meals-list">
          ${filteredMains.map(m => renderMealCard(m)).join('')}
          ${
            extraNotices.length > 0
              ? `<div style="font-size:0.84rem; color: var(--text-muted); padding: 0.4rem 0.25rem;">
                  💡 <em>${escapeHtml(extraNotices[0].name)} van ${escapeHtml(restoMeta.name)}.</em>
                </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  // Right Column: Soups & Warm Vegetables
  if (filteredSoups.length > 0 || filteredVeggies.length > 0) {
    html += `
      <div style="display:flex; flex-direction:column; gap:1.25rem;" class="${
        filteredMains.length > 0 ? 'menu-category-card span-4' : 'menu-category-card span-12'
      }">
        ${
          filteredSoups.length > 0
            ? `
              <div>
                <div class="category-header">
                  <h3>🥣 Dagsoepen</h3>
                  <span class="category-count">${filteredSoups.length} opties</span>
                </div>
                <div class="meals-list">
                  ${filteredSoups.map(s => renderMealCard(s, 'soup')).join('')}
                </div>
              </div>
            `
            : ''
        }
        ${
          filteredVeggies.length > 0
            ? `
              <div>
                <div class="category-header" style="border-top: 1px solid rgba(255,255,255,0.2);">
                  <h3>🥦 Groenten van de Dag</h3>
                  <span class="category-count">${filteredVeggies.length} opties</span>
                </div>
                <div class="meals-list">
                  ${filteredVeggies.map(v => renderMealCard(v, v.kind)).join('')}
                </div>
              </div>
            `
            : ''
        }
      </div>
    `;
  }

  dom.dailyMenuContainer.innerHTML = html;
}

/**
 * Render Side-by-Side Comparison of all 5 Dutch Restos for activeDate
 */
function renderCompareView() {
  if (state.activeDate) {
    const parts = formatDateParts(state.activeDate);
    dom.compareDateLabel.textContent = parts.fullDay;
  }

  const restosToCompare = DEFAULT_RESTOS.filter(r => r.endpoint !== 'en');

  dom.compareGrid.innerHTML = restosToCompare
    .map(resto => {
      const dayData = (state.menusByEndpoint[resto.endpoint] || {})[state.activeDate];
      if (!dayData || !Array.isArray(dayData.meals)) {
        return `
          <div class="compare-card">
            <div class="compare-card-header">
              <div>
                <h3>${escapeHtml(resto.name)}</h3>
                <div class="compare-card-sub">${escapeHtml(resto.address)}</div>
              </div>
            </div>
            <div class="compare-card-body">
              <p style="color:var(--text-muted); font-size:0.88rem;">Geen menu beschikbaar op deze dag.</p>
            </div>
          </div>
        `;
      }

      const mains = dayData.meals.filter(
        m => m.type === 'main' && m.name && !m.name.toLowerCase().includes('ontdek extra') && matchesSearchAndDiet(m)
      );
      const soups = dayData.meals.filter(
        m => (m.kind === 'soup' || m.type === 'side') && !m.name.toLowerCase().includes('groot') && matchesSearchAndDiet(m, 'soup')
      );
      const veggies = Array.isArray(dayData.vegetables2) ? dayData.vegetables2 : [];

      return `
        <div class="compare-card">
          <div class="compare-card-header">
            <div>
              <h3>${escapeHtml(resto.name)}</h3>
              <div class="compare-card-sub">🕒 ${escapeHtml(formatOpeningHours(resto.open))}</div>
            </div>
            <button
              class="banner-btn open-resto-btn"
              data-endpoint="${escapeHtml(resto.endpoint)}"
              type="button"
              style="padding:0.32rem 0.65rem; font-size:0.75rem;"
            >
              Details →
            </button>
          </div>
          <div class="compare-card-body">
            <div class="compare-section-label">Hoofdgerechten</div>
            ${
              mains.length > 0
                ? mains
                    .map(m => {
                      const kMeta = KIND_META[m.kind] || { icon: '🍽️' };
                      return `
                        <div class="compare-meal-row">
                          <div class="compare-meal-left">
                            <span title="${escapeHtml(m.kind)}">${kMeta.icon}</span>
                            <strong>${escapeHtml(m.name)}</strong>
                          </div>
                          <span class="compare-price">${escapeHtml(m.price)}</span>
                        </div>
                      `;
                    })
                    .join('')
                : `<div style="font-size:0.84rem; color:var(--text-muted);">Geen hoofdgerechten voor dit filter</div>`
            }

            ${
              soups.length > 0
                ? `
                  <div class="compare-section-label">Soepen</div>
                  ${soups
                    .map(
                      s => `
                        <div class="compare-meal-row">
                          <div class="compare-meal-left">
                            <span>🥣</span>
                            <span>${escapeHtml(s.name.replace(/\s+klein$/i, ''))}</span>
                          </div>
                          <span class="compare-price">${escapeHtml(s.price)}</span>
                        </div>
                      `
                    )
                    .join('')}
                `
                : ''
            }

            ${
              veggies.length > 0
                ? `
                  <div class="compare-section-label">Groenten</div>
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-top:0.2rem;">
                    ${veggies
                      .map(v => `<span class="allergen-tag">🥦 ${escapeHtml(v.name)}</span>`)
                      .join('')}
                  </div>
                `
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  dom.compareGrid.querySelectorAll('.open-resto-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeEndpoint = btn.dataset.endpoint;
      switchView('daily');
      renderRestoTabs();
      renderDailyView();
    });
  });
}

/**
 * Render Sandwiches & Salads View
 */
function renderSandwichesView() {
  const q = state.searchQuery.toLowerCase();

  const filteredSandwiches = state.sandwiches.filter(s => {
    if (!q) return true;
    const inName = (s.name || '').toLowerCase().includes(q);
    const inIng = Array.isArray(s.ingredients) && s.ingredients.some(i => i.toLowerCase().includes(q));
    return inName || inIng;
  });

  const filteredSalads = state.salads.filter(s => {
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
  });

  dom.sandwichesList.innerHTML = filteredSandwiches.length
    ? filteredSandwiches
        .map(s => {
          const priceStr = s.price_medium
            ? `€ ${String(s.price_medium).replace('.', ',')}`
            : '';
          const ingredients = Array.isArray(s.ingredients) ? s.ingredients : [];
          return `
            <article class="meal-item">
              <div class="meal-info">
                <div class="meal-name">🥖 ${escapeHtml(s.name)}</div>
                ${
                  ingredients.length
                    ? `<div class="allergens-row">
                        ${ingredients.map(i => `<span class="allergen-tag">${escapeHtml(i)}</span>`).join('')}
                      </div>`
                    : ''
                }
              </div>
              ${priceStr ? `<div class="meal-price">${escapeHtml(priceStr)}</div>` : ''}
            </article>
          `;
        })
        .join('')
    : `<p style="color:var(--text-muted); padding:0.5rem;">Geen broodjes gevonden.</p>`;

  dom.saladsList.innerHTML = filteredSalads.length
    ? filteredSalads
        .map(s => {
          const isWrap = (s.name || '').toLowerCase().includes('wrap');
          const isPoke = (s.name || '').toLowerCase().includes('poké');
          const icon = isWrap ? '🌯' : isPoke ? '🍲' : '🥗';
          return `
            <article class="meal-item">
              <div class="meal-info">
                <div class="meal-name">${icon} ${escapeHtml(s.name)}</div>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">
                  ${escapeHtml(s.description)}
                </p>
              </div>
              ${s.price ? `<div class="meal-price">${escapeHtml(s.price)}</div>` : ''}
            </article>
          `;
        })
        .join('')
    : `<p style="color:var(--text-muted); padding:0.5rem;">Geen salades of wraps gevonden.</p>`;
}

/**
 * Render All UGent Resto & Cafetaria Locations
 */
function renderLocationsView() {
  const locs = state.locations.filter(l => l.endpoint !== 'en');

  dom.locationsGrid.innerHTML = locs
    .map(loc => {
      const isResto = loc.type === 'resto';
      const mapUrl =
        loc.latitude && loc.longitude
          ? `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${loc.name} ${loc.address || 'Gent'}`
            )}`;

      return `
        <article class="location-card ${isResto ? 'is-resto' : ''}">
          <div>
            <span class="loc-type-badge">${isResto ? '🍴 Studentenrestaurant' : '☕ Cafetaria'}</span>
            <h3>${escapeHtml(loc.name)}</h3>
            <div class="loc-address">📍 ${escapeHtml(loc.address || 'Universiteit Gent')}</div>
            <div class="loc-hours">
              <strong>Openingsuren:</strong><br/>
              ${escapeHtml(formatOpeningHours(loc.open))}
            </div>
          </div>
          <div class="loc-actions">
            ${
              isResto && loc.endpoint
                ? `<button class="ugent-btn loc-menu-btn" data-endpoint="${escapeHtml(loc.endpoint)}" type="button">
                    Bekijk Menu
                  </button>`
                : ''
            }
            <a href="${mapUrl}" target="_blank" rel="noopener" class="ugent-btn ugent-btn-outline">
              Open in Google Maps
            </a>
          </div>
        </article>
      `;
    })
    .join('');

  dom.locationsGrid.querySelectorAll('.loc-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeEndpoint = btn.dataset.endpoint;
      switchView('daily');
      renderRestoTabs();
      renderDailyView();
    });
  });
}

function switchView(viewName) {
  state.view = viewName;
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const isMatch = tab.dataset.view === viewName;
    tab.classList.toggle('active', isMatch);
    tab.setAttribute('aria-selected', isMatch);
  });
  updateActiveViewVisibility();
}

function updateActiveViewVisibility() {
  Object.entries(dom.views).forEach(([key, section]) => {
    if (section) {
      section.classList.toggle('hidden', key !== state.view);
    }
  });

  // Hide restaurant pill bar on views where all restaurants or general items are shown
  if (state.view === 'compare') {
    dom.controlsBar.classList.remove('hidden');
    dom.restoSelectorGroup.classList.add('hidden');
  } else if (state.view === 'daily') {
    dom.controlsBar.classList.remove('hidden');
    dom.restoSelectorGroup.classList.remove('hidden');
  } else {
    dom.controlsBar.classList.add('hidden');
  }
}

function updateLangButtonUI() {
  dom.langToggle.querySelectorAll('[data-lang]').forEach(span => {
    span.classList.toggle('lang-active', span.dataset.lang === state.lang);
  });
}

// Event Listeners Initialization
function initEvents() {
  // Navigation tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.view);
    });
  });

  // Prev / Next Date buttons
  dom.prevDayBtn.addEventListener('click', () => {
    const idx = state.availableDates.indexOf(state.activeDate);
    if (idx > 0) {
      state.activeDate = state.availableDates[idx - 1];
      renderDateTabs();
      renderDailyView();
      renderCompareView();
    }
  });

  dom.nextDayBtn.addEventListener('click', () => {
    const idx = state.availableDates.indexOf(state.activeDate);
    if (idx !== -1 && idx < state.availableDates.length - 1) {
      state.activeDate = state.availableDates[idx + 1];
      renderDateTabs();
      renderDailyView();
      renderCompareView();
    }
  });

  // Diet filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.dietFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === state.dietFilter);
      });
      renderDailyView();
      renderCompareView();
    });
  });

  // Search box
  dom.searchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    renderDailyView();
    renderCompareView();
    renderSandwichesView();
  });

  // NL / EN Toggle
  dom.langToggle.addEventListener('click', () => {
    if (state.lang === 'nl') {
      state.lang = 'en';
      state.activeEndpoint = 'en';
    } else {
      state.lang = 'nl';
      state.activeEndpoint = 'nl-debrug';
    }
    updateLangButtonUI();
    renderRestoTabs();
    renderDailyView();
  });

  // Retry button
  dom.retryBtn.addEventListener('click', () => {
    loadAllData();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  loadAllData();
});
