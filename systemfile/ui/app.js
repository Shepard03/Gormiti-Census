let currentView = "home"; 
let currentSerie = null;
let currentGridItems = []; 
let currentDetailIndex = -1;
let currentDetailData = null;
let isCardFlipped = false;

let currentFullscreenVideos = [];

let filters = { show_extras: true, show_cards: false, show_missing: false, show_duplicates: false };
let currentProvenienzaFilter = "";

let activeGoal = "Nessuno";
let isCreatingGoal = false;
let editingGoalName = "";
let newGoalData = {};

let savedScrollPosition = 0;

// Variabili di memoria per il mirino della tastiera
let savedHomeFocusIndex = -1;
let savedSerieFocusIndex = -1;

async function api(method, ...args) {
  return await window.pywebview.api[method](...args);
}

function initials(name) {
  return (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ---------- LINK ESTERNI E INFO ----------
async function openExternal(url) {
    await api('open_external_link', url);
}

document.getElementById('btn-info').onclick = () => {
    document.getElementById('info-scrim').classList.add('open');
    document.getElementById('info-modal').classList.add('open');
};
document.getElementById('info-close').onclick = () => {
    document.getElementById('info-scrim').classList.remove('open');
    document.getElementById('info-modal').classList.remove('open');
};
document.getElementById('info-scrim').onclick = () => {
    document.getElementById('info-scrim').classList.remove('open');
    document.getElementById('info-modal').classList.remove('open');
};
document.getElementById('telegram-link').onclick = (e) => {
    e.preventDefault();
    api('open_external_link', 'https://t.me/+A60z7y4DVlFkMTc0');
};

// ---------- FULLSCREEN VIDEO E CARTE ----------
function openFullscreenVideo() {
    if(currentFullscreenVideos.length === 0) return;
    const fsOverlay = document.getElementById('fullscreen-overlay');
    const fsVideo = document.getElementById('fs-video');
    const fsPlaylist = document.getElementById('fs-playlist');
    
    fsOverlay.style.display = 'flex';
    fsVideo.src = '/' + currentFullscreenVideos[0];
    
    fsPlaylist.innerHTML = '';
    currentFullscreenVideos.forEach((vid, index) => {
        const btn = document.createElement('button');
        btn.innerText = index + 1;
        if(index === 0) btn.classList.add('active');
        btn.onclick = () => {
            fsVideo.src = '/' + vid;
            Array.from(fsPlaylist.children).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        fsPlaylist.appendChild(btn);
    });

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (fsOverlay.requestFullscreen) {
            fsOverlay.requestFullscreen().catch(err => console.warn(err));
        } else if (fsOverlay.webkitRequestFullscreen) {
            fsOverlay.webkitRequestFullscreen();
        }
    }
}

function closeFullscreenVideo() {
    document.getElementById('fullscreen-overlay').style.display = 'none';
    const fsVideo = document.getElementById('fs-video');
    fsVideo.pause();
    fsVideo.removeAttribute('src');
    fsVideo.load();

    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => console.warn(err));
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.getElementById('fullscreen-overlay').style.display === 'flex') {
        closeFullscreenVideo();
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement && document.getElementById('fullscreen-overlay').style.display === 'flex') {
        closeFullscreenVideo();
    }
});

function openFullscreenCard() {
    document.getElementById('image-fullscreen-overlay').style.display = 'flex';
    updateCardView(); 
}

function closeFullscreenCard() {
    document.getElementById('image-fullscreen-overlay').style.display = 'none';
}


// ---------- LOGICA CONTROLLO INDICATORI ----------
function refreshSaveIndicator(filename) {
  const dot = document.getElementById('save-dot');
  const label = document.getElementById('save-current-label');
  const modalLabel = document.getElementById('active-file-name');
  
  const isDefault = !filename || 
                    filename === 'gormiti_census.csv' || 
                    filename.includes('gormiti_auto_backup') || 
                    filename.includes('collezione_automatica');

  if (!isDefault) {
    dot.classList.add('active');
    label.textContent = filename.replace('.gormiti', '').replace('.csv', '');
    if (modalLabel) {
        modalLabel.textContent = filename;
        modalLabel.style.color = "var(--moss)";
    }
  } else {
    dot.classList.remove('active');
    label.textContent = 'Nessun salvataggio';
    if (modalLabel) {
        modalLabel.textContent = 'Nessun salvataggio personale';
        modalLabel.style.color = "var(--amber-bright)";
    }
  }
}

function refreshGoalIndicator() {
  const dot = document.getElementById('goal-dot');
  const label = document.getElementById('goal-current-label');
  if (activeGoal && activeGoal !== 'Nessuno') {
    dot.classList.add('active');
    label.textContent = activeGoal;
  } else {
    dot.classList.remove('active');
    label.textContent = 'Nessuna selezione';
  }
}

// BINDING POPUP SALVATAGGI
document.getElementById('btn-saves').onclick = async () => {
  await loadMenuSaves(); 
  document.getElementById('saves-scrim').classList.add('open');
  document.getElementById('saves-modal').classList.add('open');
};
document.getElementById('saves-close').onclick = () => {
  document.getElementById('saves-scrim').classList.remove('open');
  document.getElementById('saves-modal').classList.remove('open');
};
document.getElementById('saves-scrim').onclick = () => {
  document.getElementById('saves-scrim').classList.remove('open');
  document.getElementById('saves-modal').classList.remove('open');
};

// BINDING POPUP SELEZIONI
document.getElementById('btn-goals').onclick = async () => {
  await loadMenuGoals(); 
  document.getElementById('goals-scrim').classList.add('open');
  document.getElementById('goals-modal').classList.add('open');
};
document.getElementById('goals-close').onclick = () => {
  document.getElementById('goals-scrim').classList.remove('open');
  document.getElementById('goals-modal').classList.remove('open');
};
document.getElementById('goals-scrim').onclick = () => {
  document.getElementById('goals-scrim').classList.remove('open');
  document.getElementById('goals-modal').classList.remove('open');
};


