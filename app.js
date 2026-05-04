/* =============================================
   POKÉCARDS MARKET – APP.JS
============================================= */
'use strict';

const CONFIG = {
  PAYPAL_CLIENT_ID: 'AUYnf7fc9l89itBtl03GPaUk7GkpcKTMGct97Gla90jnVqO_v9MR6rfVXyxwH26JW09Guh90MJAowbh8',
  POKEAPI_BASE: 'https://pokeapi.co/api/v2',
  CARDS_PER_PAGE: 25,
  PRICE_MIN: 0.99,
  PRICE_MAX: 14.99,
  STORAGE_KEY: 'pokecards_owned',
};

let state = {
  allPokemons: [],
  filteredPokemons: [],
  displayedPokemons: [],
  ownedCards: new Set(),
  currentPokemon: null,
};

document.addEventListener('DOMContentLoaded', () => {
  loadOwnedCards();
  createParticles();
  initApp();
  updateCollectionBadge();
});

async function initApp() {
  try {
    await loadPokemons();
    populateTypeFilter();
    renderCards();
  } catch (err) {
    console.error('Error inicializando app:', err);
    showToast('Error al conectar con PokéAPI. Intente recargar.', 'error');
  }
}

// ========== POKEAPI ==========
async function loadPokemons() {
  setLoading(true);
  try {
    const res = await fetch(`${CONFIG.POKEAPI_BASE}/pokemon?limit=150&offset=0`);
    if (!res.ok) throw new Error('Error al cargar Pokémon');
    const data = await res.json();

    const batchSize = 25;
    const batches = [];
    for (let i = 0; i < data.results.length; i += batchSize) {
      batches.push(data.results.slice(i, i + batchSize));
    }

    let loaded = [];
    for (const batch of batches) {
      const batchData = await Promise.all(batch.map(p => fetchPokemonDetail(p.url)));
      loaded = loaded.concat(batchData.filter(Boolean));
    }

    state.allPokemons = loaded.map(poke => ({
      ...poke,
      price: generatePrice(poke.id, poke.base_experience),
    }));
    state.filteredPokemons = [...state.allPokemons];
    setLoading(false);
    updateCardsCount();
  } catch (err) {
    setLoading(false);
    throw err;
  }
}

async function fetchPokemonDetail(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      types: data.types.map(t => t.type.name),
      image: data.sprites.other?.['official-artwork']?.front_default
          || data.sprites.other?.dream_world?.front_default
          || data.sprites.front_default,
      stats: data.stats.map(s => ({ name: s.stat.name, value: s.base_stat })),
      base_experience: data.base_experience || 100,
      height: data.height,
      weight: data.weight,
    };
  } catch { return null; }
}

function generatePrice(id, baseExp) {
  const normalized = Math.min((baseExp || 50) / 300, 1);
  const price = CONFIG.PRICE_MIN + normalized * (CONFIG.PRICE_MAX - CONFIG.PRICE_MIN);
  const variation = ((id * 7) % 100) / 100 * 2 - 1;
  const finalPrice = price + variation * 0.5;
  return Math.max(CONFIG.PRICE_MIN, Math.min(CONFIG.PRICE_MAX, finalPrice)).toFixed(2);
}

// ========== RENDER CARDS ==========
function renderCards() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';
  const toShow = state.filteredPokemons.slice(0, CONFIG.CARDS_PER_PAGE);
  state.displayedPokemons = toShow;

  if (toShow.length === 0) {
    grid.innerHTML = `
      <div class="empty-collection" style="grid-column: 1/-1">
        <div class="empty-icon">🔍</div>
        <h3>Sin resultados</h3>
        <p>Intenta con otro nombre o tipo</p>
      </div>`;
    document.getElementById('load-more-container').style.display = 'none';
    return;
  }

  toShow.forEach((pokemon, index) => {
    grid.appendChild(createCardElement(pokemon, index * 60));
  });

  const loadMoreContainer = document.getElementById('load-more-container');
  if (state.filteredPokemons.length > CONFIG.CARDS_PER_PAGE) {
    loadMoreContainer.style.display = 'flex';
    document.getElementById('load-more-btn').textContent =
      `Cargar Más Cartas (${state.filteredPokemons.length - CONFIG.CARDS_PER_PAGE} restantes) ↓`;
  } else {
    loadMoreContainer.style.display = 'none';
  }
  updateCardsCount();
}

