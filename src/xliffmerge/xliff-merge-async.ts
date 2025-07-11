import { CommandOutput } from '../common/command-output';
import { XliffMergeParameters } from './xliff-merge-parameters';
import { XliffMergeError } from './xliff-merge-error';
import { FileUtil } from '../common/file-util';
import { VERSION } from './version';
import { format } from 'util';
import {
  ITranslationMessagesFile,
  ITransUnit,
  FORMAT_XMB,
  FORMAT_XTB,
  NORMALIZATION_FORMAT_DEFAULT,
  STATE_FINAL,
  STATE_TRANSLATED,
} from '../lib/index';
import { ProgramOptions, IConfigFile } from './i-xliff-merge-options';
import { NgxTranslateExtractor } from './ngx-translate-extractor';
import { TranslationMessagesFileReader } from './translation-messages-file-reader';

/**
 * Modern async version of XliffMerge
 */
export class XliffMergeAsync {
  private readonly commandOutput: CommandOutput;
  private readonly options: ProgramOptions;
  private parameters: XliffMergeParameters | null;
  private master: ITranslationMessagesFile | null = null;

  constructor(commandOutput: CommandOutput, options: ProgramOptions) {
    this.commandOutput = commandOutput;
    this.options = options;
    this.parameters = null;
  }

  /**
   * For Tests, create instance with given profile
   */
  public static createFromOptions(
    commandOutput: CommandOutput,
    options: ProgramOptions,
    profileContent?: IConfigFile
  ): XliffMergeAsync {
    const instance = new XliffMergeAsync(commandOutput, options);
    instance.parameters = XliffMergeParameters.createFromOptions(options, profileContent);
    return instance;
  }

  /**
   * Run the merge process asynchronously
   */
  public async run(): Promise<number> {
    try {
      if (this.options.quiet) {
        this.commandOutput.setQuiet();
      }
      if (this.options.verbose) {
        this.commandOutput.setVerbose();
      }

      if (!this.parameters) {
        this.parameters = XliffMergeParameters.createFromOptions(this.options);
      }

      this.commandOutput.info('xliffmerge version %s', VERSION);
      if (this.parameters.verbose()) {
        this.parameters.showAllParameters(this.commandOutput);
      }

      // Check for errors
      if (this.parameters.errorsFound.length > 0) {
        for (const err of this.parameters.errorsFound) {
          this.commandOutput.error(err.message);
        }
        return -1;
      }

      // Show warnings
      if (this.parameters.warningsFound.length > 0) {
        for (const warn of this.parameters.warningsFound) {
          this.commandOutput.warn(warn);
        }
      }

      // Read master file
      await this.readMaster();

      // Process all languages
      const results = await Promise.all(
        this.parameters.languages().map((lang) => this.processLanguage(lang))
      );

      // Return the first non-zero exit code, or 0 if all succeeded
      return results.find((code) => code !== 0) ?? 0;
    } catch (error) {
      if (error instanceof XliffMergeError) {
        this.commandOutput.error(error.message);
        return -1;
      } else {
        this.commandOutput.error('Unexpected error: %s', error);
        throw error;
      }
    }
  }

  private async readMaster(): Promise<void> {
    try {
      this.master = TranslationMessagesFileReader.fromFile(
        this.parameters!.i18nFormat(),
        this.parameters!.i18nFile(),
        this.parameters!.encoding()
      );

      this.master.warnings().forEach((warning: string) => {
        this.commandOutput.warn(warning);
      });

      const count = this.master.numberOfTransUnits();
      const missingIdCount = this.master.numberOfTransUnitsWithMissingId();
      this.commandOutput.info('master contains %s trans-units', count);

      if (missingIdCount > 0) {
        this.commandOutput.warn(
          'master contains %s trans-units, but there are %s without id',
          count,
          missingIdCount
        );
      }

      const sourceLang = this.master.sourceLanguage();
      if (sourceLang && sourceLang !== this.parameters!.defaultLanguage()) {
        this.commandOutput.warn(
          'master says to have source-language="%s", should be "%s" (your defaultLanguage)',
          sourceLang,
          this.parameters!.defaultLanguage()
        );
        this.master.setSourceLanguage(this.parameters!.defaultLanguage());
        TranslationMessagesFileReader.save(this.master, this.parameters!.beautifyOutput());
        this.commandOutput.warn(
          'changed master source-language="%s" to "%s"',
          sourceLang,
          this.parameters!.defaultLanguage()
        );
      }
    } catch (err) {
      if (err instanceof XliffMergeError) {
        throw err;
      } else {
        const currentFilename = this.parameters!.i18nFile();
        const filenameString = currentFilename ? format('file "%s", ', currentFilename) : '';
        throw new XliffMergeError(filenameString + 'oops ' + err);
      }
    }
  }

