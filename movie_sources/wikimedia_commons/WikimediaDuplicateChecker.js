/**
 * Wikimedia Commons DuplicateChecker — shared dedupe rules (external_id,
 * source_url, title+year across sources) with same-source-only enrichment
 * safety, inherited from the base implementation.
 */

const BaseDuplicateChecker = require('../base/BaseDuplicateChecker');

class WikimediaDuplicateChecker extends BaseDuplicateChecker {}

module.exports = WikimediaDuplicateChecker;
