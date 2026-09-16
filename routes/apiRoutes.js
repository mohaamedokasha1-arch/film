const express = require('express');
const router = express.Router();
const movieImporter = require('../services/importer');
const scheduler = require('../services/scheduler');
const { getSettingsMap } = require('../db/database');

// Health check endpoint
router.get('/health', async (req, res) => {
  const schedulerState = scheduler.getState();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: schedulerState,
    uptime: process.uptime()
  });
});

// Server-Sent Events (SSE) for Real-Time Live Import Console
router.get('/admin/import/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'ping', time: new Date().toISOString() })}\n\n`);

  const unsubscribe = movieImporter.addLogListener((logEvent) => {
    res.write(`data: ${JSON.stringify(logEvent)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});

// Trigger immediate manual import
router.post('/admin/import/trigger', async (req, res) => {
  // If user is not authenticated in session, check header or session
  if (!req.session.adminUser) {
    return res.status(401).json({ status: 'unauthorized', message: 'Authentication required' });
  }

  if (movieImporter.isImportRunning) {
    return res.status(409).json({ status: 'busy', message: 'An import process is already executing.' });
  }

  // Trigger import in background and return immediate acceptance
  const rows = parseInt(req.body.rows, 10) || null;
  const page = parseInt(req.body.page, 10) || 1;

  movieImporter.runImport({ rows, page, trigger: 'manual_admin' })
    .then(result => {
      console.log('[API Manual Import Finished]', result);
    })
    .catch(err => {
      console.error('[API Manual Import Error]', err);
    });

  res.json({ status: 'started', message: 'Import cycle launched successfully' });
});

module.exports = router;