// ---------- GESTIONE LISTA SALVATAGGI ----------
async function loadMenuSaves() {
    const saves = await api('get_saves_list');
    const container = document.getElementById('saves-container');
    container.innerHTML = '';

    saves.forEach(s => {
        const row = document.createElement('div');
        row.className = s.active ? "menu-btn goal-row active-goal" : "menu-btn goal-row";
        
        const titleSpan = document.createElement('span');
        titleSpan.innerText = s.filename;
        titleSpan.onclick = async () => {
            const res = await api('load_save_file', s.filename);
            if (res.success) {
                refreshSaveIndicator(res.filename);
                loadMenuSaves();
                refreshCurrentView();
            }
        };
        row.appendChild(titleSpan);

        const actions = document.createElement('div');
        actions.className = "goal-actions";

        const btnEsp = document.createElement('button');
        btnEsp.className = "goal-act-btn btn-esp"; btnEsp.innerText = "ESP";
        btnEsp.onclick = async (e) => { 
            e.stopPropagation(); 
            const res = await api('export_save_file', s.filename);
            if(res.success) alert("Salvataggio esportato con successo!");
        };
        actions.appendChild(btnEsp);

        const btnDel = document.createElement('button');
        btnDel.className = "goal-act-btn btn-del"; btnDel.innerText = "DEL";
        btnDel.onclick = async (e) => { 
            e.stopPropagation(); 
            if(confirm(`Eliminare definitivamente il salvataggio '${s.filename}'?`)){
                const res = await api('delete_save_file', s.filename);
                if(res.success) {
                    if (s.active) {
                        refreshSaveIndicator("gormiti_census.csv");
                        refreshCurrentView();
                    }
                    loadMenuSaves();
                }
            }
        };
        actions.appendChild(btnDel);

        row.appendChild(actions);
        container.appendChild(row);
    });
}

document.getElementById('btn-save-create').onclick = async () => {
    const inputEl = document.getElementById('new-save-name');
    let name = inputEl.value.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    if (!name) { alert("Inserisci un nome valido."); return; }
    
    const res = await api('create_new_save', name);
    if (res.success) {
        inputEl.value = "";
        refreshSaveIndicator(res.filename);
        loadMenuSaves();
        refreshCurrentView();
    } else {
        alert(res.error || "Errore nella creazione del salvataggio.");
    }
};

async function importSave() {
    const res = await api('import_save_file');
    if (res.success) {
        alert("Salvataggio importato con successo!");
        loadMenuSaves(); 
    } else if (!res.cancelled) {
        alert("Errore durante l'importazione: " + res.error);
    }
}

document.getElementById('menu-save').onclick = async () => {
    const res = await api('trigger_save');
    if (res.success) {
        document.getElementById('saves-scrim').classList.remove('open');
        document.getElementById('saves-modal').classList.remove('open');
        alert("Collezione salvata con successo!");
    }
};

document.getElementById('menu-reset').onclick = async () => {
    if(confirm("Sei sicuro di voler azzerare le quantità di tutta la collezione attiva? L'azione non è annullabile.")){
        const res = await api('trigger_reset');
        if (res.success) {
            document.getElementById('saves-scrim').classList.remove('open');
            document.getElementById('saves-modal').classList.remove('open');
            refreshCurrentView();
        }
    }
};


// ---------- GESTIONE SELEZIONI ----------
async function loadMenuGoals() {
    const goals = await api('get_menu_goals');
    const container = document.getElementById('goals-container');
    container.innerHTML = '';

    const btnNessuno = document.getElementById('goal-btn-nessuno');
    btnNessuno.className = activeGoal === "Nessuno" ? "menu-btn goal-row active-goal" : "menu-btn goal-row";

    goals.forEach(g => {
        const row = document.createElement('div');
        row.className = g.active ? "menu-btn goal-row active-goal" : "menu-btn goal-row";
        
        const titleSpan = document.createElement('span');
        titleSpan.innerText = g.name;
        titleSpan.onclick = () => setActiveGoal(g.name);
        row.appendChild(titleSpan);

        const actions = document.createElement('div');
        actions.className = "goal-actions";
        
        if (!g.is_factory) {
            const btnMod = document.createElement('button');
            btnMod.className = "goal-act-btn btn-mod"; btnMod.innerText = "MOD";
            btnMod.onclick = (e) => { e.stopPropagation(); startGoalEditor(g.name); };
            actions.appendChild(btnMod);
        }

        const btnEsp = document.createElement('button');
        btnEsp.className = "goal-act-btn btn-esp"; btnEsp.innerText = "ESP";
        btnEsp.onclick = async (e) => { 
            e.stopPropagation(); 
            const res = await api('export_goal', g.name);
            if(res.success) alert("Selezione esportata con successo!");
        };
        actions.appendChild(btnEsp);

        if (!g.is_factory) {
            const btnDel = document.createElement('button');
            btnDel.className = "goal-act-btn btn-del"; btnDel.innerText = "DEL";
            btnDel.onclick = async (e) => { 
                e.stopPropagation(); 
                if(confirm(`Eliminare la selezione '${g.name}'?`)){
                    const res = await api('delete_goal', g.name);
                    if(res.success) {
                        if(activeGoal === g.name) activeGoal = "Nessuno";
                        loadMenuGoals(); refreshCurrentView();
                    }
                }
            };
            actions.appendChild(btnDel);
        }

        row.appendChild(actions);
        container.appendChild(row);
    });
}

async function setActiveGoal(name) {
    await api('set_active_goal', name);
    activeGoal = name;
    document.getElementById('goals-scrim').classList.remove('open');
    document.getElementById('goals-modal').classList.remove('open');
    refreshGoalIndicator();
    refreshCurrentView();
}

async function importGoal() {
    const res = await api('import_goal');
    if (res.success) {
        alert("Selezione importata con successo!");
        loadMenuGoals();
    }
}

document.getElementById('btn-goal-create').onclick = () => {
    const inputEl = document.getElementById('new-goal-name');
    let name = inputEl.value.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
    if (!name) { alert("Inserisci un nome valido."); return; }
    if (["Solo Signori della Natura", "Fanbuk", "Oggetti Titanium"].includes(name)) {
        alert("Nome riservato."); return;
    }
    inputEl.value = ""; 
    startGoalEditor(null, name);
};

