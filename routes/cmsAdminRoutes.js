const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const { query, get, run, getSettingsMap, setSetting, hashPassword } = require('../db/database');
const { logActivity, listActivity } = require('../services/activityLog');
const { slugify, csvToArray, boolFrom, hasRole, NOT_DELETED } = require('../services/cmsHelpers');

function requireAdmin(req, res, next) {
  if (!req.session.adminUser) return res.redirect('/admin/login');
  next();
}

function requireRole(minRole) {
  return (req, res, next) => {
    if (!hasRole(req.session.adminUser, minRole)) {
      return res.status(403).send('Insufficient permissions');
    }
    next();
  };
}

async function syncMovieGenres(movieId, genreNames) {
  await run('DELETE FROM movie_genres WHERE movie_id = ?', [movieId]);
  for (const name of genreNames) {
    if (!name) continue;
    let genre = await get('SELECT * FROM genres WHERE name = ?', [name]);
    if (!genre) {
      const gslug = slugify(name);
      const result = await run('INSERT INTO genres (name, slug, movie_count) VALUES (?, ?, 0)', [name, gslug]);
      genre = { id: result.lastID, name, slug: gslug };
    }
    await run('INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)', [movieId, genre.id]);
  }
  const counts = await query(
    `SELECT g.id, COUNT(mg.movie_id) as c FROM genres g LEFT JOIN movie_genres mg ON g.id = mg.genre_id GROUP BY g.id`
  );
  for (const row of counts) {
    await run('UPDATE genres SET movie_count = ? WHERE id = ?', [row.c, row.id]);
  }
}

async function uniqueMovieSlug(base, excludeId) {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = excludeId
      ? await get('SELECT id FROM movies WHERE slug = ? AND id != ?', [candidate, excludeId])
      : await get('SELECT id FROM movies WHERE slug = ?', [candidate]);
    if (!existing) return candidate;
    n += 1;
  }
}

function movieFromBody(body) {
  const genres = csvToArray(body.genres);
  const tags = csvToArray(body.tags);
  const cast = csvToArray(body.cast_members);
  return {
    title: (body.title || '').trim(),
    title_ar: (body.title_ar || '').trim() || null,
    original_title: (body.original_title || '').trim() || null,
    year: parseInt(body.year, 10) || null,
    description: body.description || '',
    duration: parseInt(body.duration, 10) || null,
    language: body.language || 'English',
    country: body.country || null,
    director: body.director || null,
    writer: body.writer || null,
    studio: body.studio || null,
    age_rating: body.age_rating || null,
    rating: body.rating !== '' && body.rating != null ? parseFloat(body.rating) : null,
    poster_url: body.poster_url || null,
    cover_url: body.cover_url || null,
    trailer_url: body.trailer_url || null,
    video_url: body.video_url || null,
    embed_url: body.embed_url || null,
    license_type: body.license_type || 'Public Domain',
    license_url: body.license_url || null,
    attribution_text: body.attribution_text || null,
    status: body.status || 'draft',
    content_type: body.content_type || 'movie',
    featured: boolFrom(body, 'featured') ? 1 : 0,
    trending: boolFrom(body, 'trending') ? 1 : 0,
    popular: boolFrom(body, 'popular') ? 1 : 0,
    is_new: boolFrom(body, 'is_new') ? 1 : 0,
    coming_soon: boolFrom(body, 'coming_soon') ? 1 : 0,
    sort_order: parseInt(body.sort_order, 10) || 0,
    meta_title: body.meta_title || null,
    meta_description: body.meta_description || null,
    meta_keywords: body.meta_keywords || null,
    comments_enabled: boolFrom(body, 'comments_enabled') ? 1 : 0,
    genres,
    tags,
    cast
  };
}

router.get('/movies/new', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const genres = await query('SELECT * FROM genres ORDER BY name ASC');
    res.render('admin/movieForm', { movie: null, genres, formError: null });
  } catch (err) { next(err); }
});