  private async processLanguage(lang: string): Promise<number> {
    this.commandOutput.debug('processing language %s', lang);
    const languageXliffFile = this.parameters!.generatedI18nFile(lang);

    try {
      let result: void;
      if (!FileUtil.exists(languageXliffFile)) {
        result = await this.createUntranslatedXliff(lang, languageXliffFile);
      } else {
        result = await this.mergeMasterTo(lang, languageXliffFile);
      }

      if (this.parameters!.supportNgxTranslate()) {
        const languageSpecificMessagesFile = TranslationMessagesFileReader.fromFile(
          this.translationFormat(this.parameters!.i18nFormat()),
          languageXliffFile,
          this.parameters!.encoding(),
          this.master!.filename()
        );
        NgxTranslateExtractor.extract(
          languageSpecificMessagesFile,
          this.parameters!.ngxTranslateExtractionPattern(),
          this.parameters!.generatedNgxTranslateFile(lang)
        );
      }
      return 0;
    } catch (err) {
      if (err instanceof XliffMergeError) {
        this.commandOutput.error(err.message);
        return -1;
      } else {
        const filenameString = languageXliffFile ? format('file "%s", ', languageXliffFile) : '';
        this.commandOutput.error(filenameString + 'oops ' + err);
        throw err;
      }
    }
  }

  private async createUntranslatedXliff(lang: string, languageXliffFilePath: string): Promise<void> {
    const isDefaultLang = lang === this.parameters!.defaultLanguage();
    this.master!.setNewTransUnitTargetPraefix(this.parameters!.targetPraefix());
    this.master!.setNewTransUnitTargetSuffix(this.parameters!.targetSuffix());
    
    const languageSpecificMessagesFile = this.master!.createTranslationFileForLang(
      lang,
      languageXliffFilePath,
      isDefaultLang,
      this.parameters!.useSourceAsTarget()
    );

    TranslationMessagesFileReader.save(languageSpecificMessagesFile, this.parameters!.beautifyOutput());
    this.commandOutput.info('created new file "%s" for target-language="%s"', languageXliffFilePath, lang);
    
    if (!isDefaultLang) {
      this.commandOutput.warn('please translate file "%s" to target-language="%s"', languageXliffFilePath, lang);
    }
  }

