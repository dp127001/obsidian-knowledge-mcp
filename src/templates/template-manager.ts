/**
 * Template manager for note creation
 */

import {
  NoteType,
  ParaCategory,
  LifecycleStage,
  Confidence
} from '../types/core.js';
import {
  CanonicalFrontmatter,
  generateCoherenceId
} from '../vault/frontmatter-schema.js';

/**
 * Template definition
 */
export interface NoteTemplate {
  type: NoteType;
  para?: ParaCategory;
  stage: LifecycleStage;
  status: string;
  confidence?: Confidence;
  additionalFields?: Record<string, any>;
  bodyTemplate?: string;
}

/**
 * Template registry
 */
const TEMPLATES: Record<string, NoteTemplate> = {
  // Atomic notes - quick capture, single idea
  atomic: {
    type: 'atomic',
    stage: 'process',
    status: 'draft',
    confidence: 'low',
    bodyTemplate: `# {{title}}

## Context

## Key Insight

## Connections

## Next Steps
`
  },

  // Evergreen notes - long-term knowledge
  evergreen: {
    type: 'evergreen',
    stage: 'synthesize',
    status: 'evergreen',
    confidence: 'high',
    additionalFields: {
      sources: []
    },
    bodyTemplate: `# {{title}}

## Summary

## Details

## Sources

## Related Notes
`
  },

  // Decision records - ADR-style
  decision: {
    type: 'decision',
    stage: 'crystallize',
    status: 'proposed',
    additionalFields: {
      decision_date: new Date().toISOString().split('T')[0],
      depends_on: [],
      supersedes: []
    },
    bodyTemplate: `# {{title}}

## Status

{{status}} - {{decision_date}}

## Context

What is the issue we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

## Alternatives Considered

## Review Date

## Related Decisions
`
  },

  // Project notes
  project: {
    type: 'project',
    para: 'project',
    stage: 'process',
    status: 'active',
    bodyTemplate: `# {{title}}

## Objective

## Timeline

## Tasks

- [ ]

## Resources

## Notes
`
  },

  // Framework notes - mental models
  framework: {
    type: 'framework',
    para: 'resource',
    stage: 'synthesize',
    status: 'evergreen',
    confidence: 'high',
    bodyTemplate: `# {{title}}

## Overview

## Core Principles

## When to Use

## Examples

## Limitations

## Related Frameworks
`
  },

  // Journal/daily notes
  journal: {
    type: 'journal',
    stage: 'capture',
    status: 'draft',
    bodyTemplate: `# {{title}}

## Daily Notes

## Insights

## Tasks

- [ ]

## References
`
  }
};

/**
 * Template selection options
 */
export interface TemplateOptions {
  type?: NoteType;
  para?: ParaCategory;
  stage?: LifecycleStage;
  title?: string;
  addCoherenceIds?: {
    conversation?: boolean;
    insight?: boolean;
    decision?: boolean;
    concept?: boolean;
  };
}

/**
 * Get template by note type
 */
export function getTemplate(type: NoteType): NoteTemplate | undefined {
  return TEMPLATES[type];
}

/**
 * Get all available templates
 */
export function listTemplates(): Array<{ type: NoteType; description: string }> {
  return [
    { type: 'atomic', description: 'Quick capture note for single ideas' },
    { type: 'evergreen', description: 'Long-term knowledge note' },
    { type: 'decision', description: 'Decision record (ADR-style)' },
    { type: 'project', description: 'Project management note' },
    { type: 'framework', description: 'Mental model or framework' },
    { type: 'journal', description: 'Daily journal entry' }
  ];
}

/**
 * Apply template to create frontmatter
 */
