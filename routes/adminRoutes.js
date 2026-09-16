const express = require('express');
const router = express.Router();
const { query, get, run, getSettingsMap, setSetting, hashPassword } = require('../db/database');
const scheduler = require('../services/scheduler');
const movieImporter = require('../services/importer');

// Global middleware for admin routes
router.use(async (req, res, next) => {
  res.locals.adminUser = req.session.adminUser || null;
  res.locals.siteSettings = await getSettingsMap();
  res.locals.schedulerState = scheduler.getState();
  next();
});

// Auth Guard
function requireAdmin(req, res, next) {
  if (!req.session.adminUser) {
    return res.redirect('/admin/login');
  }
  next();
}

// 1. Admin Login & Logout
router.get('/login', (req, res) => {
  if (req.session.adminUser) {
    return res.redirect('/admin');
  }
  res.render('admin/login', { errorMessage: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const hash = hashPassword(password || '');
  const admin = await get('SELECT * FROM admins WHERE username = ? AND password_hash = ?', [username, hash]);

  if (admin) {
    req.session.adminUser = { id: admin.id, username: admin.username };
    return res.redirect('/admin');
  } else {
    res.render('admin/login', { errorMessage: 'Invalid username or password' });
  }
});

router.get('/logout', (req, res) => {
  req.session.adminUser = null;
  res.redirect('/admin/login');
});

// 2. Admin Dashboard Overview
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const totalRow = await get('SELECT COUNT(*) as c FROM movies');
    const publishedRow = await get("SELECT COUNT(*) as c FROM movies WHERE status = 'published'");
    const draftRow = await get("SELECT COUNT(*) as c FROM movies WHERE status = 'draft'");
    const new24hRow = await get("SELECT COUNT(*) as c FROM movies WHERE created_at >= datetime('now', '-1 day')");

    const totalsLog = await get(`
      SELECT 
        SUM(items_imported) as total_imported,
        SUM(items_skipped) as total_skipped,
        SUM(items_failed) as total_failed,
        SUM(license_rejections) as total_license_rejections,
        SUM(duplicate_rejections) as total_duplicate_rejections,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_jobs
      FROM import_logs
    `);

    const lastLog = await get('SELECT * FROM import_logs ORDER BY started_at DESC LIMIT 1');
    const recentLogs = await query('SELECT * FROM import_logs ORDER BY started_at DESC LIMIT 5');

    const stats = {
      totalMovies: totalRow ? totalRow.c : 0,
      publishedCount: publishedRow ? publishedRow.c : 0,
      draftCount: draftRow ? draftRow.c : 0,
      new24h: new24hRow ? new24hRow.c : 0,
      totalImportedAllTime: totalsLog ? (totalsLog.total_imported || 0) : 0,
      totalSkipped: totalsLog ? (totalsLog.total_skipped || 0) : 0,
      totalFailed: totalsLog ? (totalsLog.total_failed || 0) : 0,
      totalLicenseRejections: totalsLog ? (totalsLog.total_license_rejections || 0) : 0,
      totalDuplicateRejections: totalsLog ? (totalsLog.total_duplicate_rejections || 0) : 0,
      successfulImportJobs: totalsLog ? (totalsLog.successful_jobs || 0) : 0
    };

    res.render('admin/dashboard', {
      stats,
      lastLog,
      recentLogs
    });
  } catch (err) {
    next(err);
  }
});

// 3. Movies Management Library
router.get('/movies', requireAdmin, async (req, res, next) => {
  try {
    const statusFilter = req.query.status || 'all';
    const searchQuery = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];

    if (statusFilter !== 'all') {
      whereClauses.push('status = ?');
      params.push(statusFilter);
    }

    if (searchQuery) {
      whereClauses.push('(title LIKE ? OR director LIKE ? OR external_id LIKE ?)');
      const term = `%${searchQuery}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await get(`SELECT COUNT(*) as c FROM movies ${whereSql}`, params);
    const totalCount = countRow ? countRow.c : 0;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const movies = await query(
      `SELECT * FROM movies ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const counts = {
      all: (await get('SELECT COUNT(*) as c FROM movies')).c,
      published: (await get("SELECT COUNT(*) as c FROM movies WHERE status = 'published'")).c,
      draft: (await get("SELECT COUNT(*) as c FROM movies WHERE status = 'draft'")).c
    };

    res.render('admin/movies', {
      movies,
      statusFilter,
      searchQuery,
      currentPage: page,
      totalPages,
      counts
    });
  } catch (err) {
    next(err);
  }
});