  private async mergeMasterTo(lang: string, languageXliffFilePath: string): Promise<void> {
    const languageSpecificMessagesFile = TranslationMessagesFileReader.fromFile(
      this.translationFormat(this.parameters!.i18nFormat()),
      languageXliffFilePath,
      this.parameters!.encoding()
    );

    const isDefaultLang = lang === this.parameters!.defaultLanguage();
    let newCount = 0;
    let correctSourceContentCount = 0;
    let correctSourceRefCount = 0;
    let correctDescriptionOrMeaningCount = 0;
    let idChangedCount = 0;

    languageSpecificMessagesFile.setNewTransUnitTargetPraefix(this.parameters!.targetPraefix());
    languageSpecificMessagesFile.setNewTransUnitTargetSuffix(this.parameters!.targetSuffix());

    let lastProcessedUnit: ITransUnit | null = null;
    
    this.master!.forEachTransUnit((masterTransUnit) => {
      const transUnit = languageSpecificMessagesFile.transUnitWithId(masterTransUnit.id);

      if (!transUnit) {
        // New key - add it
        let newUnit;
        if (
          this.parameters!.allowIdChange() &&
          (newUnit = this.processChangedIdUnit(masterTransUnit, languageSpecificMessagesFile, lastProcessedUnit))
        ) {
          lastProcessedUnit = newUnit;
          idChangedCount++;
        } else {
          lastProcessedUnit = languageSpecificMessagesFile.importNewTransUnit(
            masterTransUnit,
            isDefaultLang,
            this.parameters!.useSourceAsTarget(),
            this.parameters!.preserveOrder() ? lastProcessedUnit : undefined
          );
          newCount++;
        }
      } else {
        // Update existing unit
        this.updateExistingUnit(transUnit, masterTransUnit, isDefaultLang, {
          onSourceContentChanged: () => correctSourceContentCount++,
          onSourceRefChanged: () => correctSourceRefCount++,
          onDescriptionOrMeaningChanged: () => correctDescriptionOrMeaningCount++,
        });
        lastProcessedUnit = transUnit;
      }
    });

    // Log changes
    if (newCount > 0) {
      this.commandOutput.warn('merged %s trans-units from master to "%s"', newCount, lang);
    }
    if (correctSourceContentCount > 0) {
      this.commandOutput.warn('transferred %s changed source content from master to "%s"', correctSourceContentCount, lang);
    }
    if (correctSourceRefCount > 0) {
      this.commandOutput.warn('transferred %s source references from master to "%s"', correctSourceRefCount, lang);
    }
    if (idChangedCount > 0) {
      this.commandOutput.warn('found %s changed id\'s in "%s"', idChangedCount, lang);
    }
    if (correctDescriptionOrMeaningCount > 0) {
      this.commandOutput.warn('transferred %s changed descriptions/meanings from master to "%s"', correctDescriptionOrMeaningCount, lang);
    }

    // Remove unused units
    const removeCount = this.removeUnusedUnits(languageSpecificMessagesFile);
    if (removeCount > 0) {
      if (this.parameters!.removeUnusedIds()) {
        this.commandOutput.warn('removed %s unused trans-units in "%s"', removeCount, lang);
      } else {
        this.commandOutput.warn('keeping %s unused trans-units in "%s", because removeUnused is disabled', removeCount, lang);
      }
    }

    // Save if changes were made
    if (newCount === 0 && removeCount === 0 && correctSourceContentCount === 0 && 
        correctSourceRefCount === 0 && correctDescriptionOrMeaningCount === 0) {
      this.commandOutput.info('file for "%s" was up to date', lang);
    } else {
      TranslationMessagesFileReader.save(languageSpecificMessagesFile, this.parameters!.beautifyOutput());
      this.commandOutput.info('updated file "%s" for target-language="%s"', languageXliffFilePath, lang);
      if (newCount > 0 && !isDefaultLang) {
        this.commandOutput.warn('please translate file "%s" to target-language="%s"', languageXliffFilePath, lang);
      }
    }
  }

  private updateExistingUnit(
    transUnit: ITransUnit,
    masterTransUnit: ITransUnit,
    isDefaultLang: boolean,
    callbacks: {
      onSourceContentChanged: () => void;
      onSourceRefChanged: () => void;
      onDescriptionOrMeaningChanged: () => void;
    }
  ): void {
    // Check for changed source content
    if (transUnit.supportsSetSourceContent() && !this.areSourcesNearlyEqual(masterTransUnit, transUnit)) {
      transUnit.setSourceContent(masterTransUnit.sourceContent());
      if (isDefaultLang) {
        transUnit.translate(masterTransUnit.sourceContent());
        transUnit.setTargetState(STATE_FINAL);
      } else {
        if (transUnit.targetState() === STATE_FINAL) {
          transUnit.setTargetState(STATE_TRANSLATED);
        }
      }
      callbacks.onSourceContentChanged();
    }

    // Check for missing or changed source ref
    if (
      transUnit.supportsSetSourceReferences() &&
      !this.areSourceReferencesEqual(masterTransUnit.sourceReferences(), transUnit.sourceReferences())
    ) {
      transUnit.setSourceReferences(masterTransUnit.sourceReferences());
      callbacks.onSourceRefChanged();
    }

    // Check for changed description or meaning
    if (transUnit.supportsSetDescriptionAndMeaning()) {
      let changed = false;
      if (transUnit.description() !== masterTransUnit.description()) {
        transUnit.setDescription(masterTransUnit.description());
        changed = true;
      }
      if (transUnit.meaning() !== masterTransUnit.meaning()) {
        transUnit.setMeaning(masterTransUnit.meaning());
        changed = true;
      }
      if (changed) {
        callbacks.onDescriptionOrMeaningChanged();
      }
    }
  }