async function startGoalEditor(existingName = null, newName = null) {
    if (existingName) {
        editingGoalName = existingName;
        newGoalData = await api('load_goal_for_edit', existingName);
    } else if (newName) {
        editingGoalName = newName;
        newGoalData = {};
    } else {
        return;
    }

    isCreatingGoal = true;
    activeGoal = "Nessuno"; await api('set_active_goal', "Nessuno");
    
    document.getElementById('goals-scrim').classList.remove('open');
    document.getElementById('goals-modal').classList.remove('open');
    refreshGoalIndicator();
    
    filters.show_extras = true; filters.show_missing = false; filters.show_duplicates = false;
    syncFilterChipsUI(); await api('save_ui_filters', filters);
    
    document.getElementById('goal-toolbar').classList.remove('hidden');
    document.getElementById('goal-toolbar-title').innerText = `SELEZIONE: ${editingGoalName.toUpperCase()} | Elementi: ${Object.keys(newGoalData).length}`;
    
    refreshCurrentView();
    alert("Seleziona cosa includere cliccando sulle card.\nUsa il tasto 'Personaggi' o 'Carte' in alto a sinistra per cambiare tipo di selezione.");
}

async function saveGoalEditor() {
    if (Object.keys(newGoalData).length === 0) { alert("Nessun elemento selezionato!"); return; }
    const res = await api('save_custom_goal', editingGoalName, newGoalData);
    if (res.success) {
        alert(`Selezione '${editingGoalName}' salvata!`);
        cancelGoalEditor();
        setActiveGoal(editingGoalName);
    } else { alert("Errore nel salvataggio."); }
}

function cancelGoalEditor() {
    isCreatingGoal = false;
    newGoalData = {};
    editingGoalName = "";
    document.getElementById('goal-toolbar').classList.add('hidden');
    refreshGoalIndicator();
    refreshCurrentView();
}

function toggleGoalSelection(id) {
    const strId = String(id);
    const targetType = filters.show_cards ? "card" : "char";
    if (!newGoalData[strId]) newGoalData[strId] = [];
    
    const idx = newGoalData[strId].indexOf(targetType);
    if (idx > -1) {
        newGoalData[strId].splice(idx, 1);
        if (newGoalData[strId].length === 0) delete newGoalData[strId];
    } else { newGoalData[strId].push(targetType); }
    
    document.getElementById('goal-toolbar-title').innerText = `SELEZIONE: ${editingGoalName.toUpperCase()} | Elementi: ${Object.keys(newGoalData).length}`;
    const cardEl = document.getElementById(`card-${id}`);
    if (cardEl) applyGoalBorderClasses(cardEl, id);
}

function applyGoalBorderClasses(cardEl, id) {
    cardEl.classList.remove('goal-select-char', 'goal-select-card');
    if (isCreatingGoal && newGoalData[String(id)]) {
        const types = newGoalData[String(id)];
        const currentViewType = filters.show_cards ? "card" : "char";
        if (types.includes(currentViewType)) {
            cardEl.classList.add(currentViewType === "card" ? 'goal-select-card' : 'goal-select-char');
        }
    }
}

// --- AZIONI RAPIDE: SELEZIONA/DESELEZIONA TUTTI ---
function selectAllInSerie() {
    const targetType = filters.show_cards ? "card" : "char";
    currentGridItems.forEach(item => {
        const strId = String(item.id);
        if (!newGoalData[strId]) newGoalData[strId] = [];
        if (!newGoalData[strId].includes(targetType)) {
            newGoalData[strId].push(targetType);
            const cardEl = document.getElementById(`card-${item.id}`);
            if (cardEl) applyGoalBorderClasses(cardEl, item.id);
        }
    });
    document.getElementById('goal-toolbar-title').innerText = `SELEZIONE: ${editingGoalName.toUpperCase()} | Elementi: ${Object.keys(newGoalData).length}`;
}

function deselectAllInSerie() {
    const targetType = filters.show_cards ? "card" : "char";
    currentGridItems.forEach(item => {
        const strId = String(item.id);
        if (newGoalData[strId]) {
            const idx = newGoalData[strId].indexOf(targetType);
            if (idx > -1) {
                newGoalData[strId].splice(idx, 1);
                if (newGoalData[strId].length === 0) delete newGoalData[strId];
                const cardEl = document.getElementById(`card-${item.id}`);
                if (cardEl) applyGoalBorderClasses(cardEl, item.id);
            }
        }
    });
    document.getElementById('goal-toolbar-title').innerText = `SELEZIONE: ${editingGoalName.toUpperCase()} | Elementi: ${Object.keys(newGoalData).length}`;
}


// ---------- NAVIGAZIONE RITORNO ----------
async function returnToSerie() {
    keyboardFocusIndex = savedSerieFocusIndex; 
    await loadSerie(currentSerie, false);
    document.querySelector('.content-wrap').scrollTop = savedScrollPosition;
}

// ---------- UI BASE & FILTRI ----------
async function updateFilters() {
    syncFilterChipsUI();
    await api('save_ui_filters', filters);
    refreshCurrentView();
}

function syncFilterChipsUI() {
  document.getElementById('chip-extras').classList.toggle('active', filters.show_extras);
  document.getElementById('chip-missing').classList.toggle('active', filters.show_missing);
  document.getElementById('chip-duplicates').classList.toggle('active', filters.show_duplicates);
  document.getElementById('toggle-char').classList.toggle('active', !filters.show_cards);
  document.getElementById('toggle-card').classList.toggle('active', filters.show_cards);
  
  if(isCreatingGoal) {
      document.querySelectorAll('.card').forEach(card => {
          const id = card.id.replace('card-', '');
          applyGoalBorderClasses(card, id);
      });
  }
}

