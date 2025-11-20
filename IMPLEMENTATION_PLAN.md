# Implementation Plan: Missing Tools

**Priority Focus:** P0 and P1 tools (Core CRUD + Batch Operations)
**Target:** Bring tool coverage from 50% to 70%

---

## Phase 1: Core CRUD Tools (P0)

### 1. `update-note` (Priority: CRITICAL)

**File:** `src/tools/update-note.ts`

**Input Schema:**
```typescript
type UpdateNoteInput = {
  vault: string;
  path: string;
  newFrontmatter?: Record<string, any>;
  newBody?: string;
  mergeFrontmatterStrategy?: 'replace' | 'merge'; // default 'merge'
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};
```

**Implementation Steps:**
1. Read current note via `read-note` logic
2. Compute `prev_hash` from current content
3. Apply frontmatter merge/replace strategy:
   - `merge`: Shallow merge `{...oldFrontmatter, ...newFrontmatter}`
   - `replace`: Use `newFrontmatter` entirely
4. Construct new content (frontmatter + body)
5. Check if content actually changed (hash comparison)
6. If changed:
   - Write file
   - Optionally lint (if `autoLint=true`)
   - Compute `new_hash`
   - Insert `note_history` entry
   - Update file index
7. Return `UpdateNoteOutput` with hashes and history entry ID

**Dependencies:**
- Existing: `src/vault/index.ts` (FileOperations)
- Existing: `src/database/index.ts` (note_history table)
- New: Hash computation utility (e.g., `crypto.createHash('sha256')`)
- New: Idempotency check on `requestId`

**Tests:**
- Merge vs replace frontmatter
- Body-only update
- Frontmatter-only update
- No-op (no changes)
- Idempotency (same requestId twice)
- autoLint integration

---

### 2. `append-content` (Priority: CRITICAL)

**File:** `src/tools/append-content.ts`

**Input Schema:**
```typescript
type AppendContentInput = {
  vault: string;
  path: string;
  content: string;
  createIfNotExists?: boolean; // default true
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};
```

**Implementation Steps:**
1. Check if note exists
2. If not exists:
   - If `createIfNotExists=true`: create via `create-note`
   - Else: return error
3. If exists:
   - Read current note
   - Append `\n\n${content}` to body
   - Call `update-note` with new body
4. Return result with `created` flag

**Dependencies:**
- `update-note` (must implement first)

**Tests:**
- Append to existing note
- Create new note
- Error when createIfNotExists=false and note missing

---

### 3. `get-note-history` (Priority: CRITICAL)

**File:** `src/tools/get-note-history.ts`

**Input Schema:**
```typescript
type GetNoteHistoryInput = {
  vault: string;
  path: string;
  limit?: number;  // default 20
  offset?: number; // default 0
};
```

**Implementation Steps:**
1. Validate vault and path exist
2. Query `note_history` table:
```sql
SELECT id, timestamp, operation, tool, actor, source, request_id, prev_hash, new_hash
FROM note_history
WHERE vault = ? AND path = ?
ORDER BY timestamp DESC
LIMIT ? OFFSET ?
```
3. Format as `NoteHistoryEntry[]`
4. Return with pagination metadata

**Dependencies:**
- Existing: `note_history` table

**Tests:**
- Pagination
- Empty history
- Invalid vault/path

---

### 4. `delete-file` (Priority: P1)

**File:** `src/tools/delete-file.ts`

**Input Schema:**
```typescript
type DeleteFileInput = {
  vault: string;
  path: string;
  recursive?: boolean; // dirs only
  dryRun?: boolean;    // default false
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};
```

**Implementation Steps:**
1. Validate vault and path
2. Check if file or directory
3. If directory and not `recursive`: error
4. If `dryRun=true`:
   - Return list of files that would be deleted
5. Else:
   - For each file to delete:
     - Compute final hash
     - Delete file from filesystem
     - Insert `note_history` entry (operation='delete')
     - Remove from file index
6. Return `DeleteFileOutput`

**Dependencies:**
- Existing: FileOperations
- Provenance system

**Tests:**
- Delete single file
- Delete directory (recursive)
- Error on directory without recursive
- dryRun mode
- Idempotency

---

### 5. `patch-content` (Priority: P1)

**File:** `src/tools/patch-content.ts`

**Input Schema:**
```typescript
type PatchContentInput = {
  vault: string;
  path: string;
  anchorType: 'heading' | 'block' | 'frontmatter';
  anchorValue: string;
  content: string;
  position?: 'before' | 'after' | 'replace'; // default 'after'
  autoLint?: boolean;
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};
```

