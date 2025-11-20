# Dataview DQL Reference - Enhanced Implementation

## Overview

The `execute-dataview-query` MCP tool implements a comprehensive subset of Dataview Query Language (DQL) with the following capabilities:

**✅ Fully Implemented:**
- TABLE/LIST/TASK query types
- Complex FROM clauses with OR/AND logic
- WHERE clauses with full expression support
- 30+ Dataview functions
- GROUP BY with 8 aggregation functions
- FLATTEN for array expansion
- SORT with ASC/DESC
- LIMIT clause
- Lambda expressions in map()/filter() functions

**⚠️ Not Implemented (Future):**
- DataviewJS (inline JavaScript)
- Implicit field extraction from markdown content
- Live query updates
- Task-specific queries (TASK returns file names only)

---

## Query Structure

```sql
TABLE|LIST|TASK <fields>
[FROM <source>]
[WHERE <expression>]
[FLATTEN <field>]
[GROUP BY <fields>]
[SORT <field> [ASC|DESC]]
[LIMIT <number>]
```

---

## FROM Clause

### Simple FROM

```sql
-- Single tag
FROM #project

-- Single folder
FROM "Projects/Active"

-- Unquoted folder
FROM Projects

-- Exclude tag
FROM -#archived
```

### Complex FROM with OR/AND

```sql
-- Multiple tags (OR logic)
FROM #project OR #work OR #personal

-- Tag AND folder (both must match)
FROM #important AND "Projects"

-- Mixed sources
FROM #tag1 OR "folder1" OR #tag2
```

### Negation

```sql
-- Exclude specific tags
FROM #project AND -#archived

-- Multiple exclusions
FROM "Projects" AND -#completed AND -#cancelled
```

---

## WHERE Clause - Expressions

### Comparison Operators

```sql
-- Numeric comparisons
WHERE rating > 3
WHERE priority >= 5
WHERE score = 100
WHERE count != 0

-- String comparisons
WHERE status = "active"
WHERE type != "archived"

-- Date comparisons
WHERE created > "2025-01-01"
WHERE date(modified) >= date("2025-01-15")
```

### Logical Operators

```sql
-- AND
WHERE rating > 3 AND status = "active"

-- OR
WHERE priority = 1 OR priority = 2

-- NOT
WHERE NOT (status = "completed")

-- Complex combinations
WHERE (rating > 3 AND status = "active") OR priority = 1
```

### Property Access

```sql
-- Frontmatter fields
WHERE rating > 3
WHERE status = "active"

-- File properties
WHERE file.folder = "Projects"
WHERE file.name = "MyNote"

-- Array properties
WHERE tags.length > 0

-- Nested properties (if frontmatter has nested objects)
WHERE metadata.author = "Doug"
```

### Arithmetic

```sql
WHERE rating + bonus > 10
WHERE (score1 + score2) / 2 >= 7
WHERE quantity * price < 1000
```

---

## Functions Reference

### Date Functions

```sql
-- Parse date
WHERE date(created) > date("2025-01-01")

-- Format date
TABLE dateformat(created, "YYYY-MM-DD")

-- Duration parsing
WHERE dur("1d 2h") > 0
```

**Supported date formats in `dateformat()`:**
- `YYYY` - 4-digit year
- `YY` - 2-digit year
- `MM` - 2-digit month
- `DD` - 2-digit day
- `HH` - 2-digit hour
- `mm` - 2-digit minute
- `ss` - 2-digit second

### Array Functions

```sql
-- Check if array contains value
WHERE contains(tags, "important")

-- Get array/string length
WHERE length(tags) > 3

-- Join array elements
TABLE join(tags, ", ")

-- Create array from values
TABLE list(field1, field2, field3)

-- Sort array
TABLE sort(tags, "asc")
TABLE sort(numbers, "desc")

-- Reverse array
TABLE reverse(list)

-- Filter array with lambda (NEW!)
TABLE filter(tags, (t) => contains(t, "project"))
WHERE length(filter(numbers, (n) => n > 10)) > 0

-- Map array with lambda (NEW!)
TABLE map(items, (x) => x.name)
TABLE map(numbers, (n) => n * 2)
```

### String Functions

```sql
-- Case conversion
WHERE lower(status) = "active"
TABLE upper(title)

-- String replacement
TABLE replace(content, "old", "new")

-- Split string into array
TABLE split(tags_string, ",")

-- Substring extraction
TABLE substring(text, 0, 10)

-- Pattern matching
WHERE startswith(file.name, "Project")
WHERE endswith(file.path, ".md")
WHERE regexmatch(content, "\\d{4}")
TABLE regexreplace(text, "\\d+", "NUM")
```

### Math Functions

```sql
-- Rounding
TABLE round(rating, 2)

-- Min/Max
TABLE min(score1, score2, score3)
TABLE max(values)

-- Sum/Average
TABLE sum(1, 2, 3, 4)
TABLE average(scores)
```