// Edit Movie Form (GET)
router.get('/movies/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const movie = await get('SELECT * FROM movies WHERE id = ?', [req.params.id]);
    if (!movie) return res.redirect('/admin/movies');
    res.render('admin/movieEdit', { movie });
  } catch (err) {
    next(err);
  }
});

// Edit Movie Form (POST)
router.post('/movies/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const { title, year, slug, description, director, duration, status, license_type, poster_url, embed_url, attribution_text } = req.body;
    await run(
      `UPDATE movies SET 
        title = ?, year = ?, slug = ?, description = ?, director = ?,
        duration = ?, status = ?, license_type = ?, poster_url = ?,
        embed_url = ?, attribution_text = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title,
        parseInt(year, 10) || null,
        slug,
        description,
        director,
        parseInt(duration, 10) || null,
        status,
        license_type,
        poster_url,
        embed_url,
        attribution_text,
        req.params.id
      ]
    );
    res.redirect('/admin/movies');
  } catch (err) {
    next(err);
  }
});

// Toggle publish / draft status
router.post('/movies/:id/toggle-status', requireAdmin, async (req, res, next) => {
  try {
    const movie = await get('SELECT status FROM movies WHERE id = ?', [req.params.id]);
    if (movie) {
      const newStatus = movie.status === 'published' ? 'draft' : 'published';
      await run('UPDATE movies SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, req.params.id]);
    }
    res.redirect('back');
  } catch (err) {
    next(err);
  }
});

// Delete Movie
router.post('/movies/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM movies WHERE id = ?', [req.params.id]);
    res.redirect('/admin/movies');
  } catch (err) {
    next(err);
  }
});

// 4. Import Audit Logs
router.get('/logs', requireAdmin, async (req, res, next) => {
  try {
    const logs = await query('SELECT * FROM import_logs ORDER BY started_at DESC LIMIT 50');
    res.render('admin/logs', { logs });
  } catch (err) {
    next(err);
  }
});

// 5. Failed Items Management
router.get('/failed', requireAdmin, async (req, res, next) => {
  try {
    const items = await query('SELECT * FROM failed_items ORDER BY created_at DESC LIMIT 100');
    res.render('admin/failed', { items });
  } catch (err) {
    next(err);
  }
});

router.post('/failed/:id/toggle-ignore', requireAdmin, async (req, res, next) => {
  try {
    const item = await get('SELECT permanently_ignored FROM failed_items WHERE id = ?', [req.params.id]);
    if (item) {
      const newIgnored = item.permanently_ignored ? 0 : 1;
      await run('UPDATE failed_items SET permanently_ignored = ? WHERE id = ?', [newIgnored, req.params.id]);
    }
    res.redirect('/admin/failed');
  } catch (err) {
    next(err);
  }
});

router.post('/failed/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM failed_items WHERE id = ?', [req.params.id]);
    res.redirect('/admin/failed');
  } catch (err) {
    next(err);
  }
});

// 6. Settings - Source
router.get('/settings/sources', requireAdmin, (req, res) => {
  res.render('admin/settingsSources', { successMessage: req.query.saved ? 'Source settings successfully saved.' : null });
});

router.post('/settings/sources', requireAdmin, async (req, res, next) => {
  try {
    await setSetting('archive_search_collections', req.body.archive_search_collections, 'string');
    await setSetting('archive_rows_per_import', parseInt(req.body.archive_rows_per_import, 10) || 15, 'int');
    await setSetting('import_frequency_hours', parseInt(req.body.import_frequency_hours, 10) || 6, 'int');
    await setSetting('archive_sort_order', req.body.archive_sort_order, 'string');
    await setSetting('scheduler_enabled', req.body.scheduler_enabled === 'true', 'boolean');

    // Restart scheduler with new configuration
    await scheduler.start();

    res.redirect('/admin/settings/sources?saved=1');
  } catch (err) {
    next(err);
  }
});

// 7. Settings - License Rules
router.get('/settings/license', requireAdmin, (req, res) => {
  res.render('admin/settingsLicense', { successMessage: req.query.saved ? 'License compliance rules updated successfully.' : null });
});

router.post('/settings/license', requireAdmin, async (req, res, next) => {
  try {
    await setSetting('license_allow_public_domain', req.body.license_allow_public_domain === 'true', 'boolean');
    await setSetting('license_allow_cc0', req.body.license_allow_cc0 === 'true', 'boolean');
    await setSetting('license_allow_cc_by', req.body.license_allow_cc_by === 'true', 'boolean');
    await setSetting('license_allow_cc_by_sa', req.body.license_allow_cc_by_sa === 'true', 'boolean');
    await setSetting('public_domain_cutoff_year', parseInt(req.body.public_domain_cutoff_year, 10) || 1929, 'int');

    res.redirect('/admin/settings/license?saved=1');
  } catch (err) {
    next(err);
  }
});

// 8. Settings - SEO
router.get('/settings/seo', requireAdmin, (req, res) => {
  res.render('admin/settingsSeo', { successMessage: req.query.saved ? 'SEO settings updated.' : null });
});

router.post('/settings/seo', requireAdmin, async (req, res, next) => {
  try {
    await setSetting('seo_title_template', req.body.seo_title_template, 'string');
    await setSetting('seo_meta_template', req.body.seo_meta_template, 'string');
    await setSetting('seo_default_og_image', req.body.seo_default_og_image, 'string');

    res.redirect('/admin/settings/seo?saved=1');
  } catch (err) {
    next(err);
  }
});

// 9. Settings - Ads
router.get('/settings/ads', requireAdmin, (req, res) => {
  res.render('admin/settingsAds', { successMessage: req.query.saved ? 'Ad slots configuration saved.' : null });
});

router.post('/settings/ads', requireAdmin, async (req, res, next) => {
  try {
    await setSetting('ad_header_enabled', req.body.ad_header_enabled === 'true', 'boolean');
    await setSetting('ad_header_code', req.body.ad_header_code || '', 'string');
    await setSetting('ad_sidebar_enabled', req.body.ad_sidebar_enabled === 'true', 'boolean');
    await setSetting('ad_sidebar_code', req.body.ad_sidebar_code || '', 'string');
    await setSetting('ad_incontent_enabled', req.body.ad_incontent_enabled === 'true', 'boolean');
    await setSetting('ad_incontent_code', req.body.ad_incontent_code || '', 'string');
    await setSetting('ad_footer_enabled', req.body.ad_footer_enabled === 'true', 'boolean');
    await setSetting('ad_footer_code', req.body.ad_footer_code || '', 'string');

    res.redirect('/admin/settings/ads?saved=1');
  } catch (err) {
    next(err);
  }
});

// 10. Settings - General
router.get('/settings/general', requireAdmin, (req, res) => {
  res.render('admin/settingsGeneral', { successMessage: req.query.saved ? 'General settings saved.' : null });
});

router.post('/settings/general', requireAdmin, async (req, res, next) => {
  try {
    await setSetting('site_name', req.body.site_name, 'string');
    await setSetting('site_tagline', req.body.site_tagline, 'string');
    await setSetting('site_description', req.body.site_description, 'string');
    await setSetting('contact_email', req.body.contact_email, 'string');
    await setSetting('dmca_agent', req.body.dmca_agent, 'string');
    await setSetting('items_per_page', parseInt(req.body.items_per_page, 10) || 12, 'int');
    await setSetting('site_url', req.body.site_url, 'string');
    await setSetting('auto_publish', req.body.auto_publish === 'true', 'boolean');

    res.redirect('/admin/settings/general?saved=1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
