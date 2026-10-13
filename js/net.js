// Dış API çağrıları için ortak fetch: isteğe bağlı ara sunucu (proxy) ve anlaşılır bağlantı hataları.
// Bazı servisler (ör. OpenCode Go) tarayıcıdan doğrudan isteğe izin vermez (CORS);
// o zaman istek, kullanıcının kurduğu ara sunucu üzerinden gider: <proxy>/<tam adres>.

let proxyBase = '';

export function setProxy(url) {
  proxyBase = String(url || '').trim().replace(/\/+$/, '');
}

export function hasProxy() {
  return !!proxyBase;
}

export async function apiFetch(url, options, label) {
  const target = proxyBase ? `${proxyBase}/${url}` : url;
  try {
    return await fetch(target, options);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    const where = label || new URL(url).host;
    const err = new Error(
      proxyBase
        ? `${where}: ara sunucuya bağlanılamadı (${e.message}). Ayarlar’daki ara sunucu adresini kontrol edin.`
        : `${where}: bağlantı kurulamadı (${e.message}). Bu servis tarayıcıdan doğrudan erişime izin vermiyor olabilir; Ayarlar → Bağlantı bölümünden ara sunucu ekleyin.`,
    );
    err.network = true;
    throw err;
  }
}
