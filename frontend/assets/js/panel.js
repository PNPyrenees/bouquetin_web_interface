/**
 * PANNEAU DONNÉES ATTRIBUTAIRES
 * Gère le tableau de données, les colonnes configurables,
 * la recherche et la pagination.
 */

// Définition de toutes les colonnes disponibles
const colonnesDisponibles = [
  { key: 'ani_nom',               label: 'Individu',          defaut: true  },
  { key: 'ani_id',                label: 'ID',                defaut: true  },
  { key: 'ani_sexe',              label: 'Sexe',              defaut: true  },
  { key: 'loc_datetime_local',    label: 'Date/Heure locale', defaut: true  },
  { key: 'ani_pop_rattach',       label: 'Population',        defaut: false },
  { key: 'loc_altitude_capteur',  label: 'Altitude (m)',      defaut: false },
  { key: 'loc_temperature_capteur', label: 'Temp. (°C)',      defaut: false },
  { key: 'loc_dop',               label: 'DOP',               defaut: false },
  { key: 'loc_nb_satellites',     label: 'Nb sat.',           defaut: false },
  { key: 'loc_anomalie',          label: 'Pos. Abe.',         defaut: false },
  { key: 'capt_constructeur',     label: 'Constructeur',      defaut: false }
];

let colonnesActives = colonnesDisponibles
  .filter(c => c.defaut)
  .map(c => c.key);

let donneesTableau = [];     // Toutes les données reçues
let donneesFiltrees = [];    // Après filtres colonnes
let pageCourante = 1;
let lignesParPage = 25;

let colonneTriee = null;
let sensTriee = 'asc';

/**
 * Initialise la structure HTML du panneau données dans #sidebarRightBody
 */
