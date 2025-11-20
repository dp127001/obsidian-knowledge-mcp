/**
 * Markdown linting engine with Obsidian-specific rules
 */

import { parseFrontmatter } from '../vault/frontmatter.js';
import { validateFrontmatter } from '../vault/frontmatter-schema.js';

/**
 * Lint rule result
 */
export interface LintDiagnostic {
  ruleId: string;
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  fixable: boolean;
}

/**
 * Lint result
 */
export interface LintResult {
  content: string; // Original or fixed content
  diagnostics: LintDiagnostic[];
  fixed: boolean; // Whether fixes were applied
}

/**
 * Lint settings
 */
export interface LintSettings {
  // Frontmatter rules
  requireFrontmatter?: boolean; // Default: false
  validateFrontmatterSchema?: boolean; // Default: true

  // Formatting rules
  removeTrailingWhitespace?: boolean; // Default: true
  ensureFinalNewline?: boolean; // Default: true
  removeMultipleBlankLines?: boolean; // Default: true (max 1 blank line)

  // Heading rules
  noTrailingPunctuation?: boolean; // Default: true
  headingStartWithCapital?: boolean; // Default: false
  noEmptyHeadings?: boolean; // Default: true

  // List rules
  consistentListMarker?: boolean; // Default: true (use '-')

  // Wikilink rules
  noSpacesInWikilinks?: boolean; // Default: false (allow spaces)
  wikilinkStyleBrackets?: boolean; // Default: true (use [[]] not [])

  // Tag rules
  noSpacesInTags?: boolean; // Default: true

  // Apply fixes automatically
  applyFixes?: boolean; // Default: false
}

/**
 * Default lint settings
 */
export const DEFAULT_LINT_SETTINGS: Required<LintSettings> = {
  requireFrontmatter: false,
  validateFrontmatterSchema: true,
  removeTrailingWhitespace: true,
  ensureFinalNewline: true,
  removeMultipleBlankLines: true,
  noTrailingPunctuation: true,
  headingStartWithCapital: false,
  noEmptyHeadings: true,
  consistentListMarker: true,
  noSpacesInWikilinks: false,
  wikilinkStyleBrackets: true,
  noSpacesInTags: true,
  applyFixes: false
};

/**
 * Obsidian markdown linter
 */
export class MarkdownLinter {
  private settings: Required<LintSettings>;

  constructor(settings: LintSettings = {}) {
    this.settings = { ...DEFAULT_LINT_SETTINGS, ...settings };
  }

  /**
   * Lint markdown content
   */
  async lint(content: string): Promise<LintResult> {
    const diagnostics: LintDiagnostic[] = [];
    let fixedContent = content;

    // 1. Check frontmatter
    const fmDiagnostics = this.checkFrontmatter(content);
    diagnostics.push(...fmDiagnostics);

    // 2. Check formatting
    if (this.settings.applyFixes) {
      const formatResult = this.fixFormatting(fixedContent);
      fixedContent = formatResult.content;
      diagnostics.push(...formatResult.diagnostics);
    } else {
      diagnostics.push(...this.checkFormatting(fixedContent));
    }

    // 3. Check headings
    const headingDiagnostics = this.checkHeadings(fixedContent);
    diagnostics.push(...headingDiagnostics);

    // 4. Check wikilinks
    const wikilinkDiagnostics = this.checkWikilinks(fixedContent);
    diagnostics.push(...wikilinkDiagnostics);

    // 5. Check tags
    const tagDiagnostics = this.checkTags(fixedContent);
    diagnostics.push(...tagDiagnostics);

    // 6. Check lists
    if (this.settings.applyFixes && this.settings.consistentListMarker) {
      const listResult = this.fixLists(fixedContent);
      fixedContent = listResult.content;
      diagnostics.push(...listResult.diagnostics);
    } else if (this.settings.consistentListMarker) {
      diagnostics.push(...this.checkLists(fixedContent));
    }

    return {
      content: this.settings.applyFixes ? fixedContent : content,
      diagnostics,
      fixed: this.settings.applyFixes && fixedContent !== content
    };
  }

  /**
   * Check frontmatter
   */
  private checkFrontmatter(content: string): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const parsed = parseFrontmatter(content);

