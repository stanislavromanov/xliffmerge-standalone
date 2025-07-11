// Re-export everything from the API
export * from './api/index';

// Also export implementation utilities that xliffmerge needs
export { DOMUtilities } from './impl/dom-utilities';
export { isNullOrUndefined, isString, format } from './impl/util';