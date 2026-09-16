/**
 * Movie Sources bootstrap — the ONE place where sources are registered.
 *
 * Architecture (per source):
 *   movie_sources/<source_key>/
 *     ├── Fetcher        (official API/feed client)
 *     ├── Parser         (raw → normalized candidate)
 *     ├── LicenseChecker (STRICT per-item legal gate)
 *     ├── Validator      (data quality)
 *     └── Importer       (wires the pipeline via BaseImporter)
 *
 * Adding Source #3+: create the folder, implement the five collaborators,
 * then register the importer below. Nothing else in the codebase changes.
 */

const SourceRegistry = require('./base/SourceRegistry');
const legacySourceDescriptor = require('./legacy_source/legacySourceDescriptor');
const { WikimediaCommonsImporter } = require('./wikimedia_commons');
const { LocImporter } = require('./loc_national_screening_room');

const registry = new SourceRegistry();

// LEGACY source (pre-existing Internet Archive pipeline) — read-only descriptor
registry.registerLegacy(legacySourceDescriptor);

// EXTERNAL sources (new, independently operating)
registry.register(new WikimediaCommonsImporter());
registry.register(new LocImporter());

module.exports = registry;
