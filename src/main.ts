/**
 * Main entry point for xliffmerge library
 */

// Export main classes and interfaces for programmatic use
export { XliffMerge } from './xliffmerge/xliff-merge';
export { XliffMergeAsync } from './xliffmerge/xliff-merge-async';
export { XliffMergeParameters } from './xliffmerge/xliff-merge-parameters';
export { CommandOutput } from './common/command-output';
export { TranslationMessagesFileReader } from './xliffmerge/translation-messages-file-reader';
export { NgxTranslateExtractor } from './xliffmerge/ngx-translate-extractor';

// Export types and interfaces
export type { ProgramOptions, IConfigFile, IXliffMergeOptions } from './xliffmerge/i-xliff-merge-options';
export * from './lib/api';

// Re-export the async version as default for modern usage
export { XliffMergeAsync as default } from './xliffmerge/xliff-merge-async';