export function initPanneau() {
  const sidebarRightBody = document.getElementById('sidebarRightBody');
  if (!sidebarRightBody) return;

  sidebarRightBody.style.display = 'flex';
  sidebarRightBody.style.flexDirection = 'column';
  sidebarRightBody.style.padding = '0 0 0 10px';
  sidebarRightBody.style.height = '100%';
  sidebarRightBody.style.overflow = 'hidden';

  sidebarRightBody.innerHTML = `
    <div class="panel-toolbar">
      <div style="position:relative; margin-left:auto;">
        <button class="panel-btn-filtres" id="panelBtnFiltres">
          <img src="assets/img/filtre_horizontal.png" alt="" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> Filtres colonnes
        </button>
        <div class="panel-colonnes-dropdown" id="panelColonnesDropdown" style="display:none">
          <div class="panel-colonnes-header">
            <span>Colonnes visibles</span>
            <button class="panel-colonnes-reset" id="panelColonnesReset">Réinitialiser</button>
          </div>
          ${colonnesDisponibles.map(c => `
            <label class="panel-colonnes-item">
              <input type="checkbox" value="${c.key}" ${c.defaut ? 'checked' : ''}>
              ${c.label}
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="panel-table-wrapper">
      <table class="panel-table">
        <thead id="panelTableHead"></thead>
        <tbody id="panelTableBody"></tbody>
      </table>
    </div>
    <div class="panel-pagination" id="panelPagination">
      <div class="panel-pagesize-container">
        <select id="panelPageSizeSelect" class="panel-pagesize-select">
          <option value="25" selected>25</option>
          <option value="50">50</option>
          <option value="all">Tous</option>
        </select>
        <span class="panel-pagesize-label">données / page</span>
      </div>
      <div class="panel-pagination-controls" id="panelPaginationControls">
        <span class="panel-page-info" id="panelPageInfo">Page 1 sur 0</span>
      </div>
    </div>
  `;

  mettreAJourColonnes();
  initFiltresColonnes();

  const pageSizeSelect = document.getElementById('panelPageSizeSelect');
  pageSizeSelect?.addEventListener('change', (e) => {
    lignesParPage = e.target.value;
    pageCourante = 1;
    rendrePage();
  });

  // Filtres par colonne — écoute sur les inputs de la ligne filtres
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('panel-col-filter')) return;
    appliquerFiltresColonnes();
  });
}

/**
 * Met à jour les colonnes visibles dans l'en-tête du tableau
 */
function mettreAJourColonnes() {
  const thead = document.getElementById('panelTableHead');
  if (!thead) return;

  const tr = document.createElement('tr');
  tr.innerHTML = colonnesDisponibles
    .filter(c => colonnesActives.includes(c.key))
    .map(c => {
      let icone;
      if (colonneTriee === c.key) {
        icone = sensTriee === 'asc'
          ? '<span class="sort-icon"><span class="sort-up active">▲</span><span class="sort-down">▼</span></span>'
          : '<span class="sort-icon"><span class="sort-up">▲</span><span class="sort-down active">▼</span></span>';
      } else {
        icone = '<span class="sort-icon"><span class="sort-up">▲</span><span class="sort-down">▼</span></span>';
      }
      return `
        <th data-col="${c.key}" class="panel-th-sortable${colonneTriee === c.key ? ' active-sort' : ''}">
          <div class="th-label">${icone} ${c.label}</div>
          <div class="th-filter">
            <input type="text" class="panel-col-filter" data-col="${c.key}" placeholder="Filtrer...">
          </div>
        </th>
      `;
    })
    .join('');

  tr.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', (e) => {
      if (e.target.classList.contains('panel-col-filter')) return;
      const col = th.dataset.col;
      if (colonneTriee === col) {
        sensTriee = sensTriee === 'asc' ? 'desc' : 'asc';
      } else {
        colonneTriee = col;
        sensTriee = 'asc';
      }
      trierDonnees();
      mettreAJourColonnes();
      rendrePage();
    });
  });

  thead.innerHTML = '';
  thead.appendChild(tr);
}

/**
 * Initialise la logique du dropdown Filtres colonnes
 */
function initFiltresColonnes() {
  const btnFiltres = document.getElementById('panelBtnFiltres');
  const dropdown = document.getElementById('panelColonnesDropdown');

  btnFiltres?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!dropdown?.contains(e.target) && e.target !== btnFiltres) {
      if (dropdown) dropdown.style.display = 'none';
    }
  });

  dropdown?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (e.target.checked) {
      if (!colonnesActives.includes(key)) colonnesActives.push(key);
    } else {
      colonnesActives = colonnesActives.filter(k => k !== key);
    }
    mettreAJourColonnes();
    rendrePage();
  });

  document.getElementById('panelColonnesReset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    colonnesActives = colonnesDisponibles.filter(c => c.defaut).map(c => c.key);
    dropdown?.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = colonnesActives.includes(cb.value);
    });
    mettreAJourColonnes();
    rendrePage();
  });
}

/**
 * Exporte colonnesActives pour usage externe (ex: chargement des données)
 */
export function getColonnesActives() {
  return colonnesActives;
}

/**
 * Reçoit les locations depuis app.js et met à jour le tableau
 */
export function mettreAJourPanneau(locations) {
  donneesTableau = locations || [];
  donneesFiltrees = [...donneesTableau];
  trierDonnees();
  pageCourante = 1;
  reconstruireSelectPageSize(donneesFiltrees.length);
  rendrePage();
}

function trierDonnees() {
  if (!colonneTriee) return;
  donneesFiltrees.sort((a, b) => {
    let valA = a[colonneTriee] ?? '';
    let valB = b[colonneTriee] ?? '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sensTriee === 'asc' ? -1 : 1;
    if (valA > valB) return sensTriee === 'asc' ? 1 : -1;
    return 0;
  });
}

function rendrePage() {
  const tbody = document.getElementById('panelTableBody');
  if (!tbody) return;

  const total = donneesFiltrees.length;
  const size = lignesParPage === 'all' ? total : parseInt(lignesParPage, 10);
  const debut = lignesParPage === 'all' ? 0 : (pageCourante - 1) * size;
  const fin = lignesParPage === 'all' ? total : Math.min(debut + size, total);
  const page = donneesFiltrees.slice(debut, fin);

  // Rendu des lignes
  tbody.innerHTML = page.map(loc => `
    <tr class="panel-table-row">
      ${colonnesDisponibles
        .filter(c => colonnesActives.includes(c.key))
        .map(c => `<td>${formaterValeur(c.key, loc[c.key])}</td>`)
        .join('')}
    </tr>
  `).join('');

  // Mettre à jour la pagination
  rendrePagination(total);
}

function formaterValeur(key, valeur) {
  if (valeur === null || valeur === undefined) return '-';

  switch (key) {
    case 'loc_datetime_local':
      return valeur.replace('T', ' ').slice(0, 16);
    case 'loc_anomalie':
      return valeur === true ? '<span style="color:#e74c3c;font-weight:700">Oui</span>' : '—';
    case 'ani_sexe':
      return valeur === 'M' ? 'Mâle' : valeur === 'F' ? 'Femelle' : valeur;
    case 'loc_altitude_capteur':
    case 'loc_temperature_capteur':
    case 'loc_dop':
      return typeof valeur === 'number' ? valeur.toFixed(1) : valeur;
    default:
      return valeur;
  }
}

function rendrePagination(total) {
  const paginationControls = document.getElementById('panelPaginationControls');
  if (!paginationControls) return;

  const size = lignesParPage === 'all' ? total : parseInt(lignesParPage, 10);
  const nbPages = size > 0 ? Math.ceil(total / size) : 1;
  const pageInfo = document.getElementById('panelPageInfo');
  if (pageInfo) pageInfo.textContent = `Page ${pageCourante} sur ${nbPages || 0}`;

  // Retirer les boutons existants en gardant le pageInfo
  paginationControls.querySelectorAll('.panel-page-btn, .panel-page-dots').forEach(b => b.remove());

  if (nbPages <= 1) return;

  // Construire tous les boutons dans un fragment
  const fragment = document.createDocumentFragment();

  // Bouton précédent
  const btnPrev = document.createElement('button');
  btnPrev.className = 'panel-page-btn';
  btnPrev.textContent = '‹';
  btnPrev.disabled = pageCourante === 1;
  btnPrev.addEventListener('click', () => {
    if (pageCourante > 1) { pageCourante--; rendrePage(); }
  });
  fragment.appendChild(btnPrev);

  // Boutons numéros avec ellipses
  const pages = [];
  for (let i = 1; i <= nbPages; i++) {
    if (i === 1 || i === nbPages || (i >= pageCourante - 1 && i <= pageCourante + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  pages.forEach(p => {
    if (p === '...') {
      const dots = document.createElement('span');
      dots.className = 'panel-page-dots';
      dots.textContent = '...';
      fragment.appendChild(dots);
    } else {
      const btn = document.createElement('button');
      btn.className = `panel-page-btn${p === pageCourante ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => { pageCourante = p; rendrePage(); });
      fragment.appendChild(btn);
    }
  });

  // Bouton suivant
  const btnNext = document.createElement('button');
  btnNext.className = 'panel-page-btn';
  btnNext.textContent = '›';
  btnNext.disabled = pageCourante === nbPages;
  btnNext.addEventListener('click', () => {
    if (pageCourante < nbPages) { pageCourante++; rendrePage(); }
  });
  fragment.appendChild(btnNext);

  // Insérer le fragment après le pageInfo
  paginationControls.appendChild(fragment);
}