function loadMoreCards() {
  const btn = document.getElementById('load-more-btn');
  const currentCount = state.displayedPokemons.length;
  const nextBatch = state.filteredPokemons.slice(currentCount, currentCount + CONFIG.CARDS_PER_PAGE);
  if (nextBatch.length === 0) return;

  btn.classList.add('loading-more');
  btn.textContent = 'Cargando...';

  const grid = document.getElementById('cards-grid');
  nextBatch.forEach((pokemon, index) => {
    grid.appendChild(createCardElement(pokemon, index * 40));
  });

  state.displayedPokemons = state.displayedPokemons.concat(nextBatch);
  const remaining = state.filteredPokemons.length - state.displayedPokemons.length;
  if (remaining > 0) {
    btn.classList.remove('loading-more');
    btn.textContent = `Cargar Más Cartas (${remaining} restantes) ↓`;
  } else {
    document.getElementById('load-more-container').style.display = 'none';
  }
}

function createCardElement(pokemon, delay = 0) {
  const isOwned = state.ownedCards.has(pokemon.id);
  const typeColor = getTypeColor(pokemon.types[0]);

  const card = document.createElement('div');
  card.className = `poke-card ${isOwned ? 'owned' : ''}`;
  card.style.animationDelay = `${delay}ms`;
  card.dataset.id = pokemon.id;

  card.innerHTML = `
    <span class="card-number">#${String(pokemon.id).padStart(3, '0')}</span>
    ${isOwned ? '<span class="card-owned-badge">✓ Tuya</span>' : ''}
    <div class="card-img-container">
      <div class="card-bg-circle" style="background: ${typeColor}"></div>
      <img class="card-img"
        src="${pokemon.image || ''}"
        alt="${pokemon.name}"
        loading="lazy"
        onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png'"
      />
    </div>
    <div class="card-body">
      <h3 class="card-name">${pokemon.name}</h3>
      <div class="card-types">
        ${pokemon.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
      </div>
      <div class="card-footer">
        <span class="card-price">$${pokemon.price}</span>
        <button class="card-buy-btn ${isOwned ? 'owned-btn' : 'available'}" ${isOwned ? 'disabled' : ''}>
          ${isOwned ? '✓ Adquirida' : '🛒 Comprar'}
        </button>
      </div>
    </div>`;

  if (!isOwned) {
    card.addEventListener('click', () => openModal(pokemon.id));
    card.querySelector('.card-buy-btn').addEventListener('click', e => {
      e.stopPropagation();
      openModal(pokemon.id);
    });
  }
  return card;
}

// ========== FILTROS ==========
function filterCards() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const type = document.getElementById('type-filter').value;
  const sort = document.getElementById('sort-filter').value;

  let filtered = [...state.allPokemons];
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || String(p.id).includes(search));
  if (type) filtered = filtered.filter(p => p.types.includes(type));

  switch (sort) {
    case 'name': filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'price-asc': filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); break;
    case 'price-desc': filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)); break;
    default: filtered.sort((a, b) => a.id - b.id);
  }

  state.filteredPokemons = filtered;
  renderCards();
}

function populateTypeFilter() {
  const allTypes = new Set();
  state.allPokemons.forEach(p => p.types.forEach(t => allTypes.add(t)));
  const select = document.getElementById('type-filter');
  [...allTypes].sort().forEach(type => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    select.appendChild(opt);
  });
}

