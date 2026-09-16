/**
 * Movie Sources Manager — NEW additive admin routes.
 * Mounted at /admin/movie-sources (see server.js). No existing route or
 * endpoint is modified. Auth follows the same cookie-session guard as the
 * rest of the admin panel.
 */

const express = require('express');
const router = express.Router();
const { query, get, run, getSettingsMap, setSetting } = require('../db/database');
const registry = require('../movie_sources');
const sourceScheduler = require('../services/sourceScheduler');

// Same admin guard + view locals as the legacy admin router (self-contained)
router.use(async (req, res, next) => {
  res.locals.adminUser = req.session.adminUser || null;
  res.locals.siteSettings = await getSettingsMap();
  res.locals.schedulerState = sourceScheduler.getState();
  next();
});

function requireAdmin(req, res, next) {
  if (!req.session.adminUser) {
    return res.redirect('/admin/login');
  }
  next();
}

/* ------------------------------------------------------------------ */
/* 1. Sources Manager overview                                         */
/* ------------------------------------------------------------------ */
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const sources = await registry.listAll();
    res.render('admin/sources/sourcesManager', { sources, schedulerState: sourceScheduler.getState() });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/* 2. Configure a source                                               */
/* ------------------------------------------------------------------ */
router.get('/:key/configure', requireAdmin, async (req, res, next) => {
  try {
    const importer = registry.get(req.params.key);
    if (!importer) return res.redirect('/admin/movie-sources');
    const settings = await getSettingsMap();
    res.render('admin/sources/sourcesConfigure', {
      sourceKey: importer.key,
      sourceName: importer.name,
      meta: importer.meta,
      settings,
      successMessage: req.query.saved ? 'Source configuration saved.' : null
    });
  } catch (err) { next(err); }
});

router.post('/:key/configure', requireAdmin, async (req, res, next) => {
  try {
    if (req.params.key === 'wikimedia_commons') {
      await setSetting('commons_search_queries', req.body.commons_search_queries || '', 'string');
      await setSetting('commons_batch_size', parseInt(req.body.commons_batch_size, 10) || 10, 'int');
      await setSetting('commons_min_duration_seconds', parseInt(req.body.commons_min_duration_seconds, 10) || 60, 'int');
      await setSetting('commons_rate_delay_ms', parseInt(req.body.commons_rate_delay_ms, 10) || 500, 'int');
      await setSetting('source_import_frequency_hours', parseInt(req.body.source_import_frequency_hours, 10) || 6, 'int');
      await setSetting('source_scheduler_enabled', req.body.source_scheduler_enabled === 'true', 'boolean');
      await sourceScheduler.start();
    } else if (req.params.key === 'loc_national_screening_room') {
      await setSetting('loc_collections', req.body.loc_collections || 'national-screening-room', 'string');
      await setSetting('loc_batch_size', parseInt(req.body.loc_batch_size, 10) || 8, 'int');
      await setSetting('loc_min_duration_seconds', parseInt(req.body.loc_min_duration_seconds, 10) || 20, 'int');
      await setSetting('loc_rate_delay_ms', parseInt(req.body.loc_rate_delay_ms, 10) || 700, 'int');
      await setSetting('source_import_frequency_hours', parseInt(req.body.source_import_frequency_hours, 10) || 6, 'int');
      await setSetting('source_scheduler_enabled', req.body.source_scheduler_enabled === 'true', 'boolean');
      await sourceScheduler.start();
    }
    res.redirect(`/admin/movie-sources/${req.params.key}/configure?saved=1`);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/* 3. Enable / disable a source (legacy source is NOT modifiable)      */
/* ------------------------------------------------------------------ */
router.post('/:key/toggle', requireAdmin, async (req, res, next) => {
  try {
    const importer = registry.get(req.params.key);
    if (!importer) return res.redirect('/admin/movie-sources');
    const row = await get('SELECT enabled FROM movie_sources WHERE source_key = ?', [req.params.key]);
    await registry.setEnabled(req.params.key, !(row && row.enabled));
    res.redirect('/admin/movie-sources');
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/* 4. Import logs (filter by source / status / date range)             */
/* ------------------------------------------------------------------ */
router.get('/logs', requireAdmin, async (req, res, next) => {
  try {
    const { source, status, from, to } = req.query;
    const where = [];
    const params = [];

    if (source && source !== 'all') { where.push('source_name = ?'); params.push(source); }
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (from) { where.push('started_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { where.push('started_at <= ?'); params.push(to + ' 23:59:59'); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const logs = await query(`SELECT * FROM import_logs ${whereSql} ORDER BY started_at DESC LIMIT 100`, params);
    const sourceNames = await query('SELECT DISTINCT source_name FROM import_logs ORDER BY source_name');

    res.render('admin/sources/sourcesLogs', { logs, sourceNames, filters: { source: source || 'all', status: status || 'all', from: from || '', to: to || '' } });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/* 5. Rejected items log                                               */
/* ------------------------------------------------------------------ */
router.get('/rejected', requireAdmin, async (req, res, next) => {
  try {
    const source = req.query.source || 'all';
    const params = [];
    let whereSql = '';
    if (source !== 'all') { whereSql = 'WHERE source_name = ?'; params.push(source); }
    const items = await query(`SELECT * FROM rejected_items ${whereSql} ORDER BY rejected_at DESC LIMIT 200`, params);
    const sourceNames = await query('SELECT DISTINCT source_name FROM rejected_items ORDER BY source_name');
    res.render('admin/sources/sourcesRejected', { items, sourceNames, sourceFilter: source });
  } catch (err) { next(err); }
});

router.post('/rejected/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM rejected_items WHERE id = ?', [req.params.id]);
    res.redirect('/admin/movie-sources/rejected');
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/* 6. JSON API — status, connection test, manual run, SSE live stream  */
/* ------------------------------------------------------------------ */
router.get('/api/status', requireAdmin, async (req, res) => {
  const sources = await registry.listAll();
  res.json({
    scheduler: sourceScheduler.getState(),
    runningSource: registry.isAnyExternalRunning(),
    sources
  });
});

router.post('/api/test/:key', requireAdmin, async (req, res) => {
  const importer = registry.get(req.params.key);
  if (!importer) return res.status(404).json({ ok: false, detail: 'Unknown source' });
  const result = await importer.fetcher.testConnection();
  await registry.setConnectionStatus(importer.key, result.ok ? `OK: ${result.detail}` : `FAILED: ${result.detail}`);
  res.json(result);
});

router.post('/api/run/:key', requireAdmin, async (req, res) => {
  const importer = registry.get(req.params.key);
  if (!importer) return res.status(404).json({ status: 'unknown', message: 'Unknown source' });
  if (importer.isRunning || registry.isAnyExternalRunning()) {
    return res.status(409).json({ status: 'busy', message: 'Another import is already running.' });
  }
  const limit = parseInt(req.body.limit, 10) || null;
  importer.run({ limit, trigger: 'manual_admin' })
    .then((result) => console.log('[MovieSources] Manual run finished:', result))
    .catch((err) => console.error('[MovieSources] Manual run error:', err));
  res.json({ status: 'started', message: `Import for ${importer.name} launched — watch the live console below.` });
});

// Server-Sent Events live console for new-source imports
router.get('/api/stream', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'ping', time: new Date().toISOString() })}\n\n`);

  const unsubs = [];
  for (const importer of registry.sources.values()) {
    unsubs.push(importer.addLogListener((ev) => {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }));
  }
  req.on('close', () => unsubs.forEach((u) => u()));
});

module.exports = router;