router.post('/movies/new', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const m = movieFromBody(req.body);
    if (!m.title || m.title.length < 2) {
      const genres = await query('SELECT * FROM genres ORDER BY name ASC');
      return res.render('admin/movieForm', { movie: { ...req.body }, genres, formError: 'Title is required (min 2 characters).' });
    }
    const slug = await uniqueMovieSlug(req.body.slug || m.title);
    const extId = 'manual-' + crypto.randomBytes(8).toString('hex');
    const sourceUrl = req.body.source_url || `https://akavox.local/manual/${extId}`;
    const result = await run(
      `INSERT INTO movies (
        external_id, source_url, title, original_title, slug, year, description, duration, language,
        poster_url, video_url, embed_url, director, cast_members, genres, license_type, license_url,
        attribution_text, status, title_ar, country, rating, trailer_url, cover_url, writer, studio,
        age_rating, tags, content_type, featured, trending, popular, is_new, coming_soon, sort_order,
        meta_title, meta_description, meta_keywords, comments_enabled, source_id, source_type
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        extId, sourceUrl, m.title, m.original_title, slug, m.year, m.description, m.duration, m.language,
        m.poster_url, m.video_url, m.embed_url, m.director, JSON.stringify(m.cast), JSON.stringify(m.genres),
        m.license_type, m.license_url, m.attribution_text, m.status, m.title_ar, m.country, m.rating,
        m.trailer_url, m.cover_url, m.writer, m.studio, m.age_rating, JSON.stringify(m.tags), m.content_type,
        m.featured, m.trending, m.popular, m.is_new, m.coming_soon, m.sort_order, m.meta_title,
        m.meta_description, m.meta_keywords, m.comments_enabled, 'manual', 'manual'
      ]
    );
    await syncMovieGenres(result.lastID, m.genres);
    await logActivity(req, 'movie.create', 'movie', result.lastID, m.title);
    res.redirect('/admin/movies');
  } catch (err) { next(err); }
});

router.get('/movies/trash', requireAdmin, async (req, res, next) => {
  try {
    const movies = await query("SELECT * FROM movies WHERE deleted_at IS NOT NULL AND deleted_at != '' ORDER BY deleted_at DESC");
    res.render('admin/moviesTrash', { movies });
  } catch (err) { next(err); }
});

router.post('/movies/:id/restore', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    await run('UPDATE movies SET deleted_at = NULL, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['draft', req.params.id]);
    await logActivity(req, 'movie.restore', 'movie', req.params.id);
    res.redirect('/admin/movies/trash');
  } catch (err) { next(err); }
});

router.post('/movies/:id/force-delete', requireAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    await run('DELETE FROM movie_genres WHERE movie_id = ?', [req.params.id]);
    await run('DELETE FROM movies WHERE id = ?', [req.params.id]);
    await logActivity(req, 'movie.force_delete', 'movie', req.params.id);
    res.redirect('/admin/movies/trash');
  } catch (err) { next(err); }
});

router.post('/movies/bulk', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const ids = [].concat(req.body.ids || []).map((id) => parseInt(id, 10)).filter(Boolean);
    const action = req.body.bulk_action;
    if (!ids.length) return res.redirect('/admin/movies');
    const placeholders = ids.map(() => '?').join(',');
    if (action === 'publish') {
      await run(`UPDATE movies SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
    } else if (action === 'draft') {
      await run(`UPDATE movies SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, ids);
    } else if (action === 'feature') {
      await run(`UPDATE movies SET featured = 1 WHERE id IN (${placeholders})`, ids);
    } else if (action === 'delete') {
      await run(`UPDATE movies SET deleted_at = CURRENT_TIMESTAMP, status = 'draft' WHERE id IN (${placeholders})`, ids);
    } else if (action === 'export') {
      const rows = await query(`SELECT * FROM movies WHERE id IN (${placeholders})`, ids);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="movies-export.json"');
      return res.send(JSON.stringify(rows, null, 2));
    }
    await logActivity(req, 'movie.bulk', 'movie', ids.join(','), action);
    res.redirect('/admin/movies');
  } catch (err) { next(err); }
});

router.get('/categories', requireAdmin, async (req, res, next) => {
  try {
    const genres = await query('SELECT * FROM genres ORDER BY sort_order ASC, name ASC');
    res.render('admin/categories', { genres, successMessage: req.query.saved ? 'Category saved.' : null });
  } catch (err) { next(err); }
});

router.get('/categories/new', requireAdmin, requireRole('editor'), async (req, res) => {
  const parents = await query('SELECT * FROM genres ORDER BY name');
  res.render('admin/categoryForm', { genre: null, parents, formError: null });
});

router.post('/categories/new', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (name.length < 2) {
      const parents = await query('SELECT * FROM genres ORDER BY name');
      return res.render('admin/categoryForm', { genre: req.body, parents, formError: 'Name is required.' });
    }
    const slug = slugify(req.body.slug || name);
    await run(
      `INSERT INTO genres (name, slug, name_ar, description, image_url, sort_order, visible, show_in_nav, show_on_home, parent_id, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, slug, req.body.name_ar || null, req.body.description || null, req.body.image_url || null,
        parseInt(req.body.sort_order, 10) || 0, boolFrom(req.body, 'visible') ? 1 : 0,
        boolFrom(req.body, 'show_in_nav') ? 1 : 0, boolFrom(req.body, 'show_on_home') ? 1 : 0,
        parseInt(req.body.parent_id, 10) || null, req.body.color || null
      ]
    );
    await logActivity(req, 'category.create', 'genre', slug, name);
    res.redirect('/admin/categories?saved=1');
  } catch (err) { next(err); }
});