**Implementation Steps:**
1. Read current note
2. Parse anchors using **Regex+** (CRITICAL: do not use ad-hoc regex):
   - **Heading anchor:** `## Anchor Value` → find line
   - **Block anchor:** `^block-id` → find line
   - **Frontmatter anchor:** YAML key in frontmatter
3. Locate anchor position in body/frontmatter
4. Insert/replace content at position:
   - `before`: Insert line before anchor
   - `after`: Insert line after anchor (or after heading section)
   - `replace`: Replace anchor line/section
5. Call `update-note` with modified body/frontmatter
6. Return result

**Dependencies:**
- `update-note`
- **Regex+ library** (must add to package.json if missing)
- Anchor parsing utilities (new module: `src/utils/anchors.ts`)

**Tests:**
- Patch after heading
- Patch before heading
- Replace heading section
- Patch frontmatter key
- Block reference anchor
- Error on missing anchor

**Implementation Notes:**
- This is the most complex tool in Phase 1
- Consider implementing heading anchors first, then blocks, then frontmatter
- Edge cases: duplicate headings (use first match or return error)

---

### 6. `list-files-in-dir` (Priority: P2)

**File:** `src/tools/list-files-in-dir.ts`

**Input Schema:**
```typescript
type ListFilesInDirInput = {
  vault: string;
  directory: string;
  includeMetadata?: boolean;
  notesOnly?: boolean;
  filterQuery?: string;
};
```

**Implementation Steps:**
1. Reuse `list-files-in-vault` logic
2. Filter results to only include files under `directory` prefix
3. Return same `FileEntry[]` format

**Dependencies:**
- Existing: `list-files-in-vault`

**Tests:**
- List files in subdirectory
- Nested directories
- Root directory
- filterQuery with directory

---

## Phase 2: Batch & Power Tools (P1)

### 7. `batch-operations` (Priority: CRITICAL)

**File:** `src/tools/batch-operations.ts`

**Input Schema:**
```typescript
type BatchOperation =
  | { type: 'update-frontmatter'; path: string; changes: Record<string, any> }
  | { type: 'add-tags'; path: string; tags: string[] }
  | { type: 'remove-tags'; path: string; tags: string[] }
  | { type: 'move-file'; path: string; newPath: string }
  | { type: 'apply-template'; path: string; templateId: string };

type BatchOperationsInput = {
  vault: string;
  operations: BatchOperation[];
  dryRun?: boolean;  // default true
  maxItems?: number; // default 20
  source?: string;
  actor?: 'user' | 'llm' | 'system';
  requestId?: string;
};
```

**Implementation Steps:**
1. Validate vault
2. Validate `operations.length <= maxItems`
3. For each operation:
   - If `dryRun=true`: Validate operation (check file exists, etc.)
   - Else: Execute operation:
     - `update-frontmatter`: Call `update-note`
     - `add-tags` / `remove-tags`: Read frontmatter, modify tags array, call `update-note`
     - `move-file`: Rename file, update index, record provenance
     - `apply-template`: Load template, merge with note, call `update-note`
4. Aggregate results per operation
5. Group provenance by note (one history entry per note, operation='batch')
6. Return `BatchOperationResult[]`

**Dependencies:**
- `update-note`
- Template system (may need to implement or stub)
- File move logic

**Tests:**
- dryRun mode
- update-frontmatter operation
- add-tags operation
- remove-tags operation
- move-file operation
- maxItems safety limit
- Partial failure handling

**Implementation Notes:**
- Consider atomicity: should batch fail entirely if one operation fails, or continue?
- Spec doesn't clarify; recommend "continue on error" with detailed error reporting per operation

---

### 8. `execute-dataview-query` (Priority: P1, HIGH RISK)

**File:** `src/tools/execute-dataview-query.ts`

**Input Schema:**
```typescript
type ExecuteDataviewQueryInput = {
  vault: string;
  query: string;                   // DQL
  format?: 'table' | 'list' | 'task' | 'raw';
};
```

**Implementation Strategy (RESEARCH REQUIRED):**

**Option A: Embed Dataview Plugin**
- **Pros:** Full DQL compatibility
- **Cons:** Requires Obsidian plugin ecosystem dependencies (heavy)

**Option B: Implement DQL Subset**
- **Pros:** Lightweight, controlled
- **Cons:** Limited feature set, maintenance burden

**Option C: Use External DQL Parser**
- Research if any standalone DQL parsers exist

**Recommended Approach:**
1. **MVP:** Implement subset supporting common queries:
   - `TABLE` queries with basic fields
   - `FROM` tag/folder filters
   - `WHERE` simple conditions
   - `SORT` by date/name
2. **Future:** Expand based on user feedback

