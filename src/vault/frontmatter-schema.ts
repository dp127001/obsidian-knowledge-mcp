/**
 * Frontmatter schema validation and constants
 */

import { NoteType, ParaCategory, LifecycleStage, Confidence } from '../types/core.js';

/**
 * Valid note types
 */
export const NOTE_TYPES: readonly NoteType[] = [
  'atomic',
  'evergreen',
  'decision',
  'project',
  'framework',
  'journal'
] as const;

/**
 * Valid PARA categories
 */
export const PARA_CATEGORIES: readonly ParaCategory[] = [
  'project',
  'area',
  'resource',
  'archive'
] as const;

/**
 * Valid lifecycle stages
 */
export const LIFECYCLE_STAGES: readonly LifecycleStage[] = [
  'capture',
  'process',
  'connect',
  'synthesize',
  'crystallize'
] as const;

/**
 * Valid confidence levels
 */
export const CONFIDENCE_LEVELS: readonly Confidence[] = [
  'low',
  'medium',
  'high'
] as const;

/**
 * Valid note statuses
 */
export const NOTE_STATUSES = [
  'draft',
  'evergreen',
  'needs-review',
  'closed',
  'active',
  'archived'
] as const;

/**
 * Valid decision statuses
 */
export const DECISION_STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'superseded'
] as const;

/**
 * Coherence ID prefixes
 */
export const COHERENCE_ID_PREFIXES = {
  conversation: 'conv-',
  insight: 'atom-',
  decision: 'dec-',
  concept: 'concept-'
} as const;

/**
 * Frontmatter validation result
 */
export interface ValidationResult {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Coherence IDs in frontmatter
 */
export interface CoherenceIds {
  conversation_id?: string;
  insight_id?: string;
  decision_id?: string;
  concept_ids?: string[];
  source?: string;
}

/**
 * Complete canonical frontmatter schema
 */
export interface CanonicalFrontmatter extends CoherenceIds {
  type?: NoteType | string;
  para?: ParaCategory | string;
  stage?: LifecycleStage | string;
  created?: string;
  updated?: string;
  tags?: string[];
  status?: string;
  confidence?: Confidence | string;
  title?: string;
  // Decision-specific
  decision_id?: string;
  decision_date?: string;
  review_date?: string;
  depends_on?: string[];
  supersedes?: string[];
  // Evergreen-specific
  sources?: string[];
}

/**
 * Validate note type
 */
export function isValidNoteType(type: any): type is NoteType {
  return typeof type === 'string' && NOTE_TYPES.includes(type as NoteType);
}

/**
 * Validate PARA category
 */
export function isValidParaCategory(para: any): para is ParaCategory {
  return typeof para === 'string' && PARA_CATEGORIES.includes(para as ParaCategory);
}

/**
 * Validate lifecycle stage
 */
export function isValidLifecycleStage(stage: any): stage is LifecycleStage {
  return typeof stage === 'string' && LIFECYCLE_STAGES.includes(stage as LifecycleStage);
}

/**
 * Validate confidence level
 */
export function isValidConfidence(confidence: any): confidence is Confidence {
  return typeof confidence === 'string' && CONFIDENCE_LEVELS.includes(confidence as Confidence);
}

/**
 * Validate frontmatter against schema
 */
export function validateFrontmatter(
  frontmatter: Record<string, any> | null
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!frontmatter) {
    return { ok: true, warnings: ['No frontmatter present'] };
  }

  // Validate type
  if (frontmatter.type !== undefined) {
    if (!isValidNoteType(frontmatter.type)) {
      warnings.push(`Unknown note type: ${frontmatter.type}. Expected one of: ${NOTE_TYPES.join(', ')}`);
    }
  }

  // Validate PARA
  if (frontmatter.para !== undefined) {
    if (!isValidParaCategory(frontmatter.para)) {
      warnings.push(`Unknown PARA category: ${frontmatter.para}. Expected one of: ${PARA_CATEGORIES.join(', ')}`);
    }
  }

  // Validate stage
  if (frontmatter.stage !== undefined) {
    if (!isValidLifecycleStage(frontmatter.stage)) {
      warnings.push(`Unknown lifecycle stage: ${frontmatter.stage}. Expected one of: ${LIFECYCLE_STAGES.join(', ')}`);
    }
  }

