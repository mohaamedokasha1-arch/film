const BaseLicenseChecker = require('../base/BaseLicenseChecker');

class LocLicenseChecker extends BaseLicenseChecker {
  constructor(licenseSettings = {}) {
    super(licenseSettings);
    this.allowPublicDomain = licenseSettings.allowPublicDomain !== false;
    this.allowCc0 = licenseSettings.allowCc0 !== false;
    this.allowCcBy = licenseSettings.allowCcBy !== false;
    this.allowCcBySa = licenseSettings.allowCcBySa !== false;
    this.cutoffYear = parseInt(licenseSettings.publicDomainCutoffYear, 10) || 1929;
  }

  check(candidate) {
    if (!candidate || !candidate.license) {
      return this.rejection(candidate, 'Candidate carries no license metadata at all');
    }
    const L = candidate.license;
    if (L.accessRestricted) {
      return this.rejection(candidate, 'LOC flags this item as access-restricted');
    }
    const blob = `${L.rightsText || ''} ${L.notes || ''} ${L.contributors || ''} ${L.createdPublished || ''}`;

    if (/all rights reserved|in copyright|copyrighted work|rights reserved/i.test(blob)
      && !/no known restrictions|public domain|CC0|CC BY/i.test(blob)) {
      return this.rejection(candidate, 'Rights statement indicates copyright / all rights reserved', 'Restricted');
    }
    if (/-NC\b|non-?commercial/i.test(blob)) {
      return this.rejection(candidate, 'License restricts to NON-COMMERCIAL use (NC)', 'Non-Commercial');
    }
    if (/-ND\b|no.?deriv/i.test(blob)) {
      return this.rejection(candidate, 'License forbids derivative works (ND)', 'No-Derivatives');
    }

    if (/no known restrictions/i.test(blob)) {
      return this._accept(candidate, 'No known restrictions on publication (Library of Congress statement)',
        'https://www.loc.gov/rr/print/res/647_res.html');
    }
    if (/public domain/i.test(blob)) {
      if (!this.allowPublicDomain) return this.rejection(candidate, 'Public Domain imports disabled', 'Public Domain');
      return this._accept(candidate, 'Public Domain (LOC metadata)', 'https://creativecommons.org/publicdomain/mark/1.0/');
    }
    if (/CC0|public domain dedication/i.test(blob)) {
      if (!this.allowCc0) return this.rejection(candidate, 'CC0 imports disabled', 'CC0');
      return this._accept(candidate, 'Creative Commons CC0 1.0 Universal', 'https://creativecommons.org/publicdomain/zero/1.0/', false);
    }
    if (/CC(?:\s|-)BY(?:\s|-)?SA/i.test(blob)) {
      if (!this.allowCcBySa) return this.rejection(candidate, 'CC BY-SA imports disabled', 'CC BY-SA');
      return this._accept(candidate, 'Creative Commons Attribution-ShareAlike', 'https://creativecommons.org/licenses/by-sa/4.0/', true);
    }
    if (/CC(?:\s|-)BY\b|creativecommons.org\/licenses\/by\//i.test(blob)) {
      if (!this.allowCcBy) return this.rejection(candidate, 'CC BY imports disabled', 'CC BY');
      return this._accept(candidate, 'Creative Commons Attribution', 'https://creativecommons.org/licenses/by/4.0/', true);
    }

    const gov = /united states\.? department|u\.s\. government|government work|usda|department of agriculture\. motion picture/i.test(blob);
    if (gov) {
      if (!this.allowPublicDomain) return this.rejection(candidate, 'U.S. Government Work imports disabled', 'US Gov');
      return this._accept(candidate, 'U.S. Government Work (public domain)', 'https://www.usa.gov/government-works');
    }

    const year = candidate.year;
    const us = /united states|u\.s\.|edison manufacturing|paper print collection/i.test(blob + ' ' + (candidate.country || ''));
    if (year && year <= this.cutoffYear && us) {
      if (!this.allowPublicDomain) return this.rejection(candidate, 'Public Domain imports disabled', 'Public Domain');
      return this._accept(
        candidate,
        `Public Domain — U.S. publication year ${year} is at or before cutoff ${this.cutoffYear}`,
        'https://copyright.gov/circs/circ15a.pdf'
      );
    }

    return this.rejection(
      candidate,
      `Unrecognized or missing LOC rights statement — fail-closed (year=${year || 'n/a'})`,
      'Unknown'
    );
  }

  _accept(candidate, licenseType, licenseUrl, attributionRequired = true) {
    const credit = `"${candidate.title}" (${candidate.year || 'n.d.'}) — ${licenseType}. Courtesy of the Library of Congress. ${candidate.source_url || ''}`.trim();
    return {
      accepted: true,
      reason: null,
      licenseType,
      licenseUrl,
      attributionRequired,
      attributionText: credit,
      canRehost: false,
      commercialAllowed: true
    };
  }
}

module.exports = LocLicenseChecker;