router.get('/categories/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const genre = await get('SELECT * FROM genres WHERE id = ?', [req.params.id]);
    if (!genre) return res.redirect('/admin/categories');
    const parents = await query('SELECT * FROM genres WHERE id != ? ORDER BY name', [genre.id]);
    const movies = await query(
      `SELECT m.id, m.title, m.year FROM movies m JOIN movie_genres mg ON m.id = mg.movie_id WHERE mg.genre_id = ? AND ${NOT_DELETED} ORDER BY m.title`,
      [genre.id]
    );
    res.render('admin/categoryForm', { genre, parents, movies, formError: null });
  } catch (err) { next(err); }
});

router.post('/categories/:id/edit', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const slug = slugify(req.body.slug || name);
    await run(
      `UPDATE genres SET name=?, slug=?, name_ar=?, description=?, image_url=?, sort_order=?, visible=?, show_in_nav=?, show_on_home=?, parent_id=?, color=? WHERE id=?`,
      [
        name, slug, req.body.name_ar || null, req.body.description || null, req.body.image_url || null,
        parseInt(req.body.sort_order, 10) || 0, boolFrom(req.body, 'visible') ? 1 : 0,
        boolFrom(req.body, 'show_in_nav') ? 1 : 0, boolFrom(req.body, 'show_on_home') ? 1 : 0,
        parseInt(req.body.parent_id, 10) || null, req.body.color || null, req.params.id
      ]
    );
    await logActivity(req, 'category.update', 'genre', req.params.id, name);
    res.redirect('/admin/categories?saved=1');
  } catch (err) { next(err); }
});

router.post('/categories/:id/delete', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const mode = req.body.mode || 'keep';
    const target = parseInt(req.body.move_to, 10);
    const links = await query('SELECT movie_id FROM movie_genres WHERE genre_id = ?', [req.params.id]);
    if (mode === 'move' && target) {
      for (const row of links) {
        await run('INSERT OR IGNORE INTO movie_genres (movie_id, genre_id) VALUES (?, ?)', [row.movie_id, target]);
      }
    }
    if (mode === 'movies') {
      for (const row of links) {
        await run('UPDATE movies SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [row.movie_id]);
      }
    }
    await run('DELETE FROM movie_genres WHERE genre_id = ?', [req.params.id]);
    await run('DELETE FROM genres WHERE id = ?', [req.params.id]);
    await logActivity(req, 'category.delete', 'genre', req.params.id, mode);
    res.redirect('/admin/categories');
  } catch (err) { next(err); }
});

router.post('/categories/reorder', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const order = [].concat(req.body.order || []);
    for (let i = 0; i < order.length; i++) {
      await run('UPDATE genres SET sort_order = ? WHERE id = ?', [i, order[i]]);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/homepage', requireAdmin, async (req, res, next) => {
  try {
    const sections = await query('SELECT * FROM homepage_sections ORDER BY sort_order ASC, id ASC');
    const movies = await query(`SELECT id, title, year, featured, trending FROM movies WHERE ${NOT_DELETED} AND status = 'published' ORDER BY title ASC LIMIT 400`);
    res.render('admin/homepage', {
      sections,
      movies,
      successMessage: req.query.saved ? 'Homepage updated.' : null
    });
  } catch (err) { next(err); }
});

