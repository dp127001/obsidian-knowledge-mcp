# Missing Tools Analysis

**Date:** 2025-11-20
**Session:** claude/analyze-missing-tools-01Ryd6fGDYxPRbEbtbNiipF1

## Executive Summary

The Obsidian Knowledge MCP server currently implements **20 of 40+** tools defined in the CLAUDE.md specification. This analysis identifies **21 missing tools**, categorizes them by priority, and provides an implementation roadmap.

### Current State
- **Implemented:** 20 tools (50% coverage)
- **Missing:** 21 tools (50% gap)
- **Critical Gap:** Note mutation (update, patch, append, delete) and batch operations

---

## Currently Implemented Tools (20)

### Core Notes & Files (4/10)
✅ `list-vaults` - List configured vaults
✅ `list-files-in-vault` - List files with fuzzy filtering
✅ `read-note` - Read note with frontmatter parsing
✅ `create-note` - Create notes with provenance

### Search & Discovery (6/14)
✅ `search-vault` - Hybrid exact/fuzzy search
✅ `fuzzy-search` - Fuzzy matching via uFuzzy/fuzzysort
✅ `find-broken-links` - Find broken wikilinks with suggestions
✅ `extract-concepts` - Extract and rank concepts
✅ `analyze-tags` - Tag usage statistics
✅ `analyze-connections` - Connection suggestions

### Dataview & Batch (0/2)
❌ None implemented

### Knowledge Workflows (3/4)
✅ `process-conversation` - Convert conversations to atomic notes
✅ `evergreen-note` - Create/update evergreen notes
✅ `decision-log` - ADR-style decision records

### Linting (2/2)
✅ `lint-note` - Lint single note
✅ `lint-folder` - Batch linting

### Health & Admin (5/5)
✅ `vault-health-enhanced` - Comprehensive health metrics
✅ `get-server-status` - Server snapshot
✅ `index-status` - Search index status
✅ `rebuild-index` - Force index rebuild
✅ `verify-database` - Database integrity checks

---

## Missing Tools (21)

### A. Core Notes & Files (6 missing)

#### **Priority: CRITICAL**

**1. `update-note` (§5.1.6)**
- **Purpose:** Update existing notes with merge/replace semantics
- **Why Critical:** Core CRUD operation; evergreen-note and decision-log currently work around this
- **Complexity:** Medium
- **Dependencies:** Provenance system (already implemented)
- **Spec Reference:** CLAUDE.md §5.1.6

**2. `patch-content` (§5.1.7)**
- **Purpose:** Surgical updates via anchors (headings, blocks, frontmatter keys)
- **Why Critical:** Enables precise note evolution without full rewrites
- **Complexity:** High (requires Regex+ anchor parsing)
- **Dependencies:** update-note, Regex+ helpers
- **Spec Reference:** CLAUDE.md §5.1.7

**3. `append-content` (§5.1.8)**
- **Purpose:** Append content to notes (e.g., daily note updates)
- **Why Critical:** Common workflow pattern
- **Complexity:** Low
- **Dependencies:** update-note
- **Spec Reference:** CLAUDE.md §5.1.8

**4. `delete-file` (§5.1.9)**
- **Purpose:** Delete files/folders with provenance
- **Why Critical:** Complete CRUD lifecycle
- **Complexity:** Medium (must handle provenance for deleted files)
- **Dependencies:** Provenance system
- **Spec Reference:** CLAUDE.md §5.1.9

**5. `get-note-history` (§5.1.10)**
- **Purpose:** Query note_history table with pagination
- **Why Critical:** Audit trail visibility; user-facing feature
- **Complexity:** Low (SQL query + formatting)
- **Dependencies:** note_history table (already exists)
- **Spec Reference:** CLAUDE.md §5.1.10

**6. `list-files-in-dir` (§5.1.3)**
- **Purpose:** List files in specific directory (vs entire vault)
- **Why Critical:** Low (convenience wrapper)
- **Complexity:** Trivial (reuse list-files-in-vault logic)
- **Dependencies:** None
- **Spec Reference:** CLAUDE.md §5.1.3

---

### B. Search & Discovery (8 missing)

#### **Priority: HIGH**

**7. `find-similar-notes` (§5.2.3)**
- **Purpose:** Semantic similarity + term/tag matching
- **Why High:** Key discovery workflow
- **Complexity:** Medium (semantic embeddings optional)
- **Dependencies:** Search engine, concept extraction
- **Spec Reference:** CLAUDE.md §5.2.3

