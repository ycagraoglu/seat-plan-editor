# Spreadsheet Reference Import Design

## Goal

Allow Codex to turn customer-provided `.xls` and `.xlsx` seating manifests into
editable seat-plan-editor drafts without a vision API. Preserve every explicit
seat, row, block, gap, label, and workbook total that can be established from
the spreadsheet. Geometry that is inferred from numbering rather than drawn in
the workbook must be identified as inferred.

## Supported Workbook Families

The scanner classifies each workbook before producing geometry:

1. **Named-range plan**: one or more worksheets contain a spatial plan and
   workbook names such as `BLOK001` identify block cell ranges. Named ranges are
   authoritative block membership and cell positions are authoritative local
   geometry.
2. **Canvas-sheet plan**: a dense worksheet contains positioned seat values,
   block labels, merged headings, fills, borders, and blank aisles. Labels and
   style-connected seat regions determine block membership; cell positions
   determine geometry.
3. **Section manifest**: each worksheet represents one section and contains a
   local row/seat matrix, but no overview sheet gives global placement. Local
   geometry comes from cells. Numeric section codes are ordered clockwise in an
   inferred oval ring, beginning with the smallest code at the top center.
4. **Flat list**: a worksheet has block, row, and seat columns but no spatial
   cell layout. It remains a verification source and cannot create geometry by
   itself unless the user explicitly selects the inferred ring layout.

Classification is deterministic and returned to Codex for inspection. If two
families are equally plausible, scanning stops with `needsReview` rather than
silently choosing one.

## Parsing And Limits

Use `@e965/xlsx` for both legacy OLE `.xls` and OOXML `.xlsx`. The parser runs
locally and never evaluates macros or external links.

Limits:

- Maximum file size: 25 MB.
- Maximum worksheets: 200.
- Maximum non-empty cells: 1,000,000.
- Maximum generated seats: 100,000.
- Password-protected, macro-dependent, or unreadable workbooks fail with a
  specific error before a plan is created or changed.

Cell coordinates use actual column widths and row heights when available,
falling back to workbook defaults. Hidden rows and columns are ignored unless a
named block range explicitly includes non-empty cells in them; those cells are
then reported for review.

## Source Priority

Evidence is applied in this order:

1. Workbook named ranges whose normalized names match block/section terms.
2. Explicit block labels, merged labels, and summary formulas that reference
   seat regions.
3. Repeated seat-like cells grouped by style, regular spacing, and connected
   row segments.
4. Worksheet names and numeric section order.

Higher-priority evidence may split or label lower-priority components. It may
not create a seat absent from a non-empty source cell. Decorative totals,
headers, row counters, and summary tables are excluded using formula references,
style frequency, and their separation from seat regions.

Seat-like values include numeric labels and alphanumeric values such as `A12`.
The scanner separates the row and seat portions only when the pattern is
unambiguous. Otherwise it keeps the original value as the source identity and
marks the row for review.

## Spreadsheet Scan Contract

Add `scan_spreadsheet({ path })`. It returns and stores an ephemeral scan:

```json
{
  "scanId": "sheet-scan-...",
  "family": "named-range-plan",
  "workbook": "manifest.xlsx",
  "seatCount": 4134,
  "groups": [
    {
      "groupId": "group-1",
      "sheet": "Plan",
      "suggestedLabel": "BLOK 201",
      "source": "named-range",
      "rows": [
        {
          "rowId": "row-1",
          "suggestedLabel": "A",
          "seatIds": ["A1", "A2"],
          "centers": [[120.5, 80.0], [150.5, 80.0]],
          "confidence": 1,
          "needsReview": false
        }
      ]
    }
  ],
  "totals": [{ "label": "TOPLAM KAPASITE", "value": 4134 }],
  "conflicts": [],
  "needsReview": []
}
```

Raw filesystem paths are not repeated in user-visible output. The scan remains
in the MCP session and is not written into the persistent plan schema.

## Semantic Confirmation

Add `submit_spreadsheet_analysis({ scanId, venueKind, groups?, layout? })`.
Codex may correct labels and levels, but cannot alter detected seat cells or
their local positions.

`layout` is one of:

- `source`: required for named-range and canvas-sheet plans; preserves worksheet
  coordinates.
- `ring`: default for section manifests; orders numeric sections clockwise in
  an oval. This geometry is tagged `inferredFrom: "section-order"` in ephemeral
  verification state, not in the persistent plan schema.