router.post('/homepage/settings', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    await setSetting('homepage_hero_mode', req.body.homepage_hero_mode || 'featured', 'string');
    await setSetting('homepage_hero_limit', parseInt(req.body.homepage_hero_limit, 10) || 1, 'int');
    await logActivity(req, 'homepage.settings', 'homepage', null, req.body.homepage_hero_mode);
    res.redirect('/admin/homepage?saved=1');
  } catch (err) { next(err); }
});

router.post('/homepage/sections', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const key = slugify(req.body.section_key || req.body.title || 'section') + '-' + Date.now().toString(36);
    await run(
      `INSERT INTO homepage_sections (title, section_key, section_type, enabled, sort_order, item_limit, layout, source_mode, filter_flag, filter_genre, movie_ids, custom_html)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.body.title, key, req.body.section_type || 'movies',
        boolFrom(req.body, 'enabled') ? 1 : 0, parseInt(req.body.sort_order, 10) || 99,
        parseInt(req.body.item_limit, 10) || 12, req.body.layout || 'grid',
        req.body.source_mode || 'auto', req.body.filter_flag || 'latest',
        req.body.filter_genre || null, JSON.stringify(csvToArray(req.body.movie_ids)),
        req.body.custom_html || null
      ]
    );
    await logActivity(req, 'homepage.section_create', 'homepage_section', key);
    res.redirect('/admin/homepage?saved=1');
  } catch (err) { next(err); }
});

router.post('/homepage/sections/:id', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    await run(
      `UPDATE homepage_sections SET title=?, enabled=?, sort_order=?, item_limit=?, layout=?, source_mode=?, filter_flag=?, filter_genre=?, movie_ids=?, custom_html=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [
        req.body.title, boolFrom(req.body, 'enabled') ? 1 : 0, parseInt(req.body.sort_order, 10) || 0,
        parseInt(req.body.item_limit, 10) || 12, req.body.layout || 'grid', req.body.source_mode || 'auto',
        req.body.filter_flag || 'latest', req.body.filter_genre || null,
        JSON.stringify([].concat(req.body.movie_ids || [])), req.body.custom_html || null, req.params.id
      ]
    );
    await logActivity(req, 'homepage.section_update', 'homepage_section', req.params.id);
    res.redirect('/admin/homepage?saved=1');
  } catch (err) { next(err); }
});

router.post('/homepage/sections/:id/delete', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    await run('DELETE FROM homepage_sections WHERE id = ?', [req.params.id]);
    await logActivity(req, 'homepage.section_delete', 'homepage_section', req.params.id);
    res.redirect('/admin/homepage');
  } catch (err) { next(err); }
});

router.get('/users', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const users = await query('SELECT id, username, email, role, is_active, last_login, created_at FROM admins ORDER BY id');
    res.render('admin/users', { users, formError: null, successMessage: req.query.saved ? 'User saved.' : null });
  } catch (err) { next(err); }
});

router.post('/users', requireAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    if (username.length < 2 || password.length < 8) {
      const users = await query('SELECT id, username, email, role, is_active, last_login, created_at FROM admins ORDER BY id');
      return res.render('admin/users', { users, formError: 'Username min 2 chars, password min 8.', successMessage: null });
    }
    await run(
      'INSERT INTO admins (username, password_hash, role, email, is_active) VALUES (?, ?, ?, ?, ?)',
      [username, hashPassword(password), req.body.role || 'editor', req.body.email || null, 1]
    );
    await logActivity(req, 'user.create', 'admin', username);
    res.redirect('/admin/users?saved=1');
  } catch (err) { next(err); }
});

router.post('/users/:id', requireAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    const role = req.body.role || 'editor';
    const isActive = boolFrom(req.body, 'is_active') ? 1 : 0;
    if (req.body.password) {
      await run('UPDATE admins SET role=?, email=?, is_active=?, password_hash=? WHERE id=?', [
        role, req.body.email || null, isActive, hashPassword(req.body.password), req.params.id
      ]);
    } else {
      await run('UPDATE admins SET role=?, email=?, is_active=? WHERE id=?', [
        role, req.body.email || null, isActive, req.params.id
      ]);
    }
    await logActivity(req, 'user.update', 'admin', req.params.id);
    res.redirect('/admin/users?saved=1');
  } catch (err) { next(err); }
});