**8. `find-by-concept` (§5.2.7)**
- **Purpose:** Find notes by concept_id
- **Why High:** Leverages concept extraction investment
- **Complexity:** Low (SQL query)
- **Dependencies:** concepts/concept_notes tables (already exist)
- **Spec Reference:** CLAUDE.md §5.2.7

#### **Priority: MEDIUM**

**9. `find-content-clusters` (§5.2.4)**
- **Purpose:** Cluster notes by content similarity
- **Complexity:** High (clustering algorithm)
- **Spec Reference:** CLAUDE.md §5.2.4

**10. `find-frequent-pairs` (§5.2.5)**
- **Purpose:** Notes frequently co-cited
- **Complexity:** Medium (graph analysis)
- **Spec Reference:** CLAUDE.md §5.2.5

**11. `find-co-citation` (§5.2.6)**
- **Purpose:** Co-citation analysis
- **Complexity:** Medium (graph analysis)
- **Spec Reference:** CLAUDE.md §5.2.6

**12. `find-concept-variations` (§5.2.7)**
- **Purpose:** Find term variations/synonyms
- **Complexity:** Low (query concepts table)
- **Spec Reference:** CLAUDE.md §5.2.7

**13. `get-activity-timeline` (§5.2.8)**
- **Purpose:** Timeline of note activity
- **Complexity:** Low (query note_history)
- **Spec Reference:** CLAUDE.md §5.2.8

**14. `find-temporal-related` (§5.2.8)**
- **Purpose:** Notes related by time proximity
- **Complexity:** Medium
- **Spec Reference:** CLAUDE.md §5.2.8

**15. `find-temporal-clusters` (§5.2.8)**
- **Purpose:** Cluster notes by temporal patterns
- **Complexity:** Medium
- **Spec Reference:** CLAUDE.md §5.2.8

---

### C. Dataview & Batch (2 missing)

#### **Priority: CRITICAL**

**16. `execute-dataview-query` (§5.3.1)**
- **Purpose:** Run Dataview queries (DQL)
- **Why Critical:** Power-user feature; enables complex filtering
- **Complexity:** High (integrate Dataview engine)
- **Dependencies:** Dataview library or parser
- **Spec Reference:** CLAUDE.md §5.3.1
- **Note:** May require embedding Obsidian's Dataview plugin or implementing DQL subset

**17. `batch-operations` (§5.3.2)**
- **Purpose:** Bulk updates (frontmatter, tags, moves)
- **Why Critical:** Essential for health workflows (fix orphans, standardize tags)
- **Complexity:** Medium
- **Dependencies:** update-note, delete-file
- **Spec Reference:** CLAUDE.md §5.3.2

---

### D. Knowledge Workflows (1 missing)

#### **Priority: MEDIUM**

**18. `extract-knowledge` (§5.4.1)**
- **Purpose:** Extract insights from raw text (abstraction layer)
- **Why Medium:** Useful for multi-vault policy (work → personal abstraction)
- **Complexity:** Medium (LLM integration or heuristics)
- **Dependencies:** None (pure function)
- **Spec Reference:** CLAUDE.md §5.4.1

---

### E. Epic-Specific Missing Features

**19-21. Provenance Extensions**
- **Note:** While `note_history` table exists, several tools don't fully implement:
  - `actor`, `source`, `requestId` parameters
  - Hash computation (`prev_hash`, `new_hash`)
  - Idempotency on `requestId`

**Status:** Partially implemented; needs audit and completion across all write tools.

---

## Priority Matrix

### P0 - Blocking Core Workflows
1. **`update-note`** - Blocks note evolution workflows
2. **`batch-operations`** - Blocks health remediation workflows
3. **`get-note-history`** - User-facing audit trail

### P1 - Critical Features
4. **`delete-file`** - Complete CRUD lifecycle
5. **`append-content`** - Common pattern (daily notes)
6. **`patch-content`** - Surgical updates
7. **`execute-dataview-query`** - Power-user queries
8. **`find-similar-notes`** - Key discovery workflow
9. **`find-by-concept`** - Leverages existing concept system

### P2 - Quality of Life
10. **`list-files-in-dir`** - Convenience wrapper
11. **`find-concept-variations`** - Concept discovery
12. **`get-activity-timeline`** - Temporal insights
13. **`extract-knowledge`** - Cross-vault abstraction

### P3 - Advanced Features
14-21. Clustering, co-citation, temporal analysis tools

---

## Implementation Roadmap

### Phase 1: Core CRUD Completion (P0)
**Epic 1 Alignment: Core Platform & Provenance**

1. **`update-note`** (2-3 days)
   - Implement merge/replace frontmatter semantics
   - Wire provenance (hash, history entry, idempotency)
   - Add tests for merge strategies

