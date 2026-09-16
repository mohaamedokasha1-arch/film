const BaseImporter = require('../base/BaseImporter');
const LocFetcher = require('./LocFetcher');
const LocParser = require('./LocParser');
const LocLicenseChecker = require('./LocLicenseChecker');
const LocValidator = require('./LocValidator');
const LocDuplicateChecker = require('./LocDuplicateChecker');
const { getSetting } = require('../../db/database');

class LocImporter extends BaseImporter {
  constructor() {
    const fetcher = new LocFetcher();
    super({
      key: 'loc_national_screening_room',
      name: 'Library of Congress (National Screening Room)',
      sourceType: 'external',
      sourceId: 'loc_national_screening_room',
      fetcher,
      parser: new LocParser(),
      licenseChecker: new LocLicenseChecker(),
      validator: new LocValidator({ minDurationSeconds: 20 }),
      duplicateChecker: new LocDuplicateChecker(),
      loadSettings: async () => {
        const collectionsRaw = await getSetting('loc_collections', 'national-screening-room');
        return {
          collections: String(collectionsRaw || 'national-screening-room').split('|').map((s) => s.trim()).filter(Boolean),
          page: parseInt(await getSetting('loc_page', 1), 10) || 1,
          batchSize: parseInt(await getSetting('loc_batch_size', 8), 10) || 8,
          minDurationSeconds: parseInt(await getSetting('loc_min_duration_seconds', 20), 10) || 20,
          rateDelayMs: parseInt(await getSetting('loc_rate_delay_ms', 700), 10) || 700,
          autoPublish: await getSetting('auto_publish', true),
          frequencyHours: parseInt(await getSetting('source_import_frequency_hours', 6), 10) || 6,
          licenseSettings: {
            allowPublicDomain: await getSetting('license_allow_public_domain', true),
            allowCc0: await getSetting('license_allow_cc0', true),
            allowCcBy: await getSetting('license_allow_cc_by', true),
            allowCcBySa: await getSetting('license_allow_cc_by_sa', true),
            publicDomainCutoffYear: parseInt(await getSetting('public_domain_cutoff_year', 1929), 10) || 1929
          }
        };
      },
      meta: {
        officialUrl: 'https://www.loc.gov/collections/national-screening-room/',
        licensePolicyUrl: 'https://www.loc.gov/legal/',
        apiDocsUrl: 'https://www.loc.gov/apis/json-and-yaml/',
        termsOfServiceUrl: 'https://www.loc.gov/legal/',
        sourceValidationDoc: 'docs/SOURCE_VALIDATION_loc_national_screening_room.md',
        description: 'Official Library of Congress JSON API over the National Screening Room. Per-item rights check; stream from tile.loc.gov; no file rehosting.'
      }
    });

    const originalRun = this.run.bind(this);
    this.run = async (opts) => {
      const minDuration = parseInt(await getSetting('loc_min_duration_seconds', 20), 10) || 20;
      this.validator.minDurationSeconds = minDuration;
      this.fetcher.rateLimitDelayMs = parseInt(await getSetting('loc_rate_delay_ms', 700), 10) || 700;
      const cutoff = parseInt(await getSetting('public_domain_cutoff_year', 1929), 10) || 1929;
      this.licenseChecker = new LocLicenseChecker({
        allowPublicDomain: await getSetting('license_allow_public_domain', true),
        allowCc0: await getSetting('license_allow_cc0', true),
        allowCcBy: await getSetting('license_allow_cc_by', true),
        allowCcBySa: await getSetting('license_allow_cc_by_sa', true),
        publicDomainCutoffYear: cutoff
      });
      return originalRun(opts);
    };
  }
}

module.exports = LocImporter;
