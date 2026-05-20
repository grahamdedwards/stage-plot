# Stage Plot — Product Spec & How-To
**Status:** v0.1 — working prototype (Loosely Covered, 7-piece)
**Repo:** github.com/grahamdedwards/stage-plot
**Live:** https://stage-plot-five.vercel.app

---

## The Idea

Most bands hand venues a Word doc or a hand-drawn sketch for their technical rider. It gets printed, lost, or opened on a laptop at load-in. This is a live, mobile-optimized URL — shareable via text, always current, readable on a phone at the side of the stage.

**Core insight:** structured band data (who's where, what they need) rendered as a spatial physical layout. The data model mirrors the stage itself.

---

## What It Does (v0.1)

1. **Stage Plot** — visual grid showing who stands where (USR/USC/USL backline, DSR/DSC/DSL frontline), with monitor mix numbers and power requirements
2. **Input List** — channel-by-channel: instrument, mic/DI, stand type, notes
3. **Monitor Mixes** — per-person monitor needs
4. **General Notes** — stands, power drops, special requirements

---

## The Data Model

Everything flows from two arrays and a band name. To reconfigure for a new band or lineup, you only edit the data — not the layout.

```ts
// Band identity
const bandName = "Loosely Covered"
const lineup = "7-Piece Band"

// Stage positions (drives the visual grid)
// Each person has: name, position (USR/USC/USL/DSR/DSC/DSL), role, mix, power
const stagePlot = [
  { name: "Matt",    pos: "USR", role: "Keys + BGV",  mix: 4, power: true  },
  { name: "Bill",    pos: "USC", role: "Drums",        mix: 6, power: false },
  { name: "Terry",   pos: "USL", role: "Bass + BGV",   mix: 5, power: true  },
  { name: "Horns",   pos: "DSR", role: "Sax & Tpt",   mix: 3, power: false },
  { name: "Rachel",  pos: "DSC", role: "Lead Vox",     mix: 1, power: false, featured: true },
  { name: "Graham",  pos: "DSL", role: "Gtr + BGV",    mix: 2, power: true  },
]

// Input list
const inputs = [ /* channel-by-channel */ ]

// Monitor mixes
const monitors = [ /* per-person needs */ ]
```

The stage grid renders automatically from `pos` — no manual layout work needed for new configurations.

---

## How to Configure for a New Band

1. Clone the repo: `git clone github.com/grahamdedwards/stage-plot`
2. Edit `app/page.tsx` — update `bandName`, `stagePlot`, `inputs`, `monitors`
3. Build locally: `pnpm dev`
4. Deploy: `vercel --prod`

**To add a new position:** The grid is 3×2 (cols × rows). Positions map as:
```
[ USR ] [ USC ] [ USL ]   ← backline (row 1)
[ DSR ] [ DSC ] [ DSL ]   ← frontline (row 2)
```
Extend to a 3×3 grid for 9-piece bands by adding a mid row.

---

## Template Library (Planned — not built)

Templates are opinionated starting points — pre-filled stage positions, input counts, mic types, monitor mix count — with placeholder names ("Actor 1", "Lead Vox", "Trumpet 1"). Engineer fills in real names and tweaks for the specific show.

| Template | Use Case |
|---|---|
| **Band Only** | Standard rock/pop band — drums, bass, keys, guitars, vox |
| **Brass Band** | Horn-heavy, minimal rhythm section |
| **Orchestra** | Strings + winds + brass + conductor, minimal PA vox |
| **Choir** | Massed voices, minimal instruments |
| **Actor + Band** | Pit-style band + lead actor mics, spoken word + song |
| **Actor Heavy** | Many individual actor mics, minimal band, theater config |
| **Big-3** | Bohemian-specific mega-production — large cast, full orchestra, multiple areas. Composition TBD with Graham. |

### Show Library / Multi-Show UX (Planned)

The ontology:
```
Organization (e.g. Bohemian Club)
  └── Season (Fall-25, Spring-26, Encampment-26, Jinks-26)
        └── Show (date + venue)
              └── Rider (stage plot, inputs, monitors, setlist)
```

- **Show library in localStorage** — save/load multiple named shows from a dropdown in the header. Keyed by season + show name.
- **JSON export/import** — "Save Show File" downloads `.json`; "Load Show File" imports it. PDF = pretty archive; JSON = editable record.
- **New Show wizard** — 3 steps: pick template → update date/venue/names → done.
- Per-engineer views within a shared org structure (future, needs backend).

### Stage Grid Evolution (Planned)

Current grid is 2-row (US/DS). Needs to scale for complex productions:

```
[ USR ] [ USC ] [ USL ]   ← upstage
[ MSR ] [ MSC ] [ MSL ]   ← mid-stage (added)
[ DSR ] [ DSC ] [ DSL ]   ← downstage
[          PIT           ]   ← orchestra pit (full-width row)
```

Special zones: `PIT` (orchestra pit, spans full width), `FOH` (engineer desk), `OTHER` (fly rigs, side stages, etc.)

For big shows (Big-3 etc.) the grid may need to be free-form rather than a fixed 3×N — drag-and-drop positioning is the right UX end state. Simpler near-term: zone dropdown with a free-text position label ("US Wings R", "Pit Row 2", etc.).

**Drag-and-drop:** viable with `@dnd-kit/core` (lightweight, no jQuery). Each slot becomes draggable; dropping onto a grid cell updates the position. Nice-to-have, not blocking.

### Charts / Lead Sheets (Planned)

#### Architecture: Folder-as-Metadata in Google Drive

No filename conventions needed. Folder = instrument role.

```
Drive/
  Charts/
    Lyrics/        ← singer lyric sheets
    Guitar/        ← guitar chord charts
    Bass/          ← bass charts
    Piano/         ← piano/keys charts
    Horns/         ← horn charts (Bb transposition assumed)
    Drums/         ← drum charts / click maps
    Conductor/     ← full scores / MD charts
    [any folder]   ← free-text roles, extensible
```

#### Import Logic (per song)
1. Normalize song title (lowercase, strip punctuation, strip "the/a/an")
2. For each role folder: look for a file matching the normalized title (fuzzy match)
3. **Found one** → link it, color-code by role in the setlist row
4. **Found multiple** → take first, flag with badge ("2 found") for manual review
5. **Found none** → no chart icon, no noise

#### Format Handling (detect from URL, no conversion)

| URL pattern | Type | Action |
|---|---|---|
| `docs.google.com/document` | Google Doc | Open in new tab |
| `drive.google.com` PDF | Drive PDF | Open in new tab |
| `notion.so` | Notion | Open in new tab |
| `irealb://` | iReal Pro | Deep link → opens app |
| `.pdf` | PDF | Open in new tab |
| anything else | Link | Open in new tab |

#### Chart Data Model
```ts
interface Chart {
  role: string;      // folder name = role ("Lyrics", "Guitar", free text)
  url: string;       // any URL
  label?: string;    // optional e.g. "Bb transposition", "Chorus Only"
  dupeCount?: number; // >1 = flag for review
}
```

#### Access Model
- Shared band Google Drive folder — everyone with access can add/update charts by dropping files in the right folder
- App needs read-only access to the Charts folder tree (single Drive API call with root folder ID)
- Auth: same Google OAuth already used for Sheets import

#### First-Time Setup Flow (App-Managed Folder Creation)
1. User clicks "Connect Google Drive" → OAuth
2. App prompts: "Where should your Charts folder live?" → Drive folder picker
3. App creates canonical subfolders automatically (exact, fixed spelling — no drift):
   - `Lyrics`, `Guitar`, `Bass`, `Piano / Keys`, `Horns`, `Drums`, `Conductor`, `Other`
4. Folder IDs (not names) stored in config → rename-proof, portable
5. Share the config URL → other engineers get the same chart library automatically
6. Custom roles: user can add ad-hoc roles → app creates the folder on demand

This keeps fuzzy matching focused on song names only. Folder names are canonical and fixed.

#### Existing Assets (Graham)
- Notion database of lead sheets (lyrics) — migrate to `Lyrics/` folder
- Various musicians have their own charts — migrate to role folders
- Master song list already in Google Sheets — add `chartsRootFolderId` config field

#### Duplicate Handling
- Take first match (alphabetical by filename)
- Flag with orange badge "2 found" in setlist row
- Clicking badge shows all matches for manual selection

#### Future: "My Charts" View
Musician picks their name/role from a dropdown → sees only their songs + their charts for the whole show. One tap, their part, no noise. (Bohemian Club scale feature.)

### Decision Gate
Not building until Graham validates the use case through personal bands + Bohemian Club shows. Current tool (localStorage + shareable URL + PDF print) serves immediate needs. Template/library layer added when the iteration loop proves the value.

---

## Roadmap / Ideas

### Near-term (easy wins)
- [x] Config-driven architecture — band data in `lib/bands/`, page is pure renderer
- [x] PDF/print with section selector
- [x] Setup/Config UI — editable tabs, localStorage, shareable URL
- [x] Google Sheet setlist import
- [x] Extended position types (MSR/MSC/MSL, PIT, FOH, OTHER)
- [ ] Instrument icons on stage plot cells (guitar, keys, drums, mic, horn)
- [ ] Multiple lineup support (e.g., full band vs. acoustic trio)
- [ ] JSON export/import (save/load show files)

### Medium-term (product features)
- [ ] Web form — band enters their info, gets a URL (no code required)
- [ ] Shareable slug: `stageplot.app/loosely-covered`
- [ ] QR code on the rider page (venue can scan → their system)
- [ ] Editable online (no redeploy needed for minor changes)

### Business model options
1. **Free tool** — enter your band info, get a URL. Viral distribution (every venue that sees it asks "how do I get one of these?")
2. **Paid tier** — custom domain, multiple configs, PDF export, venue notes
3. **Venue/promoter B2B** — all booked acts submit riders through one system; promoter sees everything in one dashboard
4. **White-label** — booking agencies or management companies license it for their roster

### The moat
Not the tech — the network. If enough bands use it, venues start expecting it. Venues start expecting it, bands need it. Classic two-sided marketplace flywheel, small scale.

---

## Tech Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS** — all styling, no component library needed
- **Vercel** — deploy in seconds, auto-deploy on push
- **GitHub** — source at `grahamdedwards/stage-plot`

No database, no auth, no backend. Purely static for v0.1. Fast to load, zero ops.

---

## Notes on the Spatial Rendering Approach

The stage plot is a CSS grid that mirrors the physical stage. Position names (USR, DSC, etc.) are standard stage directions used universally by sound engineers and stage managers. Mapping data to those positions — rather than drawing a diagram — means:

- Any band configuration is expressible as structured data
- The layout is always correct (no hand-drawing errors)
- Changing a lineup is a data edit, not a design task
- The same component works for a 4-piece and a 12-piece (with grid adjustments)

This is the core reusable insight. Everything else is presentation.
