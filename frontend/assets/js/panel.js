/**
 * PANNEAU DONNÉES ATTRIBUTAIRES
 * Gère le tableau de données, les colonnes configurables,
 * la recherche et la pagination.
 */

// Définition de toutes les colonnes disponibles
const colonnesDisponibles = [
  { key: 'ani_nom',                 label: 'Individu',             defaut: true  },
  { key: 'loc_datetime_local',      label: 'Date de localisation', defaut: true  },
  { key: 'ani_pop_rattach',         label: 'Population',           defaut: true  },
  { key: 'ani_gestionnaire',        label: 'Gestionnaire',         defaut: true  },
  { key: 'ani_id',                  label: 'ID',                   defaut: false },
  { key: 'ani_sexe',                label: 'Sexe',                 defaut: false },
  { key: 'loc_altitude_capteur',    label: 'Altitude (m)',         defaut: false },
  { key: 'loc_temperature_capteur', label: 'Temp. (°C)',           defaut: false },
  { key: 'loc_dop',                 label: 'DOP',                  defaut: false }
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
let panneauFermeManuel = false;
let aniIdSelectionne = null;

const colonnesIndividus = [
  { key: 'ani_nom',             label: 'Individu',          defaut: true  },
  { key: 'ani_id',              label: 'ID',                defaut: true  },
  { key: 'ani_sexe',            label: 'Sexe',              defaut: true  },
  { key: 'ani_pop_rattach',     label: 'Population',        defaut: true  },
  { key: 'ani_gestionnaire',    label: 'Gestionnaire',      defaut: true  },
  { key: 'ani_annee_naissance', label: 'Année naissance',   defaut: false },
  { key: 'premiere_position',   label: 'Première position', defaut: false },
  { key: 'derniere_position',   label: 'Date de localisation', defaut: false },
  { key: 'ani_code',            label: 'Code',              defaut: false },
  { key: 'ani_date_relache',    label: 'Date lâcher',       defaut: false },
  { key: 'ani_date_mort',       label: 'Date mort',         defaut: false }
];

let colonnesIndividusActives = colonnesIndividus.filter(c => c.defaut).map(c => c.key);
let donneesIndividus = [];
let donneesIndividusFiltrees = [];
let pageCouranteIndividus = 1;
let lignesParPageIndividus = 25;
let colonneTrieeIndividus = null;
let sensTrieeIndividus = 'asc';

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
    <div class="panel-tabs">
      <button class="panel-tab" id="tabIndividus" style="display:none">Individus observés</button>
      <button class="panel-tab active" id="tabDonnees">Localisations</button>
    </div>
    <div class="panel-tab-content" id="panelContentDonnees" style="display:flex">
      <div class="panel-toolbar">
        <button id="btnExportCSV" class="panel-btn-filtres" title="Exporter toutes les localisations en CSV">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Exporter CSV
        </button>
        <div style="position:relative; margin-left:auto;">
          <button class="panel-btn-filtres" id="panelBtnFiltres">
            <img src="assets/img/filtre_horizontal.png" alt="" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> Filtres colonnes
          </button>
          <div class="panel-colonnes-dropdown" id="panelColonnesDropdown" style="display:none">
            <div class="panel-colonnes-header">
              <span>Colonnes</span>
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
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="25" selected>25</option>
            <option value="50">50</option>
            <option value="all">Tous</option>
          </select>
        </div>
        <div class="panel-pagination-controls" id="panelPaginationControls">
          <span class="panel-page-info" id="panelPageInfo">Page 1 sur 0</span>
        </div>
        <span class="panel-positions-total"><strong>0</strong> positions totales</span>
      </div>
    </div>
    <div class="panel-tab-content" id="panelContentIndividus" style="display:none">
      <div class="panel-toolbar">
        <div style="position:relative; margin-left:auto;">
          <button class="panel-btn-filtres" id="panelBtnFiltresIndividus">
            <img src="assets/img/filtre_horizontal.png" alt="" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> Filtres colonnes
          </button>
          <div class="panel-colonnes-dropdown" id="panelIndividusDropdown" style="display:none">
            <div class="panel-colonnes-header">
              <span>Colonnes</span>
              <button class="panel-colonnes-reset" id="panelIndividusReset">Réinitialiser</button>
            </div>
            ${colonnesIndividus.map(c => `
              <label class="panel-colonnes-item">
                <input type="checkbox" value="${c.key}" ${c.defaut ? 'checked' : ''}>
                ${c.label}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="panel-table-wrapper">
        <table class="panel-table panel-table-individus">
          <thead id="panelIndividusHead"></thead>
          <tbody id="panelIndividusBody"></tbody>
        </table>
      </div>
      <div class="panel-pagination" id="panelIndividusPagination">
        <div class="panel-pagesize-container">
          <select id="panelIndividusPageSizeSelect" class="panel-pagesize-select">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="25" selected>25</option>
            <option value="50">50</option>
            <option value="all">Tous</option>
          </select>
          <span class="panel-individus-total"><strong>0</strong> individus</span>
        </div>
        <div class="panel-pagination-controls" id="panelIndividusPaginationControls">
          <span class="panel-page-info" id="panelIndividusPageInfo">Page 1 sur 0</span>
        </div>
      </div>
    </div>
  `;

  mettreAJourColonnes();
  initFiltresColonnes();

  // Dropdown filtres colonnes individus
  const btnFiltresIndividus = document.getElementById('panelBtnFiltresIndividus');
  const dropdownIndividus = document.getElementById('panelIndividusDropdown');

  btnFiltresIndividus?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownIndividus.style.display = dropdownIndividus.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!dropdownIndividus?.contains(e.target) && e.target !== btnFiltresIndividus) {
      if (dropdownIndividus) dropdownIndividus.style.display = 'none';
    }
  });

  dropdownIndividus?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (e.target.checked) {
      if (!colonnesIndividusActives.includes(key)) colonnesIndividusActives.push(key);
    } else {
      colonnesIndividusActives = colonnesIndividusActives.filter(k => k !== key);
    }
    mettreAJourColonnesIndividus();
    rendrePageIndividus();
  });

  document.getElementById('panelIndividusReset')?.addEventListener('click', (e) => {
    e.stopPropagation();
    colonnesIndividusActives = colonnesIndividus.filter(c => c.defaut).map(c => c.key);
    dropdownIndividus?.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = colonnesIndividusActives.includes(cb.value);
    });
    mettreAJourColonnesIndividus();
    rendrePageIndividus();
  });

  // Filtres par colonne individus
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('panel-individu-filter')) return;
    const filtres = {};
    document.querySelectorAll('.panel-individu-filter').forEach(input => {
      const col = input.dataset.col;
      const val = input.value.trim().toLowerCase();
      if (val) filtres[col] = val;
    });
    donneesIndividusFiltrees = donneesIndividus.filter(ani => {
      return Object.entries(filtres).every(([col, val]) => {
        const cellVal = formaterValeurIndividu(col, ani[col]);
        return String(cellVal).toLowerCase().includes(val);
      });
    });
    trierIndividus();
    pageCouranteIndividus = 1;
    reconstruireSelectPageSizeIndividus(donneesIndividusFiltrees.length);
    rendrePageIndividus();
  });

  document.getElementById('panelIndividusPageSizeSelect')?.addEventListener('change', (e) => {
    lignesParPageIndividus = e.target.value;
    pageCouranteIndividus = 1;
    rendrePageIndividus();
  });

  mettreAJourColonnesIndividus();

  const tabDonnees = sidebarRightBody.querySelector('#tabDonnees');
  const tabIndividus = sidebarRightBody.querySelector('#tabIndividus');

  tabDonnees?.addEventListener('click', () => {
    tabDonnees.classList.add('active');
    tabIndividus?.classList.remove('active');
    document.getElementById('panelContentDonnees').style.display = 'flex';
    document.getElementById('panelContentIndividus').style.display = 'none';
    mettreAJourColonnes();

    const aniIdSelectionne = document.querySelector('.panel-individu-row.selected-carte')?.dataset.aniId;
    if (aniIdSelectionne) {
      window._scrollToAniId?.(aniIdSelectionne);
      setTimeout(() => {
        document.querySelectorAll(`.panel-table-row[data-ani-id='${aniIdSelectionne}']`).forEach(tr => {
          tr.classList.add('selected-carte');
        });
      }, 50);
    }
  });

  tabIndividus?.addEventListener('click', () => {
    tabIndividus.classList.add('active');
    tabDonnees?.classList.remove('active');
    document.getElementById('panelContentDonnees').style.display = 'none';
    document.getElementById('panelContentIndividus').style.display = 'flex';
    mettreAJourColonnesIndividus();

    const aniIdSelectionne = document.querySelector('.panel-table-row.selected-carte')?.dataset.aniId;
    if (aniIdSelectionne) {
      window._scrollToAniIdIndividus?.(aniIdSelectionne);
      setTimeout(() => {
        document.querySelectorAll(`.panel-individu-row[data-ani-id='${aniIdSelectionne}']`).forEach(tr => {
          tr.classList.add('selected-carte');
        });
      }, 50);
    }
  });

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
    // Fallback loc_date_local si loc_datetime_local est null
    let valA = colonneTriee === 'loc_datetime_local'
      ? (a.loc_datetime_local || a.loc_date_local || '')
      : (a[colonneTriee] ?? '');
    let valB = colonneTriee === 'loc_datetime_local'
      ? (b.loc_datetime_local || b.loc_date_local || '')
      : (b[colonneTriee] ?? '');
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sensTriee === 'asc' ? -1 : 1;
    if (valA > valB) return sensTriee === 'asc' ? 1 : -1;
    return 0;
  });
}