2. **`append-content`** (1 day)
   - Wrapper around update-note
   - Handle create-if-not-exists logic

3. **`patch-content`** (3-4 days)
   - Implement Regex+ anchor parsing (headings, blocks, frontmatter)
   - Position logic (before/after/replace)
   - Edge case handling (missing anchors)

4. **`delete-file`** (2 days)
   - Implement with provenance
   - Handle directories (recursive)
   - dryRun mode

5. **`get-note-history`** (1 day)
   - SQL query with pagination
   - Format as ToolResponse

6. **`list-files-in-dir`** (0.5 days)
   - Reuse list-files-in-vault with directory filter

**Total:** ~10-12 days

### Phase 2: Batch & Power Features (P1)
**Epic Alignment: Health & Batch Operations**

7. **`batch-operations`** (3-4 days)
   - Design operation types (update-frontmatter, add-tags, remove-tags, move-file, apply-template)
   - Implement with dryRun
   - Aggregate provenance per note
   - Safety limits (maxItems)

8. **`execute-dataview-query`** (5-7 days)
   - Research: Embed Dataview vs implement DQL subset
   - Implement DQL parser or integrate Dataview engine
   - Format results as DataviewRow[]
   - Add tests with sample queries

**Total:** ~8-11 days

### Phase 3: Discovery & Concepts (P1-P2)
**Epic 2 Alignment: Search & Connections**

9. **`find-similar-notes`** (2-3 days)
   - Combine semantic (optional), term, tag similarity
   - Return SimilarNote[] with sharedTerms

10. **`find-by-concept`** (1 day)
    - Query concept_notes table
    - Join with file metadata

11. **`find-concept-variations`** (1 day)
    - Query concepts table for variants

12. **`get-activity-timeline`** (1 day)
    - Query note_history grouped by time
    - Format as timeline events

**Total:** ~5-6 days

### Phase 4: Advanced Features (P3)
**Epic Alignment: Optional Enhancements**

13-18. Clustering, co-citation, temporal tools (10-15 days)

---

## Technical Debt & Gaps

### 1. Provenance Audit
**Status:** note_history table exists, but not all tools use it consistently.

**Action Items:**
- Audit all write tools (create-note, evergreen-note, decision-log, lint-note, lint-folder)
- Ensure:
  - `actor`, `source`, `requestId` accepted
  - `prev_hash`, `new_hash` computed
  - Idempotency enforced on `requestId`
- Add integration tests for provenance

**Estimated Effort:** 3-5 days

### 2. Regex+ Integration
**Status:** Spec requires Regex+ for all regex operations; current implementation status unclear.

**Action Items:**
- Audit current regex usage (search, link parsing, anchor parsing)
- Replace with Regex+ helpers
- Add Regex+ to dependencies

**Estimated Effort:** 2-3 days

### 3. Multi-Vault Policy
**Status:** Vault classification exists in spec but not enforced.

**Action Items:**
- Add `classification: 'personal' | 'work'` to VaultConfig
- Implement policy enforcement in write tools
- Add POLICY_VIOLATION error code

**Estimated Effort:** 2-3 days

### 4. Linter Integration Completeness
**Status:** lint-note and lint-folder exist; autoLint parameter not universally supported.

**Action Items:**
- Add `autoLint?: boolean` to all write tools
- Integrate linter with single history entry per logical change

**Estimated Effort:** 2-3 days

---

## Risk Assessment

### High Risk
- **`execute-dataview-query`**: Dataview integration may require significant reverse-engineering or embedding Obsidian plugin ecosystem
- **Clustering/Semantic Tools**: May require ML dependencies (embeddings, clustering algorithms)

### Medium Risk
- **`patch-content`**: Anchor parsing edge cases (malformed markdown, duplicate headings)
- **`batch-operations`**: Atomicity and rollback semantics unclear in spec

### Low Risk
- Simple CRUD tools (update, append, delete)
- SQL-backed tools (find-by-concept, get-note-history)

---

## Dependencies & External Libraries

### Required
- **Regex+**: Safe regex parsing (currently missing from package.json)
- **Dataview**: DQL execution (if implementing execute-dataview-query)

### Already Integrated
- uFuzzy (fuzzy search)
- fuzzysort (path/name fuzzy matching)
- obsidian-linter (markdown formatting)

### Optional (for Advanced Features)
- Embeddings library (e.g., sentence-transformers.js) for semantic similarity
- Clustering library (e.g., ml-kmeans) for content-clusters

---

## Recommendations

### Immediate Actions (Next Sprint)
1. **Implement Phase 1 (Core CRUD)** - Unblocks workflows
2. **Provenance Audit** - Ensures consistency
3. **Create GitHub Issues** - Track each missing tool

