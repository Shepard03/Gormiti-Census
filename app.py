"""
Gormiti Census — porting web (pywebview) dell'app CustomTkinter.
BLOCCO 1-15: Obiettivi, Safe CSV, System Temp, Filtri a Cascata, Aggiunta in Blocco.
"""
import os
import sys
import glob
import json
import shutil
import webview
import pandas as pd
import webbrowser  
import tempfile  

def get_base_path():
    if getattr(sys, 'frozen', False):
        if sys.platform == "darwin":
            # Su macOS systemfile resta incorporato nel bundle .app tramite
            # --add-data, quindi si segue il percorso standard di PyInstaller.
            bundle_dir = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))

            # Controllo specifico per l'architettura dei pacchetti .app del Mac
            mac_resources = os.path.abspath(os.path.join(bundle_dir, '..', 'Resources'))
            if os.path.exists(os.path.join(mac_resources, "systemfile")):
                return mac_resources

            return bundle_dir
        else:
            # Su Windows systemfile NON viene piu' incorporato nell'exe (vedi
            # comando di build senza --add-data): e' l'installer a metterlo
            # accanto all'eseguibile. Usiamo direttamente la cartella dell'exe
            # (sys.executable), che resta stabile anche se PyInstaller cambia
            # in futuro la propria struttura interna (es. _internal).
            return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

BASE_PATH = get_base_path()

# Configurazione fissa e stabile sulla cartella "systemfile"
SYSTEM_DIR = os.path.normpath(os.path.join(BASE_PATH, "systemfile"))

# Dati "statici" del progetto (census, evoluzioni, interfaccia): vivono sempre
# dentro systemfile, che sia dentro o fuori dal bundle. Vengono aggiornati ad
# ogni release e va bene cosi', non contengono nulla di personale dell'utente.
CSV_PATH = os.path.normpath(os.path.join(SYSTEM_DIR, "gormiti_census.csv"))
MEDIA_DIR = os.path.normpath(os.path.join(SYSTEM_DIR, "ui", "media"))
EVOLUZIONI_PATH = os.path.normpath(os.path.join(SYSTEM_DIR, "evoluzioni.csv"))

if sys.platform == "darwin":
    # Su macOS l'app viene distribuita come bundle .app: un aggiornamento (nuovo
    # .app trascinato sopra il vecchio, o un nuovo .dmg) sostituisce l'INTERO
    # bundle in blocco. Per questo, salvataggi e preferenze utente vivono FUORI
    # dal bundle, nella cartella che macOS prevede apposta per questo scopo:
    # ~/Library/Application Support/Gormiti Census/. Cosi' un aggiornamento
    # dell'app non cancella mai la collezione o le preferenze dell'utente.
    APP_SUPPORT_DIR = os.path.normpath(os.path.join(
        os.path.expanduser("~"), "Library", "Application Support", "Gormiti Census"
    ))
    SAVES_DIR = os.path.normpath(os.path.join(APP_SUPPORT_DIR, "salvataggi"))
    CONFIG_PATH = os.path.normpath(os.path.join(APP_SUPPORT_DIR, "config.json"))
else:
    # Su Windows i salvataggi restano accanto all'eseguibile: qui l'aggiornamento
    # e' gestito dall'installer (Inno Setup), che copia file-per-file e non
    # tocca mai la cartella "salvataggi" ne' un config.json gia' esistente.
    SAVES_DIR = os.path.normpath(os.path.join(BASE_PATH, "salvataggi"))
    CONFIG_PATH = os.path.normpath(os.path.join(SYSTEM_DIR, "config.json"))

GOALS_DIR = os.path.normpath(os.path.join(SAVES_DIR, "selezioni"))

# File temporaneo invisibile nascosto nella directory di sistema del PC
TEMP_SAVE_PATH = os.path.normpath(os.path.join(tempfile.gettempdir(), "gormiti_auto_backup.gormiti"))

for d in [SAVES_DIR, GOALS_DIR, SYSTEM_DIR]:
    if not os.path.exists(d):
        try: os.makedirs(d)
        except: pass

def safe_read_csv(filepath):
    try:
        return pd.read_csv(filepath, sep=';', encoding='utf-8')
    except UnicodeDecodeError:
        try:
            return pd.read_csv(filepath, sep=';', encoding='latin-1')
        except Exception:
            return pd.read_csv(filepath, sep=';', encoding='utf-8', errors='replace')
    except Exception as e:
        print(f"Errore grave nella lettura del CSV: {e}")
        return pd.DataFrame(columns=['id', 'serie', 'popolo', 'nome', 'personaggio_posseduto', 'carta_posseduta', 'accessorio_posseduto', 'collezione_standard'])

def clean_dataframe(df):
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
    cols_to_drop = ['personaggi_doppioni', 'carte_doppie', 'accessori_doppioni']
    df = df.drop(columns=[c for c in cols_to_drop if c in df.columns], errors='ignore')
    text_cols = ['popolo', 'serie', 'fronte_carta', 'retro_carta', 'foto', 'nome',
                 'provenienza', 'descrizione', 'foto_ogg', 'nome_ogg',
                 'video_rot', 'video_gim1', 'video_gim2', 'video_gim3']
    for col in text_cols:
        if col in df.columns: df[col] = df[col].astype(str).str.strip()
    num_cols = ['id', 'collezione_standard', 'personaggio_posseduto', 'carta_posseduta', 'accessorio_posseduto']
    for col in num_cols:
        if col in df.columns: df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        else: df[col] = 0
    return df