### Utility Functions

```sql
-- Default value
TABLE default(rating, 0)

-- Conditional (ternary)
TABLE choice(rating > 5, "high", "low")
```

---

## GROUP BY and Aggregations

### Basic GROUP BY

```sql
TABLE category, COUNT() AS count
GROUP BY category
```

### Multiple Group Fields

```sql
TABLE category, status, COUNT() AS count
GROUP BY category, status
```

### Aggregation Functions

| Function | Description | Example |
|----------|-------------|---------|
| `COUNT()` | Count rows in group | `COUNT() AS total` |
| `SUM(field)` | Sum numeric field | `SUM(value) AS total_value` |
| `AVG(field)` | Average of field | `AVG(rating) AS avg_rating` |
| `MIN(field)` | Minimum value | `MIN(date) AS earliest` |
| `MAX(field)` | Maximum value | `MAX(score) AS highest` |
| `FIRST(field)` | First value in group | `FIRST(title)` |
| `LAST(field)` | Last value in group | `LAST(modified)` |
| `LIST(field)` | Collect values into array | `LIST(file.name) AS files` |

### Complex Aggregation Example

```sql
TABLE
  category,
  COUNT() AS total,
  AVG(rating) AS avg_rating,
  SUM(value) AS total_value,
  MIN(created) AS first_created,
  MAX(modified) AS last_modified,
  LIST(file.name) AS all_files
FROM #project
WHERE status = "active"
GROUP BY category
SORT avg_rating DESC
LIMIT 10
```

---

## FLATTEN

Expands array fields into multiple rows (one row per array element).

### Basic FLATTEN

```sql
TABLE file.name, tags
FROM #project
FLATTEN tags
```

**Example:**

Before FLATTEN:
| file.name | tags |
|-----------|------|
| Note1 | ["tag1", "tag2", "tag3"] |
| Note2 | ["tag4"] |

After FLATTEN tags:
| file.name | tags |
|-----------|------|
| Note1 | tag1 |
| Note1 | tag2 |
| Note1 | tag3 |
| Note2 | tag4 |

### Use Cases

```sql
-- Analyze all tags used
TABLE tags, COUNT() AS count
FLATTEN tags
GROUP BY tags
SORT count DESC

-- Find notes sharing specific tag values
TABLE file.name, tags
FROM #project
FLATTEN tags
WHERE tags = "important"
```

---

## SORT

```sql
-- Ascending (default)
SORT created

-- Descending
SORT rating DESC

-- With expressions (use field name from TABLE clause)
TABLE file.name, rating + bonus AS total_score
SORT total_score DESC
```

---

## LIMIT

```sql
-- Top 10 results
LIMIT 10

-- Often combined with SORT
SORT rating DESC
LIMIT 5
```

### Result Limits and Token Management

⚠️ **Important**: Query results are automatically limited to prevent excessive token usage in conversations.

**Default Limits:**
- **TABLE queries**: 1000 rows
- **LIST queries**: 100 items
- **TASK queries**: 100 tasks

**Override Limits:**

1. **Using LIMIT clause in query** (recommended):
   ```sql
   TABLE file.name, rating
   FROM #project
   LIMIT 20
   ```

2. **Using maxResults parameter** (MCP tool parameter):
   ```json
   {
     "vault": "my-vault",
     "query": "TABLE file.name FROM #project",
     "maxResults": 50
   }
   ```

**Precedence**: Query `LIMIT` clause overrides `maxResults` parameter, which overrides defaults.

**Truncation Warnings:**

When results are truncated, you'll receive a warning message:
```
⚠️ Results truncated: returning 100 of 523 results to prevent excessive token usage.
Use 'maxResults' parameter or 'LIMIT' clause in query to control result size.
```

The response will include:
- `truncated: true` - Boolean flag indicating truncation occurred
- `totalCount: 523` - Total results before truncation
- `resultCount: 100` - Number of results actually returned
- `warning: "..."` - Human-readable warning message

**Best Practices:**

1. **Always use LIMIT** for large vaults:
   ```sql
   -- Good: Bounded result set
   TABLE file.name, rating
   FROM #project
   SORT rating DESC
   LIMIT 20
   ```

2. **Use specific filters** before LIMIT:
   ```sql
   -- Good: Filter first, then limit
   TABLE file.name, rating
   FROM #project
   WHERE rating > 7
   SORT rating DESC
   LIMIT 10
   ```

3. **Avoid unbounded queries** on large vaults:
   ```sql
   -- Caution: May return thousands of rows (will be truncated)
   TABLE file.name, rating
   FROM #all
   -- Better: Add LIMIT
   LIMIT 50
   ```

4. **Use GROUP BY for summaries** instead of full results:
   ```sql
   -- Good: Aggregated summary instead of all rows
   TABLE category, COUNT() AS count, AVG(rating) AS avg
   FROM #project
   GROUP BY category
   SORT count DESC
   ```

