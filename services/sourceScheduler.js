/**
 * Multi-Source Import Scheduler
 * ------------------------------------------------------------------
 * Runs every registered (enabled) external movie source on a fixed cadence.
 * This scheduler is ADDITIVE: the pre-existing legacy scheduler
 * (services/scheduler.js → Internet Archive) keeps running completely
 * untouched on its own timer. This module only drives movie_sources/*.
 *
 * Defaults to every 6 hours (matches the platform's automation standard),
 * configurable via the `source_import_frequency_hours` setting, with an
 * overlap guard so a slow run can never stack on top of the previous one.
 */

const { getSetting } = require('../db/database');
const registry = require('../movie_sources');

class SourceScheduler {
  constructor() {
    this.timer = null;
    this.isRunningTick = false;
    this.nextRunAt = null;
    this.lastRunAt = null;
  }

  async start() {
    this.stop();
    const enabled = await getSetting('source_scheduler_enabled', true);
    if (!enabled) {
      console.log('⏳ Multi-source scheduler is disabled in settings.');
      return;
    }

    const hours = Math.max(1, parseInt(await getSetting('source_import_frequency_hours', 6), 10) || 6);
    const intervalMs = hours * 3600 * 1000;

    this.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    console.log(`⏰ Multi-source scheduler active: Wikimedia Commons + future sources every ${hours}h. Next: ${this.nextRunAt}`);

    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error('[SourceScheduler] tick error:', err.message));
    }, intervalMs);

    // Do NOT block server startup; keep a handle so the timer stays alive.
    if (this.timer.unref) this.timer.ref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
  }

  async tick(trigger = 'scheduler') {
    if (this.isRunningTick) {
      console.log('[SourceScheduler] Previous cycle still running — skipping (overlap guard).');
      return;
    }
    this.isRunningTick = true;
    this.lastRunAt = new Date().toISOString();
    try {
      console.log('[SourceScheduler] 🚀 Running all enabled external movie sources…');
      const results = await registry.runAllEnabled(trigger);
      for (const r of results) {
        console.log(`[SourceScheduler] ${r.source}: ${r.status} — imported ${r.itemsImported}, rejected ${r.itemsRejected}, duplicates ${r.itemsDuplicate}`);
      }
    } finally {
      this.isRunningTick = false;
      const hours = Math.max(1, parseInt(await getSetting('source_import_frequency_hours', 6), 10) || 6);
      this.nextRunAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    }
  }

  getState() {
    return {
      active: !!this.timer,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      cycleRunning: this.isRunningTick
    };
  }
}

module.exports = new SourceScheduler();