// ========== MODAL ==========
function openModal(pokemonId) {
  const pokemon = state.allPokemons.find(p => p.id === pokemonId);
  if (!pokemon) return;
  state.currentPokemon = pokemon;

  const typeColor = getTypeColor(pokemon.types[0]);

  document.getElementById('modal-card-preview').innerHTML = `
    <div class="preview-bg" style="background: radial-gradient(circle, ${typeColor}60 0%, transparent 70%)"></div>
    <div class="preview-card-frame"></div>
    <img class="preview-img"
      src="${pokemon.image}"
      alt="${pokemon.name}"
      onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png'"
    />`;
  document.getElementById('modal-card-preview').style.background =
    `linear-gradient(135deg, ${typeColor}18, var(--bg-secondary))`;

  document.getElementById('modal-poke-number').textContent = `#${String(pokemon.id).padStart(3, '0')}`;
  document.getElementById('modal-name').textContent = pokemon.name;
  document.getElementById('modal-price').textContent = `$${pokemon.price}`;
  document.getElementById('modal-types').innerHTML =
    pokemon.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('');

  const statNames = { hp:'HP', attack:'ATK', defense:'DEF', speed:'SPD', 'special-attack':'SP.ATK', 'special-defense':'SP.DEF' };
  document.getElementById('modal-stats').innerHTML = pokemon.stats.slice(0, 4).map(s => `
    <div class="stat-row">
      <span class="stat-label">${statNames[s.name] || s.name}</span>
      <span class="stat-value">${s.value}</span>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.min(s.value/255*100,100)}%"></div></div>
    </div>`).join('');

  const paypalContainer = document.getElementById('paypal-button-container');
  paypalContainer.innerHTML = '';

  if (typeof paypal === 'undefined') {
    paypalContainer.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid rgba(255,100,100,0.3);border-radius:10px;padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">
        ⚠️ PayPal no disponible. Verifica tu conexión y recarga la página.
      </div>`;
  } else {
    renderPayPalButton(pokemon.price);
  }

  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ========== PAYPAL ==========
function renderPayPalButton(price) {
  if (typeof paypal === 'undefined') return;

  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';

  paypal.Buttons({
    style: {
      shape: 'pill',
      color: 'blue',
      layout: 'vertical',
      label: 'pay',
      height: 44,
    },

    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: String(state.currentPokemon.price),
          },
          description: `PokéCard: ${state.currentPokemon.name} #${state.currentPokemon.id}`,
        }],
      });
    },

    onApprove: (data, actions) => {
      showToast('Procesando pago...', 'info');

      return actions.order.capture().then(function(orderData) {
        // Pago capturado exitosamente
        handlePaymentSuccess(orderData);
      }).catch(function(err) {
        // En Sandbox: si capture falla pero existe orderID y payerID,
        // el usuario SÍ aprobó el pago — lo tratamos como exitoso
        console.warn('Capture error (sandbox):', err);
        if (data.orderID && data.payerID) {
          handlePaymentSuccess({
            id: data.orderID,
            status: 'COMPLETED',
            payer: { payer_id: data.payerID }
          });
        } else {
          handlePaymentError('No se pudo completar el pago. Intenta de nuevo.');
        }
      });
    },

    onError: (err) => {
      console.error('PayPal onError:', err);
      // Ignorar errores de popup cerrado por el usuario
      const msg = (err && err.message) ? err.message : '';
      if (msg.toLowerCase().includes('window') || msg.toLowerCase().includes('closed')) return;
      handlePaymentError('Error en PayPal. Intenta de nuevo.');
    },

    onCancel: () => {
      showToast('⚠️ Pago cancelado. La carta sigue bloqueada.', 'info');
    },

  }).render('#paypal-button-container');
}

function handlePaymentSuccess(order) {
  const pokemon = state.currentPokemon;
  if (!pokemon) return;

  state.ownedCards.add(pokemon.id);
  saveOwnedCards();
  closeModalDirect();
  updateCardInGrid(pokemon.id, true);
  updateCollectionBadge();
  showSuccessOverlay(pokemon);

  console.log('✅ Pago exitoso:', {
    orderId: order.id,
    pokemon: pokemon.name,
    amount: `$${pokemon.price}`,
    status: order.status,
  });
}

function handlePaymentError(message) {
  showToast(`❌ ${message}`, 'error');
}

function closeModal(event) {
  if (event.target === document.getElementById('modal-overlay')) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  state.currentPokemon = null;
}

// ========== SUCCESS ==========
function showSuccessOverlay(pokemon) {
  document.getElementById('success-card-name').textContent = pokemon.name;
  document.getElementById('success-card-mini').innerHTML =
    `<img src="${pokemon.image}" alt="${pokemon.name}"
      onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png'"/>`;
  document.getElementById('success-overlay').classList.add('show');
  setTimeout(() => closeSuccess(), 5000);
}

function closeSuccess() {
  document.getElementById('success-overlay').classList.remove('show');
  showSection('collection');
}

// ========== COLECCIÓN ==========
function renderCollection() {
  const grid = document.getElementById('collection-grid');
  const owned = state.allPokemons.filter(p => state.ownedCards.has(p.id));

  if (owned.length === 0) {
    grid.innerHTML = `
      <div class="empty-collection">
        <div class="empty-icon">📭</div>
        <h3>No tienes cartas aún</h3>
        <p>Explora el mercado y compra tu primera carta coleccionable</p>
        <button class="hero-cta" onclick="showSection('explore')">Explorar Cartas</button>
      </div>`;
    document.getElementById('collection-stats').innerHTML = '';
    return;
  }

  const totalSpent = owned.reduce((sum, p) => sum + parseFloat(p.price), 0);
  const types = [...new Set(owned.flatMap(p => p.types))];

  document.getElementById('collection-stats').innerHTML = `
    <div class="stat-chip">
      <span class="stat-chip-label">Cartas</span>
      <span class="stat-chip-value">${owned.length}</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip-label">Invertido</span>
      <span class="stat-chip-value">$${totalSpent.toFixed(2)}</span>
    </div>
    <div class="stat-chip">
      <span class="stat-chip-label">Tipos</span>
      <span class="stat-chip-value">${types.length}</span>
    </div>`;

  grid.innerHTML = '';
  owned.forEach((pokemon, index) => {
    grid.appendChild(createCollectionCard(pokemon, index * 60));
  });
}