Every detected group must be accepted or excluded with a source-based reason.
Every unresolved ambiguity or duplicate seat identity must be explicitly
resolved before compilation. Workbook formula mismatches remain visible even
after a user selects which source is authoritative.

## Deterministic Compilation

Add `build_spreadsheet_layout()`.

For source-positioned plans, convert cell centers to editor centimeters using a
single workbook scale whose median adjacent-seat distance is 50 cm. Straight
row segments compile to existing `grid` blocks; common-center curved segments
compile to existing `fan` blocks. Per-seat `ov` adjustments place every seat on
its measured cell center. Blank cells inside a row stay blank and are represented
by removed/gap overrides without renumbering neighboring seats.

For section manifests, preserve each worksheet's local cell geometry, then fit
its section into a non-overlapping fan sector. Section codes define clockwise
order; the smallest numeric code starts at top center. Ring radius expands until
all section footprints have at least the normal aisle clearance. No focal
shape, door, boundary, accessible place, or corridor is created unless it is an
explicit workbook object.

Compilation happens against a temporary plan. The active session and live
editor update once, only after mutation blockers are zero. Failure leaves the
current plan untouched.

## Verification

Add `verify_spreadsheet()` and require all of the following for success:

- Every accepted source seat maps to exactly one plan seat.
- No extra plan seat exists.
- Block, row, and seat counts match the accepted spreadsheet analysis.
- Source-positioned plans place at least 99% of seats within 0.35 times the
  median source seat spacing.
- Section-manifest plans preserve exact local row shape and seat order; global
  position is reported as inferred rather than source-verified.
- Duplicate source identities are zero.
- Existing hard geometry and data-integrity blockers are zero.
- Explicit workbook totals equal detected totals, or the chosen conflict
  resolution is reported with both values.
- No physical object absent from the workbook has been added.

The result distinguishes `verifiedSourceGeometry` from `verifiedInferredLayout`.
The UI and Codex completion report must not describe an inferred ring as an
architecturally verified venue.

## MCP State Machine

Spreadsheet mode uses:

```text
no-plan
-> spreadsheet-scanned
-> spreadsheet-semantics-ready
-> spreadsheet-compiled
-> spreadsheet-verified
```

`scan_spreadsheet` runs before `create_plan`; invalid or unsupported files do
not leave blank plans in the plan list. Compilation creates the new plan name
from an explicit user name or the workbook filename. Spreadsheet mode blocks
low-level mutation tools until verification completes or the user explicitly
abandons the import.

`editor_capabilities` reports accepted extensions, workbook limits, detected
family, current phase, allowed next tools, and the distinction between source
and inferred geometry. The MCP system prompt directs Codex to inspect, resolve
only reported ambiguity, build, verify, and never call the image-reference
workflow for spreadsheets.

## Application Upload

The existing upload endpoint accepts `.xls` and `.xlsx` and returns
`kind: "spreadsheet"`. The browser sends only the saved server-side path to the
MCP/chat bridge and displays the original basename. File contents and temporary
paths are never echoed into chat history. Existing image, CSV, and JSON behavior
is unchanged.

## Error Handling

- Unsupported or corrupt workbook: reject before creating a plan.
- Ambiguous workbook family: return evidence and request one user decision.
- Duplicate seat identity: block compilation and list bounded examples.
- Total mismatch: show formula total and detected total; require a declared
  authority (`cells` or `summary`) before compiling.
- Unlabeled connected component: keep its measured seats but require a label or
  explicit exclusion.
- Block overlap after compilation: rollback and report the involved source
  groups.

## Tests

Add generated fixtures for all four workbook families. Tests cover:

- `.xls` and `.xlsx` decoding.
- Named-range block extraction and multi-range names.
- Numeric and alphanumeric seat detection.
- Merged labels, style-separated regions, blank aisles, hidden cells, and
  summary-table exclusion.
- Section-sheet ordering and collision-free inferred ring layout.
- Duplicate identities, contradictory totals, corrupt files, limits, and
  ambiguous classification.
- Atomic rollback when compilation fails.
- Exact seat count and source identity verification.
- Upload classification and path redaction.
- MCP state transitions and low-level mutation blocking.

The three supplied workbook shapes are represented by synthetic fixtures so
tests do not depend on files in a user's Downloads directory. The full existing
test suite, venue geometry checks, interaction checks, and production build
remain release gates.

## Non-Goals

- Executing workbook macros or refreshing external links.
- Inferring doors, accessibility, walls, stages, or fields that are absent from
  workbook cells.
- Claiming architectural accuracy for section-order ring layouts.
- Adding a new persistent plan schema or a second geometry engine.
