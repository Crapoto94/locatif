// Utilitaires HTTP/SQL communs : pagination, tri sûr, validation légère, constructeur de SET.
const httpError = (status, message) => Object.assign(new Error(message), { status });

function pageParams(q, { max = 200, def = 25 } = {}) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), max);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  return { limit, offset };
}

// Tri : seule une valeur de la liste blanche est acceptée (jamais concaténer une entrée libre).
function orderBy(q, allowed, def) {
  const col = allowed[String(q.sort || '')] || def;
  const dir = String(q.dir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  return `${col} ${dir} NULLS LAST`;
}

// Filtre dynamique : ajoute les conditions et les paramètres positionnels.
function whereBuilder() {
  const conds = []; const params = [];
  return {
    add(sql, value) { params.push(value); conds.push(sql.replace(/\?/g, `$${params.length}`)); },
    addRaw(sql) { conds.push(sql); },
    clause: () => (conds.length ? `WHERE ${conds.join(' AND ')}` : ''),
    params,
  };
}

// Construit "col1=$1, col2=$2" pour les seuls champs autorisés présents dans body.
function setClause(body, allowed, startIndex = 1) {
  const cols = []; const vals = [];
  for (const f of allowed) {
    if (body[f] === undefined) continue;
    vals.push(body[f] === '' ? null : body[f]);
    cols.push(`${f} = $${startIndex + vals.length - 1}`);
  }
  return { sql: cols.join(', '), vals, fields: cols.length ? allowed.filter((f) => body[f] !== undefined) : [] };
}

function insertParts(body, allowed) {
  const fields = allowed.filter((f) => body[f] !== undefined);
  return {
    fields,
    cols: fields.join(', '),
    placeholders: fields.map((_, i) => `$${i + 1}`).join(', '),
    vals: fields.map((f) => (body[f] === '' ? null : body[f])),
  };
}

const isoDate = (v) => (v ? String(v).slice(0, 10) : null);
const like = (s) => `%${String(s).trim().replace(/[%_\\]/g, '\\$&')}%`;

module.exports = { httpError, pageParams, orderBy, whereBuilder, setClause, insertParts, isoDate, like };