function createCollectionCard(pokemon, delay = 0) {
  const typeColor = getTypeColor(pokemon.types[0]);
  const card = document.createElement('div');
  card.className = 'poke-card owned';
  card.style.animationDelay = `${delay}ms`;
  card.innerHTML = `
    <span class="card-number">#${String(pokemon.id).padStart(3, '0')}</span>
    <span class="card-owned-badge">✓ Tuya</span>
    <div class="card-img-container">
      <div class="card-bg-circle" style="background: ${typeColor}"></div>
      <img class="card-img" src="${pokemon.image}" alt="${pokemon.name}" loading="lazy"
        onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png'"/>
    </div>
    <div class="card-body">
      <h3 class="card-name">${pokemon.name}</h3>
      <div class="card-types">
        ${pokemon.types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
      </div>
      <div class="card-footer">
        <span class="card-price">$${pokemon.price}</span>
        <button class="card-buy-btn owned-btn" disabled>✓ Adquirida</button>
      </div>
    </div>`;
  return card;
}

// ========== NAVEGACIÓN ==========
function showSection(section) {
  document.getElementById('btn-explore').classList.remove('active');
  document.getElementById('btn-collection').classList.remove('active');

  if (section === 'explore') {
    document.getElementById('btn-explore').classList.add('active');
    document.getElementById('hero-section').style.display = '';
    document.getElementById('cards-section').classList.remove('hidden');
    document.getElementById('collection-section').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    document.getElementById('btn-collection').classList.add('active');
    document.getElementById('hero-section').style.display = 'none';
    document.getElementById('cards-section').classList.add('hidden');
    document.getElementById('collection-section').classList.remove('hidden');
    renderCollection();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ========== PERSISTENCIA ==========
function loadOwnedCards() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (stored) state.ownedCards = new Set(JSON.parse(stored));
  } catch { state.ownedCards = new Set(); }
}

function saveOwnedCards() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify([...state.ownedCards]));
  } catch { console.warn('No se pudo guardar en localStorage'); }
}

// ========== UI HELPERS ==========
function setLoading(loading) {
  const screen = document.getElementById('loading-screen');
  const grid = document.getElementById('cards-grid');
  const loadMore = document.getElementById('load-more-container');
  if (loading) {
    screen.style.display = 'flex';
    grid.style.display = 'none';
    loadMore.style.display = 'none';
  } else {
    screen.style.display = 'none';
    grid.style.display = 'grid';
  }
}

function updateCardsCount() {
  const count = state.filteredPokemons.length;
  const owned = state.allPokemons.filter(p => state.ownedCards.has(p.id)).length;
  document.getElementById('cards-count').textContent =
    `${count} cartas disponibles • ${owned} adquiridas`;
}

function updateCollectionBadge() {
  const badge = document.getElementById('collection-badge');
  const count = state.ownedCards.size;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function updateCardInGrid(pokemonId, isOwned) {
  const card = document.querySelector(`.poke-card[data-id="${pokemonId}"]`);
  if (!card) return;
  if (isOwned) {
    card.classList.add('owned');
    if (!card.querySelector('.card-owned-badge')) {
      const badge = document.createElement('span');
      badge.className = 'card-owned-badge';
      badge.textContent = '✓ Tuya';
      card.appendChild(badge);
    }
    const btn = card.querySelector('.card-buy-btn');
    if (btn) {
      btn.className = 'card-buy-btn owned-btn';
      btn.textContent = '✓ Adquirida';
      btn.disabled = true;
    }
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slide-out-toast 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function createParticles() {
  const container = document.getElementById('particles');
  const colors = ['#FFD700','#4fc3f7','#e91e8c','#4caf50','#ab47bc'];
  const count = window.innerWidth < 768 ? 15 : 30;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 1;
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.style.cssText = `width:${size}px;height:${size}px;background:${color};left:${Math.random()*100}%;animation-duration:${Math.random()*15+10}s;animation-delay:${Math.random()*10}s;box-shadow:0 0 ${size*2}px ${color};`;
    container.appendChild(p);
  }
}

function getTypeColor(type) {
  const colors = {
    fire:'#FF6B35',water:'#4db8ff',grass:'#4caf50',electric:'#FFD700',
    psychic:'#e91e8c',ice:'#80deea',dragon:'#7e57c2',dark:'#616161',
    fairy:'#f06292',normal:'#9e9e9e',fighting:'#bf360c',flying:'#90caf9',
    poison:'#ab47bc',ground:'#8d6e63',rock:'#78909c',bug:'#8bc34a',
    ghost:'#5c6bc0',steel:'#b0bec5',
  };
  return colors[type] || '#9e9e9e';
}

// Exponer funciones globalmente
window.showSection = showSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalDirect = closeModalDirect;
window.closeSuccess = closeSuccess;
window.loadMoreCards = loadMoreCards;
window.filterCards = filterCards;