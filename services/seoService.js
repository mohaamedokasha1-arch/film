/**
 * SEO Generator & Sitemap Service for AKASHA HUB
 * Automates title, meta description, structured data, canonical URLs, and XML sitemaps.
 */

const { query, get, getSetting } = require('../db/database');

class SeoService {
  /**
   * Generates SEO Title for a movie
   */
  static generateMovieTitle(movie, siteName = 'AKASHA HUB') {
    const yearStr = movie.year ? ` (${movie.year})` : '';
    return `${movie.title}${yearStr} - Watch Free Classic Movie | ${siteName}`;
  }

  /**
   * Generates Meta Description for a movie
   */
  static generateMovieDescription(movie, siteName = 'AKASHA HUB') {
    let genres = 'Classic';
    try {
      const gList = Array.isArray(movie.genres) ? movie.genres : JSON.parse(movie.genres || '[]');
      if (gList.length > 0) genres = gList.join(', ');
    } catch (e) {}

    const director = movie.director && movie.director !== 'Unknown Director' ? movie.director : 'Classic Filmmakers';
    const cleanDesc = (movie.description || '').replace(/\s+/g, ' ').slice(0, 140);
    const yearStr = movie.year ? ` (${movie.year})` : '';

    return `Watch ${movie.title}${yearStr}, a ${genres} classic directed by ${director}. ${cleanDesc}... 100% legal streaming on ${siteName}.`;
  }

  /**
   * Generates JSON-LD Structured Data for Movie schema
   */
  static generateMovieSchema(movie, baseUrl = '') {
    let genreArray = [];
    try {
      genreArray = Array.isArray(movie.genres) ? movie.genres : JSON.parse(movie.genres || '[]');
    } catch (e) {
      genreArray = ['Classic'];
    }

    let actors = [];
    try {
      actors = Array.isArray(movie.cast_members) ? movie.cast_members : JSON.parse(movie.cast_members || '[]');
    } catch (e) {}

    const schema = {
      "@context": "https://schema.org",
      "@type": "Movie",
      "name": movie.title,
      "description": movie.description || `${movie.title} classic film`,
      "url": `${baseUrl}/movie/${movie.slug}`,
      "image": movie.poster_url || `${baseUrl}/images/placeholder-poster.svg`,
      "genre": genreArray,
      "inLanguage": movie.language || "en",
      "license": movie.license_url || "https://creativecommons.org/publicdomain/mark/1.0/"
    };

    if (movie.year) {
      schema.datePublished = String(movie.year);
    }

    if (movie.duration) {
      schema.duration = `PT${movie.duration}M`;
    }

    if (movie.director && movie.director !== 'Unknown Director') {
      schema.director = {
        "@type": "Person",
        "name": movie.director
      };
    }

    if (actors.length > 0) {
      schema.actor = actors.map(name => ({
        "@type": "Person",
        "name": name
      }));
    }

    return JSON.stringify(schema, null, 2);
  }

  /**
   * Generates BreadcrumbList Schema JSON-LD
   */
  static generateBreadcrumbSchema(items, baseUrl = '') {
    const itemListElement = items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`
    }));

    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": itemListElement
    }, null, 2);
  }

  /**
   * Generates XML Sitemap content
   */
  static async generateXmlSitemap(baseUrl = '') {
    const movies = await query(
      "SELECT slug, updated_at, created_at FROM movies WHERE status = 'published' ORDER BY updated_at DESC"
    );
    const genres = await query('SELECT slug FROM genres WHERE movie_count > 0 ORDER BY name ASC');
    const years = await query(
      "SELECT DISTINCT year FROM movies WHERE status = 'published' AND year IS NOT NULL ORDER BY year DESC"
    );

    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/search', priority: '0.8', changefreq: 'weekly' },
      { loc: '/about', priority: '0.6', changefreq: 'monthly' },
      { loc: '/contact', priority: '0.6', changefreq: 'monthly' },
      { loc: '/privacy-policy', priority: '0.4', changefreq: 'yearly' },
      { loc: '/terms-of-service', priority: '0.4', changefreq: 'yearly' },
      { loc: '/sitemap', priority: '0.5', changefreq: 'weekly' }
    ];

    const now = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    for (const page of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${page.loc}</loc>\n`;
      xml += `    <lastmod>${now}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Genres
    for (const g of genres) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/genre/${g.slug}</loc>\n`;
      xml += `    <lastmod>${now}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    // Years
    for (const y of years) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/year/${y.year}</loc>\n`;
      xml += `    <lastmod>${now}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += `  </url>\n`;
    }

    // Movies
    for (const m of movies) {
      const date = (m.updated_at || m.created_at || now).split(' ')[0].split('T')[0];
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/movie/${m.slug}</loc>\n`;
      xml += `    <lastmod>${date}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;
    return xml;
  }

  /**
   * Generates robots.txt content
   */
  static generateRobotsTxt(baseUrl = '') {
    return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;
  }
}

module.exports = SeoService;