### Medium-Term (1-2 Months)
4. **Implement Phase 2 (Batch & Dataview)** - Power-user features
5. **Implement Phase 3 (Discovery)** - Completes search ecosystem

### Long-Term (3+ Months)
6. **Implement Phase 4 (Advanced)** - Nice-to-have features
7. **Multi-Vault Policy** - Enterprise/privacy features

### Research Tasks
- **Dataview Integration Strategy**: Evaluate embedding vs reimplementing DQL
- **Semantic Search**: Evaluate local embeddings vs optional external service

---

## Success Metrics

### Coverage Goals
- **Phase 1 Complete:** 65% tool coverage (26/40)
- **Phase 2 Complete:** 70% tool coverage (28/40)
- **Phase 3 Complete:** 80% tool coverage (32/40)

### Quality Gates
- All new tools must:
  - Follow ToolResponse<T> envelope
  - Include provenance parameters (actor, source, requestId)
  - Have integration tests
  - Update CLAUDE.md with actual behavior

---

## Appendix: Tool Spec Cross-Reference

| Tool Name | Spec Section | Priority | Complexity | Status |
|-----------|--------------|----------|------------|--------|
| list-vaults | §5.1.1 | - | - | ✅ Implemented |
| list-files-in-vault | §5.1.2 | - | - | ✅ Implemented |
| list-files-in-dir | §5.1.3 | P2 | Trivial | ❌ Missing |
| read-note | §5.1.4 | - | - | ✅ Implemented |
| create-note | §5.1.5 | - | - | ✅ Implemented |
| update-note | §5.1.6 | P0 | Medium | ❌ Missing |
| patch-content | §5.1.7 | P1 | High | ❌ Missing |
| append-content | §5.1.8 | P1 | Low | ❌ Missing |
| delete-file | §5.1.9 | P1 | Medium | ❌ Missing |
| get-note-history | §5.1.10 | P0 | Low | ❌ Missing |
| search-vault | §5.2.1 | - | - | ✅ Implemented |
| fuzzy-search | §5.2.2 | - | - | ✅ Implemented |
| find-similar-notes | §5.2.3 | P1 | Medium | ❌ Missing |
| find-content-clusters | §5.2.4 | P3 | High | ❌ Missing |
| find-frequent-pairs | §5.2.5 | P3 | Medium | ❌ Missing |
| find-co-citation | §5.2.6 | P3 | Medium | ❌ Missing |
| find-broken-links | §5.2.6 | - | - | ✅ Implemented |
| extract-concepts | §5.2.7 | - | - | ✅ Implemented |
| find-by-concept | §5.2.7 | P1 | Low | ❌ Missing |
| find-concept-variations | §5.2.7 | P2 | Low | ❌ Missing |
| analyze-tags | §5.2.8 | - | - | ✅ Implemented |
| get-activity-timeline | §5.2.8 | P2 | Low | ❌ Missing |
| find-temporal-related | §5.2.8 | P3 | Medium | ❌ Missing |
| find-temporal-clusters | §5.2.8 | P3 | Medium | ❌ Missing |
| analyze-connections | §5.2.8 | - | - | ✅ Implemented |
| execute-dataview-query | §5.3.1 | P1 | High | ❌ Missing |
| batch-operations | §5.3.2 | P0 | Medium | ❌ Missing |
| extract-knowledge | §5.4.1 | P2 | Medium | ❌ Missing |
| process-conversation | §5.4.2 | - | - | ✅ Implemented |
| evergreen-note | §5.4.3 | - | - | ✅ Implemented |
| decision-log | §5.4.4 | - | - | ✅ Implemented |
| lint-note | §5.5.1 | - | - | ✅ Implemented |
| lint-folder | §5.5.2 | - | - | ✅ Implemented |
| index-status | §5.6.1 | - | - | ✅ Implemented |
| rebuild-index | §5.6.2 | - | - | ✅ Implemented |
| verify-database | §5.6.3 | - | - | ✅ Implemented |
| vault-health-enhanced | §5.6.4 | - | - | ✅ Implemented |
| get-server-status | §5.6.5 | - | - | ✅ Implemented |

---

## Next Steps

1. **Review this analysis** with stakeholders/maintainers
2. **Create GitHub issues** for P0/P1 tools
3. **Allocate sprint capacity** for Phase 1 (Core CRUD)
4. **Research Dataview integration** (critical path item)
5. **Update project roadmap** with implementation timeline

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Prepared By:** Claude (Session: claude/analyze-missing-tools-01Ryd6fGDYxPRbEbtbNiipF1)