    // Check if frontmatter is required
    if (this.settings.requireFrontmatter && !parsed.frontmatter) {
      diagnostics.push({
        ruleId: 'require-frontmatter',
        message: 'Note should have frontmatter',
        line: 1,
        severity: 'warning',
        fixable: false
      });
    }

    // Validate frontmatter schema
    if (this.settings.validateFrontmatterSchema && parsed.frontmatter) {
      const validation = validateFrontmatter(parsed.frontmatter);
      if (!validation.ok && validation.errors) {
        for (const error of validation.errors) {
          diagnostics.push({
            ruleId: 'frontmatter-schema',
            message: `Frontmatter error: ${error}`,
            line: 1,
            severity: 'error',
            fixable: false
          });
        }
      }
      if (validation.warnings) {
        for (const warning of validation.warnings) {
          diagnostics.push({
            ruleId: 'frontmatter-schema',
            message: `Frontmatter warning: ${warning}`,
            line: 1,
            severity: 'warning',
            fixable: false
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Check formatting issues
   */
  private checkFormatting(content: string): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const lines = content.split('\n');

    // Check trailing whitespace
    if (this.settings.removeTrailingWhitespace) {
      lines.forEach((line, idx) => {
        if (line.length > 0) {
          const trailingSpaces = line.length - line.trimEnd().length;

          // Valid: no trailing spaces or exactly 2 spaces (Markdown line break)
          if (trailingSpaces === 0 || trailingSpaces === 2) {
            return;
          }

          // Invalid: 1 space or 3+ spaces
          const message = trailingSpaces === 1
            ? 'Line has 1 trailing space (use 0 or 2 for line break)'
            : `Line has ${trailingSpaces} trailing spaces (use 0 or 2 for line break)`;

          diagnostics.push({
            ruleId: 'no-trailing-whitespace',
            message,
            line: idx + 1,
            severity: 'warning',
            fixable: true
          });
        }
      });
    }

    // Check final newline
    if (this.settings.ensureFinalNewline && !content.endsWith('\n')) {
      diagnostics.push({
        ruleId: 'final-newline',
        message: 'File should end with a newline',
        line: lines.length,
        severity: 'warning',
        fixable: true
      });
    }

    // Check multiple blank lines
    if (this.settings.removeMultipleBlankLines) {
      let blankCount = 0;
      lines.forEach((line, idx) => {
        if (line.trim() === '') {
          blankCount++;
          if (blankCount > 1) {
            diagnostics.push({
              ruleId: 'no-multiple-blank-lines',
              message: 'Multiple consecutive blank lines',
              line: idx + 1,
              severity: 'warning',
              fixable: true
            });
          }
        } else {
          blankCount = 0;
        }
      });
    }

    return diagnostics;
  }

  /**
   * Fix formatting issues
   */
  private fixFormatting(content: string): { content: string; diagnostics: LintDiagnostic[] } {
    const diagnostics: LintDiagnostic[] = [];
    let fixed = content;

    // Fix trailing whitespace
    if (this.settings.removeTrailingWhitespace) {
      const before = fixed;
      fixed = fixed.split('\n').map(line => {
        if (line.length === 0) return line;

        const trailingSpaces = line.length - line.trimEnd().length;

        // Already correct: 0 or 2 spaces (Markdown line break)
        if (trailingSpaces === 0 || trailingSpaces === 2) {
          return line;
        }

        // 1 space: remove it (likely accidental)
        if (trailingSpaces === 1) {
          return line.trimEnd();
        }

        // 3+ spaces: normalize to 2 (assume line break intent)
        return line.trimEnd() + '  ';
      }).join('\n');

      if (before !== fixed) {
        diagnostics.push({
          ruleId: 'no-trailing-whitespace',
          message: 'Fixed trailing whitespace',
          severity: 'info',
          fixable: true
        });
      }
    }

    // Ensure final newline
    if (this.settings.ensureFinalNewline && !fixed.endsWith('\n')) {
      fixed += '\n';
      diagnostics.push({
        ruleId: 'final-newline',
        message: 'Added final newline',
        severity: 'info',
        fixable: true
      });
    }

    // Remove multiple blank lines
    if (this.settings.removeMultipleBlankLines) {
      const before = fixed;
      fixed = fixed.replace(/\n{3,}/g, '\n\n');
      if (before !== fixed) {
        diagnostics.push({
          ruleId: 'no-multiple-blank-lines',
          message: 'Fixed multiple blank lines',
          severity: 'info',
          fixable: true
        });
      }
    }

    return { content: fixed, diagnostics };
  }

  /**
   * Check headings
   */
  private checkHeadings(content: string): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (!headingMatch) return;

      const headingText = headingMatch[2];

      // Check for trailing punctuation
      if (this.settings.noTrailingPunctuation && /[.!?;,:]$/.test(headingText)) {
        diagnostics.push({
          ruleId: 'no-heading-punctuation',
          message: 'Heading should not end with punctuation',
          line: idx + 1,
          severity: 'warning',
          fixable: false
        });
      }

      // Check for capital letter
      if (this.settings.headingStartWithCapital && !/^[A-Z]/.test(headingText)) {
        diagnostics.push({
          ruleId: 'heading-start-capital',
          message: 'Heading should start with a capital letter',
          line: idx + 1,
          severity: 'warning',
          fixable: false
        });
      }

      // Check for empty headings
      if (this.settings.noEmptyHeadings && headingText.trim() === '') {
        diagnostics.push({
          ruleId: 'no-empty-heading',
          message: 'Heading should not be empty',
          line: idx + 1,
          severity: 'error',
          fixable: false
        });
      }
    });

    return diagnostics;
  }

  /**
   * Check wikilinks
   */
  private checkWikilinks(content: string): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Find wikilinks
      const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
      let match;

      while ((match = wikilinkRegex.exec(line)) !== null) {
        const linkContent = match[1];

        // Check for spaces in wikilinks (some prefer no spaces)
        if (this.settings.noSpacesInWikilinks && /\s/.test(linkContent.split('|')[0])) {
          diagnostics.push({
            ruleId: 'no-spaces-in-wikilinks',
            message: 'Wikilink should not contain spaces (use dashes or underscores)',
            line: idx + 1,
            column: match.index,
            severity: 'info',
            fixable: false
          });
        }
      }

      // Check for markdown links that should be wikilinks
      if (this.settings.wikilinkStyleBrackets) {
        const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        while ((match = mdLinkRegex.exec(line)) !== null) {
          const url = match[2];
          // Check if it's a local link (no protocol)
          if (!url.match(/^https?:\/\//) && !url.match(/^mailto:/)) {
            diagnostics.push({
              ruleId: 'prefer-wikilinks',
              message: 'Consider using wikilink style [[]] for internal links',
              line: idx + 1,
              column: match.index,
              severity: 'info',
              fixable: false
            });
          }
        }
      }
    });

