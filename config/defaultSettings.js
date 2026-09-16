// Default settings for AKASHA HUB (أكاشا هاب)
// Official brand name (EN): AKASHA HUB | Brand name (AR): أكاشا هاب
module.exports = [
  { key: 'site_name', value: 'AKASHA HUB', type: 'string' },
  { key: 'site_tagline', value: 'Timeless Public Domain & Legal Classic Cinema', type: 'string' },
  { key: 'site_description', value: 'Stream thousands of verified legal, public domain, and Creative Commons classic movies, silent masterworks, film noir, vintage comedies, and historical treasures. 100% free and open culture.', type: 'string' },
  { key: 'site_url', value: 'http://localhost:3000', type: 'string' },
  { key: 'contact_email', value: 'legal@akashahub.org', type: 'string' },
  { key: 'dmca_agent', value: 'Copyright & Compliance Officer, AKASHA HUB Open Cultural Project', type: 'string' },
  { key: 'items_per_page', value: '12', type: 'int' },
  { key: 'auto_publish', value: 'true', type: 'boolean' },
  { key: 'scheduler_enabled', value: 'true', type: 'boolean' },
  { key: 'import_frequency_hours', value: '6', type: 'int' },
  { key: 'last_successful_import', value: '', type: 'string' },
  { key: 'archive_search_collections', value: 'feature_films,silent_films,Comedy_Films,classic_tv,scifi_horror', type: 'string' },
  { key: 'archive_rows_per_import', value: '15', type: 'int' },
  { key: 'archive_sort_order', value: 'downloads desc', type: 'string' },
  
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
