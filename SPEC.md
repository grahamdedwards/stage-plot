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

## Roadmap / Ideas

### Near-term (easy wins)
- [ ] Move data to a config file (`band.config.ts`) — separate from layout code
- [ ] PDF export (browser print stylesheet or Puppeteer)
- [ ] Instrument icons on stage plot cells (guitar, keys, drums, mic, horn)
- [ ] Multiple lineup support (e.g., full band vs. acoustic trio)

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