function appliquerFiltresColonnes() {
  const filtres = {};
  document.querySelectorAll('.panel-col-filter').forEach(input => {
    const col = input.dataset.col;
    const val = input.value.trim().toLowerCase();
    if (val) filtres[col] = val;
  });

  donneesFiltrees = donneesTableau.filter(loc => {
    return Object.entries(filtres).every(([col, val]) => {
      const cellVal = formaterValeur(col, loc[col]);
      return String(cellVal).toLowerCase().includes(val);
    });
  });

  trierDonnees();
  pageCourante = 1;
  reconstruireSelectPageSize(donneesFiltrees.length);
  rendrePage();
}

/**
 * Calcule deux intervalles logiques et arrondis basés sur le nombre total de données
 */
function calculerIntervalles(total) {
  if (total <= 10) {
    return [5, 10];
  }
  if (total <= 25) {
    return [10, 25];
  }
  if (total <= 50) {
    return [15, 25];
  }
  if (total <= 100) {
    return [25, 50];
  }
  if (total <= 250) {
    return [50, 100];
  }
  if (total <= 500) {
    return [50, 200];
  }
  if (total <= 1000) {
    return [100, 500];
  }

  // Pour total > 1000, arrondit à la centaine près
  const step = Math.pow(10, Math.floor(Math.log10(total)) - 1);
  const val1 = Math.round((total / 5) / step) * step;
  const val2 = Math.round((total / 2) / step) * step;
  return [val1 || 100, val2 || 500];
}

/**
 * Reconstruit dynamiquement les options du sélecteur selon le total actuel
 */
function reconstruireSelectPageSize(total) {
  const select = document.getElementById('panelPageSizeSelect');
  if (!select) return;

  const [i1, i2] = calculerIntervalles(total);
  const ancienneValeur = select.value;

  select.innerHTML = `
    <option value="${i1}">${i1}</option>
    <option value="${i2}">${i2}</option>
    <option value="all">Tous</option>
  `;

  // Tente de restaurer la sélection précédente, sinon prend le premier intervalle
  if (ancienneValeur === 'all') {
    select.value = 'all';
    lignesParPage = 'all';
  } else if (Array.from(select.options).some(opt => opt.value === ancienneValeur)) {
    select.value = ancienneValeur;
    lignesParPage = ancienneValeur;
  } else {
    select.value = i1;
    lignesParPage = i1;
  }
}
