const express = require('express');
const router = express.Router();
const { query, get, getSettingsMap } = require('../db/database');
const SeoService = require('../services/seoService');

// Middleware to load siteSettings on all public requests
router.use(async (req, res, next) => {
  try {
    res.locals.siteSettings = await getSettingsMap();
    next();
  } catch (err) {
    next(err);
  }
});

// 1. Homepage
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = res.locals.siteSettings.items_per_page || 12;
    const offset = (page - 1) * limit;

    const totalRow = await get("SELECT COUNT(*) as c FROM movies WHERE status = 'published'");
    const totalMovies = totalRow.c;
    const totalPages = Math.ceil(totalMovies / limit) || 1;

    const movies = await query(
      "SELECT * FROM movies WHERE status = 'published' ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    // Featured classic movie (highest view count or first prominent)
    const featuredMovie = await get(
      "SELECT * FROM movies WHERE status = 'published' AND poster_url IS NOT NULL ORDER BY year ASC LIMIT 1"
    );

    // Active genres with counts
    const genres = await query(
      "SELECT * FROM genres WHERE movie_count > 0 ORDER BY movie_count DESC LIMIT 15"
    );

    // Years distribution
    const years = await query(
      "SELECT year, COUNT(*) as count FROM movies WHERE status = 'published' AND year IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 12"
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pageTitle = `${res.locals.siteSettings.site_name} - ${res.locals.siteSettings.site_tagline}`;
    const metaDescription = res.locals.siteSettings.site_description;

    res.render('public/index', {
      pageTitle,
      metaDescription,
      canonicalUrl: `${baseUrl}/`,
      ogType: 'website',
      ogImage: res.locals.siteSettings.seo_default_og_image,
      activeNav: 'home',
      movies,
      featuredMovie,
      genres,
      years,
      totalMovies,
      currentPage: page,
      totalPages
    });
  } catch (err) {
    next(err);
  }
});

// 2. Movie Detail Page (/movie/:slug)
router.get('/movie/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const movie = await get('SELECT * FROM movies WHERE slug = ?', [slug]);

    if (!movie) {
      return res.status(404).render('public/search', {
        pageTitle: 'Movie Not Found | CineArchive',
        metaDescription: 'The requested film could not be found.',
        canonicalUrl: '',
        searchQuery: slug.replace(/-/g, ' '),
        selectedGenre: '',
        selectedYear: '',
        movies: [],
        genres: await query('SELECT * FROM genres WHERE movie_count > 0 ORDER BY movie_count DESC'),
        years: await query('SELECT DISTINCT year FROM movies WHERE year IS NOT NULL ORDER BY year DESC'),
        totalCount: 0,
        currentPage: 1,
        totalPages: 1,
        breadcrumbs: [{ name: 'Movies', url: '/search' }, { name: 'Not Found', url: '#' }]
      });
    }

    // Increment view count asynchronously
    query('UPDATE movies SET view_count = view_count + 1 WHERE id = ?', [movie.id]).catch(() => {});

    // Parse genres for related query and breadcrumbs
    let gList = [];
    try {
      gList = Array.isArray(movie.genres) ? movie.genres : JSON.parse(movie.genres || '[]');
    } catch (e) { gList = ['Classic']; }
    const primaryGenre = gList[0] || 'Classic';

    // Related movies (same genre or nearby year)
    const relatedMovies = await query(
      `SELECT * FROM movies 
       WHERE id != ? AND status = 'published' AND (genres LIKE ? OR year = ?) 
       ORDER BY RANDOM() LIMIT 4`,
      [movie.id, `%${primaryGenre}%`, movie.year]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pageTitle = SeoService.generateMovieTitle(movie, res.locals.siteSettings.site_name);
    const metaDescription = SeoService.generateMovieDescription(movie, res.locals.siteSettings.site_name);
    const jsonLdSchema = SeoService.generateMovieSchema(movie, baseUrl);

    const breadcrumbs = [
      { name: 'Movies', url: '/search' },
      { name: primaryGenre, url: `/genre/${primaryGenre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` },
      { name: movie.title, url: `/movie/${movie.slug}` }
    ];

    res.render('public/movie', {
      movie,
      relatedMovies,
      pageTitle,
      metaDescription,
      canonicalUrl: `${baseUrl}/movie/${movie.slug}`,
      ogType: 'video.movie',
      ogImage: movie.poster_url || res.locals.siteSettings.seo_default_og_image,
      jsonLdSchema,
      breadcrumbs,
      activeNav: 'movies'
    });
  } catch (err) {
    next(err);
  }
});

