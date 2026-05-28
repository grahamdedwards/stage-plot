# Console Patch Export — Design Spec v1.0

## Problem

Engineers receive a stage plot (PDF or ShowRunr link) and manually re-key every input channel into their mixing console. A 40-channel show = 40 manual entries before soundcheck. This is slow, error-prone, and repeated at every venue on a tour.

ShowRunr already has structured input list data (channel, instrument, mic, stand, notes) and monitor mix assignments. Exporting this in a format consoles can import eliminates the re-keying step entirely.

## Goal

One-click export of the input list and monitor mixes to standard formats that mixing consoles can import. The engineer loads the file, the patch list appears on the desk, soundcheck starts faster.

## Scope — Tiered Approach

### Tier 1 (this spec)

- **Generic CSV** — universal, importable by DiGiCo, Midas, and any desk that accepts a channel-list CSV. Also useful as a human-readable reference.
- **XML patch list** — structured format for desks/software that accept XML (Yamaha CL/QL `.clf` files are XML-based; this provides a foundation).

### Tier 2 (future, on demand)

- Yamaha CL/QL native `.clf` scene file (XML, well-documented).
- DiGiCo native `.session` fragment (if their format is documented or reverse-engineered).

### Tier 3 (future, if asked)

- Proprietary binary formats (Avid VENUE `.vnue`, A&H dLive `.allshow`). These are reverse-engineering projects — only worth doing if users ask.

### Out of scope

- Console-to-ShowRunr import (reading a desk file back in). Interesting but different feature.
- Head amp gain, EQ, dynamics presets — these are mix-specific, not patch-specific.

## Data Model

### Current InputChannel (no changes needed)

```typescript
interface InputChannel {
  id?: string;
  ch: number;        // channel number
  inst: string;      // instrument / source name
  mic: string;       // microphone model
  stand: string;     // stand type
  notes?: string;    // free-text notes
}
```

### Optional field additions (non-breaking)

These fields would make the export more useful to engineers. All optional — backward compatible with existing shows.

```typescript
interface InputChannel {
  // ... existing fields ...
  phantom?: boolean;    // 48V phantom power needed
  stereoLink?: number;  // paired channel number (e.g., ch 5 links to ch 6)
  directOut?: number;   // direct out routing (channel number or bus number)
}
```

**Decision: defer phantom/stereoLink/directOut to a follow-up PR.** The CSV/XML export works with the current data model. These fields add value but aren't blockers.

### Current MonitorMix (no changes needed)

```typescript
interface MonitorMix {
  id?: string;
  mix: number;       // mix bus number
  name: string;      // who gets this mix (e.g., "Vocals", "Drummer")
  needs: string;     // what they want in the mix
}
```

## Export Formats

### 1. CSV Export

**Filename:** `{show-slug}-patch.csv`

**Columns:**

| Column | Source | Notes |
|--------|--------|-------|
| `Channel` | `ch` | Integer |
| `Name` | `inst` | Instrument/source label — this is what appears on the console scribble strip |
| `Mic` | `mic` | Microphone model |
| `Stand` | `stand` | Stand type |
| `Notes` | `notes` | Free-text |
| `MonitorMix` | Derived | Mix number this channel is associated with (from stage plot slot → mix number) |

**Format rules:**
- UTF-8 with BOM (Excel and console software handle this correctly)
- Fields containing commas, quotes, or newlines are double-quoted per RFC 4180
- Header row always present
- Empty fields = empty string (not "null" or "N/A")
- Sorted by channel number ascending

**Example output:**

```csv
Channel,Name,Mic,Stand,Notes,MonitorMix
1,Kick In,Beta 91A,Internal,,1
2,Kick Out,Beta 52A,Short Boom,,1
3,Snare Top,SM57,Clip,,1
4,Snare Bottom,SM57,Clip,Phase flip,1
5,Hi-Hat,KSM137,Short Boom,,1
6,Rack Tom,e604,Clip,,1
7,Floor Tom,e604,Clip,,1
8,OH L,KSM32,Tall Boom,Stereo pair w/ ch9,1
9,OH R,KSM32,Tall Boom,Stereo pair w/ ch8,1
10,Bass DI,Radial J48,DI,,2
11,Bass Amp,RE20,Short Boom,,2
12,Guitar L,SM57,Short Boom,,3
```

### 2. XML Export

**Filename:** `{show-slug}-patch.xml`