def clean_for_json(value):
    if isinstance(value, float) and pd.isna(value): return ""
    return value

def row_to_clean_dict(row):
    return {k: clean_for_json(v) for k, v in row.items()}

_media_index_cache = {}

def find_media_file(subfolder, filename):
    if not filename or filename.lower() in ('nan', ''): return None
    folder_path = os.path.join(MEDIA_DIR, subfolder)
    if folder_path not in _media_index_cache:
        index = {}
        if os.path.isdir(folder_path):
            for f in os.listdir(folder_path): index[f.lower()] = f
        _media_index_cache[folder_path] = index
    index = _media_index_cache[folder_path]
    real_name = index.get(filename.lower())
    if real_name: return f"media/{subfolder}/{real_name}"
    return None

def find_logo(serie_name):
    clean_name = str(serie_name).lower().strip().replace(" ", "_")
    folder_path = os.path.join(MEDIA_DIR, "loghi")
    if folder_path not in _media_index_cache:
        index = {}
        if os.path.isdir(folder_path):
            for f in os.listdir(folder_path): index[f.lower()] = f
        _media_index_cache[folder_path] = index
    index = _media_index_cache[folder_path]
    for ext in ("png", "jpg", "jpeg"):
        real = index.get(f"{clean_name}.{ext}")
        if real: return f"media/loghi/{real}"
    return None


