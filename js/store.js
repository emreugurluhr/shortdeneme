// Ayarlar (localStorage) ve proje kaydı (IndexedDB; ses dosyaları dahil).

const SETTINGS_KEY = 'shorts-atolyesi:settings';

export const DEFAULT_SETTINGS = {
  elevenKey: '',
  voiceId: 'DpEiQMnL9WxMsymCsjPY',
  modelId: 'eleven_v4',
  stability: 0.5,
  // yapay zekâ: seçili sağlayıcı + her sağlayıcı için <id>Key / <id>Model / <id>Base
  provider: 'claude',
  maxSfx: 6,
  ambience: true,
  captions: true,
  captionWords: 3,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch (_) {
    return false;
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shorts-atolyesi', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('projects');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(project) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project, 'current');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {
    /* kayıt yapılamazsa proje sadece bu oturumda kalır */
  }
}

export async function loadProject() {
  try {
    const db = await openDB();
    const p = await new Promise((resolve, reject) => {
      const req = db.transaction('projects').objectStore('projects').get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return p;
  } catch (_) {
    return null;
  }
}
