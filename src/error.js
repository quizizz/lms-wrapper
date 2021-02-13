
/// <reference path='./error.d.ts' />
class LMSError extends Error {
  /**
   * @param {string} message
   * @param {string} [type=error]
   * @param {Object} [cause=null] - extra data for debugging
   */
  constructor(message, type = 'error', cause = null) {
    super(message);
    this.name = 'LMSError';
    this.type = type;
    this.cause = cause;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }

  toString() {
    return `${this.stack}\n${JSON.stringify(this.cause, null, 2)}`;
  }
}

module.exports = LMSError;