class Api:
    def __init__(self):
        self._window = None 
        self._db = pd.DataFrame() 
        self.config = self._load_config()
        
        last_file = self.config.get("last_file", CSV_PATH)
        if last_file and not last_file.endswith('.gormiti') and not last_file.endswith('.csv'):
            last_file = CSV_PATH
        self.current_save_path = os.path.normpath(last_file)
        
        self.active_goal = self.config.get("active_goal", "Nessuno")
        self.active_goal_data = {}
        
        if os.path.exists(TEMP_SAVE_PATH):
            if self.current_save_path != TEMP_SAVE_PATH:
                try: os.remove(TEMP_SAVE_PATH)
                except: pass
        
        self.load_database(self.current_save_path)
        self.generate_default_goals()
        self.load_active_goal_from_file()
        self._evo_map = {}
        self._load_evolutions()

    def _load_evolutions(self):
        self._evo_map = {}
        if not os.path.exists(EVOLUZIONI_PATH): return
        try: df = pd.read_csv(EVOLUZIONI_PATH, sep=';', encoding='utf-8-sig')
        except Exception as e:
            print(f"Errore nella lettura di evoluzioni.csv: {e}")
            return
        df.columns = df.columns.str.strip().str.lower()
        id_cols = [c for c in df.columns if c.startswith('id')]
        for _, row in df.iterrows():
            chain = []
            for c in id_cols:
                val = row.get(c)
                if pd.isna(val) or str(val).strip() == '': continue
                try: chain.append(int(val))
                except (ValueError, TypeError): continue
            for i, cid in enumerate(chain):
                self._evo_map[cid] = {"chain": chain, "index": i}

    def _get_evo_neighbor_info(self, cid):
        if cid is None or self._db.empty: return None
        df = self._db[self._db['id'] == int(cid)]
        if df.empty: return None
        r = df.iloc[0]
        return {"id": int(cid), "serie": str(r.get('serie', '')), "nome": str(r.get('nome', ''))}

    def open_external_link(self, url):
        try: webbrowser.open(url); return {"success": True}
        except Exception as e: return {"success": False, "error": str(e)}

    def _load_config(self):
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, 'r', encoding='utf-8') as f: return json.load(f)
            except: pass
        return {"last_file": CSV_PATH, "filters": {}, "active_goal": "Nessuno"}

    def _save_config(self):
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=4)

    def get_app_state(self):
        return {
            "filters": self.config.get("filters", {}),
            "current_file": os.path.basename(self.current_save_path),
            "active_goal": self.active_goal
        }

    def save_ui_filters(self, filters):
        self.config["filters"] = filters
        self._save_config()

    def _merge_save_onto_master(self, save_path):
        master_df = safe_read_csv(CSV_PATH)
        master_df = clean_dataframe(master_df)
        
        user_df = safe_read_csv(save_path)
        user_df = clean_dataframe(user_df)

        progress_map = {}
        for _, row in user_df.iterrows():
            progress_map[row['id']] = {
                'personaggio_posseduto': row.get('personaggio_posseduto', 0),
                'carta_posseduta': row.get('carta_posseduta', 0),
                'accessorio_posseduto': row.get('accessorio_posseduto', 0),
            }
            
        for index, row in master_df.iterrows():
            rid = row['id']
            if rid in progress_map:
                master_df.at[index, 'personaggio_posseduto'] = progress_map[rid]['personaggio_posseduto']
                master_df.at[index, 'carta_posseduta'] = progress_map[rid]['carta_posseduta']
                master_df.at[index, 'accessorio_posseduto'] = progress_map[rid]['accessorio_posseduto']

        return master_df

    def load_database(self, path=None):
        target_path = os.path.normpath(path if path else self.current_save_path)
        global _media_index_cache
        _media_index_cache = {}

        if not os.path.exists(target_path) or target_path == CSV_PATH:
            try:
                df = safe_read_csv(CSV_PATH)
                self._db = clean_dataframe(df)
                self.current_save_path = CSV_PATH
                self.config["last_file"] = CSV_PATH
                self._save_config()
                return {"success": True, "filename": "gormiti_census.csv"}
            except Exception as e:
                self._db = pd.DataFrame(columns=['id', 'serie', 'popolo', 'nome', 'personaggio_posseduto', 'carta_posseduta', 'accessorio_posseduto', 'collezione_standard'])
                return {"success": False, "error": str(e)}

        try:
            merged_df = self._merge_save_onto_master(target_path)
            self._db = merged_df
            self.current_save_path = target_path
            self.config["last_file"] = target_path
            self._save_config()
            return {"success": True, "filename": os.path.basename(target_path)}
        except Exception as e:
            self._db = pd.DataFrame(columns=['id', 'serie', 'popolo', 'nome', 'personaggio_posseduto', 'carta_posseduta', 'accessorio_posseduto', 'collezione_standard'])
            return {"success": False, "error": str(e)}

    def get_saves_list(self):
        saves = []
        if os.path.exists(SAVES_DIR):
            for f in os.listdir(SAVES_DIR):
                path = os.path.join(SAVES_DIR, f)
                if os.path.isfile(path) and (f.endswith('.gormiti') or f.endswith('.csv')):
                    active = (self.current_save_path == path)
                    saves.append({"filename": f, "active": active})
        return sorted(saves, key=lambda x: x['filename'].lower())

    def create_new_save(self, name):
        filename = f"{name}.gormiti"
        save_path = os.path.normpath(os.path.join(SAVES_DIR, filename))
        if os.path.exists(save_path):
            return {"success": False, "error": "Esiste già un salvataggio con questo nome."}
        try:
            num_cols = ['personaggio_posseduto', 'carta_posseduta', 'accessorio_posseduto']
            for col in num_cols:
                if col in self._db.columns: self._db[col] = 0
            
            old_path = self.current_save_path
            self._db.to_csv(save_path, sep=';', index=False)
            
            self.current_save_path = save_path
            self.config["last_file"] = self.current_save_path
            self._save_config()
            
            if old_path == TEMP_SAVE_PATH and save_path != TEMP_SAVE_PATH:
                if os.path.exists(TEMP_SAVE_PATH):
                    try: os.remove(TEMP_SAVE_PATH)
                    except: pass
            return {"success": True, "filename": filename}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def load_save_file(self, filename):
        path = os.path.normpath(os.path.join(SAVES_DIR, filename))
        return self.load_database(path)

    # --- NUOVA FUNZIONE DI IMPORTAZIONE AGGIUNTA QUI ---
    def import_save_file(self):
        result = self._window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=('Gormiti Save (*.gormiti;*.csv)', 'All files (*.*)'))
        if result and len(result) > 0:
            try:
                shutil.copy(result[0], os.path.normpath(os.path.join(SAVES_DIR, os.path.basename(result[0]))))
                return {"success": True}
            except Exception as e: return {"success": False, "error": str(e)}
        return {"success": False, "cancelled": True}
    # ---------------------------------------------------

    def export_save_file(self, filename):
        src = os.path.normpath(os.path.join(SAVES_DIR, filename))
        if not os.path.exists(src): return {"success": False}
        result = self._window.create_file_dialog(webview.SAVE_DIALOG, save_filename=filename, file_types=('Gormiti Save (*.gormiti)', 'CSV File (*.csv)', 'All files (*.*)'))
        if result:
            dest = os.path.normpath(result if isinstance(result, str) else result[0])
            try:
                shutil.copy(src, dest)
                return {"success": True}
            except Exception as e: return {"success": False, "error": str(e)}
        return {"success": False, "cancelled": True}

    def delete_save_file(self, filename):
        path = os.path.normpath(os.path.join(SAVES_DIR, filename))
        if os.path.exists(path):
            try:
                os.remove(path)
                if self.current_save_path == path:
                    self.load_database(CSV_PATH)
                return {"success": True}
            except Exception as e: return {"success": False, "error": str(e)}
        return {"success": False, "error": "Not found"}

    def trigger_save(self):
        try:
            if self.current_save_path == CSV_PATH:
                self.current_save_path = TEMP_SAVE_PATH
                self.config["last_file"] = TEMP_SAVE_PATH
                self._save_config()

            self._db.to_csv(self.current_save_path, sep=';', index=False)
            return {"success": True}
        except Exception as e: return {"success": False, "error": str(e)}

    def trigger_reset(self):
        num_cols = ['personaggio_posseduto', 'carta_posseduta', 'accessorio_posseduto']
        for col in num_cols:
            if col in self._db.columns: self._db[col] = 0
        self.trigger_save()
        return {"success": True}

    def generate_default_goals(self):
        path_fanbuk = os.path.normpath(os.path.join(GOALS_DIR, "Fanbuk.json"))
        if not os.path.exists(path_fanbuk):
            fanbuk_data = {"215": ["char"], "220": ["char"], "221": ["char"], "226": ["char"], "227": ["char"], "232": ["char"], "233": ["char"], "238": ["char"], "239": ["char"], "244": ["char"], "245": ["char"], "250": ["char"], "251": ["char"], "256": ["char"], "272": ["char"], "273": ["char"], "274": ["char"], "275": ["char"], "276": ["char"], "277": ["char"], "278": ["char"], "279": ["char"], "280": ["char"], "281": ["char"], "282": ["char"], "283": ["char"], "284": ["char"], "285": ["char"], "316": ["char"], "317": ["char"], "318": ["char"], "319": ["char"], "320": ["char"], "321": ["char"], "322": ["char"], "344": ["char"], "345": ["char"], "346": ["char"], "347": ["char"], "348": ["char"], "349": ["char"], "350": ["char"], "351": ["char"], "357": ["char"], "363": ["char"], "364": ["char"], "365": ["char"], "366": ["char"], "367": ["char"], "369": ["char"], "375": ["char"], "381": ["char"], "387": ["char"], "395": ["char"], "400": ["char"], "401": ["char"], "406": ["char"], "407": ["char"], "412": ["char"], "413": ["char"], "418": ["char"], "419": ["char"], "428": ["char"], "439": ["char"], "440": ["char"], "446": ["char"], "448": ["char"], "449": ["char"], "455": ["char"], "457": ["char"], "458": ["char"], "464": ["char"], "466": ["char"], "467": ["char"], "472": ["char"], "474": ["char"], "481": ["char"], "500": ["char"], "502": ["char"], "507": ["char"], "510": ["char"], "514": ["char"], "517": ["char"], "521": ["char"], "527": ["char"], "529": ["char"], "532": ["char"], "534": ["char"], "535": ["char"], "537": ["char"], "538": ["char"], "540": ["char"], "547": ["char"], "554": ["char"], "561": ["char"], "575": ["char"], "576": ["char"], "577": ["char"], "578": ["char"], "580": ["char"], "581": ["char"], "582": ["char"], "583": ["char"], "597": ["char"], "599": ["char"], "604": ["char"], "605": ["char"], "611": ["char"], "613": ["char"], "618": ["char"], "621": ["char"], "624": ["char"], "625": ["char"], "626": ["char"], "630": ["char"], "639": ["char"], "640": ["char"], "646": ["char"], "651": ["char"], "653": ["char"], "659": ["char"], "660": ["char"], "665": ["char"], "667": ["char"], "668": ["char"], "672": ["char"], "675": ["char"], "677": ["char"], "679": ["char"], "684": ["char"], "685": ["char"], "689": ["char"], "691": ["char"], "694": ["char"], "695": ["char"], "696": ["char"], "700": ["char"], "706": ["char"], "707": ["char"], "710": ["char"], "712": ["char"], "714": ["char"], "715": ["char"], "716": ["char"], "720": ["char"], "721": ["char"], "725": ["char"], "728": ["char"], "730": ["char"], "733": ["char"], "735": ["char"], "739": ["char"], "740": ["char"], "741": ["char"], "742": ["char"]}
            with open(path_fanbuk, 'w') as f: json.dump(fanbuk_data, f)
        
        path_tit = os.path.normpath(os.path.join(GOALS_DIR, "Oggetti Titanium.json"))
        if not os.path.exists(path_tit) and not self._db.empty:
            mask_tit = (self._db['serie'] == 'Titanium') & (self._db['popolo'] == 'Oggetto')
            ids = self._db[mask_tit]['id'].tolist()
            goal_data = {str(i): ["char"] for i in ids}
            with open(path_tit, 'w') as f: json.dump(goal_data, f)

        path_lord = os.path.normpath(os.path.join(GOALS_DIR, "Solo Signori della Natura.json"))
        if not os.path.exists(path_lord) and not self._db.empty:
            ids = []
            if 'collezione_standard' in self._db.columns:
                df_std = self._db[self._db['collezione_standard'] == 1]
                for s in df_std['serie'].unique():
                    if "esteri" in str(s).lower(): continue
                    df_s = df_std[df_std['serie'] == s]
                    for p in df_s['popolo'].unique():
                        df_p = df_s[df_s['popolo'] == p].sort_values(by='id')
                        if df_p.empty: continue
                        ids_p = df_p['id'].tolist()
                        pl = str(p).lower(); sl = str(s).lower()
                        if "senza popolo" in pl: ids.extend(ids_p)
                        elif "popolo del male" in pl: ids.extend(ids_p[:2])
                        elif ("cartoon" in sl or "elemental fusion" in sl) and "vulcano" in pl: ids.extend(ids_p[:3])
                        elif "eclissi suprema" in sl:
                            if "luce" in pl or "tenebre" in pl: ids.append(ids_p[0])
                            else: ids.extend(ids_p[:2])
                        elif "nature unleashed" in sl and "vulcano" in pl:
                            if ids_p: ids.append(ids_p[0])
                            if len(ids_p)>1: ids.append(ids_p[-1])
                        else: ids.append(ids_p[0])
                goal_data = {str(i): ["char", "card"] for i in ids}
                with open(path_lord, 'w') as f: json.dump(goal_data, f)

    def load_active_goal_from_file(self):
        self.active_goal_data = {}
        if self.active_goal == "Nessuno": return
        tf = os.path.normpath(os.path.join(GOALS_DIR, f"{self.active_goal}.json"))
        if os.path.exists(tf):
            try:
                with open(tf, 'r') as f:
                    data = json.load(f)
                    if isinstance(data, list): self.active_goal_data = {str(i): ["char"] for i in data}
                    else: self.active_goal_data = data
            except: self.active_goal = "Nessuno"
        else: self.active_goal = "Nessuno"

    def get_menu_goals(self):
        factory = [
            "Solo Signori della Natura",
            "Oggetti Titanium",
            "Fanbuk"
        ] 
        goals = []
        if os.path.exists(GOALS_DIR):
            for f in glob.glob(os.path.join(GOALS_DIR, "*.json")):
                name = os.path.splitext(os.path.basename(f))[0]
                goals.append({"name": name, "is_factory": name in factory, "active": name == self.active_goal})
        return sorted(goals, key=lambda x: (not x['is_factory'], x['name']))

    def set_active_goal(self, goal_name):
        self.active_goal = goal_name
        self.config["active_goal"] = goal_name
        self._save_config()
        self.load_active_goal_from_file()
        return {"success": True}

    def save_custom_goal(self, name, data):
        filename = os.path.normpath(os.path.join(GOALS_DIR, f"{name}.json"))
        try:
            with open(filename, 'w') as f: json.dump(data, f)
            return {"success": True}
        except Exception as e: return {"success": False, "error": str(e)}

    def delete_goal(self, name):
        tf = os.path.normpath(os.path.join(GOALS_DIR, f"{name}.json"))
        if os.path.exists(tf):
            try:
                os.remove(tf)
                if self.active_goal == name: self.set_active_goal("Nessuno")
                return {"success": True}
            except Exception as e: return {"success": False, "error": str(e)}
        return {"success": False, "error": "Not found"}

    def load_goal_for_edit(self, name):
        tf = os.path.normpath(os.path.join(GOALS_DIR, f"{name}.json"))
        if os.path.exists(tf):
            try:
                with open(tf, 'r') as f:
                    data = json.load(f)
                    if isinstance(data, list): return {str(i): ["char"] for i in data}
                    return data
            except: pass
        return {}

    def import_goal(self):
        result = self._window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=('JSON File (*.json)',))
        if result and len(result) > 0:
            try:
                shutil.copy(result[0], os.path.normpath(os.path.join(GOALS_DIR, os.path.basename(result[0]))))
                return {"success": True}
            except Exception as e: return {"success": False, "error": str(e)}
        return {"success": False, "cancelled": True}

    def export_goal(self, name):
        src = os.path.normpath(os.path.join(GOALS_DIR, f"{name}.json"))
        if not os.path.exists(src): return {"success": False}
        result = self._window.create_file_dialog(webview.SAVE_DIALOG, save_filename=f"{name}.json", file_types=('JSON File (*.json)',))
        if result:
            dest = os.path.normpath(result if isinstance(result, str) else result[0])
            try:
                shutil.copy(src, dest)
                return {"success": True}
            except Exception as e: return {"success": False, "error": str(e)}
        return {"success": False, "cancelled": True}

    def _filter_by_goal(self, df):
        if self.active_goal != "Nessuno" and self.active_goal_data:
            goal_ids = [int(k) for k in self.active_goal_data.keys()]
            return df[df['id'].isin(goal_ids)]
        return df

    def get_home_series(self, filters=None, is_creating_goal=False):
        if self._db.empty: return []
        
        filters = filters or {}
        show_extras = filters.get("show_extras", True)
        show_missing = filters.get("show_missing", False)
        show_duplicates = filters.get("show_duplicates", False)
        show_cards = filters.get("show_cards", False)

        series_out = []
        if 'serie' not in self._db.columns: return []
        unique_series = self._db['serie'].unique()
        target_col = 'carta_posseduta' if show_cards else 'personaggio_posseduto'

        for serie_name in unique_series:
            if not serie_name or str(serie_name).lower() == 'nan': continue
            df_s = self._db[self._db['serie'] == serie_name]

            if not is_creating_goal:
                df_s = self._filter_by_goal(df_s)

            if show_cards:
                df_s = df_s[df_s['fronte_carta'].apply(lambda x: str(x).lower() not in ['nan', ''])]

            if not show_extras: df_s = df_s[df_s['collezione_standard'] == 1]
            if show_missing: df_s = df_s[df_s[target_col] == 0]
            if show_duplicates: df_s = df_s[df_s[target_col] > 1]
            if df_s.empty: continue

            series_out.append({"nome": serie_name, "logo": find_logo(serie_name)})
        return series_out

    def get_overall_progress(self, filters=None, is_creating_goal=False):
        if is_creating_goal or self._db.empty: return {"owned": 0, "total": 0, "percent": 0, "is_goal": False}
        
        filters = filters or {}
        show_extras = filters.get("show_extras", True)
        show_cards = filters.get("show_cards", False)

        df_target = self._db
        is_goal_active = self.active_goal != "Nessuno"

        if is_goal_active:
            df_target = self._filter_by_goal(df_target)
            
        if not show_extras:
            df_target = df_target[df_target['collezione_standard'] == 1]

        total, owned = 0, 0

        if is_goal_active:
            target_type = "card" if show_cards else "char"
            relevant_ids = [int(k) for k, v in self.active_goal_data.items() if target_type in v]
            df_relevant = df_target[df_target['id'].isin(relevant_ids)]
            
            if show_cards:
                df_relevant = df_relevant[df_relevant['fronte_carta'].apply(lambda x: str(x).lower() not in ['nan', ''])]
                total = len(df_relevant)
                owned = int((df_relevant['carta_posseduta'] > 0).sum())
            else:
                total = len(df_relevant)
                owned = int((df_relevant['personaggio_posseduto'] > 0).sum())
        else:
            if show_cards:
                df_cards = df_target[df_target['fronte_carta'].apply(lambda x: str(x).lower() not in ['nan', ''])]
                total = len(df_cards)
                owned = int((df_cards['carta_posseduta'] > 0).sum())
            else:
                valid_acc_mask = df_target['nome_ogg'].apply(lambda x: str(x).lower() not in ['nan', ''])
                count_valid_acc = int(valid_acc_mask.sum())
                owned_acc = int(((df_target['accessorio_posseduto'] > 0) & valid_acc_mask).sum())
                total = len(df_target) + count_valid_acc
                owned_chars = int((df_target['personaggio_posseduto'] > 0).sum())
                owned = owned_chars + owned_acc

        perc = (owned / total) if total > 0 else 0
        return {"owned": owned, "total": total, "percent": round(perc * 100), "is_goal": is_goal_active}

    def get_serie_provenienze(self, serie_name):
        if self._db.empty or 'provenienza' not in self._db.columns: return []
        df = self._db[(self._db['serie'] == serie_name) & (self._db['collezione_standard'] == 1)]
        values = set()
        for v in df['provenienza'].astype(str):
            if not v or v.lower() == 'nan': continue
            for part in v.split('|'):
                part = part.strip()
                if part: values.add(part)
        return sorted(values)

    def get_serie_groups(self, serie_name, filters=None, is_creating_goal=False):
        if self._db.empty: return []
        
        filters = filters or {}
        show_extras = filters.get("show_extras", True)
        show_missing = filters.get("show_missing", False)
        show_duplicates = filters.get("show_duplicates", False)
        show_cards = filters.get("show_cards", False)
        prov_filter = filters.get("provenienza", "")

        df_serie = self._db[self._db['serie'] == serie_name]

        if prov_filter:
            df_serie = df_serie[df_serie['provenienza'].apply(
                lambda x: prov_filter in [p.strip() for p in str(x).split('|')]
            )]

        if show_cards:
            df_serie = df_serie[df_serie['fronte_carta'].apply(lambda x: str(x).lower() not in ['nan', ''])]
        
        if not is_creating_goal:
            df_serie = self._filter_by_goal(df_serie)
            
        if not show_extras:
            df_serie = df_serie[df_serie['collezione_standard'] == 1]

        target_col = 'carta_posseduta' if show_cards else 'personaggio_posseduto'
        if show_missing: df_serie = df_serie[df_serie[target_col] == 0]
        if show_duplicates: df_serie = df_serie[df_serie[target_col] > 1]

        groups = []
        use_unified_grid = (self.active_goal in ["Solo Signori della Natura", "Fanbuk", "Oggetti Titanium"]) and not is_creating_goal

        if use_unified_grid:
            items = [self._enrich_item(r, show_cards) for r in df_serie.sort_values(by='id').to_dict('records')]
            if items: groups.append({"popolo": "", "extra": False, "items": items})
        else:
            if 'popolo' not in df_serie.columns: return []
            popoli = df_serie['popolo'].unique()
            for p in popoli:
                df_p = df_serie[df_serie['popolo'] == p].copy()
                
                if serie_name == 'Magazine':
                    df_p['mag_num'] = df_p['provenienza'].str.extract(r'(\d+)', expand=False).astype(float)
                    df_p['is_new'] = df_p['provenienza'].str.contains('New', case=False, na=False).astype(int)
                    df_p['sort_score'] = df_p['mag_num'] + (df_p['is_new'] * 1000)
                    df_p = df_p.sort_values(by=['sort_score', 'id'], na_position='last')
                else:
                    df_p = df_p.sort_values(by='id')
                
                df_std_view = df_p[df_p['collezione_standard'] == 1]
                if not df_std_view.empty:
                    items = [self._enrich_item(r, show_cards) for r in df_std_view.to_dict('records')]
                    groups.append({"popolo": p, "extra": False, "items": items})

            if show_extras or is_creating_goal:
                df_all_ext = df_serie[df_serie['collezione_standard'] == 0]
                if not df_all_ext.empty:
                    ext_popoli = df_all_ext['popolo'].unique()
                    for p in ext_popoli:
                        df_ext = df_all_ext[df_all_ext['popolo'] == p].copy()
                        
                        if serie_name == 'Magazine':
                            df_ext['mag_num'] = df_ext['provenienza'].str.extract(r'(\d+)', expand=False).astype(float)
                            df_ext['is_new'] = df_ext['provenienza'].str.contains('New', case=False, na=False).astype(int)
                            df_ext['sort_score'] = df_ext['mag_num'] + (df_ext['is_new'] * 1000)
                            df_ext = df_ext.sort_values(by=['sort_score', 'id'], na_position='last')
                        else:
                            df_ext = df_ext.sort_values(by='id')
                        
                        if not df_ext.empty:
                            items = [self._enrich_item(r, show_cards) for r in df_ext.to_dict('records')]
                            groups.append({"popolo": p, "extra": True, "items": items})
        return groups

    def get_serie_progress(self, serie_name, filters=None, is_creating_goal=False):
        if is_creating_goal or self._db.empty: return {"owned": 0, "total": 0, "percent": 0, "is_goal": False}
        
        filters = filters or {}
        show_extras = filters.get("show_extras", True)
        show_cards = filters.get("show_cards", False)
        prov_filter = filters.get("provenienza", "")

        df_target = self._db[self._db['serie'] == serie_name]

        if prov_filter:
            df_target = df_target[df_target['provenienza'].apply(
                lambda x: prov_filter in [p.strip() for p in str(x).split('|')]
            )]

        is_goal_active = self.active_goal != "Nessuno"

        if is_goal_active:
            df_target = self._filter_by_goal(df_target)
            
        if not show_extras:
            df_target = df_target[df_target['collezione_standard'] == 1]

        total, owned = 0, 0

        if is_goal_active:
            target_type = "card" if show_cards else "char"
            relevant_ids = [int(k) for k, v in self.active_goal_data.items() if target_type in v]
            df_relevant = df_target[df_target['id'].isin(relevant_ids)]
            
            if show_cards:
                df_relevant = df_relevant[df_relevant['fronte_carta'].apply(lambda x: str(x).lower() not in ['nan', ''])]
                total = len(df_relevant)
                owned = int((df_relevant['carta_posseduta'] > 0).sum())
            else:
                total = len(df_relevant)
                owned = int((df_relevant['personaggio_posseduto'] > 0).sum())
        else:
            if show_cards:
                df_cards = df_target[df_target['fronte_carta'].apply(lambda x: str(x).lower() not in ['nan', ''])]
                total = len(df_cards)
                owned = int((df_cards['carta_posseduta'] > 0).sum())
            else:
                valid_acc_mask = df_target['nome_ogg'].apply(lambda x: str(x).lower() not in ['nan', ''])
                count_valid_acc = int(valid_acc_mask.sum())
                owned_acc = int(((df_target['accessorio_posseduto'] > 0) & valid_acc_mask).sum())
                total = len(df_target) + count_valid_acc
                owned_chars = int((df_target['personaggio_posseduto'] > 0).sum())
                owned = owned_chars + owned_acc

        perc = (owned / total) if total > 0 else 0
        return {"owned": owned, "total": total, "percent": round(perc * 100), "is_goal": is_goal_active}

    def _enrich_item(self, row_dict, show_cards):
        data = row_to_clean_dict(row_dict)
        if show_cards: img_url = find_media_file("carte", data.get("fronte_carta", ""))
        else:
            img_url = find_media_file("personaggi", data.get("foto", ""))
            if img_url is None: img_url = find_media_file("oggetti", data.get("foto", ""))
        data["_img_url"] = img_url
        return data

    def _is_object_automated(self, row_data):
        if row_data.get('serie') == 'Titanium' and row_data.get('popolo') == 'Oggetto': return False
        prov_str = str(row_data.get('provenienza', ''))
        if not prov_str or prov_str == 'nan': return False
        if self._db.empty: return False
        titanium_names = self._db[(self._db['serie'] == 'Titanium') & (self._db['popolo'] != 'Oggetto')]['nome'].values
        for p in [p.strip() for p in prov_str.split('|')]:
            if p in titanium_names: return True
        return False

    def _get_provenienza_links(self, row_data):
        if row_data.get('serie') != 'Titanium' or row_data.get('popolo') != 'Oggetto':
            return {}
        prov_str = str(row_data.get('provenienza', ''))
        if not prov_str or prov_str == 'nan':
            return {}
        if self._db.empty:
            return {}
        titanium_chars = self._db[
            (self._db['serie'] == 'Titanium') &
            (self._db['popolo'] != 'Oggetto') &
            (self._db['collezione_standard'] == 1)
        ]
        name_to_id = pd.Series(titanium_chars.id.values, index=titanium_chars.nome).to_dict()
        links = {}
        for p in [p.strip() for p in prov_str.split('|')]:
            if p in name_to_id:
                links[p] = int(name_to_id[p])
        return links

    def get_character_detail(self, char_id):
        if self._db.empty: return {}
        df = self._db[self._db['id'] == int(char_id)]
        if df.empty: return {}
        row = df.to_dict('records')[0] 
        data = row_to_clean_dict(row)
        data['is_automated'] = self._is_object_automated(row)
        data['_provenienza_links'] = self._get_provenienza_links(row)

        prev_id = next_id = None
        evo_info = self._evo_map.get(int(char_id))
        if evo_info:
            chain, idx = evo_info["chain"], evo_info["index"]
            if idx > 0: prev_id = chain[idx - 1]
            if idx < len(chain) - 1: next_id = chain[idx + 1]
        data['_evo_prev'] = self._get_evo_neighbor_info(prev_id)
        data['_evo_next'] = self._get_evo_neighbor_info(next_id)

        foto_url = find_media_file("personaggi", data.get("foto", ""))
        if not foto_url: foto_url = find_media_file("oggetti", data.get("foto", "")) 
        data["_foto_url"] = foto_url
        data["_obj_url"] = find_media_file("oggetti", data.get("foto_ogg", ""))
        data["_fronte_url"] = find_media_file("carte", data.get("fronte_carta", ""))
        data["_retro_url"] = find_media_file("carte", data.get("retro_carta", ""))
        for v_col in ['video_rot', 'video_gim1', 'video_gim2', 'video_gim3']:
            data[f"_{v_col}_url"] = find_media_file("video", data.get(v_col, ""))
        return data

    def update_counter(self, item_id, col_name, delta):
        if self._db.empty: return 0
        idx_list = self._db.index[self._db['id'] == int(item_id)].tolist()
        if not idx_list: return 0
        
        first_i = idx_list[0]
        cur = int(self._db.at[first_i, col_name]) if col_name in self._db.columns else 0
        new_v = max(0, cur + delta)
        
        titanium_sync_needed = False
        
        for i in idx_list:
            self._db.at[i, col_name] = new_v
            row = self._db.iloc[i]
            if row['serie'] == 'Titanium' and row['popolo'] == 'Oggetto': 
                self._sync_titanium_reverse(i)
            if row['serie'] == 'Titanium': 
                titanium_sync_needed = True
                
        if titanium_sync_needed:
            self._sync_titanium_objects()
            
        self.trigger_save()
        return int(new_v)

    def update_multiple_counters(self, item_ids, col_name, delta):
        if self._db.empty or not item_ids: return {"success": False}
        changed = False
        titanium_objects_to_sync = False
        
        for item_id in item_ids:
            idx_list = self._db.index[self._db['id'] == int(item_id)].tolist()
            if not idx_list: continue
            
            first_i = idx_list[0]
            cur = int(self._db.at[first_i, col_name]) if col_name in self._db.columns else 0
            new_v = max(0, cur + delta)
            
            for i in idx_list:
                if self._db.at[i, col_name] != new_v:
                    self._db.at[i, col_name] = new_v
                    changed = True
                    
                    row = self._db.iloc[i]
                    if row['serie'] == 'Titanium' and row['popolo'] == 'Oggetto': 
                        self._sync_titanium_reverse(i)
                    if row['serie'] == 'Titanium': 
                        titanium_objects_to_sync = True

        if titanium_objects_to_sync:
            self._sync_titanium_objects()
            
        if changed:
            self.trigger_save()
            
        return {"success": True}

    def _sync_titanium_objects(self):
        if self._db is None or self._db.empty: return
        titanium_chars = self._db[(self._db['serie'] == 'Titanium') & (self._db['popolo'] != 'Oggetto')]
        char_acc_map = pd.Series(titanium_chars.accessorio_posseduto.values, index=titanium_chars.nome).to_dict()
        objects_mask = (self._db['serie'] == 'Titanium') & (self._db['popolo'] == 'Oggetto')
        object_indices = self._db[objects_mask].index
        for idx in object_indices:
            prov_str = str(self._db.at[idx, 'provenienza'])
            if pd.isna(prov_str) or prov_str == 'nan': continue 
            parts = [name.strip() for name in prov_str.split('|')]
            valid_parts = [p for p in parts if p in char_acc_map]
            if valid_parts:
                min_qty = min(char_acc_map[p] for p in valid_parts)
                if self._db.at[idx, 'personaggio_posseduto'] != min_qty: 
                    self._db.at[idx, 'personaggio_posseduto'] = min_qty

    def _sync_titanium_reverse(self, obj_row_index):
        if self._db.empty: return
        obj_row = self._db.iloc[obj_row_index]
        qty = obj_row['personaggio_posseduto'] 
        prov_str = str(obj_row.get('provenienza', ''))
        if not prov_str or prov_str == 'nan': return
        components = [name.strip() for name in prov_str.split('|')]
        for comp_name in components:
            mask = (self._db['serie'] == 'Titanium') & (self._db['nome'] == comp_name)
            target_indices = self._db[mask].index
            for target_idx in target_indices: self._db.at[target_idx, 'accessorio_posseduto'] = qty

def main():
    api = Api()
    window = webview.create_window(
        "Gormiti Census",
        os.path.join(SYSTEM_DIR, "ui", "index.html"),
        js_api=api,
        width=1320,
        height=880,
        min_size=(1000, 680),
        background_color="#1C1410",
        maximized=True,
    )
    api._window = window
    webview.start()

if __name__ == "__main__":
    main()
