const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const { initDb, get, query } = require('./db/database');
const scheduler = require('./services/scheduler');
const movieImporter = require('./services/importer');

const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Session handling
app.use(cookieSession({
  name: 'cinearchive_session',
  keys: [process.env.SESSION_SECRET || 'cinearchive_super_secret_key_2026'],
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
}));

// API Routes
app.use('/api', apiRoutes);

// Admin Routes
app.use('/admin', adminRoutes);

// Public Routes
app.use('/', publicRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('public/search', {
    pageTitle: 'Page Not Found (404) | CineArchive',
    metaDescription: 'The requested page could not be found.',
    canonicalUrl: '',
    searchQuery: '',
    selectedGenre: '',
    selectedYear: '',
    movies: [],
    genres: [],
    years: [],
    totalCount: 0,
    currentPage: 1,
    totalPages: 1,
    breadcrumbs: [{ name: '404 Not Found', url: '#' }],
    activeNav: ''
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled Server Error:', err);
  res.status(500).send(`
    <!DOCTYPE html>
    <html>
      <head><title>System Notice - CineArchive</title><link rel="stylesheet" href="/css/styles.css"></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0b0e14;color:#fff;font-family:sans-serif;text-align:center;">
        <div>
          <h1 style="color:#f59e0b;font-size:2rem;margin-bottom:1rem;">Temporarily Processing Request</h1>
          <p style="color:#9ca3af;margin-bottom:1.5rem;">The requested action encountered an internal condition. Please try again shortly.</p>
          <a href="/" class="btn btn-primary" style="display:inline-block;padding:0.6rem 1.2rem;background:#f59e0b;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;">Return Home</a>
        </div>
      </body>
    </html>
  `);
});

// Start Server & Ingestion Engine
async function bootstrap() {
  try {
    console.log('🚀 Initializing CineArchive System...');
    await initDb();

    // Check if initial seed is needed (if fewer than 8 movies in DB)
    const countRow = await get('SELECT COUNT(*) as c FROM movies');
    if (countRow.c < 8) {
      console.log('🌱 Database has fewer than 8 movies. Running initial legal seed batch from Internet Archive...');
      await movieImporter.runImport({ rows: 15, page: 1, trigger: 'system_bootstrap' });
    }

    // Start background automated scheduler
    await scheduler.start();

    app.listen(PORT, HOST, () => {
      console.log(`=======================================================`);
      console.log(`🎬 CineArchive Platform is LIVE!`);
      console.log(`🌐 Public Website : http://${HOST}:${PORT}`);
      console.log(`🔐 Admin Panel    : http://${HOST}:${PORT}/admin`);
      console.log(`🔑 Credentials    : admin / admin123`);
      console.log(`📡 Ingestion Engine: Connected to Internet Archive`);
      console.log(`⏰ Scheduler       : Automated every 6h`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('❌ Failed to start CineArchive server:', err);
    process.exit(1);
  }
}

bootstrap();