document.getElementById('chip-extras').onclick = () => { filters.show_extras = !filters.show_extras; updateFilters(); };
document.getElementById('chip-missing').onclick = () => { filters.show_missing = !filters.show_missing; if (filters.show_missing) filters.show_duplicates = false; updateFilters(); };
document.getElementById('chip-duplicates').onclick = () => { filters.show_duplicates = !filters.show_duplicates; if (filters.show_duplicates) filters.show_missing = false; updateFilters(); };
document.getElementById('toggle-char').onclick = () => { filters.show_cards = false; updateFilters(); };
document.getElementById('toggle-card').onclick = () => { filters.show_cards = true; updateFilters(); };

document.getElementById('brand-home').onclick = () => { if(!isCreatingGoal) goHome(); };
document.getElementById('btn-back').onclick = () => {
    if(currentView === "detail") returnToSerie();
    else goHome();
};

function refreshCurrentView() {
  if (currentView === "home") loadHome();
  else if (currentView === "serie") loadSerie(currentSerie, false);
  else if (currentView === "detail") loadSerie(currentSerie, false);
}


// ---------- HOME E SERIE ----------
async function goHome() {
  stopVideo();
  currentView = "home";
  currentSerie = null;
  currentProvenienzaFilter = "";
  document.getElementById('view-home').style.display = 'grid';
  document.getElementById('view-serie').style.display = 'none';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('scope-progress').style.display = 'none';
  document.getElementById('prov-filter-wrap').style.display = 'none';
  document.getElementById('prov-filter-sep').style.display = 'none';
  document.getElementById('crumb').textContent = '';
  document.getElementById('btn-back').style.display = 'none';
  
  keyboardFocusIndex = savedHomeFocusIndex;
  await loadHome();
}

function renderProvenienzaFilter(provenienze) {
  const wrap = document.getElementById('prov-filter-wrap');
  const select = document.getElementById('prov-filter-select');

  if (!provenienze || provenienze.length === 0) {
      wrap.style.display = 'none';
      document.getElementById('prov-filter-sep').style.display = 'none';
      return;
  }

  wrap.style.display = 'flex';
  document.getElementById('prov-filter-sep').style.display = 'block';
  const previousValue = currentProvenienzaFilter;
  select.innerHTML = '<option value="">Tutte le provenienze</option>' +
      provenienze.map(p => `<option value="${p}">${p}</option>`).join('');
  select.value = provenienze.includes(previousValue) ? previousValue : '';
  currentProvenienzaFilter = select.value;
}

document.getElementById('prov-filter-select').onchange = (e) => {
  currentProvenienzaFilter = e.target.value;
  loadSerie(currentSerie, false);
};

