const { run, query, get } = require('../db/database');

async function logActivity(req, action, entityType, entityId, details) {
  try {
    const admin = (req && req.session && req.session.adminUser) || {};
    await run(
      `INSERT INTO activity_logs (admin_id, username, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        admin.id || null,
        admin.username || 'system',
        action,
        entityType || null,
        entityId != null ? String(entityId) : null,
        details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        req && req.ip ? req.ip : null,
        req && req.get ? String(req.get('user-agent') || '').slice(0, 250) : null
      ]
    );
  } catch (err) {
    console.warn('activity log failed:', err.message);
  }
}

async function listActivity(limit = 100, offset = 0, filters = {}) {
  const where = [];
  const params = [];
  if (filters.q) {
    where.push('(username LIKE ? OR action LIKE ? OR details LIKE ?)');
    const t = `%${filters.q}%`;
    params.push(t, t, t);
  }
  if (filters.action) {
    where.push('action = ?');
    params.push(filters.action);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRow = await get(`SELECT COUNT(*) as c FROM activity_logs ${sqlWhere}`, params);
  const rows = await query(
    `SELECT * FROM activity_logs ${sqlWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { rows, total: countRow ? countRow.c : 0 };
}

module.exports = { logActivity, listActivity };
