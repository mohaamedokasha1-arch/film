/**
 * Automated Scheduler for CineArchive
 * Periodically executes import jobs based on configurable intervals.
 */

const { getSetting } = require('../db/database');
const movieImporter = require('./importer');

class Scheduler {
  constructor() {
    this.timer = null;
    this.isRunning = false;
    this.nextRunTimestamp = null;
    this.lastRunTimestamp = null;
    this.currentPage = 1;
  }

  /**
   * Starts or reconfigures the automated scheduler
   */
  async start() {
    this.stop();

    const enabled = await getSetting('scheduler_enabled', true);
    if (!enabled) {
      console.log('⏳ Automated Scheduler is disabled in settings.');
      this.isRunning = false;
      this.nextRunTimestamp = null;
      return;
    }

    const frequencyHours = Math.max(1, await getSetting('import_frequency_hours', 6));
    const intervalMs = frequencyHours * 60 * 60 * 1000;

    this.isRunning = true;
    this.nextRunTimestamp = new Date(Date.now() + intervalMs).toISOString();

    console.log(`⏰ Scheduler active: Running every ${frequencyHours} hour(s). Next run at: ${this.nextRunTimestamp}`);

    this.timer = setInterval(async () => {
      await this.executeJob();
    }, intervalMs);
  }

  /**
   * Stops the active scheduler timer
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Executes scheduled job
   */
  async executeJob() {
    console.log(`[Scheduler] 🚀 Automated import job triggered. Page: ${this.currentPage}`);
    this.lastRunTimestamp = new Date().toISOString();

    try {
      const result = await movieImporter.runImport({
        page: this.currentPage,
        trigger: 'scheduler'
      });
      console.log('[Scheduler] Job finished:', result.status, `Imported: ${result.itemsImported}`);

      // Increment page for next run to discover deeper archive items
      this.currentPage = (this.currentPage % 20) + 1;
    } catch (err) {
      console.error('[Scheduler] Error executing scheduled job:', err.message);
    }

    const frequencyHours = Math.max(1, await getSetting('import_frequency_hours', 6));
    this.nextRunTimestamp = new Date(Date.now() + frequencyHours * 3600 * 1000).toISOString();
  }

  /**
   * Returns current scheduler state
   */
  getState() {
    return {
      isRunning: this.isRunning,
      nextRun: this.nextRunTimestamp,
      lastRun: this.lastRunTimestamp,
      currentPage: this.currentPage,
      isImportActive: movieImporter.isImportRunning
    };
  }
}

const schedulerInstance = new Scheduler();
module.exports = schedulerInstance;