// 3. Genre Pages (/genre/:slug)
router.get('/genre/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const genre = await get('SELECT * FROM genres WHERE slug = ?', [slug]);

    if (!genre) {
      return res.redirect('/search?genre=' + encodeURIComponent(slug));
    }

    const sort = req.query.sort || 'latest';
    let orderBy = 'm.created_at DESC';
    if (sort === 'year_desc') orderBy = 'm.year DESC, m.created_at DESC';
    else if (sort === 'year_asc') orderBy = 'm.year ASC, m.created_at DESC';
    else if (sort === 'title') orderBy = 'm.title ASC';

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = res.locals.siteSettings.items_per_page || 12;
    const offset = (page - 1) * limit;

    const countRow = await get(
      `SELECT COUNT(*) as c FROM movies m
       JOIN movie_genres mg ON m.id = mg.movie_id
       WHERE mg.genre_id = ? AND m.status = 'published'`,
      [genre.id]
    );
    const totalCount = countRow.c;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const movies = await query(
      `SELECT m.* FROM movies m
       JOIN movie_genres mg ON m.id = mg.movie_id
       WHERE mg.genre_id = ? AND m.status = 'published'
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [genre.id, limit, offset]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pageTitle = `${genre.name} Classic Movies - Free Legal Streaming | ${res.locals.siteSettings.site_name}`;
    const metaDescription = `Watch free classic ${genre.name} movies in the public domain. Legally preserved and streaming at ${res.locals.siteSettings.site_name}.`;

    const breadcrumbs = [
      { name: 'Genres', url: '/search' },
      { name: genre.name, url: `/genre/${genre.slug}` }
    ];

    res.render('public/genre', {
      genre,
      movies,
      totalCount,
      sort,
      currentPage: page,
      totalPages,
      pageTitle,
      metaDescription,
      canonicalUrl: `${baseUrl}/genre/${genre.slug}`,
      breadcrumbs,
      activeNav: 'genres'
    });
  } catch (err) {
    next(err);
  }
});

// 4. Year Pages (/year/:year)
router.get('/year/:year', async (req, res, next) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 1880 || year > 2050) {
      return res.redirect('/');
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = res.locals.siteSettings.items_per_page || 12;
    const offset = (page - 1) * limit;

    const countRow = await get(
      "SELECT COUNT(*) as c FROM movies WHERE year = ? AND status = 'published'",
      [year]
    );
    const totalCount = countRow.c;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const movies = await query(
      "SELECT * FROM movies WHERE year = ? AND status = 'published' ORDER BY title ASC LIMIT ? OFFSET ?",
      [year, limit, offset]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pageTitle = `Classic Movies from ${year} - Public Domain Cinema | ${res.locals.siteSettings.site_name}`;
    const metaDescription = `Browse classic public domain and Creative Commons films released in ${year}. Stream online legally on ${res.locals.siteSettings.site_name}.`;

    const breadcrumbs = [
      { name: 'Years', url: '/search' },
      { name: String(year), url: `/year/${year}` }
    ];

    res.render('public/year', {
      year,
      movies,
      totalCount,
      currentPage: page,
      totalPages,
      pageTitle,
      metaDescription,
      canonicalUrl: `${baseUrl}/year/${year}`,
      breadcrumbs,
      activeNav: 'movies'
    });
  } catch (err) {
    next(err);
  }
});

// 5. Search Page (/search)
router.get('/search', async (req, res, next) => {
  try {
    const searchQuery = (req.query.q || '').trim();
    const selectedGenre = (req.query.genre || '').trim().toLowerCase();
    const selectedYear = parseInt(req.query.year, 10) || '';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = res.locals.siteSettings.items_per_page || 12;
    const offset = (page - 1) * limit;

    let whereClauses = ["status = 'published'"];
    let params = [];

    if (searchQuery) {
      whereClauses.push("(title LIKE ? OR description LIKE ? OR director LIKE ? OR cast_members LIKE ? OR original_title LIKE ?)");
      const term = `%${searchQuery}%`;
      params.push(term, term, term, term, term);
    }

    if (selectedGenre) {
      whereClauses.push("genres LIKE ?");
      params.push(`%${selectedGenre}%`);
    }

    if (selectedYear) {
      whereClauses.push("year = ?");
      params.push(selectedYear);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = await get(`SELECT COUNT(*) as c FROM movies WHERE ${whereSql}`, params);
    const totalCount = countRow ? countRow.c : 0;
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const movies = await query(
      `SELECT * FROM movies WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const genres = await query("SELECT * FROM genres WHERE movie_count > 0 ORDER BY movie_count DESC");
    const years = await query("SELECT DISTINCT year FROM movies WHERE status = 'published' AND year IS NOT NULL ORDER BY year DESC");

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pageTitle = searchQuery 
      ? `Search: "${searchQuery}" - Classic Public Domain Movies | ${res.locals.siteSettings.site_name}`
      : `Browse All Classic Movies - Public Domain Catalog | ${res.locals.siteSettings.site_name}`;
    const metaDescription = `Search across hundreds of verified legal public domain classic films, silent movies, and vintage cinematic art.`;

    const breadcrumbs = [
      { name: 'Catalog', url: '/search' },
      { name: searchQuery ? `Search: ${searchQuery}` : 'All Movies', url: '/search' }
    ];

    res.render('public/search', {
      searchQuery,
      selectedGenre,
      selectedYear,
      movies,
      genres,
      years,
      totalCount,
      currentPage: page,
      totalPages,
      pageTitle,
      metaDescription,
      canonicalUrl: `${baseUrl}/search${searchQuery ? '?q=' + encodeURIComponent(searchQuery) : ''}`,
      breadcrumbs,
      activeNav: 'movies'
    });
  } catch (err) {
    next(err);
  }
});

