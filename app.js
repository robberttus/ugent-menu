const HYDRA_BASE = 'https://hydra.ugent.be/api/2.0/resto';

const RESTOS = [
  { name: 'De Brug', slug: 'debrug', endpoint: 'nl-debrug' },
  { name: 'Sterre', slug: 'sterre', endpoint: 'nl-sterre' },
  { name: 'Coupure', slug: 'coupure', endpoint: 'nl-coupure' },
  { name: 'Ardoyen', slug: 'ardoyen', endpoint: 'nl-ardoyen' },
  { name: 'Merelbeke', slug: 'merelbeke', endpoint: 'nl-merelbeke' }
];

const KIND_LABELS = {
  vegan: 'Vegan',
  vegetarian: 'Veggie',
  meat: 'Vlees',
  fish: 'Vis',
  soup: 'Soep'
};

const state = {
  activeEndpoint: 'nl-debrug',
  activeDate: null,
  dates: [],
  menus: {}
};

const restoTabsEl = document.getElementById('resto-tabs');
const dateTabsEl = document.getElementById('date-tabs');
const prevDayBtn = document.getElementById('prev-day');
const nextDayBtn = document.getElementById('next-day');
const menuContentEl = document.getElementById('menu-content');

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (dateStr === getTodayISO()) return 'Vandaag';
  return date.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getRestoFromHash() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/^nl-/, '').replace(/\s+/g, '');
  return RESTOS.find(
    r => r.slug === normalized || r.endpoint === raw || r.name.toLowerCase().replace(/\s+/g, '') === normalized
  );
}

function syncHashWithActiveResto() {
  const current = RESTOS.find(r => r.endpoint === state.activeEndpoint);
  if (current && window.location.hash !== `#${current.slug}`) {
    history.replaceState(null, '', `#${current.slug}`);
  }
}

async function init() {
  const hashResto = getRestoFromHash();
  if (hashResto) {
    state.activeEndpoint = hashResto.endpoint;
  }
  syncHashWithActiveResto();

  window.addEventListener('hashchange', () => {
    const matched = getRestoFromHash();
    if (matched && matched.endpoint !== state.activeEndpoint) {
      state.activeEndpoint = matched.endpoint;
      renderRestoTabs();
      renderMenu();
    }
  });

  menuContentEl.innerHTML = '<div class="empty-msg">Menu laden...</div>';

  try {
    const results = await Promise.all(
      RESTOS.map(async r => {
        const res = await fetch(`${HYDRA_BASE}/menu/${r.endpoint}/overview.json`);
        const days = res.ok ? await res.json() : [];
        return { endpoint: r.endpoint, days: Array.isArray(days) ? days : [] };
      })
    );

    const dateSet = new Set();
    results.forEach(({ endpoint, days }) => {
      state.menus[endpoint] = {};
      days.forEach(day => {
        if (day && day.date) {
          state.menus[endpoint][day.date] = day;
          dateSet.add(day.date);
        }
      });
    });

    state.dates = Array.from(dateSet).sort();
    const today = getTodayISO();
    state.activeDate = state.dates.find(d => d >= today) || state.dates[0] || today;

    render();
  } catch (e) {
    menuContentEl.innerHTML = '<div class="empty-msg">Kon het menu niet ophalen.</div>';
  }
}

function render() {
  renderRestoTabs();
  renderDateTabs();
  renderMenu();
}

function renderRestoTabs() {
  restoTabsEl.innerHTML = RESTOS.map(r => {
    const active = r.endpoint === state.activeEndpoint ? 'active' : '';
    return `<button class="resto-tab ${active}" data-ep="${r.endpoint}">${escapeHtml(r.name)}</button>`;
  }).join('');

  restoTabsEl.querySelectorAll('.resto-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeEndpoint = btn.dataset.ep;
      syncHashWithActiveResto();
      renderRestoTabs();
      renderMenu();
    });
  });
}

function renderDateTabs() {
  dateTabsEl.innerHTML = state.dates.map(d => {
    const active = d === state.activeDate ? 'active' : '';
    return `<button class="date-tab ${active}" data-date="${d}">${escapeHtml(formatDateLabel(d))}</button>`;
  }).join('');

  const idx = state.dates.indexOf(state.activeDate);
  prevDayBtn.disabled = idx <= 0;
  nextDayBtn.disabled = idx === -1 || idx >= state.dates.length - 1;

  dateTabsEl.querySelectorAll('.date-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeDate = btn.dataset.date;
      renderDateTabs();
      renderMenu();
    });
  });

  const activeBtn = dateTabsEl.querySelector('.date-tab.active');
  if (activeBtn) {
    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

prevDayBtn.addEventListener('click', () => {
  const idx = state.dates.indexOf(state.activeDate);
  if (idx > 0) {
    state.activeDate = state.dates[idx - 1];
    renderDateTabs();
    renderMenu();
  }
});

nextDayBtn.addEventListener('click', () => {
  const idx = state.dates.indexOf(state.activeDate);
  if (idx !== -1 && idx < state.dates.length - 1) {
    state.activeDate = state.dates[idx + 1];
    renderDateTabs();
    renderMenu();
  }
});

function renderMenu() {
  const day = (state.menus[state.activeEndpoint] || {})[state.activeDate];

  if (!day || day.open === false || !Array.isArray(day.meals) || day.meals.length === 0) {
    menuContentEl.innerHTML = '<div class="empty-msg">Geen menu op deze dag.</div>';
    return;
  }

  const mains = day.meals.filter(
    m => m.type === 'main' && m.name && !m.name.toLowerCase().includes('ontdek extra')
  );
  const soups = day.meals.filter(m => m.kind === 'soup' || m.type === 'side');

  let veggies = [];
  if (Array.isArray(day.vegetables2) && day.vegetables2.length) {
    veggies = day.vegetables2.map(v => v.name);
  } else if (Array.isArray(day.vegetables)) {
    veggies = day.vegetables.map(v => v.replace(/^(veggie|vegan):\s*/i, ''));
  }

  const sections = [];

  if (mains.length) {
    sections.push(`
      <section class="menu-section">
        <div class="section-title">Hoofdgerechten</div>
        <ul class="menu-list">
          ${mains.map(m => `
            <li class="menu-row">
              <div class="meal-left">
                <span class="meal-tag">${escapeHtml(KIND_LABELS[m.kind] || m.kind)}</span>
                <span class="meal-name">${escapeHtml(m.name)}</span>
              </div>
              <span class="meal-price">${escapeHtml(m.price)}</span>
            </li>
          `).join('')}
        </ul>
      </section>
    `);
  }

  if (soups.length) {
    sections.push(`
      <section class="menu-section">
        <div class="section-title">Soep</div>
        <ul class="menu-list">
          ${soups.map(s => `
            <li class="menu-row">
              <span class="meal-name">${escapeHtml(s.name)}</span>
              <span class="meal-price">${escapeHtml(s.price)}</span>
            </li>
          `).join('')}
        </ul>
      </section>
    `);
  }

  if (veggies.length) {
    sections.push(`
      <section class="menu-section">
        <div class="section-title">Groenten</div>
        <ul class="menu-list">
          ${veggies.map(v => `
            <li class="menu-row">
              <span class="meal-name">${escapeHtml(v)}</span>
            </li>
          `).join('')}
        </ul>
      </section>
    `);
  }

  menuContentEl.innerHTML = sections.join('');
}

document.addEventListener('DOMContentLoaded', init);