async function loadHome() {
  const [series, progress] = await Promise.all([
    api('get_home_series', filters, isCreatingGoal),
    api('get_overall_progress', filters, isCreatingGoal),
  ]);

  const grid = document.getElementById('view-home');
  grid.innerHTML = '';

  if (!series.length) {
    grid.innerHTML = '<div class="empty-state">Nessuna serie corrisponde ai filtri attivi.</div>';
  } else {
    series.forEach((s, idx) => {
      const tile = document.createElement('div');
      tile.className = 'serie-tile';
      if (s.logo) { tile.innerHTML = `<img src="/${s.logo}" alt="${s.nome}">`; } 
      else { tile.innerHTML = `<div class="fallback-label">${s.nome.toUpperCase()}</div>`; }
      tile.onclick = () => {
          savedHomeFocusIndex = idx;
          keyboardFocusIndex = -1;
          loadSerie(s.nome);
      };
      grid.appendChild(tile);
    });
  }
  updateHeaderStats(progress);

  // Applica il focus visivo se l'utente è tornato col Backspace
  if (isUsingKeyboard && keyboardFocusIndex !== -1 && currentView === "home") {
      const items = document.querySelectorAll('.serie-tile');
      if (items[keyboardFocusIndex]) {
          items[keyboardFocusIndex].classList.add('keyboard-focused');
          items[keyboardFocusIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  }
}

async function loadSerie(serieName, resetProvenienza = true) {
  stopVideo();
  currentView = "serie";
  currentSerie = serieName;
  currentGridItems = [];
  if (resetProvenienza) currentProvenienzaFilter = "";
  
  document.getElementById('view-home').style.display = 'none';
  document.getElementById('view-serie').style.display = 'block';
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('crumb').innerHTML = `/ <b style="cursor:pointer;" onclick="goHome()">${serieName}</b>`;
  document.getElementById('btn-back').style.display = 'inline-block';

  const activeFilters = { ...filters, provenienza: currentProvenienzaFilter };

  const [groups, progress, provenienze] = await Promise.all([
    api('get_serie_groups', serieName, activeFilters, isCreatingGoal),
    api('get_serie_progress', serieName, activeFilters, isCreatingGoal),
    api('get_serie_provenienze', serieName),
  ]);

  renderProvenienzaFilter(provenienze);

  const container = document.getElementById('view-serie');
  container.innerHTML = '';

  if (!groups.length) {
    container.innerHTML = '<div class="empty-state">Nessun personaggio trovato per questi filtri.</div>';
  } else {
    
    if (isCreatingGoal) {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'serie-goal-actions';
        actionsBar.innerHTML = `
            <button class="primary-btn" style="padding: 10px 20px; font-size: 11.5px;" onclick="selectAllInSerie()">☑️ SELEZIONA VISIBILI</button>
            <button class="menu-btn danger-btn" style="width: auto; padding: 10px 20px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; border-radius: 4px;" onclick="deselectAllInSerie()">☒ DESELEZIONA VISIBILI</button>
        `;
        container.appendChild(actionsBar);
    }

    groups.forEach(g => {
      if (g.popolo) {
          const heading = document.createElement('div');
          heading.className = 'popolo-heading' + (g.extra ? ' extra-divider' : '');
          
          const titleBox = document.createElement('div');
          titleBox.className = 'popolo-title-box';
          
          const titleText = document.createElement('span');
          titleText.textContent = g.extra ? `FUORI SERIE — ${g.popolo}` : g.popolo;
          titleBox.appendChild(titleText);

          if (!isCreatingGoal) {
              const countField = filters.show_cards ? 'carta_posseduta' : 'personaggio_posseduto';
              const itemIds = g.items.map(i => i.id); 

              const subBtn = document.createElement('button');
              subBtn.className = 'popolo-btn sub';
              subBtn.innerHTML = '-1';
              subBtn.title = "Rimuovi 1 a tutto il popolo";
              subBtn.onclick = async (e) => {
                  e.stopPropagation();
                  const wrap = document.querySelector('.content-wrap');
                  const scrollPos = wrap.scrollTop;
                  await api('update_multiple_counters', itemIds, countField, -1);
                  await loadSerie(currentSerie, false);
                  document.querySelector('.content-wrap').scrollTop = scrollPos;
              };

              const addBtn = document.createElement('button');
              addBtn.className = 'popolo-btn add';
              addBtn.innerHTML = '+1';
              addBtn.title = "Aggiungi 1 a tutto il popolo";
              addBtn.onclick = async (e) => {
                  e.stopPropagation();
                  const wrap = document.querySelector('.content-wrap');
                  const scrollPos = wrap.scrollTop;
                  await api('update_multiple_counters', itemIds, countField, 1);
                  await loadSerie(currentSerie, false);
                  document.querySelector('.content-wrap').scrollTop = scrollPos;
              };

              titleBox.appendChild(subBtn);
              titleBox.appendChild(addBtn);
          }

          heading.appendChild(titleBox);
          container.appendChild(heading);
      }
      
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      g.items.forEach(item => {
          currentGridItems.push(item);
          grid.appendChild(buildCard(item, currentGridItems.length - 1));
      });
      container.appendChild(grid);
    });
  }
  updateScopeProgress(serieName, progress);
  updateHeaderStats(progress);

  // Applica il focus visivo se l'utente è tornato col Backspace
  if (isUsingKeyboard && keyboardFocusIndex !== -1 && currentView === "serie") {
      const items = document.querySelectorAll('.card');
      if (items[keyboardFocusIndex]) {
          items[keyboardFocusIndex].classList.add('keyboard-focused');
      }
  }
}

function buildCard(item, index) {
  const countField = filters.show_cards ? 'carta_posseduta' : 'personaggio_posseduto';
  const count = item[countField] || 0;
  const owned = count > 0;
  const duplicate = count > 1;

  const card = document.createElement('div');
  card.id = `card-${item.id}`;
  card.className = 'card' + (owned ? ' owned' : '') + (duplicate ? ' duplicate' : '');
  
  applyGoalBorderClasses(card, item.id);

  const glyphInner = item._img_url ? `<img src="/${item._img_url}" alt="${item.nome}">` : initials(item.nome);
  card.innerHTML = `<div class="card-glyph">${glyphInner}</div><div class="card-name">${item.nome}</div><div class="card-meta" style="justify-content: flex-end;"><span class="card-count">×${count}</span></div>`;
  
  if (!isCreatingGoal) {
      const quickAddBtn = document.createElement('button');
      quickAddBtn.className = 'quick-add-btn';
      quickAddBtn.innerHTML = '+1';
      quickAddBtn.title = "Aggiungi rapido";
      quickAddBtn.onclick = async (e) => {
          e.stopPropagation();
          const wrap = document.querySelector('.content-wrap');
          const scrollPos = wrap.scrollTop;
          await api('update_counter', item.id, countField, 1);
          await loadSerie(currentSerie, false);
          document.querySelector('.content-wrap').scrollTop = scrollPos;
      };
      card.appendChild(quickAddBtn);

      if (count > 0) {
          const quickSubBtn = document.createElement('button');
          quickSubBtn.className = 'quick-sub-btn';
          quickSubBtn.innerHTML = '-1';
          quickSubBtn.title = "Rimuovi rapido";
          quickSubBtn.onclick = async (e) => {
              e.stopPropagation();
              const wrap = document.querySelector('.content-wrap');
              const scrollPos = wrap.scrollTop;
              await api('update_counter', item.id, countField, -1);
              await loadSerie(currentSerie, false);
              document.querySelector('.content-wrap').scrollTop = scrollPos;
          };
          card.appendChild(quickSubBtn);
      }
  }

  card.onclick = () => { 
      if (isCreatingGoal) toggleGoalSelection(item.id); 
      else {
          keyboardFocusIndex = -1;
          openDetail(item, index); 
      }
  };
  return card;
}


// ---------- SCHEDA PERSONAGGIO E FORMATTAZIONE TESTI ----------
async function openDetail(item, index) {
  if (currentView === "serie") {
      savedScrollPosition = document.querySelector('.content-wrap').scrollTop;
  }

  stopVideo();
  currentView = "detail";
  currentDetailIndex = index;
  savedSerieFocusIndex = index; 
  
  document.getElementById('view-serie').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';
  
  let popoloStr = (item.popolo && item.popolo !== 'nan') ? item.popolo + ' / ' : '';
  document.getElementById('crumb').innerHTML = `/ <b style="cursor:pointer;" onclick="returnToSerie()">${currentSerie}</b> / ${popoloStr}${item.nome}`;
  
  try {
      currentDetailData = await api('get_character_detail', item.id);
      isCardFlipped = false;
      renderDetail();
  } catch (e) { console.error(e); }
}

async function openDetailById(id) {
  stopVideo();
  currentView = "detail";

  document.getElementById('view-serie').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';

  try {
      currentDetailData = await api('get_character_detail', id);
      const data = currentDetailData;
      const idxInGrid = currentGridItems.findIndex(i => i.id === data.id);
      currentDetailIndex = idxInGrid;
      savedSerieFocusIndex = idxInGrid; 

      let popoloStr = (data.popolo && data.popolo !== 'nan') ? data.popolo + ' / ' : '';
      document.getElementById('crumb').innerHTML = `/ <b style="cursor:pointer;" onclick="returnToSerie()">${currentSerie}</b> / ${popoloStr}${data.nome}`;

      isCardFlipped = false;
      renderDetail();
  } catch (e) { console.error(e); }
}

async function jumpToEvolution(id) {
  stopVideo();
  currentView = "detail";
  document.getElementById('view-serie').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';

  try {
      const data = await api('get_character_detail', id);
      currentDetailData = data;

      if (data.serie && data.serie !== currentSerie) {
          currentSerie = data.serie;
          currentProvenienzaFilter = "";
          const activeFilters = { ...filters, provenienza: "" };
          const [groups, provenienze] = await Promise.all([
              api('get_serie_groups', currentSerie, activeFilters, isCreatingGoal),
              api('get_serie_provenienze', currentSerie),
          ]);
          currentGridItems = [];
          groups.forEach(g => g.items.forEach(item => currentGridItems.push(item)));
          renderProvenienzaFilter(provenienze);
      }

      const idxInGrid = currentGridItems.findIndex(i => i.id === data.id);
      currentDetailIndex = idxInGrid;
      savedSerieFocusIndex = idxInGrid; 

      let popoloStr = (data.popolo && data.popolo !== 'nan') ? data.popolo + ' / ' : '';
      document.getElementById('crumb').innerHTML = `/ <b style="cursor:pointer;" onclick="returnToSerie()">${currentSerie}</b> / ${popoloStr}${data.nome}`;

      isCardFlipped = false;
      renderDetail();
  } catch (e) { console.error(e); }
}


function renderDetail() {
  const data = currentDetailData;
  document.getElementById('detail-name').innerText = data.nome.toUpperCase();
  document.getElementById('detail-serie').innerText = data.serie.toUpperCase();

  const btnPrev = document.getElementById('btn-prev-char');
  const btnNext = document.getElementById('btn-next-char');
  if (currentDetailIndex === -1) {
      btnPrev.disabled = true;
      btnNext.disabled = true;
  } else {
      btnPrev.disabled = currentDetailIndex <= 0;
      btnNext.disabled = currentDetailIndex >= currentGridItems.length - 1;
      btnPrev.onclick = () => openDetail(currentGridItems[currentDetailIndex - 1], currentDetailIndex - 1);
      btnNext.onclick = () => openDetail(currentGridItems[currentDetailIndex + 1], currentDetailIndex + 1);
  }

  const evoBtnPrev = document.getElementById('evo-btn-prev');
  const evoBtnNext = document.getElementById('evo-btn-next');

  if (data._evo_prev) {
      evoBtnPrev.classList.remove('evo-hidden');
      document.getElementById('evo-prev-label').textContent = data._evo_prev.serie;
      evoBtnPrev.title = `Vai a ${data._evo_prev.nome} (${data._evo_prev.serie})`;
      evoBtnPrev.onclick = () => jumpToEvolution(data._evo_prev.id);
  } else {
      evoBtnPrev.classList.add('evo-hidden');
  }

  if (data._evo_next) {
      evoBtnNext.classList.remove('evo-hidden');
      document.getElementById('evo-next-label').textContent = data._evo_next.serie;
      evoBtnNext.title = `Vai a ${data._evo_next.nome} (${data._evo_next.serie})`;
      evoBtnNext.onclick = () => jumpToEvolution(data._evo_next.id);
  } else {
      evoBtnNext.classList.add('evo-hidden');
  }


  const imgEl = document.getElementById('char-img');
  const videoEl = document.getElementById('char-video');
  const playlistEl = document.getElementById('video-controls');
  const btnExpandVideo = document.getElementById('btn-fullscreen-video');
  
  const videos = [data._video_rot_url, data._video_gim1_url, data._video_gim2_url, data._video_gim3_url].filter(v => v);
  currentFullscreenVideos = videos;
  
  if (videos.length > 0) {
      imgEl.style.display = 'none';
      videoEl.style.display = 'block';
      playlistEl.style.display = 'flex';
      btnExpandVideo.style.display = 'block';
      videoEl.src = '/' + videos[0];
      
      playlistEl.innerHTML = '';
      videos.forEach((vid, index) => {
          const btn = document.createElement('button');
          if (index === 0) btn.classList.add('active');
          btn.onclick = () => {
              videoEl.src = '/' + vid;
              Array.from(playlistEl.children).forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
          };
          playlistEl.appendChild(btn);
      });
  } else {
      videoEl.style.display = 'none';
      playlistEl.style.display = 'none';
      btnExpandVideo.style.display = 'none';
      if(data._foto_url){ imgEl.src = '/' + data._foto_url; imgEl.style.display = 'block'; } 
      else { imgEl.style.display = 'none'; }
  }

  const charCounter = document.getElementById('char-counter-container');
  if (data.is_automated) { charCounter.innerHTML = `<div class="auto-qty">QUANTITÀ CALCOLATA: ${data.personaggio_posseduto}</div>`; } 
  else { renderCounter(charCounter, data.personaggio_posseduto, data.id, 'personaggio_posseduto'); }

  const objSection = document.getElementById('object-section');
  if (data.nome_ogg && data.nome_ogg !== 'nan' && data.nome_ogg !== '') {
      objSection.style.display = 'block';
      document.getElementById('obj-name').innerText = data.nome_ogg.toUpperCase();
      const objImg = document.getElementById('obj-img');
      if (data._obj_url) { objImg.src = '/' + data._obj_url; objImg.style.display = 'block'; } 
      else { objImg.style.display = 'none'; }
      renderCounter(document.getElementById('obj-counter-container'), data.accessorio_posseduto, data.id, 'accessorio_posseduto');
  } else { objSection.style.display = 'none'; }

  const provRaw = data.provenienza === 'nan' || !data.provenienza ? "Dati non disponibili" : data.provenienza;
  const provEl = document.getElementById('detail-provenienza');
  const provLinks = data._provenienza_links || {};
  if (Object.keys(provLinks).length > 0) {
      provEl.innerHTML = provRaw.split('|').map(part => {
          const name = part.trim();
          const linkId = provLinks[name];
          return linkId ? `<span class="prov-link" onclick="openDetailById(${linkId})">${name}</span>` : name;
      }).join('<br>');
  } else {
      provEl.innerHTML = provRaw.replace(/\|/g, '<br>');
  }

  updateCardView();
  
  const cardCounter = document.getElementById('card-counter-container');
  if (data._fronte_url) { renderCounter(cardCounter, data.carta_posseduta, data.id, 'carta_posseduta'); } 
  else { cardCounter.innerHTML = ''; }
}

function flipCard() { isCardFlipped = !isCardFlipped; updateCardView(); }

function updateCardView() {
  const data = currentDetailData;
  const cardImg = document.getElementById('card-img');
  const cardDesc = document.getElementById('card-desc');
  const btnFsCard = document.getElementById('btn-fullscreen-card');
  
  const fsImg = document.getElementById('fs-image');
  const fsDesc = document.getElementById('fs-desc');
  
  const targetUrl = isCardFlipped ? data._retro_url : data._fronte_url;
  
  btnFsCard.style.display = 'block'; 
  
  const textRaw = data.descrizione && data.descrizione !== 'nan' ? data.descrizione : "Descrizione non disponibile.";
  const formattedText = textRaw.replace(/\|/g, '<br>');
  
  if (targetUrl) { 
      cardImg.src = '/' + targetUrl; 
      cardImg.style.display = 'block'; 
      cardDesc.style.display = 'none'; 
      
      if(fsImg) {
          fsImg.src = '/' + targetUrl;
          fsImg.style.display = 'block';
          if(fsDesc) fsDesc.style.display = 'none';
      }
  } else { 
      cardImg.style.display = 'none'; 
      cardDesc.style.display = 'block'; 
      cardDesc.innerHTML = formattedText; 
      
      if(fsDesc) {
          fsImg.style.display = 'none';
          fsDesc.style.display = 'block';
          fsDesc.innerHTML = formattedText; 
      }
  }
}

function renderCounter(container, currentValue, id, colName) {
  container.innerHTML = `
      <div class="counter-widget">
          <button onclick="changeCount(${id}, '${colName}', -1, this.nextElementSibling)">-</button>
          <div class="value-box">${currentValue}</div>
          <button onclick="changeCount(${id}, '${colName}', 1, this.previousElementSibling)">+</button>
      </div>
  `;
}

async function changeCount(id, colName, delta, valueBoxEl) {
  const newVal = await api('update_counter', id, colName, delta);
  valueBoxEl.innerText = newVal;
  if (currentDetailData) currentDetailData[colName] = newVal;
  api('get_serie_progress', currentSerie, filters, isCreatingGoal).then(updateHeaderStats);
}

function stopVideo() {
    const videoEl = document.getElementById('char-video');
    if(videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }
}

// ---------- PROGRESS ----------
function updateHeaderStats(progress) {
  if (progress.is_goal) { document.getElementById('stat-owned').parentElement.querySelector('.label').innerText = "IN SELEZIONE"; } 
  else { document.getElementById('stat-owned').parentElement.querySelector('.label').innerText = "POSSEDUTI"; }

  document.getElementById('stat-owned').textContent = `${progress.owned} / ${progress.total}`;
  document.getElementById('progress-pct').textContent = progress.percent + '%';
  document.getElementById('progress-ring').style.setProperty('--pct', progress.percent);
  
  if (progress.is_goal) { document.getElementById('progress-ring').style.background = `conic-gradient(#1E90FF calc(${progress.percent} * 1%), var(--line) 0)`; } 
  else { document.getElementById('progress-ring').style.background = `conic-gradient(var(--amber-bright) calc(${progress.percent} * 1%), var(--line) 0)`; }
}

function updateScopeProgress(serieName, progress) {
  const el = document.getElementById('scope-progress');
  if (isCreatingGoal) { el.style.display = 'none'; return; }
  
  el.style.display = 'flex';
  document.getElementById('scope-pct').textContent = progress.percent + '%';
  document.getElementById('scope-bar-fill').style.width = progress.percent + '%';

  if (progress.is_goal) {
      el.classList.add('goal-active-scope');
      document.getElementById('scope-label').textContent = `SELEZIONE ATTIVA (${serieName})`;
  } else {
      el.classList.remove('goal-active-scope');
      document.getElementById('scope-label').textContent = `COLLEZIONE (${serieName})`;
  }
}

// ---------- INIT E TASTIERA ----------
window.addEventListener('pywebviewready', async () => {
  const state = await api('get_app_state');
  if(state.filters && Object.keys(state.filters).length > 0) { filters = state.filters; }
  
  activeGoal = state.active_goal || "Nessuno";
  
  refreshSaveIndicator(state.current_file);
  refreshGoalIndicator();
  
  syncFilterChipsUI();
  await goHome();
});

// Variabile per tenere traccia di cosa stiamo puntando con la tastiera
let keyboardFocusIndex = -1;
let isUsingKeyboard = false;

// 1. GESTIONE MOUSE-TASTIERA (CORRETTA CONTRO GLI "HOVER FANTASMA")
document.addEventListener('mousemove', (e) => {
    // Se il mouse non si è mosso fisicamente di un singolo pixel,
    // significa che è la pagina che gli sta scorrendo sotto. Ignoralo!
    if (e.movementX === 0 && e.movementY === 0) return;

    if (isUsingKeyboard) {
        isUsingKeyboard = false;
        document.body.classList.remove('keyboard-mode');
        
        // Rimuoviamo gli effetti visivi, ma NON azzeriamo keyboardFocusIndex.
        // Così se ripremi una freccia, riparti da dove eri arrivato!
        document.querySelectorAll('.keyboard-focused').forEach(el => el.classList.remove('keyboard-focused'));
    }
});

// 2. NAVIGAZIONE GEOMETRICA: Calcola esattamente qual è l'elemento sotto/sopra sul monitor
function getNextIndex(items, currentIndex, key) {
    if (currentIndex === -1) return 0;
    
    // Destra e Sinistra scorrono normalmente nella lista
    if (key === 'ArrowRight') return Math.min(currentIndex + 1, items.length - 1);
    if (key === 'ArrowLeft') return Math.max(currentIndex - 1, 0);
    
    const currentRect = items[currentIndex].getBoundingClientRect();
    const currCx = currentRect.left + currentRect.width / 2;
    const currCy = currentRect.top + currentRect.height / 2;
    
    let bestIdx = currentIndex;
    let minDist = Infinity;

    items.forEach((item, idx) => {
        if (idx === currentIndex) return;
        const r = item.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        
        const dy = cy - currCy;
        const dx = Math.abs(cx - currCx);
        
        // Se premo Giù, cerco l'elemento con la Y maggiore
        if (key === 'ArrowDown' && dy > 10) {
            // Moltiplichiamo dx * 15 per "penalizzare" le carte che non sono esattamente in asse verticale
            const dist = dy + (dx * 15); 
            if (dist < minDist) { minDist = dist; bestIdx = idx; }
        }
        // Se premo Su, cerco l'elemento con la Y minore
        if (key === 'ArrowUp' && dy < -10) {
            const dist = Math.abs(dy) + (dx * 15);
            if (dist < minDist) { minDist = dist; bestIdx = idx; }
        }
    });
    
    return bestIdx;
}

document.addEventListener('keydown', (e) => {
  // Ignora le scorciatoie se stai scrivendo del testo
  if ((e.key === 'Backspace' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return;
  }

  // Se premi un tasto utile, entra in "Modalità Tastiera"
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', '+', '-', 'Escape', 'Backspace'].includes(e.key)) {
      isUsingKeyboard = true;
      document.body.classList.add('keyboard-mode');
  }

  // Tasti per tornare indietro
  if (e.key === 'Escape' || e.key === 'Backspace') {
      if (document.getElementById('fullscreen-overlay').style.display === 'flex') {
          closeFullscreenVideo();
      } else if (document.getElementById('image-fullscreen-overlay').style.display === 'flex') {
          closeFullscreenCard();
      } else if (document.getElementById('info-scrim').classList.contains('open')) {
          document.getElementById('info-scrim').classList.remove('open');
          document.getElementById('info-modal').classList.remove('open');
      } else if (document.getElementById('saves-scrim').classList.contains('open')) {
          document.getElementById('saves-scrim').classList.remove('open');
          document.getElementById('saves-modal').classList.remove('open');
      } else if (document.getElementById('goals-scrim').classList.contains('open')) {
          document.getElementById('goals-scrim').classList.remove('open');
          document.getElementById('goals-modal').classList.remove('open');
      } else if (isCreatingGoal) {
          cancelGoalEditor();
      } else if (currentView === 'detail') {
          returnToSerie();
      } else if (currentView === 'serie') {
          goHome();
      }
      return; 
  }

  // NAVIGAZIONE NELLA HOME
  if (currentView === 'home' && !document.getElementById('saves-scrim').classList.contains('open') && !document.getElementById('goals-scrim').classList.contains('open')) {
      const items = document.querySelectorAll('.serie-tile');
      if (items.length === 0) return;

      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
          e.preventDefault(); 
          keyboardFocusIndex = getNextIndex(items, keyboardFocusIndex, e.key);

          items.forEach(el => el.classList.remove('keyboard-focused'));
          items[keyboardFocusIndex].classList.add('keyboard-focused');
          items[keyboardFocusIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (e.key === 'Enter' && keyboardFocusIndex !== -1) {
          e.preventDefault();
          const target = items[keyboardFocusIndex];
          target.click();
      }
  }

  // NAVIGAZIONE NELLA SCHERMATA SERIE
  if (currentView === 'serie' && !document.getElementById('saves-scrim').classList.contains('open') && !document.getElementById('goals-scrim').classList.contains('open')) {
      const items = document.querySelectorAll('.card');
      if (items.length === 0) return;

      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
          e.preventDefault();
          keyboardFocusIndex = getNextIndex(items, keyboardFocusIndex, e.key);

          items.forEach(el => el.classList.remove('keyboard-focused'));
          items[keyboardFocusIndex].classList.add('keyboard-focused');
          items[keyboardFocusIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      if (e.key === 'Enter' && keyboardFocusIndex !== -1) {
          e.preventDefault();
          const target = items[keyboardFocusIndex];
          target.click();
      }

      if ((e.key === '+' || e.key === '-') && keyboardFocusIndex !== -1) {
          e.preventDefault();
          const focusedCard = items[keyboardFocusIndex];
          if (e.key === '+') {
              const addBtn = focusedCard.querySelector('.quick-add-btn');
              if (addBtn) addBtn.click();
          } else if (e.key === '-') {
              const subBtn = focusedCard.querySelector('.quick-sub-btn');
              if (subBtn) subBtn.click();
          }
      }
  }

  // NAVIGAZIONE NELLA SCHEDA PERSONAGGIO
  if (currentView === 'detail') {
      if (e.key === 'ArrowLeft' && currentDetailIndex > 0) {
          openDetail(currentGridItems[currentDetailIndex - 1], currentDetailIndex - 1);
      }
      if (e.key === 'ArrowRight' && currentDetailIndex < currentGridItems.length - 1) {
          openDetail(currentGridItems[currentDetailIndex + 1], currentDetailIndex + 1);
      }
      if (e.key === 'ArrowUp' && currentDetailData && currentDetailData._evo_next) {
          e.preventDefault(); 
          jumpToEvolution(currentDetailData._evo_next.id); 
      }
      if (e.key === 'ArrowDown' && currentDetailData && currentDetailData._evo_prev) {
          e.preventDefault(); 
          jumpToEvolution(currentDetailData._evo_prev.id); 
      }
  }
});
// Sincronizza il mirino della tastiera con l'ultima carta toccata dal mouse!
document.addEventListener('mouseover', (e) => {
    // Se stiamo usando attivamente la tastiera, ignora questo passaggio
    if (isUsingKeyboard) return; 
    
    // Se il mouse passa sopra un personaggio
    const card = e.target.closest('.card');
    if (card) {
        const cards = Array.from(document.querySelectorAll('.card'));
        keyboardFocusIndex = cards.indexOf(card);
        return;
    }
    
    // Se il mouse passa sopra una serie nella Home
    const tile = e.target.closest('.serie-tile');
    if (tile) {
        const tiles = Array.from(document.querySelectorAll('.serie-tile'));
        keyboardFocusIndex = tiles.indexOf(tile);
    }
});

// ---------- CLICK TO PLAY/PAUSE VIDEO ----------
document.getElementById('char-video').onclick = function() {
    if (this.paused) this.play();
    else this.pause();
};

document.getElementById('fs-video').onclick = function() {
    if (this.paused) this.play();
    else this.pause();
};