// 6. Static Pages: About, Contact, Privacy, Terms, Sitemap
router.get('/about', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('public/about', {
    pageTitle: `About Our Legal Mission & Archives | ${res.locals.siteSettings.site_name}`,
    metaDescription: 'Learn about our legal compliance engine, public domain verification, and attribution to the Internet Archive.',
    canonicalUrl: `${baseUrl}/about`,
    breadcrumbs: [{ name: 'About', url: '/about' }],
    activeNav: 'about'
  });
});

router.get('/contact', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('public/contact', {
    pageTitle: `DMCA Takedown & Contact Office | ${res.locals.siteSettings.site_name}`,
    metaDescription: 'Contact our copyright compliance officer or submit inquiries regarding public domain licenses and DMCA procedures.',
    canonicalUrl: `${baseUrl}/contact`,
    breadcrumbs: [{ name: 'Contact & DMCA', url: '/contact' }],
    activeNav: 'contact',
    submitted: req.query.submitted === '1'
  });
});

router.post('/contact', (req, res) => {
  console.log('[Contact Submission]', req.body);
  res.redirect('/contact?submitted=1');
});

router.get('/privacy-policy', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('public/privacy', {
    pageTitle: `Privacy Policy | ${res.locals.siteSettings.site_name}`,
    metaDescription: 'Privacy policy and advertising cookie disclosures for CineArchive.',
    canonicalUrl: `${baseUrl}/privacy-policy`,
    breadcrumbs: [{ name: 'Privacy Policy', url: '/privacy-policy' }],
    activeNav: ''
  });
});

router.get('/terms-of-service', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.render('public/terms', {
    pageTitle: `Terms of Service | ${res.locals.siteSettings.site_name}`,
    metaDescription: 'Terms of service and public domain cultural heritage disclaimers for CineArchive.',
    canonicalUrl: `${baseUrl}/terms-of-service`,
    breadcrumbs: [{ name: 'Terms of Service', url: '/terms-of-service' }],
    activeNav: ''
  });
});

router.get('/sitemap', async (req, res, next) => {
  try {
    const movies = await query("SELECT title, slug, year FROM movies WHERE status = 'published' ORDER BY title ASC");
    const genres = await query("SELECT name, slug, movie_count FROM genres WHERE movie_count > 0 ORDER BY name ASC");
    const years = await query("SELECT year, COUNT(*) as count FROM movies WHERE status = 'published' AND year IS NOT NULL GROUP BY year ORDER BY year DESC");

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.render('public/sitemap', {
      movies,
      genres,
      years,
      pageTitle: `HTML Sitemap | ${res.locals.siteSettings.site_name}`,
      metaDescription: 'Full index of all public domain movies, genres, and release years.',
      canonicalUrl: `${baseUrl}/sitemap`,
      breadcrumbs: [{ name: 'Sitemap', url: '/sitemap' }],
      activeNav: ''
    });
  } catch (err) {
    next(err);
  }
});

// 7. Dynamic XML Sitemap (/sitemap.xml)
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const xml = await SeoService.generateXmlSitemap(baseUrl);
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

// 8. Robots.txt
router.get('/robots.txt', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.header('Content-Type', 'text/plain');
  res.send(SeoService.generateRobotsTxt(baseUrl));
});

module.exports = router;
