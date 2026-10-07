// Adaptateur Alfresco (API REST publique v1) : dépôt dans un dossier racine, nouvelles versions via
// PUT /content, lecture via GET /content. Clé de stockage : alf:<nodeId>.
const axios = require('axios');

const API = '/alfresco/api/-default-/public/alfresco/versions/1';
const safeName = (n) => String(n || 'fichier').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120);

function create(c) {
  if (!c.alfresco_url) throw new Error('URL Alfresco non renseignée');
  const http = axios.create({
    baseURL: c.alfresco_url.replace(/\/$/, ''), timeout: 30000,
    auth: { username: c.alfresco_login || '', password: c.password || '' },
    maxBodyLength: Infinity, maxContentLength: Infinity,
  });
  const explain = (e) => {
    const s = e.response?.status;
    if (s === 401 || s === 403) return 'identifiants refusés par Alfresco';
    if (s === 404) return 'ressource introuvable (URL ou dossier racine erroné)';
    if (e.code === 'ECONNABORTED') return 'délai dépassé';
    if (!s) return `serveur injoignable (${e.code || e.message})`;
    return `HTTP ${s} ${e.response?.data?.error?.briefSummary || ''}`.trim();
  };
  const wrap = async (fn) => { try { return await fn(); } catch (e) { throw new Error(`Alfresco : ${explain(e)}`); } };

  // Racine : identifiant de nœud (UUID) ou chemin relatif à « Company Home » / « -root- ».
  async function rootId() {
    const r = c.alfresco_root || '-root-';
    if (/^[0-9a-f-]{36}$/i.test(r)) return r;
    if (r === '-root-') return r;
    const { data } = await http.get(`${API}/nodes/-root-`, { params: { relativePath: r.replace(/^\/+/, '') } });
    return data.entry.id;
  }
  async function childFolder(parentId, name) {
    const n = safeName(name);
    try {
      const { data } = await http.get(`${API}/nodes/${parentId}`, { params: { relativePath: n } });
      return data.entry.id;
    } catch (e) {
      if (e.response?.status !== 404) throw e;
      const { data } = await http.post(`${API}/nodes/${parentId}/children`, { name: n, nodeType: 'cm:folder' });
      return data.entry.id;
    }
  }
  async function ensurePath(folder) {
    let id = await rootId();
    for (const seg of String(folder || '').split(/[\\/]+/).filter(Boolean)) id = await childFolder(id, seg);
    return id;
  }

  return {
    prefix: 'alf',
    async put({ buffer, nom, folder, mime, replaceKey }) {
      return wrap(async () => {
        if (replaceKey) { // nouvelle version du même nœud, jamais de doublon
          const id = replaceKey.slice(4);
          await http.put(`${API}/nodes/${id}/content`, buffer, { params: { majorVersion: true }, headers: { 'Content-Type': mime || 'application/octet-stream' } });
          return { key: replaceKey };
        }
        const parent = await ensurePath(folder);
        const form = new FormData();
        form.append('filedata', new Blob([buffer], { type: mime || 'application/octet-stream' }), safeName(nom));
        form.append('name', safeName(nom));
        form.append('autoRename', 'true');
        const { data } = await http.post(`${API}/nodes/${parent}/children`, form);
        return { key: `alf:${data.entry.id}` };
      });
    },
    async get(key) {
      return wrap(async () => {
        const { data } = await http.get(`${API}/nodes/${key.slice(4)}/content`, { responseType: 'arraybuffer' });
        return { buffer: Buffer.from(data) };
      });
    },
    async remove(key) { return wrap(() => http.delete(`${API}/nodes/${key.slice(4)}`)); },
    async test() {
      return wrap(async () => {
        const { data } = await axios.get(`${c.alfresco_url.replace(/\/$/, '')}/alfresco/api/discovery`, {
          timeout: 15000, auth: { username: c.alfresco_login || '', password: c.password || '' } });
        const v = data?.entry?.repository?.version?.display || data?.entry?.repository?.id || 'version inconnue';
        const id = await rootId();
        return { message: `Alfresco joint (${v}), dossier racine trouvé (${id})` };
      });
    },
    async browse(rel) {
      return wrap(async () => {
        let id = await rootId();
        for (const seg of String(rel || '').split(/[\\/]+/).filter(Boolean)) id = await childFolder(id, seg);
        const { data } = await http.get(`${API}/nodes/${id}/children`, { params: { maxItems: 200 } });
        return data.list.entries.map(({ entry: e }) => ({ nom: e.name, dossier: e.isFolder, taille: e.content?.sizeInBytes ?? null, modifie: e.modifiedAt }));
      });
    },
  };
}

module.exports = { create };
