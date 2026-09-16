function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'item';
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return String(value).split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function csvToArray(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function boolFrom(body, key) {
  const v = body[key];
  return v === 'true' || v === 'on' || v === '1' || v === true;
}

const ROLE_RANK = {
  moderator: 1,
  editor: 2,
  admin: 3,
  super_admin: 4
};

function hasRole(user, minRole) {
  if (!user) return false;
  const rank = ROLE_RANK[user.role] || ROLE_RANK.super_admin;
  return rank >= (ROLE_RANK[minRole] || 0);
}

const NOT_DELETED = "(deleted_at IS NULL OR deleted_at = '')";

module.exports = {
  slugify,
  parseJsonArray,
  csvToArray,
  boolFrom,
  hasRole,
  ROLE_RANK,
  NOT_DELETED
};
