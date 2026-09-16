// Default settings for AKAVOX (أكافوكس)
// Official brand name (EN): AKAVOX | Brand name (AR): أكافوكس
module.exports = [
  { key: 'site_name', value: 'AKAVOX', type: 'string' },
  { key: 'site_tagline', value: 'Timeless Public Domain & Legal Classic Cinema', type: 'string' },
  { key: 'site_description', value: 'Stream thousands of verified legal, public domain, and Creative Commons classic movies, silent masterworks, film noir, vintage comedies, and historical treasures. 100% free and open culture.', type: 'string' },
  { key: 'site_url', value: 'http://localhost:3000', type: 'string' },
  { key: 'contact_email', value: 'legal@akavox.org', type: 'string' },
  { key: 'dmca_agent', value: 'Copyright & Compliance Officer, AKAVOX Open Cultural Project', type: 'string' },
  { key: 'items_per_page', value: '12', type: 'int' },
  { key: 'auto_publish', value: 'true', type: 'boolean' },
  { key: 'scheduler_enabled', value: 'true', type: 'boolean' },
  { key: 'import_frequency_hours', value: '6', type: 'int' },
  { key: 'last_successful_import', value: '', type: 'string' },
  { key: 'archive_search_collections', value: 'feature_films,silent_films,Comedy_Films,classic_tv,scifi_horror', type: 'string' },
  { key: 'archive_rows_per_import', value: '15', type: 'int' },
  { key: 'archive_sort_order', value: 'downloads desc', type: 'string' },

  // Multi-Source System (NEW — Wikimedia Commons external source; additive)
  { key: 'commons_enabled', value: 'true', type: 'boolean' },
  { key: 'commons_search_queries', value: 'incategory:"Videos of films in the public domain"|incategory:"Films from Archive.org"|incategory:"Films by Georges Méliès"|incategory:"Films by Charlie Chaplin"', type: 'string' },
  { key: 'commons_batch_size', value: '10', type: 'int' },
  { key: 'commons_min_duration_seconds', value: '180', type: 'int' },
  { key: 'commons_rate_delay_ms', value: '500', type: 'int' },
  { key: 'commons_query_offsets', value: '{}', type: 'json' },
  { key: 'source_scheduler_enabled', value: 'true', type: 'boolean' },
  { key: 'source_import_frequency_hours', value: '6', type: 'int' },
  
  // Strict License Rules
  { key: 'license_allow_public_domain', value: 'true', type: 'boolean' },
  { key: 'license_allow_cc0', value: 'true', type: 'boolean' },
  { key: 'license_allow_cc_by', value: 'true', type: 'boolean' },
  { key: 'license_allow_cc_by_sa', value: 'true', type: 'boolean' },
  { key: 'license_allow_cc_nc', value: 'false', type: 'boolean' }, // Strict: Non-Commercial rejected
  { key: 'license_allow_cc_nd', value: 'false', type: 'boolean' },
  { key: 'require_explicit_license', value: 'true', type: 'boolean' },
  { key: 'public_domain_cutoff_year', value: '1929', type: 'int' },

  // SEO Templates
  { key: 'seo_title_template', value: '{title} ({year}) - Watch Free Classic Movie | {site_name}', type: 'string' },
  { key: 'seo_meta_template', value: 'Watch {title} ({year}), a classic {genre} film directed by {director}. Licensed legally under {license_type}. Free streaming on {site_name}.', type: 'string' },
  { key: 'seo_default_og_image', value: '/images/placeholder-poster.svg', type: 'string' },

  // Advertisements Placeholders
  { key: 'ad_header_enabled', value: 'true', type: 'boolean' },
  { key: 'ad_header_code', value: '<div class="ad-banner banner-728"><span class="ad-label">ADVERTISEMENT</span><div class="ad-box">Leaderboard Sponsor (728x90)</div></div>', type: 'string' },
  { key: 'ad_sidebar_enabled', value: 'true', type: 'boolean' },
  { key: 'ad_sidebar_code', value: '<div class="ad-banner banner-300"><span class="ad-label">ADVERTISEMENT</span><div class="ad-box">Medium Rectangle (300x250)</div></div>', type: 'string' },
  { key: 'ad_incontent_enabled', value: 'true', type: 'boolean' },
  { key: 'ad_incontent_code', value: '<div class="ad-banner banner-incontent"><span class="ad-label">SPONSORED</span><div class="ad-box">In-Stream Content Partner (Responsive)</div></div>', type: 'string' },
  { key: 'ad_footer_enabled', value: 'true', type: 'boolean' },
  { key: 'ad_footer_code', value: '<div class="ad-banner banner-footer"><span class="ad-label">ADVERTISEMENT</span><div class="ad-box">Footer Leaderboard (728x90)</div></div>', type: 'string' }
];