export function applyTemplate(
  options: TemplateOptions,
  overrides?: Partial<CanonicalFrontmatter>
): { frontmatter: CanonicalFrontmatter; body: string } {
  const type = options.type || 'atomic';
  const template = TEMPLATES[type];

  if (!template) {
    throw new Error(`Template not found for type: ${type}`);
  }

  // Build base frontmatter from template
  const frontmatter: CanonicalFrontmatter = {
    type: template.type,
    para: options.para || template.para,
    stage: options.stage || template.stage,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    status: template.status,
    confidence: template.confidence,
    tags: [],
    ...template.additionalFields
  };

  // Add title if provided
  if (options.title) {
    frontmatter.title = options.title;
  }

  // Add coherence IDs if requested
  if (options.addCoherenceIds) {
    if (options.addCoherenceIds.conversation) {
      frontmatter.conversation_id = generateCoherenceId('conversation');
    }
    if (options.addCoherenceIds.insight) {
      frontmatter.insight_id = generateCoherenceId('insight');
    }
    if (options.addCoherenceIds.decision) {
      frontmatter.decision_id = generateCoherenceId('decision');
    }
    if (options.addCoherenceIds.concept) {
      frontmatter.concept_ids = [generateCoherenceId('concept')];
    }
  }

  // Apply overrides
  if (overrides) {
    Object.assign(frontmatter, overrides);
  }

  // Generate body from template
  let body = template.bodyTemplate || '';
  if (options.title) {
    body = body.replace(/{{title}}/g, options.title);
  }
  if (frontmatter.status) {
    body = body.replace(/{{status}}/g, frontmatter.status);
  }
  if (frontmatter.decision_date) {
    body = body.replace(/{{decision_date}}/g, frontmatter.decision_date);
  }

  return { frontmatter, body };
}

/**
 * Select template based on path hints
 */
export function selectTemplateFromPath(path: string): NoteTemplate | undefined {
  const pathLower = path.toLowerCase();

  // Check for note type indicators in path
  if (pathLower.includes('atomic') || pathLower.includes('atoms')) {
    return TEMPLATES.atomic;
  } else if (pathLower.includes('evergreen')) {
    return TEMPLATES.evergreen;
  } else if (pathLower.includes('decision')) {
    return TEMPLATES.decision;
  } else if (pathLower.includes('project')) {
    return TEMPLATES.project;
  } else if (pathLower.includes('journal') || pathLower.includes('daily')) {
    return TEMPLATES.journal;
  } else if (pathLower.includes('framework')) {
    return TEMPLATES.framework;
  }

  return undefined;
}

/**
 * Merge template with path-based defaults and user overrides
 */
export function createNoteFromTemplate(
  path: string,
  options: TemplateOptions,
  overrides?: Partial<CanonicalFrontmatter>
): { frontmatter: CanonicalFrontmatter; body: string } {
  // Try to infer template from path if type not specified
  let template = options.type ? getTemplate(options.type) : selectTemplateFromPath(path);

  // Default to atomic if no template found
  if (!template) {
    template = TEMPLATES.atomic;
    options.type = 'atomic';
  }

  // Apply template with overrides
  return applyTemplate(options, overrides);
}

/**
 * Update existing note with template-based defaults
 */
export function enrichFrontmatter(
  existingFrontmatter: Record<string, any> | null,
  path: string
): Partial<CanonicalFrontmatter> {
  const enriched: Partial<CanonicalFrontmatter> = { ...existingFrontmatter };

  // Add updated timestamp
  enriched.updated = new Date().toISOString();

  // Add created if missing
  if (!enriched.created) {
    enriched.created = enriched.updated;
  }

  // Infer type from path if missing
  if (!enriched.type) {
    const template = selectTemplateFromPath(path);
    if (template) {
      enriched.type = template.type;
      enriched.stage = template.stage;
    }
  }

  // Infer para from path if missing
  if (!enriched.para) {
    const pathLower = path.toLowerCase();
    if (pathLower.includes('projects/') || pathLower.includes('/project/')) {
      enriched.para = 'project';
    } else if (pathLower.includes('areas/') || pathLower.includes('/area/')) {
      enriched.para = 'area';
    } else if (pathLower.includes('resources/') || pathLower.includes('/resource/')) {
      enriched.para = 'resource';
    } else if (pathLower.includes('archive')) {
      enriched.para = 'archive';
    }
  }

  // Ensure tags array exists
  if (!enriched.tags) {
    enriched.tags = [];
  }

  return enriched;
}
