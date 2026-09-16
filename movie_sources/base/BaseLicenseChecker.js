/**
 * BaseLicenseChecker — CRITICAL legal compliance contract.
 *
 * Every candidate item MUST pass an individual, item-level license check
 * before it may be imported. Accepting a license "per source" is forbidden.
 *
 * Required result shape:
 * {
 *   accepted: boolean,
 *   reason: string|null,          // rejection reason (mandatory when rejected)
 *   licenseType: string,          // normalized license name
 *   licenseUrl: string,           // canonical license text URL
 *   attributionRequired: boolean,
 *   attributionText: string,      // pre-built attribution/credit line
 *   canRehost: boolean,           // may we self-host the media file?
 *   commercialAllowed: boolean    // may it be monetized with ads?
 * }
 */

class BaseLicenseChecker {
  constructor(licenseSettings = {}) {
    this.licenseSettings = licenseSettings;
  }

  /**
   * Item-level license verification. Must be implemented per source.
   */
  // eslint-disable-next-line no-unused-vars
  check(item) {
    throw new Error('check() must be implemented by the concrete license checker');
  }

  rejection(item, reason, licenseType = 'Unknown / Undetermined') {
    return {
      accepted: false,
      reason,
      licenseType,
      licenseUrl: '',
      attributionRequired: false,
      attributionText: '',
      canRehost: false,
      commercialAllowed: false
    };
  }
}

module.exports = BaseLicenseChecker;