router.post('/users/:id/delete', requireAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    const count = await get('SELECT COUNT(*) as c FROM admins');
    if (count.c <= 1) return res.redirect('/admin/users');
    if (String(req.session.adminUser.id) === String(req.params.id)) return res.redirect('/admin/users');
    await run('DELETE FROM admins WHERE id = ?', [req.params.id]);
    await logActivity(req, 'user.delete', 'admin', req.params.id);
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

router.get('/pages', requireAdmin, async (req, res, next) => {
  try {
    const pages = await query('SELECT * FROM cms_pages ORDER BY sort_order, title');
    res.render('admin/pages', { pages, successMessage: req.query.saved ? 'Page saved.' : null });
  } catch (err) { next(err); }
});

router.get('/pages/new', requireAdmin, requireRole('editor'), (req, res) => {
  res.render('admin/pageForm', { page: null, formError: null });
});

router.post('/pages/new', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const title = (req.body.title || '').trim();
    const slug = slugify(req.body.slug || title);
    await run(
      `INSERT INTO cms_pages (title, slug, content, status, show_in_nav, sort_order, meta_title, meta_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, slug, req.body.content || '', req.body.status || 'published', boolFrom(req.body, 'show_in_nav') ? 1 : 0,
        parseInt(req.body.sort_order, 10) || 0, req.body.meta_title || title, req.body.meta_description || '']
    );
    await logActivity(req, 'page.create', 'cms_page', slug);
    res.redirect('/admin/pages?saved=1');
  } catch (err) { next(err); }
});

router.get('/pages/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const page = await get('SELECT * FROM cms_pages WHERE id = ?', [req.params.id]);
    if (!page) return res.redirect('/admin/pages');
    res.render('admin/pageForm', { page, formError: null });
  } catch (err) { next(err); }
});

router.post('/pages/:id/edit', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const existing = await get('SELECT * FROM cms_pages WHERE id = ?', [req.params.id]);
    const slug = existing.is_system ? existing.slug : slugify(req.body.slug || req.body.title);
    await run(
      `UPDATE cms_pages SET title=?, slug=?, content=?, status=?, show_in_nav=?, sort_order=?, meta_title=?, meta_description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.body.title, slug, req.body.content || '', req.body.status || 'published',
        boolFrom(req.body, 'show_in_nav') ? 1 : 0, parseInt(req.body.sort_order, 10) || 0,
        req.body.meta_title || req.body.title, req.body.meta_description || '', req.params.id]
    );
    await logActivity(req, 'page.update', 'cms_page', req.params.id);
    res.redirect('/admin/pages?saved=1');
  } catch (err) { next(err); }
});

router.post('/pages/:id/delete', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const page = await get('SELECT * FROM cms_pages WHERE id = ?', [req.params.id]);
    if (!page || page.is_system) return res.redirect('/admin/pages');
    await run('DELETE FROM cms_pages WHERE id = ?', [req.params.id]);
    await logActivity(req, 'page.delete', 'cms_page', req.params.id);
    res.redirect('/admin/pages');
  } catch (err) { next(err); }
});

router.get('/media', requireAdmin, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    let files;
    if (q) {
      files = await query('SELECT * FROM media_files WHERE name LIKE ? OR url LIKE ? ORDER BY created_at DESC', [`%${q}%`, `%${q}%`]);
    } else {
      files = await query('SELECT * FROM media_files ORDER BY created_at DESC LIMIT 200');
    }
    res.render('admin/media', { files, searchQuery: q, successMessage: req.query.saved ? 'Media saved.' : null });
  } catch (err) { next(err); }
});

router.post('/media', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    const url = (req.body.url || '').trim();
    const name = (req.body.name || url).trim();
    if (!url) return res.redirect('/admin/media');
    await run('INSERT INTO media_files (name, url, media_type, used_in) VALUES (?, ?, ?, ?)', [
      name, url, req.body.media_type || 'image', req.body.used_in || null
    ]);
    await logActivity(req, 'media.create', 'media', url, name);
    res.redirect('/admin/media?saved=1');
  } catch (err) { next(err); }
});

router.post('/media/:id/delete', requireAdmin, requireRole('editor'), async (req, res, next) => {
  try {
    await run('DELETE FROM media_files WHERE id = ?', [req.params.id]);
    await logActivity(req, 'media.delete', 'media', req.params.id);
    res.redirect('/admin/media');
  } catch (err) { next(err); }
});

