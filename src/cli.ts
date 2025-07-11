#!/usr/bin/env node
import { Command } from 'commander';
import { XliffMergeAsync } from './xliffmerge/xliff-merge-async';
import { CommandOutput } from './common/command-output';
import { ProgramOptions } from './xliffmerge/i-xliff-merge-options';
import { VERSION } from './xliffmerge/version';

const program = new Command();

program
  .name('xliffmerge')
  .description('Merge translation files for Angular i18n projects')
  .version(VERSION)
  .option('-p, --profile <path>', 'path to configuration file')
  .option('-v, --verbose', 'enable verbose output', false)
  .option('-q, --quiet', 'only show error messages', false)
  .argument('[languages...]', 'language codes to process')
  .action(async (languages, options) => {
    const programOptions: ProgramOptions = {
      languages: languages || [],
      profilePath: options.profile,
      verbose: options.verbose,
      quiet: options.quiet
    };

    try {
      const xliffMerge = new XliffMergeAsync(
        new CommandOutput(process.stdout),
        programOptions
      );

      const exitCode = await xliffMerge.run();
      process.exit(exitCode);
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();