**Implementation Steps (Subset Approach):**
1. Parse DQL query (simple parser or regex-based)
2. Extract query type (TABLE, LIST, TASK)
3. Extract `FROM`, `WHERE`, `SORT` clauses
4. Query file index + frontmatter
5. Filter and sort results
6. Format as `DataviewRow[]`
7. Return result

**Dependencies:**
- DQL parser (new module: `src/dataview/parser.ts`)
- Query executor (new module: `src/dataview/executor.ts`)

**Tests:**
- TABLE query with tags filter
- LIST query with folder filter
- WHERE clause (frontmatter field matching)
- SORT by date
- Invalid query error handling

**Timeline:**
- Research: 1-2 days
- MVP subset: 3-5 days
- Testing: 1-2 days
- **Total: 5-9 days**

---

## Phase 3: Discovery Tools (P1-P2)

### 9. `find-similar-notes` (Priority: P1)

**File:** `src/tools/find-similar-notes.ts`

**Input Schema:**
```typescript
type FindSimilarNotesInput = {
  vault: string;
  path: string;
  limit?: number;
  includeSharedTerms?: boolean;
};
```

**Implementation Steps:**
1. Read anchor note
2. Extract features:
   - Tags
   - Concepts (from `concept_notes` table)
   - Terms (word frequency)
3. For all other notes in vault:
   - Compute similarity score:
     - Tag overlap (Jaccard)
     - Concept overlap (Jaccard)
     - Term overlap (TF-IDF cosine similarity - optional)
4. Rank by score
5. Return top `limit` results

**Dependencies:**
- Existing: `extract-concepts`
- Optional: TF-IDF vectorizer

**Tests:**
- Similar notes by tags
- Similar notes by concepts
- includeSharedTerms flag

---

### 10. `find-by-concept` (Priority: P1)

**File:** `src/tools/find-by-concept.ts`

**Input Schema:**
```typescript
type FindByConceptInput = {
  vault: string;
  concept: string;
  limit?: number;
};
```

**Implementation Steps:**
1. Query `concepts` table for `concept_id` matching `concept` (normalized)
2. Query `concept_notes` table for notes with that `concept_id`
3. Join with file metadata
4. Return as `SearchResult[]`

**Dependencies:**
- Existing: `concepts`, `concept_notes` tables

**Tests:**
- Find by exact concept
- Find by normalized concept
- Case sensitivity
- Missing concept

---

### 11. `find-concept-variations` (Priority: P2)

**File:** `src/tools/find-concept-variations.ts`

**Input Schema:**
```typescript
type FindConceptVariationsInput = {
  vault: string;
  concept: string;
};
```

**Implementation Steps:**
1. Normalize input `concept`
2. Query `concepts` table WHERE `normalized = ?`
3. Return all variants (original `term` values)

**Dependencies:**
- Existing: `concepts` table

**Tests:**
- Multiple variations
- Single variation
- No variations

---

### 12. `get-activity-timeline` (Priority: P2)

**File:** `src/tools/get-activity-timeline.ts`

**Input Schema:**
```typescript
type GetActivityTimelineInput = {
  vault: string;
  startDate?: string;  // ISO date
  endDate?: string;    // ISO date
  limit?: number;
};
```

**Implementation Steps:**
1. Query `note_history` table:
```sql
SELECT timestamp, operation, path, tool, actor
FROM note_history
WHERE vault = ?
  AND timestamp >= ?
  AND timestamp <= ?
ORDER BY timestamp DESC
LIMIT ?
```
2. Group by date or time bucket
3. Format as timeline events
4. Return `ActivityTimeline`

**Dependencies:**
- Existing: `note_history` table

**Tests:**
- Date range filtering
- No date range (all history)
- Grouping by day

---

## Phase 4: Advanced Tools (P3)

Deferred until Phase 1-3 complete. Includes:
- `find-content-clusters`
- `find-frequent-pairs`
- `find-co-citation`
- `find-temporal-related`
- `find-temporal-clusters`
- `extract-knowledge`

---

## Technical Debt Items

### A. Provenance Audit

**Files to Audit:**
- `src/tools/create-note.ts`
- `src/tools/evergreen-note.ts`
- `src/tools/decision-log.ts`
- `src/tools/process-conversation.ts`
- `src/tools/lint-note.ts`
- `src/tools/lint-folder.ts`

**Checklist per Tool:**
- [ ] Accepts `actor`, `source`, `requestId` parameters
- [ ] Computes `prev_hash` and `new_hash`
- [ ] Inserts `note_history` entry
- [ ] Enforces idempotency on `requestId`
- [ ] Tests for idempotency

**Estimated Effort:** 0.5 days per tool = 3 days total

---

### B. Hash Utility

**File:** `src/utils/hash.ts`

**Implementation:**
```typescript
import { createHash } from 'crypto';

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
```

