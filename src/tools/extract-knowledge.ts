import type { ToolResponse, NoteRef } from '../types/core.js';
import type { ServerContext } from '../server.js';

/**
 * Atomic insight extracted from source text
 */
export interface AtomicInsight {
  id: string;
  summary: string;
  detail?: string;
  tags?: string[];
  confidence: 'low' | 'medium' | 'high';
  sourceSpans?: { start: number; end: number }[];
}

/**
 * Input for extract-knowledge tool (spec §5.4.1)
 */
export interface ExtractKnowledgeInput {
  sourceText: string;
  context?: {
    vault?: string;
    origin?: 'conversation' | 'note' | 'document';
    originRef?: NoteRef | { id: string; type: string };
    date?: string;
  };
}

/**
 * Output from extract-knowledge tool
 */
export interface ExtractKnowledgeOutput {
  insights: AtomicInsight[];
}

/**
 * Extract atomic insights from source text (spec §5.4.1)
 *
 * This tool analyzes text and extracts reusable atomic insights.
 * It's designed for:
 * - Cross-vault abstraction (extracting non-sensitive insights from work content)
 * - Building blocks for process-conversation
 * - Converting unstructured text into structured knowledge
 *
 * The extraction uses heuristics to identify:
 * - Declarative statements (facts, observations)
 * - Decisions and their rationale
 * - Questions and their answers
 * - Key concepts and definitions
 * - Action items and recommendations
 */
export async function handleExtractKnowledge(
  _context: ServerContext,
  args: ExtractKnowledgeInput
): Promise<ToolResponse<ExtractKnowledgeOutput>> {
  try {
    const { sourceText, context } = args;

    if (!sourceText || sourceText.trim().length === 0) {
      return {
        status: 'error',
        error: {
          code: 'INVALID_INPUT',
          message: 'sourceText is required and cannot be empty'
        }
      };
    }

    // Extract insights using heuristic analysis
    const insights = await extractInsights(sourceText, context);

    return {
      status: 'ok',
      data: {
        insights
      },
      meta: {
        tool: 'extract-knowledge',
        vault: context?.vault,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: 'error',
      error: {
        code: 'EXTRACTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error during knowledge extraction'
      }
    };
  }
}

/**
 * Extract insights from source text using heuristic analysis
 */
async function extractInsights(
  sourceText: string,
  context?: ExtractKnowledgeInput['context']
): Promise<AtomicInsight[]> {
  const insights: AtomicInsight[] = [];
  const lines = sourceText.split('\n');

  // Generate base ID from context
  const baseId = context?.originRef && 'id' in context.originRef
    ? context.originRef.id
    : `extract-${Date.now()}`;

  let insightCounter = 1;

  // Track current section/topic for context
  let currentSection = '';

  // Process text line by line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.length === 0) continue;

    // Track markdown headings for section context
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[2].trim();
      continue;
    }

    // Extract different types of insights

    // 1. Decisions (marked by keywords)
    const decisionMatch = line.match(/(?:decided|decision|chose|selected|agreed|resolved):\s*(.+)/i);
    if (decisionMatch) {
      insights.push({
        id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
        summary: decisionMatch[1].trim(),
        detail: currentSection ? `From section: ${currentSection}` : undefined,
        tags: ['decision'],
        confidence: 'high',
        sourceSpans: [{ start: i, end: i }]
      });
      continue;
    }

    // 2. Declarative facts/observations (subject-verb-object patterns)
    const factMatch = line.match(/^(?:•|\*|-|\d+\.)\s*(.+)$/);
    if (factMatch) {
      const statement = factMatch[1].trim();

      // Check if it's a meaningful statement (has verb, sufficient length)
      if (statement.length > 20 && /\b(?:is|are|was|were|has|have|shows|indicates|means|requires|enables)\b/i.test(statement)) {
        insights.push({
          id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
          summary: statement,
          detail: currentSection ? `From section: ${currentSection}` : undefined,
          tags: currentSection ? [currentSection.toLowerCase().replace(/\s+/g, '-')] : [],
          confidence: 'medium',
          sourceSpans: [{ start: i, end: i }]
        });
      }
      continue;
    }

    // 3. Questions and answers
    if (line.endsWith('?')) {
      // Look ahead for answer
      const answer = i + 1 < lines.length ? lines[i + 1].trim() : '';
      if (answer.length > 0) {
        insights.push({
          id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
          summary: `Q: ${line}`,
          detail: `A: ${answer}`,
          tags: ['question'],
          confidence: 'medium',
          sourceSpans: [{ start: i, end: i + 1 }]
        });
      }
      continue;
    }

    // 4. Action items (TODO, SHOULD, MUST, etc.)
    const actionMatch = line.match(/(?:TODO|FIXME|TODO:|should|must|need to|action):\s*(.+)/i);
    if (actionMatch) {
      insights.push({
        id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
        summary: actionMatch[1].trim(),
        tags: ['action'],
        confidence: 'high',
        sourceSpans: [{ start: i, end: i }]
      });
      continue;
    }

    // 5. Definitions (marked by "is a", "means", "refers to")
    const defMatch = line.match(/^(.+?)\s+(?:is a|is an|means|refers to|defined as)\s+(.+)$/i);
    if (defMatch) {
      insights.push({
        id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
        summary: `${defMatch[1].trim()}: ${defMatch[2].trim()}`,
        tags: ['definition'],
        confidence: 'high',
        sourceSpans: [{ start: i, end: i }]
      });
      continue;
    }

    // 6. Key-value pairs (metadata-like)
    const kvMatch = line.match(/^([A-Z][A-Za-z\s]+):\s*(.+)$/);
    if (kvMatch && kvMatch[1].length < 30) {
      insights.push({
        id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
        summary: `${kvMatch[1].trim()}: ${kvMatch[2].trim()}`,
        tags: ['metadata'],
        confidence: 'medium',
        sourceSpans: [{ start: i, end: i }]
      });
      continue;
    }
  }

  // Multi-line insights: Look for paragraph blocks with high information density
  const paragraphs = sourceText.split(/\n\n+/);
  for (let p = 0; p < paragraphs.length; p++) {
    const para = paragraphs[p].trim();

    // Skip short paragraphs or those already processed
    if (para.length < 100) continue;

    // Look for paragraphs with multiple verbs and concepts (high density)
    const verbCount = (para.match(/\b(?:is|are|was|were|has|have|shows|indicates|means|requires|enables|provides|supports|allows)\b/gi) || []).length;
    const conceptCount = (para.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []).length;

    if (verbCount >= 3 && conceptCount >= 5) {
      // Extract first sentence as summary
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length > 0) {
        // Non-null assertion safe because of length check above
        const firstSentence = sentences[0]!;
        insights.push({
          id: `${baseId}-${String(insightCounter++).padStart(3, '0')}`,
          summary: firstSentence.trim(),
          detail: sentences.length > 1 ? sentences.slice(1).join(' ').trim() : undefined,
          tags: ['complex-insight'],
          confidence: 'low',
          sourceSpans: [{ start: p * 2, end: p * 2 }] // Approximate
        });
      }
    }
  }

  // Sort by source position, then by confidence
  insights.sort((a, b) => {
    const aStart = a.sourceSpans?.[0]?.start ?? 0;
    const bStart = b.sourceSpans?.[0]?.start ?? 0;
    if (aStart !== bStart) return aStart - bStart;

    const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3);
  });

  return insights;
}