---

## Complete Examples

### Example 1: Project Dashboard

```sql
TABLE
  file.name AS Project,
  status,
  rating,
  dateformat(created, "YYYY-MM-DD") AS Created
FROM #project
WHERE status = "active" AND rating >= 4
SORT rating DESC
LIMIT 20
```

### Example 2: Tag Analysis

```sql
TABLE
  tags AS Tag,
  COUNT() AS "Note Count"
FROM #all
FLATTEN tags
GROUP BY tags
SORT "Note Count" DESC
LIMIT 15
```

### Example 3: Category Statistics

```sql
TABLE
  category,
  COUNT() AS total,
  AVG(rating) AS avg_rating,
  SUM(value) AS total_value,
  LIST(file.name) AS notes
FROM #data
WHERE rating > 0
GROUP BY category
SORT avg_rating DESC
```

### Example 4: Complex Multi-Source

```sql
TABLE
  file.name,
  file.folder,
  status,
  rating
FROM #important OR #urgent OR "Projects/Active"
WHERE (rating > 7 OR priority = 1) AND status != "archived"
SORT rating DESC
LIMIT 10
```

### Example 5: Date-Based Filtering

```sql
TABLE
  file.name,
  dateformat(created, "YYYY-MM-DD") AS Created,
  rating
FROM #project
WHERE date(created) >= date("2025-01-01") AND status = "active"
SORT created DESC
```

### Example 6: String Manipulation

```sql
TABLE
  file.name,
  upper(status) AS STATUS,
  replace(category, "_", " ") AS Category,
  join(tags, ", ") AS Tags
FROM #data
WHERE contains(tags, "important") AND length(file.name) > 5
```

---

## Limitations & Differences from Full Dataview

### Not Implemented

1. **DataviewJS**: Inline JavaScript execution not supported
2. **Implicit Fields**: Cannot query markdown content directly (only frontmatter)
   ```sql
   -- NOT SUPPORTED
   WHERE file.tasks.length > 0
   ```
3. **Complex Date Arithmetic**: No date addition/subtraction
   ```sql
   -- NOT SUPPORTED
   WHERE date(today) - date(created) < dur("7d")
   ```

### Workarounds

**For date arithmetic**: Use explicit date comparisons
```sql
-- Instead of date arithmetic:
WHERE date(created) >= date("2025-01-15")
```

**For content search**: Use frontmatter fields or separate search tools

---

## Performance Tips

1. **Use specific FROM clauses**: Narrow down files early
   ```sql
   -- Good
   FROM #project

   -- Avoid scanning everything
   FROM ""
   ```

2. **Apply WHERE before GROUP BY**: Reduces rows to aggregate

3. **Always use LIMIT**: Especially for large vaults
   ```sql
   -- Good: Explicit limit prevents token exhaustion
   TABLE file.name, rating
   FROM #project
   LIMIT 50
   ```

4. **Use maxResults parameter**: For dynamic control over result size
   - Set lower limits for exploratory queries (10-20 results)
   - Increase limits only when you need full data sets
   - Remember: 1000 rows can consume significant tokens

5. **Index-friendly queries**: Frontmatter field comparisons are fast

6. **Token-conscious querying**:
   - Start with small LIMIT values and increase if needed
   - Use GROUP BY for aggregated summaries instead of full row lists
   - Filter with WHERE before sorting to reduce result size
   - Monitor the `truncated` flag and adjust queries accordingly

---

## Error Handling

Common errors and solutions:

**Error**: `Unknown function: myFunc`
- **Cause**: Function not in supported list
- **Solution**: Check function reference above

**Error**: `Aggregate functions require GROUP BY clause`
- **Cause**: Using COUNT/SUM/etc without GROUP BY
- **Solution**: Add GROUP BY clause or remove aggregates

**Error**: `Expression evaluation failed`
- **Cause**: Syntax error in WHERE clause
- **Solution**: Check parentheses, operators, quotes

**Error**: `VAULT_NOT_FOUND`
- **Cause**: Invalid vault ID
- **Solution**: Use `list-vaults` to get valid vault IDs

---

## Version History

### v0.2.0 (Current) - Enhanced Implementation
- ✅ Full expression evaluator
- ✅ 30+ Dataview functions
- ✅ GROUP BY with 8 aggregation types
- ✅ FLATTEN support
- ✅ Complex FROM with OR/AND

### v0.1.0 - Initial MVP
- ⚠️ Basic TABLE/FROM/WHERE/SORT/LIMIT
- ⚠️ No functions or aggregations
- ⚠️ Simple string-based WHERE matching

---

## Further Reading

- [Obsidian Dataview Plugin Documentation](https://blacksmithgu.github.io/obsidian-dataview/)
- [MCP Tool Reference](../README.md#tools)
- [Expression Evaluator Implementation](../src/dataview/expression-evaluator.ts)
- [Function Library](../src/dataview/functions.ts)