    return diagnostics;
  }

  /**
   * Check tags
   */
  private checkTags(_content: string): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    // Note: noSpacesInTags check is currently a placeholder
    // The regex /#([^\s#]+)/g already excludes spaces by definition
    // Additional validation could be added here in the future

    return diagnostics;
  }

  /**
   * Check lists
   */
  private checkLists(content: string): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Check for list items using * or + instead of -
      if (/^\s*[*+]\s/.test(line)) {
        diagnostics.push({
          ruleId: 'consistent-list-marker',
          message: 'Use "-" for unordered list items',
          line: idx + 1,
          severity: 'warning',
          fixable: true
        });
      }
    });

    return diagnostics;
  }

  /**
   * Fix lists
   */
  private fixLists(content: string): { content: string; diagnostics: LintDiagnostic[] } {
    const diagnostics: LintDiagnostic[] = [];
    const lines = content.split('\n');
    let changed = false;

    const fixed = lines.map(line => {
      if (/^\s*[*+]\s/.test(line)) {
        changed = true;
        return line.replace(/^(\s*)[*+](\s)/, '$1-$2');
      }
      return line;
    }).join('\n');

    if (changed) {
      diagnostics.push({
        ruleId: 'consistent-list-marker',
        message: 'Fixed list markers to use "-"',
        severity: 'info',
        fixable: true
      });
    }

    return { content: fixed, diagnostics };
  }
}

/**
 * Create a linter instance
 */
export function createLinter(settings?: LintSettings): MarkdownLinter {
  return new MarkdownLinter(settings);
}

/**
 * Lint markdown content (convenience function)
 */
export async function lintMarkdown(
  content: string,
  settings?: LintSettings
): Promise<LintResult> {
  const linter = createLinter(settings);
  return await linter.lint(content);
}