router.get('/activity', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 40;
    const { rows, total } = await listActivity(limit, (page - 1) * limit, { q: req.query.q, action: req.query.action });
    res.render('admin/activity', {
      logs: rows,
      searchQuery: req.query.q || '',
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (err) { next(err); }
});

router.post('/activity/clear', requireAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    await run('DELETE FROM activity_logs');
    await logActivity(req, 'logs.clear', 'activity_logs', null);
    res.redirect('/admin/activity');
  } catch (err) { next(err); }
});

router.get('/backup', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const movieCount = await get('SELECT COUNT(*) as c FROM movies');
    res.render('admin/backup', { movieCount: movieCount ? movieCount.c : 0, successMessage: null });
  } catch (err) { next(err); }
});

router.get('/backup/export/:type', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const type = req.params.type;
    let data;
    if (type === 'movies') data = await query('SELECT * FROM movies');
    else if (type === 'categories') data = await query('SELECT * FROM genres');
    else if (type === 'settings') data = await query('SELECT * FROM settings');
    else if (type === 'all') {
      data = {
        movies: await query('SELECT * FROM movies'),
        genres: await query('SELECT * FROM genres'),
        settings: await query('SELECT * FROM settings'),
        pages: await query('SELECT * FROM cms_pages'),
        sections: await query('SELECT * FROM homepage_sections')
      };
    } else {
      return res.redirect('/admin/backup');
    }
    await logActivity(req, 'backup.export', 'backup', type);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="akavox-${type}-${Date.now()}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) { next(err); }
});

router.get('/backup/database', requireAdmin, requireRole('super_admin'), async (req, res, next) => {
  try {
    const dbPath = process.env.AKAVOX_DB_PATH || path.join(__dirname, '..', 'db', 'akavox.db');
    if (!fs.existsSync(dbPath)) return res.redirect('/admin/backup');
    await logActivity(req, 'backup.database', 'backup', 'sqlite');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="akavox-${Date.now()}.db"`);
    fs.createReadStream(dbPath).pipe(res);
  } catch (err) { next(err); }
});

router.get('/analytics', requireAdmin, async (req, res, next) => {
  try {
    const topMovies = await query(`SELECT id, title, year, view_count, slug FROM movies WHERE ${NOT_DELETED} ORDER BY view_count DESC LIMIT 10`);
    const recentMovies = await query(`SELECT id, title, year, status, created_at FROM movies WHERE ${NOT_DELETED} ORDER BY created_at DESC LIMIT 8`);
    const byGenre = await query('SELECT name, movie_count FROM genres ORDER BY movie_count DESC LIMIT 12');
    const byYear = await query(`SELECT year, COUNT(*) as c FROM movies WHERE ${NOT_DELETED} AND year IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 20`);
    const missingPoster = await get(`SELECT COUNT(*) as c FROM movies WHERE ${NOT_DELETED} AND (poster_url IS NULL OR poster_url = '')`);
    res.render('admin/analytics', { topMovies, recentMovies, byGenre, byYear, missingPoster: missingPoster ? missingPoster.c : 0 });
  } catch (err) { next(err); }
});

router.get('/settings/social', requireAdmin, (req, res) => {
  res.render('admin/settingsSocial', { successMessage: req.query.saved ? 'Social links saved.' : null });
});

router.post('/settings/social', requireAdmin, requireRole('admin'), async (req, res, next) => {
  try {
    const keys = ['social_facebook', 'social_twitter', 'social_instagram', 'social_youtube', 'social_tiktok', 'social_telegram'];
    for (const key of keys) {
      await setSetting(key, req.body[key] || '', 'string');
    }
    await logActivity(req, 'settings.social', 'settings');
    res.redirect('/admin/settings/social?saved=1');
  } catch (err) { next(err); }
});

router.get('/api/dashboard/stats', requireAdmin, async (req, res, next) => {
  try {
    const total = await get(`SELECT COUNT(*) as c FROM movies WHERE ${NOT_DELETED}`);
    const published = await get(`SELECT COUNT(*) as c FROM movies WHERE ${NOT_DELETED} AND status = 'published'`);
    const genres = await get('SELECT COUNT(*) as c FROM genres');
    res.json({
      success: true,
      data: {
        movies: total ? total.c : 0,
        published: published ? published.c : 0,
        genres: genres ? genres.c : 0
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.movieFromBody = movieFromBody;
module.exports.syncMovieGenres = syncMovieGenres;
module.exports.uniqueMovieSlug = uniqueMovieSlug;
module.exports.NOT_DELETED = NOT_DELETED;