  // Validate confidence
  if (frontmatter.confidence !== undefined) {
    if (!isValidConfidence(frontmatter.confidence)) {
      warnings.push(`Unknown confidence level: ${frontmatter.confidence}. Expected one of: ${CONFIDENCE_LEVELS.join(', ')}`);
    }
  }

  // Validate dates
  if (frontmatter.created !== undefined) {
    if (typeof frontmatter.created !== 'string') {
      errors.push('created must be a string (ISO date)');
    }
  }

  if (frontmatter.updated !== undefined) {
    if (typeof frontmatter.updated !== 'string') {
      errors.push('updated must be a string (ISO date)');
    }
  }

  // Validate tags
  if (frontmatter.tags !== undefined) {
    if (!Array.isArray(frontmatter.tags)) {
      errors.push('tags must be an array');
    }
  }

  // Validate coherence IDs
  if (frontmatter.conversation_id !== undefined) {
    if (typeof frontmatter.conversation_id !== 'string') {
      errors.push('conversation_id must be a string');
    }
  }

  if (frontmatter.insight_id !== undefined) {
    if (typeof frontmatter.insight_id !== 'string') {
      errors.push('insight_id must be a string');
    }
  }

  if (frontmatter.decision_id !== undefined) {
    if (typeof frontmatter.decision_id !== 'string') {
      errors.push('decision_id must be a string');
    }
  }

  if (frontmatter.concept_ids !== undefined) {
    if (!Array.isArray(frontmatter.concept_ids)) {
      errors.push('concept_ids must be an array');
    }
  }

  // Validate decision-specific fields
  if (frontmatter.depends_on !== undefined) {
    if (!Array.isArray(frontmatter.depends_on)) {
      errors.push('depends_on must be an array');
    }
  }

  if (frontmatter.supersedes !== undefined) {
    if (!Array.isArray(frontmatter.supersedes)) {
      errors.push('supersedes must be an array');
    }
  }

  // Validate evergreen-specific fields
  if (frontmatter.sources !== undefined) {
    if (!Array.isArray(frontmatter.sources)) {
      errors.push('sources must be an array');
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

/**
 * Generate coherence ID
 */
export function generateCoherenceId(
  type: 'conversation' | 'insight' | 'decision' | 'concept',
  suffix?: string
): string {
  const prefix = COHERENCE_ID_PREFIXES[type];
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const random = Math.random().toString(36).substring(2, 8);

  if (suffix) {
    return `${prefix}${timestamp}-${suffix}`;
  }

  return `${prefix}${timestamp}-${random}`;
}

/**
 * Infer defaults from path
 */
export function inferDefaultsFromPath(path: string): Partial<CanonicalFrontmatter> {
  const defaults: Partial<CanonicalFrontmatter> = {};
  const pathLower = path.toLowerCase();

  // Infer type from path
  if (pathLower.includes('atomic') || pathLower.includes('atoms')) {
    defaults.type = 'atomic';
    defaults.stage = 'process';
  } else if (pathLower.includes('evergreen')) {
    defaults.type = 'evergreen';
    defaults.stage = 'synthesize';
  } else if (pathLower.includes('decision')) {
    defaults.type = 'decision';
    defaults.stage = 'crystallize';
  } else if (pathLower.includes('project')) {
    defaults.type = 'project';
    defaults.para = 'project';
  } else if (pathLower.includes('journal') || pathLower.includes('daily')) {
    defaults.type = 'journal';
    defaults.stage = 'capture';
  } else if (pathLower.includes('framework')) {
    defaults.type = 'framework';
  }

  // Infer PARA from path
  if (pathLower.includes('projects/') || pathLower.includes('/project/')) {
    defaults.para = 'project';
  } else if (pathLower.includes('areas/') || pathLower.includes('/area/')) {
    defaults.para = 'area';
  } else if (pathLower.includes('resources/') || pathLower.includes('/resource/')) {
    defaults.para = 'resource';
  } else if (pathLower.includes('archive')) {
    defaults.para = 'archive';
  }

  return defaults;
}