  private removeUnusedUnits(languageSpecificMessagesFile: ITranslationMessagesFile): number {
    let removeCount = 0;
    languageSpecificMessagesFile.forEachTransUnit((transUnit: ITransUnit) => {
      const existsInMaster = this.master!.transUnitWithId(transUnit.id) !== null;
      if (!existsInMaster) {
        if (this.parameters!.removeUnusedIds()) {
          languageSpecificMessagesFile.removeTransUnitWithId(transUnit.id);
        }
        removeCount++;
      }
    });
    return removeCount;
  }

  private processChangedIdUnit(
    masterTransUnit: ITransUnit,
    languageSpecificMessagesFile: ITranslationMessagesFile,
    lastProcessedUnit: ITransUnit | null
  ): ITransUnit | null {
    let changedTransUnit: ITransUnit | null = null;
    languageSpecificMessagesFile.forEachTransUnit((languageTransUnit) => {
      if (this.areSourcesNearlyEqual(languageTransUnit, masterTransUnit)) {
        changedTransUnit = languageTransUnit;
      }
    });

    if (!changedTransUnit) {
      return null;
    }

    const mergedTransUnit = languageSpecificMessagesFile.importNewTransUnit(
      masterTransUnit,
      false,
      false,
      this.parameters!.preserveOrder() ? lastProcessedUnit : undefined
    );

    const translatedContent = changedTransUnit.targetContent();
    if (translatedContent) {
      mergedTransUnit.translate(translatedContent);
      mergedTransUnit.setTargetState(STATE_TRANSLATED);
    }
    return mergedTransUnit;
  }

  private translationFormat(i18nFormat: string): string {
    return i18nFormat === FORMAT_XMB ? FORMAT_XTB : i18nFormat;
  }

  private areSourcesNearlyEqual(tu1: ITransUnit, tu2: ITransUnit): boolean {
    if ((tu1 && !tu2) || (tu2 && !tu1)) {
      return false;
    }

    const tu1Normalized = tu1.sourceContentNormalized();
    const tu2Normalized = tu2.sourceContentNormalized();

    if (tu1Normalized.isICUMessage()) {
      if (tu2Normalized.isICUMessage()) {
        const icu1Normalized = tu1Normalized.getICUMessage()?.asNativeString().trim();
        const icu2Normalized = tu2Normalized.getICUMessage()?.asNativeString().trim();
        return icu1Normalized === icu2Normalized;
      } else {
        return false;
      }
    }

    if (tu1Normalized.containsICUMessageRef()) {
      const icuref1Normalized = tu1Normalized.asNativeString().trim();
      const icuref2Normalized = tu2Normalized.asNativeString().trim();
      return icuref1Normalized === icuref2Normalized;
    }

    const s1Normalized = tu1Normalized.asDisplayString(NORMALIZATION_FORMAT_DEFAULT).trim();
    const s2Normalized = tu2Normalized.asDisplayString(NORMALIZATION_FORMAT_DEFAULT).trim();
    return s1Normalized === s2Normalized;
  }

  private areSourceReferencesEqual(
    ref1: { sourcefile: string; linenumber: number }[] | null,
    ref2: { sourcefile: string; linenumber: number }[] | null
  ): boolean {
    if ((!ref1 && ref2) || (ref1 && !ref2)) {
      return false;
    }
    if (!ref1 && !ref2) {
      return true;
    }

    const set1 = new Set<string>();
    ref1!.forEach((ref) => {
      set1.add(ref.sourcefile + ':' + ref.linenumber);
    });

    const set2 = new Set<string>();
    ref2!.forEach((ref) => {
      set2.add(ref.sourcefile + ':' + ref.linenumber);
    });

    if (set1.size !== set2.size) {
      return false;
    }

    let match = true;
    set2.forEach((ref) => {
      if (!set1.has(ref)) {
        match = false;
      }
    });
    return match;
  }

  /**
   * Warnings found during the run.
   */
  public warnings(): string[] {
    return this.parameters?.warningsFound ?? [];
  }

  /**
   * Return the name of the generated file for given lang.
   */
  public generatedI18nFile(lang: string): string {
    return this.parameters!.generatedI18nFile(lang);
  }

  /**
   * Return the name of the generated ngx-translation file for given lang.
   */
  public generatedNgxTranslateFile(lang: string): string {
    return this.parameters!.generatedNgxTranslateFile(lang);
  }
}