**Schema:** Custom `showrunr/v1` — not tied to any single console vendor. Provides structured data that can be transformed to vendor-specific formats later.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<showrunr-patch version="1" show="Band Name" date="2026-06-15" venue="The Fillmore">
  <inputs>
    <channel number="1" name="Kick In" mic="Beta 91A" stand="Internal" monitor-mix="1" />
    <channel number="2" name="Kick Out" mic="Beta 52A" stand="Short Boom" monitor-mix="1" />
    <channel number="3" name="Snare Top" mic="SM57" stand="Clip" monitor-mix="1" />
    <!-- ... -->
  </inputs>
  <monitors>
    <mix number="1" name="Drums" needs="Click, keys, vocal" />
    <mix number="2" name="Bass" needs="Kick, snare, vocal, keys" />
    <mix number="3" name="Guitar" needs="Vocal, drums, bass" />
  </monitors>
</showrunr-patch>
```

**XML rules:**
- UTF-8, XML declaration present
- All special characters escaped (`&amp;`, `&lt;`, `&gt;`, `&quot;`)
- Attributes preferred over child elements for flat data (keeps it compact)
- Optional fields omitted when empty (no `notes=""`)
- `monitor-mix` attribute derived from stage plot slot → mix number mapping

### Monitor mix association

The link between an input channel and a monitor mix is indirect in the current data model: `StageSlot.mix` assigns a stage position to a mix number, and `InputChannel` has a channel number but no explicit mix reference.

**Derivation strategy:**
1. Build a map: `mix number → stage position` from `stagePlot` array
2. For each input channel, attempt to match `inst` against slot `name` or `role` (fuzzy — best effort)
3. If a match is found, include the mix number in the export
4. If no match, leave `MonitorMix` empty — the engineer assigns it manually

This is a best-effort enrichment. The export is useful even without it (the primary value is the channel/name/mic patch list).

## UX Flow

### Entry point

**Location:** Config tab → Export / Import section (existing).

Add two new buttons below the existing "Export Show (.yaml)" button:

```
[Export Show (.yaml)]
[Export Patch List (.csv)]  [Export Patch List (.xml)]
```

Or, if we want to keep it cleaner — a single dropdown:

```
[Export Show (.yaml)]
[Export Patch ▾]
  → CSV (for consoles)
  → XML (structured)
```

**Recommendation:** Start with two distinct buttons. Simple, no dropdown component needed. The labels make the purpose clear.

### Export action

1. User clicks "Export Patch List (.csv)" or "Export Patch List (.xml)"
2. Build export data from current `config.inputs` and `config.monitors`
3. Generate file content (CSV string or XML string)
4. Trigger browser download via `<a>` blob URL (same pattern as YAML export)
5. Filename: `{slugified-show-name}-patch.csv` or `.xml`

### No new dependencies

- CSV generation: string concatenation (no library needed — the format is trivial)
- XML generation: string concatenation with escaping helper (no library needed — the structure is flat)
- File download: existing blob URL + `<a>` click pattern from YAML export

## Implementation Plan

### Files to create

- `lib/console-export.ts` — pure functions: `exportPatchCsv(config)` and `exportPatchXml(config)` returning strings

### Files to modify

- `app/[slug]/page.tsx` — add export buttons in the Export/Import section of ConfigTab

### No new dependencies

Zero npm additions.

## Testing

### Manual

- Export CSV from a show with 20+ channels → open in Excel/Google Sheets → verify columns, encoding, quoting
- Export CSV → import into DiGiCo SD-series offline editor (if available) → verify channel names populate
- Export XML → validate well-formedness (`xmllint --noout`)
- Export from a show with special characters in instrument names (ampersands, quotes, commas)
- Export from a show with empty notes fields → verify no "null" or "undefined" in output
- Export from a show with 0 inputs → verify empty file with header row only (CSV) or empty `<inputs>` (XML)

### Automated

- Unit tests for `exportPatchCsv` and `exportPatchXml` covering:
  - Standard input list
  - Special characters (RFC 4180 quoting for CSV, XML escaping)
  - Empty inputs array
  - Missing optional fields

## Future Considerations

- **Yamaha CL/QL `.clf` export:** The XML export provides the data foundation. A `.clf` file is XML with a specific schema — adding a `exportYamahaCLF(config)` function later is straightforward.
- **Phantom power / stereo link fields:** When added to `InputChannel`, the export functions pick them up with minimal changes (new CSV column, new XML attribute).
- **Round-trip import:** Loading a CSV/XML patch file back into ShowRunr. Useful for "I started my patch on the desk, now I want it in ShowRunr." Separate spec.
- **Console-specific CSV dialects:** Some desks want specific column headers (DiGiCo uses "Channel", "Label", etc.). We can add format variants as users report them.