function trierIndividus() {
  if (!colonneTrieeIndividus) return;
  donneesIndividusFiltrees.sort((a, b) => {
    let valA = a[colonneTrieeIndividus] ?? '';
    let valB = b[colonneTrieeIndividus] ?? '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sensTrieeIndividus === 'asc' ? -1 : 1;
    if (valA > valB) return sensTrieeIndividus === 'asc' ? 1 : -1;
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
    <tr class="panel-table-row" data-ani-id="${loc.ani_id}" data-loc-datetime="${loc.loc_datetime_local || loc.loc_date_local || ''}">
      ${colonnesDisponibles
      .filter(c => colonnesActives.includes(c.key))
      .map(c => `<td>${formaterValeur(c.key, loc[c.key], loc)}</td>`)
      .join('')}
    </tr>
  `).join('');

  tbody.querySelectorAll('.panel-table-row').forEach((tr, index) => {
    const loc = page[index];
    if (!loc) return;

    // Survol — désactivé (incompatible WebGLPointsLayer)
    // tr.addEventListener('mouseenter', () => { ... window._highlightPoint(loc.ani_id, true) });
    // tr.addEventListener('mouseleave', () => { ... window._highlightPoint(loc.ani_id, false) });

    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      document.querySelectorAll('.panel-table-row.selected-carte').forEach(r => r.classList.remove('selected-carte'));
      tr.classList.add('selected-carte');
      aniIdSelectionne = String(loc.ani_id);
      if (window._afficherPositionsIndividu) window._afficherPositionsIndividu(loc.ani_id);

      // Recentrer la carte sur ce point GPS precis
      if (loc?.geom?.coordinates) {
        const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
        const coord = ol.proj.fromLonLat(wgs84);
        window._getMap?.().getView().animate({
          center: coord,
          duration: 400
        });
      }

      // Surligner la ligne selectionnee
      document.querySelectorAll('.panel-table-row.selected-click').forEach(r => r.classList.remove('selected-click'));
      tr.classList.add('selected-click');
    });
  });

  if (aniIdSelectionne) {
    document.querySelectorAll(`.panel-table-row[data-ani-id='${aniIdSelectionne}']`).forEach(tr => {
      tr.classList.add('selected-carte');
    });
  }

  // Mettre à jour la pagination
  rendrePagination(total);

  // Remonter le tableau en haut apres le changement de page
  const tableWrapper = document.querySelector('.panel-table-wrapper');
  if (tableWrapper) {
    tableWrapper.scrollTop = 0;
  }
}

function formaterDateLocalisation(valeur) {
  if (!valeur) return '—';
  const date = new Date(valeur);
  if (isNaN(date)) return valeur;
  const j = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const a = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${j}/${m}/${a} ${h}:${min}`;
}

function formaterValeur(key, valeur, loc = {}) {
  if (valeur === null || valeur === undefined) {
    if (key === 'loc_datetime_local' && loc.loc_date_local) {
      valeur = loc.loc_date_local;
    } else {
      return '-';
    }
  }

  switch (key) {
    case 'loc_datetime_local':
      return formaterDateLocalisation(valeur);
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

  // Compteur positions — mis à jour avant le return
  const totalEl = document.querySelector('.panel-positions-total');
  if (totalEl) totalEl.innerHTML = `<strong>${donneesFiltrees.length}</strong> positions`;

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

  // Fenêtre glissante : page courante + suivante, ellipsis si suite
  const pages = [];
  for (let i = pageCourante; i <= Math.min(pageCourante + 1, nbPages); i++) {
    pages.push(i);
  }
  if (pageCourante + 1 < nbPages) {
    pages.push('...');
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

  // Synchroniser les points carte avec les lignes visibles dans le tableau
  if (Object.keys(filtres).length === 0) {
    window._filtrerPointsCarte?.(null);
  } else {
    filtrerCarteDepuisTableau(donneesFiltrees);
  }
}

/**
 * Exporte en CSV toutes les localisations des animaux donnes — requete dediee
 * tous champs de v_localisation, independante de la pagination et des filtres colonnes.
 */
export async function exporterCSV(token, aniIds, params = {}) {
  if (!aniIds || aniIds.length === 0) {
    window._showToast?.('Aucun individu a exporter');
    return;
  }

  window._showToast?.('Export en cours...');

  try {
    const { fetchLocationsExportCSV } = await import('./api.js');
    const locs = await fetchLocationsExportCSV(token, aniIds, params);

    if (locs.length === 0) {
      window._showToast?.('Aucune donnee a exporter');
      return;
    }

    // Generer le CSV
    const colonnes = [
      'loc_id', 'ani_id', 'ani_code', 'ani_nom', 'ani_sexe',
      'ani_pop_rattach', 'ani_date_relache', 'ani_gestionnaire',
      'capt_id', 'capt_actif', 'capt_frequence', 'capt_constructeur', 'capt_id_constructeur',
      'loc_dop', 'fix_status_label', 'loc_nb_satellites', 'loc_outlier', 'loc_anomalie',
      'loc_altitude_capteur', 'loc_temperature_capteur',
      'loc_datetime_utc', 'loc_datetime_local', 'loc_date_local',
      'loc_mois_jour_local', 'loc_commentaire'
    ];

    const header = colonnes.join(';');
    const lignes = locs.map(loc =>
      colonnes.map(col => {
        const val = loc[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Echapper les valeurs contenant des points-virgules ou guillemets
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(';')
    );

    const csvContent = '﻿' + [header, ...lignes].join('\n'); // BOM UTF-8 pour Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bouquetins_localisations_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    window._showToast?.(`${locs.length} localisations exportees`);
  } catch (err) {
    console.error('Erreur export CSV:', err);
    window._showToast?.('Erreur lors de l export');
  }
}

/**
 * Masque sur la carte les points dont la localisation n'est pas visible
 * dans le tableau apres filtrage colonnes.
 */
export function filtrerCarteDepuisTableau(locs) {
  const visiblesSet = new Set(
    locs.map(l => `${l.ani_id}__${l.loc_datetime_local || l.loc_date_local}`)
  );
  window._filtrerPointsCarte?.(visiblesSet);
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

function reconstruireSelectPageSizeIndividus(total) {
  const select = document.getElementById('panelIndividusPageSizeSelect');
  if (!select) return;

  const [i1, i2] = calculerIntervalles(total);
  const ancienneValeur = select.value;

  select.innerHTML = `
    <option value="${i1}">${i1}</option>
    <option value="${i2}">${i2}</option>
    <option value="all">Tous</option>
  `;

  if (ancienneValeur === 'all') {
    select.value = 'all';
    lignesParPageIndividus = 'all';
  } else if (Array.from(select.options).some(opt => opt.value === ancienneValeur)) {
    select.value = ancienneValeur;
    lignesParPageIndividus = ancienneValeur;
  } else {
    select.value = i1;
    lignesParPageIndividus = i1;
  }
}

export function mettreAJourIndividus(animals) {
  donneesIndividus = animals || [];
  donneesIndividusFiltrees = [...donneesIndividus];
  trierIndividus();
  pageCouranteIndividus = 1;
  reconstruireSelectPageSizeIndividus(donneesIndividusFiltrees.length);
  rendrePageIndividus();
}

function mettreAJourColonnesIndividus() {
  const thead = document.getElementById('panelIndividusHead');
  if (!thead) return;

  const tr = document.createElement('tr');
  tr.innerHTML = colonnesIndividus
    .filter(c => colonnesIndividusActives.includes(c.key))
    .map(c => {
      let icone;
      if (colonneTrieeIndividus === c.key) {
        icone = sensTrieeIndividus === 'asc'
          ? '<span class="sort-icon"><span class="sort-up active">▲</span><span class="sort-down">▼</span></span>'
          : '<span class="sort-icon"><span class="sort-up">▲</span><span class="sort-down active">▼</span></span>';
      } else {
        icone = '<span class="sort-icon"><span class="sort-up">▲</span><span class="sort-down">▼</span></span>';
      }
      return `
        <th data-col="${c.key}" class="panel-th-sortable${colonneTrieeIndividus === c.key ? ' active-sort' : ''}">
          <div class="th-label">${icone} ${c.label}</div>
          <div class="th-filter">
            <input type="text" class="panel-individu-filter" data-col="${c.key}" placeholder="Filtrer...">
          </div>
        </th>
      `;
    })
    .join('');

  tr.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', (e) => {
      if (e.target.classList.contains('panel-individu-filter')) return;
      const col = th.dataset.col;
      if (colonneTrieeIndividus === col) {
        sensTrieeIndividus = sensTrieeIndividus === 'asc' ? 'desc' : 'asc';
      } else {
        colonneTrieeIndividus = col;
        sensTrieeIndividus = 'asc';
      }
      trierIndividus();
      mettreAJourColonnesIndividus();
      rendrePageIndividus();
    });
  });

  thead.innerHTML = '';
  thead.appendChild(tr);
}

function rendrePageIndividus() {
  const tbody = document.getElementById('panelIndividusBody');
  if (!tbody) return;

  const total = donneesIndividusFiltrees.length;
  const size = lignesParPageIndividus === 'all' ? total : parseInt(lignesParPageIndividus, 10);
  const debut = lignesParPageIndividus === 'all' ? 0 : (pageCouranteIndividus - 1) * size;
  const fin = lignesParPageIndividus === 'all' ? total : Math.min(debut + size, total);
  const page = donneesIndividusFiltrees.slice(debut, fin);

  tbody.innerHTML = page.map(ani => `
    <tr class="panel-table-row panel-individu-row" data-ani-id="${ani.ani_id}">
      ${colonnesIndividus
      .filter(c => colonnesIndividusActives.includes(c.key))
      .map(c => `<td>${formaterValeurIndividu(c.key, ani[c.key])}</td>`)
      .join('')}
    </tr>
  `).join('');

  tbody.querySelectorAll('.panel-individu-row').forEach(tr => {
    const aniId = tr.dataset.aniId;

    // Survol — désactivé (incompatible WebGLPointsLayer)
    // tr.addEventListener('mouseenter', () => { ... window._highlightPoint(aniId, true) });
    // tr.addEventListener('mouseleave', () => { ... window._highlightPoint(aniId, false) });

    tr.addEventListener('click', () => {
      document.querySelectorAll('.panel-table-row.selected-carte').forEach(r => r.classList.remove('selected-carte'));
      tr.classList.add('selected-carte');
      aniIdSelectionne = String(aniId);
      if (window._afficherPositionsIndividu) window._afficherPositionsIndividu(aniId);
    });
  });

  if (aniIdSelectionne) {
    document.querySelectorAll(`.panel-individu-row[data-ani-id='${aniIdSelectionne}']`).forEach(tr => {
      tr.classList.add('selected-carte');
    });
  }

  rendrePaginationIndividus(total);
}

function formaterValeurIndividu(key, valeur) {
  if (valeur === null || valeur === undefined) return '-';
  switch (key) {
    case 'ani_sexe':
      return valeur === 'M' ? 'Mâle' : valeur === 'F' ? 'Femelle' : valeur;
    case 'ani_date_relache':
    case 'ani_date_mort':
      return valeur ? valeur.slice(0, 10) : '-';
    case 'premiere_position':
    case 'derniere_position':
      return valeur ? valeur.replace('T', ' ').slice(0, 16) : '-';
    default:
      return valeur;
  }
}

function rendrePaginationIndividus(total) {
  const paginationControls = document.getElementById('panelIndividusPaginationControls');
  if (!paginationControls) return;

  const size = lignesParPageIndividus === 'all' ? total : parseInt(lignesParPageIndividus, 10);
  const nbPages = size > 0 ? Math.ceil(total / size) : 1;
  const pageInfo = document.getElementById('panelIndividusPageInfo');
  if (pageInfo) pageInfo.textContent = `Page ${pageCouranteIndividus} sur ${nbPages || 0}`;

  const totalEl = document.querySelector('.panel-individus-total');
  if (totalEl) totalEl.innerHTML = `<strong>${total}</strong> individus`;

  paginationControls.querySelectorAll('.panel-page-btn, .panel-page-dots').forEach(b => b.remove());
  if (nbPages <= 1) return;

  const fragment = document.createDocumentFragment();

  const btnPrev = document.createElement('button');
  btnPrev.className = 'panel-page-btn';
  btnPrev.textContent = '‹';
  btnPrev.disabled = pageCouranteIndividus === 1;
  btnPrev.addEventListener('click', () => {
    if (pageCouranteIndividus > 1) { pageCouranteIndividus--; rendrePageIndividus(); }
  });
  fragment.appendChild(btnPrev);

  const pages = [];
  for (let i = pageCouranteIndividus; i <= Math.min(pageCouranteIndividus + 1, nbPages); i++) {
    pages.push(i);
  }
  if (pageCouranteIndividus + 1 < nbPages) {
    pages.push('...');
  }

  pages.forEach(p => {
    if (p === '...') {
      const dots = document.createElement('span');
      dots.className = 'panel-page-dots';
      dots.textContent = '...';
      fragment.appendChild(dots);
    } else {
      const btn = document.createElement('button');
      btn.className = `panel-page-btn${p === pageCouranteIndividus ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => { pageCouranteIndividus = p; rendrePageIndividus(); });
      fragment.appendChild(btn);
    }
  });

  const btnNext = document.createElement('button');
  btnNext.className = 'panel-page-btn';
  btnNext.textContent = '›';
  btnNext.disabled = pageCouranteIndividus === nbPages;
  btnNext.addEventListener('click', () => {
    if (pageCouranteIndividus < nbPages) { pageCouranteIndividus++; rendrePageIndividus(); }
  });
  fragment.appendChild(btnNext);
  paginationControls.appendChild(fragment);
}

export function setAniIdSelectionne(id) {
  aniIdSelectionne = id ? String(id) : null;
}

export function scrollToAniId(aniId, locDatetime = null) {
  let index = locDatetime
    ? donneesFiltrees.findIndex(l =>
        String(l.ani_id) === String(aniId) &&
        (l.loc_datetime_local || l.loc_date_local) === locDatetime)
    : -1;
  if (index === -1) {
    index = donneesFiltrees.findIndex(l => String(l.ani_id) === String(aniId));
  }
  if (index === -1) return;

  const size = lignesParPage === 'all' ? donneesFiltrees.length : parseInt(lignesParPage, 10);
  const pageCible = Math.floor(index / size) + 1;

  if (pageCible !== pageCourante) {
    pageCourante = pageCible;
    rendrePage();
  }

  setTimeout(() => {
    let tr = locDatetime
      ? [...document.querySelectorAll('.panel-table-row')]
          .find(t => t.dataset.aniId === String(aniId) && t.dataset.locDatetime === locDatetime)
      : null;
    if (!tr) {
      tr = document.querySelector(`.panel-table-row[data-ani-id='${aniId}']`);
    }
    const wrapper = tr?.closest('.panel-table-wrapper');
    if (tr && wrapper) {
      document.querySelectorAll('.panel-table-row.selected-carte').forEach(r => r.classList.remove('selected-carte'));
      tr.classList.add('selected-carte');
      const trRect = tr.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const offset = trRect.top - wrapperRect.top - (wrapperRect.height / 2) + (trRect.height / 2);
      wrapper.scrollTop += offset;
    }
  }, 50);
}

export function scrollToAniIdIndividus(aniId) {
  const index = donneesIndividusFiltrees.findIndex(a => String(a.ani_id) === String(aniId));
  if (index === -1) return;

  const size = lignesParPageIndividus === 'all' ? donneesIndividusFiltrees.length : parseInt(lignesParPageIndividus, 10);
  const pageCible = Math.floor(index / size) + 1;

  if (pageCible !== pageCouranteIndividus) {
    pageCouranteIndividus = pageCible;
    rendrePageIndividus();
  }

  setTimeout(() => {
    const tr = document.querySelector(`.panel-individu-row[data-ani-id='${aniId}']`);
    const wrapper = tr?.closest('.panel-table-wrapper');
    if (tr && wrapper) {
      const trRect = tr.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const offset = trRect.top - wrapperRect.top - (wrapperRect.height / 2) + (trRect.height / 2);
      wrapper.scrollTop += offset;
    }
  }, 50);
}

export function setLabelDatetime(label) {
  const col = colonnesDisponibles.find(c => c.key === 'loc_datetime_local');
  if (col) {
    col.label = label;
    mettreAJourColonnes();
  }
}

export function ouvrirPanneauSiNecessaire() {
  if (panneauFermeManuel) return;
  const sidebarRight = document.getElementById('sidebarRight');
  const icon = document.querySelector('.sidebar-right-toggle .toggle-icon');
  if (sidebarRight && !sidebarRight.classList.contains('visible')) {
    sidebarRight.classList.add('visible');
    if (icon) icon.textContent = '›';
    document.getElementById('tabDonnees')?.classList.add('active');
    document.getElementById('tabIndividus')?.classList.remove('active');
    document.getElementById('panelContentDonnees').style.display = 'flex';
    document.getElementById('panelContentIndividus').style.display = 'none';
  }
}

export function setPanneauFermeManuel(valeur) {
  panneauFermeManuel = valeur;
}
