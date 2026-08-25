
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
const LIGNES_PAR_PAGE = 25;

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
let colonneTrieeIndividus = null;
let sensTrieeIndividus = 'asc';

export function initPanneau() {
  const sidebarRightBody = document.getElementById('sidebarRightBody');
  if (!sidebarRightBody) return;

  document.getElementById('panelColonnesItems').innerHTML = colonnesDisponibles.map(c => `
    <label class="panel-colonnes-item">
      <input type="checkbox" value="${c.key}" ${c.defaut ? 'checked' : ''}>
      ${c.label}
    </label>
  `).join('');

  document.getElementById('panelIndividusItems').innerHTML = colonnesIndividus.map(c => `
    <label class="panel-colonnes-item">
      <input type="checkbox" value="${c.key}" ${c.defaut ? 'checked' : ''}>
      ${c.label}
    </label>
  `).join('');

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

  initialiserPagination(
    'panelPaginationControls',
    page => { pageCourante = page; },
    rendrePage,
    'panelTableWrapper'
  );

  initialiserPagination(
    'panelIndividusPaginationControls',
    page => { pageCouranteIndividus = page; },
    rendrePageIndividus,
    'panelIndividusTableWrapper'
  );

  // Filtres par colonne — écoute sur les inputs de la ligne filtres
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('panel-col-filter')) return;
    appliquerFiltresColonnes();
  });
}

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

export function getColonnesActives() {
  return colonnesActives;
}

export function getColonnesDisponibles() {
  return colonnesDisponibles;
}

export function mettreAJourPanneau(locations) {
  donneesTableau = locations || [];
  donneesFiltrees = [...donneesTableau];
  trierDonnees();
  pageCourante = 1;
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
  const debut = (pageCourante - 1) * LIGNES_PAR_PAGE;
  const fin = Math.min(debut + LIGNES_PAR_PAGE, total);
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


    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      document.querySelectorAll('.panel-table-row.selected-carte').forEach(r => r.classList.remove('selected-carte'));
      tr.classList.add('selected-carte');
      aniIdSelectionne = String(loc.ani_id);

      if (loc?.geom?.coordinates) {
        const wgs84 = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
        const coord = ol.proj.fromLonLat(wgs84);
        window._getMap?.().getView().animate({
          center: coord,
          duration: 400
        });
      }

      // Surbrillance jaune du point correspondant sur la carte — date de localisation
      // incluse pour cibler la position exacte cliquee, pas juste l'animal
      window._highlightPoint?.(loc.ani_id, loc.loc_datetime_local || loc.loc_date_local || null);

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
  const tableWrapper = document.getElementById('panelTableWrapper');
  if (tableWrapper) {
    tableWrapper.scrollTop = 0;
  }
}

function formaterDateLocalisation(valeur) {
  if (!valeur) return '-';
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
      return valeur === true ? '<span style="color:#e74c3c;font-weight:700">Oui</span>' : '-';
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

function obtenirElementsPagination(totalPages, pageActive) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (pageActive <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (pageActive >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages
    ];
  }

  return [
    1,
    'ellipsis',
    pageActive - 1,
    pageActive,
    pageActive + 1,
    'ellipsis',
    totalPages
  ];
}

function creerBoutonPagination(libelle, pageCible, { actif = false, disabled = false } = {}) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = `panel-page-btn${actif ? ' active' : ''}`;
  bouton.textContent = libelle;
  bouton.dataset.page = pageCible;
  bouton.disabled = disabled;

  if (actif) {
    bouton.setAttribute('aria-current', 'page');
  }

  return bouton;
}

function mettreAJourPaginationTableau({ paginationId, infoId, totalLignes, pageActive }) {
  const totalPages = Math.max(1, Math.ceil(totalLignes / LIGNES_PAR_PAGE));
  const premiereLigne = totalLignes === 0
    ? 0
    : (pageActive - 1) * LIGNES_PAR_PAGE + 1;
  const derniereLigne = Math.min(pageActive * LIGNES_PAR_PAGE, totalLignes);

  const info = document.getElementById(infoId);
  if (info) {
    info.textContent = `ligne(s) ${premiereLigne} à ${derniereLigne} sur ${totalLignes}`;
  }

  const pagination = document.getElementById(paginationId);
  if (!pagination) return;

  pagination.innerHTML = '';
  pagination.appendChild(
    creerBoutonPagination('Premier', 1, { disabled: pageActive === 1 })
  );
  pagination.appendChild(
    creerBoutonPagination('<', pageActive - 1, { disabled: pageActive === 1 })
  );

  obtenirElementsPagination(totalPages, pageActive).forEach(element => {
    if (element === 'ellipsis') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'panel-page-ellipsis';
      ellipsis.textContent = '…';
      ellipsis.setAttribute('aria-hidden', 'true');
      pagination.appendChild(ellipsis);
      return;
    }

    pagination.appendChild(
      creerBoutonPagination(String(element), element, {
        actif: element === pageActive
      })
    );
  });

  pagination.appendChild(
    creerBoutonPagination('>', pageActive + 1, {
      disabled: pageActive === totalPages
    })
  );
  pagination.appendChild(
    creerBoutonPagination('Dernier', totalPages, {
      disabled: pageActive === totalPages
    })
  );
}