**Usage:**
```typescript
const prevHash = computeContentHash(oldContent);
const newHash = computeContentHash(newContent);
```

---

### C. Idempotency Helper

**File:** `src/database/provenance.ts`

**Implementation:**
```typescript
export async function checkIdempotency(
  db: KnowledgeDatabase,
  vault: string,
  path: string,
  requestId: string
): Promise<{ exists: boolean; historyEntryId?: number }> {
  const row = await db.queryOne(
    `SELECT id FROM note_history
     WHERE vault = ? AND path = ? AND request_id = ?
     LIMIT 1`,
    [vault, path, requestId]
  );
  return { exists: !!row, historyEntryId: row?.id };
}

export async function recordHistoryEntry(
  db: KnowledgeDatabase,
  entry: {
    vault: string;
    path: string;
    operation: string;
    tool: string;
    actor: string;
    source?: string;
    requestId?: string;
    prevHash?: string;
    newHash: string;
  }
): Promise<number> {
  const result = await db.execute(
    `INSERT INTO note_history
     (vault, path, timestamp, operation, tool, actor, source, request_id, prev_hash, new_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.vault,
      entry.path,
      new Date().toISOString(),
      entry.operation,
      entry.tool,
      entry.actor,
      entry.source || null,
      entry.requestId || null,
      entry.prevHash || null,
      entry.newHash
    ]
  );
  return result.lastInsertRowid;
}
```

---

### D. Regex+ Integration

**Status:** Spec requires Regex+ for all regex operations.

**Action Items:**
1. Add to package.json:
```json
{
  "dependencies": {
    "regex-plus": "^1.0.0"  // Replace with actual package
  }
}
```

2. Create helper module: `src/utils/regex-plus.ts`
3. Replace all `RegExp` usage with Regex+ wrappers

**Files to Audit:**
- `src/search/` (link extraction, tag parsing)
- `src/tools/patch-content.ts` (anchor parsing)

**Estimated Effort:** 2-3 days

---

## Testing Strategy

### Unit Tests
- Each tool should have `src/tools/__tests__/<tool-name>.test.ts`
- Test all input validation
- Test error cases
- Test provenance recording

### Integration Tests
- End-to-end workflows:
  - Create → Update → Patch → Append → Delete
  - Batch operations on multiple notes
  - Search → Find Similar → Analyze Connections

### Fixtures
- Use `tests/fixtures/sample-vault/` with known notes
- Seed database with test data

---

## Acceptance Criteria

### Per Tool
- [ ] Implements spec input/output schema exactly
- [ ] Returns `ToolResponse<T>` envelope
- [ ] Records provenance (if write operation)
- [ ] Handles errors gracefully
- [ ] Has unit tests (>80% coverage)
- [ ] Has integration test
- [ ] Documented in CLAUDE.md (update spec with actual behavior)

### Per Phase
- [ ] All tools in phase implemented
- [ ] Integration test suite passes
- [ ] Tool coverage metric updated
- [ ] CHANGELOG.md updated

---

## Timeline Estimate

| Phase | Tools | Days | Calendar Weeks |
|-------|-------|------|----------------|
| Phase 1 (Core CRUD) | 6 tools | 10-12 | 2 weeks |
| Provenance Audit | - | 3 | 0.5 weeks |
| Phase 2 (Batch & Dataview) | 2 tools | 8-11 | 2 weeks |
| Phase 3 (Discovery) | 4 tools | 5-6 | 1 week |
| **Total (P0/P1)** | **12 tools** | **26-32 days** | **5-6 weeks** |

**Assumptions:**
- 1 developer, full-time
- Includes testing, documentation, code review
- Does not include Phase 4 (P3 advanced tools)

---

## Success Metrics

### Quantitative
- **Tool Coverage:** 50% → 70% (20 → 32 tools)
- **Test Coverage:** >80% for new tools
- **Build Pass Rate:** 100%

### Qualitative
- All P0/P1 workflows unblocked
- Provenance system complete and consistent
- Dataview query support (even if subset)

---

## Risks & Mitigations

### Risk: Dataview Integration Complexity
- **Mitigation:** Start with MVP subset; expand incrementally

### Risk: Regex+ Library Not Available
- **Mitigation:** Research alternatives; worst case, implement safe regex wrappers

### Risk: Provenance Audit Reveals Deep Issues
- **Mitigation:** Budget extra time for refactoring if needed

---

## Next Steps

1. **Prioritize Phase 1 for immediate sprint**
2. **Research Dataview integration strategy** (before starting Phase 2)
3. **Create GitHub issues** with this plan as description
4. **Set up project board** with Phase 1-3 columns

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Session:** claude/analyze-missing-tools-01Ryd6fGDYxPRbEbtbNiipF1
