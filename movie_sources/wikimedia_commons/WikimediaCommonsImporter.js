/**
 * WikimediaCommonsImporter — concrete source wired together.
 * Fully modular: implementing the same spec is all a future source needs.
 */

const BaseImporter = require('../base/BaseImporter');
const WikimediaFetcher = require('./WikimediaFetcher');
const WikimediaParser = require('./WikimediaParser');
const WikimediaLicenseChecker = require('./WikimediaLicenseChecker');
const WikimediaValidator = require('./WikimediaValidator');
const WikimediaDuplicateChecker = require('./WikimediaDuplicateChecker');
const { getSetting } = require('../../db/database');

class WikimediaCommonsImporter extends BaseImporter {
  constructor() {
    const fetcher = new WikimediaFetcher();
    super({
      key: 'wikimedia_commons',
      name: 'Wikimedia Commons',
      sourceType: 'external',
      sourceId: 'wikimedia_commons',
      fetcher,
      parser: new WikimediaParser(),
      licenseChecker: new WikimediaLicenseChecker(),
      validator: new WikimediaValidator({ minDurationSeconds: 60 }),
      duplicateChecker: new WikimediaDuplicateChecker(),
      loadSettings: async () => {
        const queriesRaw = (await getSetting('commons_search_queries', 'incategory:"Videos of films in the public domain"')) || '';
        const offsetsRaw = (await getSetting('commons_query_offsets', null)) || {};
        return {
          queries: queriesRaw.split('|').map(q => q.trim()).filter(Boolean),
          offsets: typeof offsetsRaw === 'object' ? offsetsRaw : {},
          batchSize: parseInt(await getSetting('commons_batch_size', 10), 10) || 10,
          minDurationSeconds: parseInt(await getSetting('commons_min_duration_seconds', 180), 10) || 60,
          rateDelayMs: parseInt(await getSetting('commons_rate_delay_ms', 500), 10) || 500,
          autoPublish: await getSetting('auto_publish', true),
          frequencyHours: parseInt(await getSetting('source_import_frequency_hours', 6), 10) || 6,
          licenseSettings: {
            allowPublicDomain: await getSetting('license_allow_public_domain', true),
            allowCc0: await getSetting('license_allow_cc0', true),
            allowCcBy: await getSetting('license_allow_cc_by', true),
            allowCcBySa: await getSetting('license_allow_cc_by_sa', true)
          }
        };
      },
      meta: {
        officialUrl: 'https://commons.wikimedia.org',
        licensePolicyUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing',
        apiDocsUrl: 'https://www.mediawiki.org/wiki/API:Main_page',
        termsOfServiceUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
        apiUsagePolicyUrl: 'https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines',
        sourceValidationDoc: 'docs/SOURCE_VALIDATION_wikimedia_commons.md',
        description: 'Free-license media repository operated by the Wikimedia Foundation. Hosts ONLY public-domain and freely licensed files (NC/ND licenses are banned platform-wide). Every item is still verified individually at import time.'
      }
    });

    // Keep the validator's minimum duration in sync with admin settings
    this._syncValidatorOptions = async () => {
      const minDuration = parseInt(await getSetting('commons_min_duration_seconds', 180), 10) || 60;
      this.validator.minDurationSeconds = minDuration;
    };
    const originalRun = this.run.bind(this);
    this.run = async (opts) => {
      await this._syncValidatorOptions();
      const rateDelay = parseInt(await getSetting('commons_rate_delay_ms', 500), 10) || 500;
      this.fetcher.rateLimitDelayMs = rateDelay;
      return originalRun(opts);
    };
  }
}

module.exports = WikimediaCommonsImporter;