function initialiserPagination(paginationId, definirPage, rendre, wrapperId) {
  document.getElementById(paginationId)?.addEventListener('click', (e) => {
    const bouton = e.target.closest('.panel-page-btn[data-page]');
    if (!bouton || bouton.disabled || bouton.classList.contains('active')) return;

    const pageDemandee = Number(bouton.dataset.page);
    if (!Number.isInteger(pageDemandee) || pageDemandee < 1) return;

    definirPage(pageDemandee);
    rendre();

    const wrapper = document.getElementById(wrapperId);
    if (wrapper) wrapper.scrollTop = 0;
  });
}

function rendrePagination(total) {
  mettreAJourPaginationTableau({
    paginationId: 'panelPaginationControls',
    infoId: 'panelTableInfo',
    totalLignes: total,
    pageActive: pageCourante
  });
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
  rendrePage();

  // Synchroniser les points carte avec les lignes visibles dans le tableau
  if (Object.keys(filtres).length === 0) {
    window._filtrerPointsCarte?.(null);
  } else {
    filtrerCarteDepuisTableau(donneesFiltrees);
  }
}

export async function exporterCSV(token, filters = {}, options = {}) {
  const locationsPreFiltrees = options.locationsPreFiltrees || null;

  const aniIds = filters.ani_id || [];
  const hasAniIds = Array.isArray(aniIds) && aniIds.length > 0;
  const isFollowedOnly = !!(filters.ani_is_followed || filters.suivisSeulement);

  if (!locationsPreFiltrees && !hasAniIds && !isFollowedOnly) {
    return;
  }

  const projection = options.projection === 'lambert93' || options.projection === 'etrs89'
    ? options.projection
    : 'wgs84';
  const colonnesExport = Array.isArray(options.colonnes) && options.colonnes.length > 0
    ? options.colonnes
    : colonnesDisponibles.map(c => c.key);

  const progressEl = document.getElementById('exportProgress');
  const progressText = document.getElementById('exportProgressText');
  const arc = document.getElementById('exportArc');

  // Lire le total depuis le compteur de positions déjà affiché dans la table attributaire
  const totalExpected = locationsPreFiltrees
    ? locationsPreFiltrees.length
    : parseInt(document.getElementById('positionsCount')?.textContent?.replace(/\s/g, '') || '0') || 0;

  if (arc) arc.setAttribute('stroke-dashoffset', '69.1');
  if (progressText) {
    progressText.innerHTML = totalExpected > 0
      ? `<span>0</span> sur ${totalExpected.toLocaleString('fr-FR')} positions`
      : '<span>0</span> positions';
  }
  if (progressEl) progressEl.style.display = 'flex';

  let totalRecu = 0;

  try {
    let locs;
    if (locationsPreFiltrees) {
      // Deja en memoire (features de la carte filtrees par emprise) — aucun appel reseau
      locs = locationsPreFiltrees;
      totalRecu = locs.length;
      if (arc) arc.setAttribute('stroke-dashoffset', '0');
      if (progressText) {
        const total = totalRecu.toLocaleString('fr-FR');
        progressText.innerHTML = `<span>${total}</span> sur ${total} positions`;
      }
    } else {
      const { fetchLocalisationsRPC } = await import('./api.js');

      const rpcFilters = {
        date_from: filters.date_from || null,
        date_to: filters.date_to || null,
        saisonFrom: filters.saisonFrom || null,
        saisonTo: filters.saisonTo || null,
        annees: filters.annees && filters.annees.length > 0 ? filters.annees : null,
        sexe: filters.sexe || null,
        gestionnaire: filters.gestionnaire || null,
        population: filters.population || null,
        programmation: filters.programmation || null
      };

      if (hasAniIds) {
        rpcFilters.ani_id = aniIds.map(Number);
      } else if (isFollowedOnly) {
        rpcFilters.ani_is_followed = true;
      }

      if (filters.limit_par_animal) {
        rpcFilters.limit_par_animal = filters.limit_par_animal;
      }

      locs = await fetchLocalisationsRPC(token, rpcFilters, (batch) => {
        totalRecu += batch.length;
        const pct = totalExpected > 0 ? (totalRecu / totalExpected) : 0;
        if (arc) arc.setAttribute('stroke-dashoffset', String(69.1 * (1 - Math.min(pct, 1))));
        if (progressText) {
          const recu = totalRecu.toLocaleString('fr-FR');
          const total = totalExpected > 0 ? ` sur ${totalExpected.toLocaleString('fr-FR')}` : '';
          progressText.innerHTML = `<span>${recu}</span>${total} positions`;
        }
      });
    }

    if (locs.length === 0) {
      return;
    }

    const colonnesCoord = projection === 'lambert93'
      ? ['loc_x_lambert93', 'loc_y_lambert93']
      : projection === 'etrs89'
        ? ['loc_x_etrs89', 'loc_y_etrs89']
        : ['loc_longitude', 'loc_latitude'];
    const header = [...colonnesExport, ...colonnesCoord].join(';');
    const lignes = locs.map(loc => {
      const cellules = colonnesExport.map(col => {
        const val = loc[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Echapper les valeurs contenant des points-virgules ou guillemets
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });

      let coord1 = '';
      let coord2 = '';
      if (loc?.geom?.coordinates) {
        if (projection === 'lambert93') {
          const [x, y] = loc.geom.coordinates;
          coord1 = x.toFixed(2);
          coord2 = y.toFixed(2);
        } else if (projection === 'etrs89') {
          const [x, y] = proj4('EPSG:2154', 'EPSG:3035', loc.geom.coordinates);
          coord1 = x.toFixed(2);
          coord2 = y.toFixed(2);
        } else {
          const [lon, lat] = proj4('EPSG:2154', 'EPSG:4326', loc.geom.coordinates);
          coord1 = lon.toFixed(6);
          coord2 = lat.toFixed(6);
        }
      }

      return [...cellules, coord1, coord2].join(';');
    });

    const csvContent = '\ufeff' + [header, ...lignes].join('\n'); // BOM UTF-8 pour Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const date = new Date().toISOString().slice(0, 10);
    // Nom fourni par la modal, assaini des caracteres interdits dans un nom de fichier —
    // repli sur le nom par defaut si vide/absent.
    const nomBrut = (options.nomFichier || '').trim();
    const nomSanitise = nomBrut.replace(/[\\/:*?"<>|]/g, '').trim();
    const nomFinal = nomSanitise ? `${nomSanitise}.csv` : `bouquetins_localisations_${date}.csv`;

    if (options.fileHandle) {
      const writable = await options.fileHandle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomFinal;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('Erreur export CSV:', err);
  } finally {
    if (arc) arc.setAttribute('stroke-dashoffset', '0');
    setTimeout(() => {
      if (progressEl) progressEl.style.display = 'none';
      if (arc) arc.setAttribute('stroke-dashoffset', '69.1');
    }, 800);
  }
}

export function filtrerCarteDepuisTableau(locs) {
  const visiblesSet = new Set(
    locs.map(l => `${l.ani_id}__${l.loc_datetime_local || l.loc_date_local}`)
  );
  window._filtrerPointsCarte?.(visiblesSet);
}

export function mettreAJourIndividus(animals) {
  donneesIndividus = animals || [];
  donneesIndividusFiltrees = [...donneesIndividus];
  trierIndividus();
  pageCouranteIndividus = 1;
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
  const debut = (pageCouranteIndividus - 1) * LIGNES_PAR_PAGE;
  const fin = Math.min(debut + LIGNES_PAR_PAGE, total);
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
  mettreAJourPaginationTableau({
    paginationId: 'panelIndividusPaginationControls',
    infoId: 'panelIndividusTableInfo',
    totalLignes: total,
    pageActive: pageCouranteIndividus
  });
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

  const pageCible = Math.floor(index / LIGNES_PAR_PAGE) + 1;

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

  const pageCible = Math.floor(index / LIGNES_PAR_PAGE) + 1;

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
