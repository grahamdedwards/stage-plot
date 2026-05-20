# Design: Agent-as-Show-Codesigner (BYOA)

**Status:** Draft v1.0 — awaiting review
**Depends on:** None (additive to current Setup tab)
**Scope:** Natural language chat interface for populating and editing show configuration

---

## The Idea

Setting up a show config today means filling in tables row by row — names, positions, instruments, channels, monitor needs. It works, but it's tedious and the user has to translate their mental model of the band into structured form fields.

Musicians think in sentences: *"Graham is lead singing and playing guitar, DSC. Terry plays bass, put him to the drummer's left."* The agent translates that into structured data — stage positions, input channels, monitor mixes — and writes it directly to the config. The user sees the results live and can keep refining with follow-up instructions.

This is BYOA (Bring Your Own API key) — the user provides their own Claude API key. No backend AI costs for us, no key management, no rate-limit headaches.

---

## Example Conversation

```
User: "We're a 7-piece called Loosely Covered. Graham is lead vocals and
       lead guitar, put him DSC. JT is on drums, USC. Terry plays bass
       and BGV, put him to the drummer's left. Matt is on keys and BGV,
       opposite side behind the horns in USR. Chris, Konstantins and Luke
       are playing sax, trumpet and trombone — put them DSR as a section."

Agent: Done. I've set up 7 positions:
       • Graham — Lead Vox + Guitar, DSC (featured)
       • JT — Drums, USC
       • Terry — Bass + BGV, USL (drummer's left)
       • Matt — Keys + BGV, USR
       • Chris — Saxophone, DSR
       • Konstantins — Trumpet, DSR
       • Luke — Trombone, DSR

       I also drafted a 12-channel input list based on standard mic'ing
       for these instruments. Want me to show it, or should I adjust
       anything first?

User: "Terry needs power for his amp. The horn section shares a monitor
       mix. Graham gets his own monitor with lots of himself and keys."

Agent: Updated:
       • Terry — power: on
       • Monitor Mix 3: Horns (Chris, Konstantins, Luke) — horns +
         rhythm section
       • Monitor Mix 1: Graham — heavy vocals, keys, light everything else

User: "Add a setlist: Superstition, Brick House, September, Signed
       Sealed Delivered, Pick Up the Pieces. Graham sings everything
       except Pick Up the Pieces which is instrumental."

Agent: Setlist added (5 songs). Graham as lead on 1-4, no lead on #5
       (instrumental). Want scene notes or key info on any of them?
```

---

## Architecture

### System Prompt & Tool Use

The agent is a Claude API call with tool use. The system prompt gives it:

1. **The data model** — full TypeScript interfaces for StageSlot, InputChannel, MonitorMix, SetlistSong, GeneralNote
2. **Stage position semantics** — what USR/USC/USL/DSR/DSC/DSL mean spatially, audience perspective, stage-left vs house-left conventions
3. **Domain knowledge** — standard instrument mic'ing, typical monitor mix patterns, power requirements by instrument, horn section conventions (Bb transposition, section grouping)
4. **The current config** — passed as context so the agent can see what's already set up and make incremental edits

### Tools Available to the Agent

The agent doesn't call APIs — it returns structured tool calls that the app applies to the config:

```ts
// Tool: update_stage_plot
{
  stagePlot: StageSlot[]  // full replacement — agent sends complete array
}

// Tool: update_inputs
{
  inputs: InputChannel[]  // full replacement
}

// Tool: update_monitors
{
  monitors: MonitorMix[]  // full replacement
}

// Tool: update_setlist
{
  setlist: SetlistSong[]  // full replacement
}

// Tool: update_notes
{
  notes: GeneralNote[]  // full replacement
}

// Tool: update_show_info
{
  bandName?: string
  lineup?: string
  eventDate?: string
  venue?: string
}
```

**Why full replacement, not patches?** Simpler and safer. The agent sees the complete current state, makes its changes, and returns the full new state. No merge conflicts, no partial updates, no "delete item at index 3" fragility. The config is small enough (~5-20KB) that this is negligible.

### Preview/Approve Gate

Every tool call goes through a preview step before being applied:

```
┌─────────────────────────────────────────┐
│  Agent wants to update Stage Plot       │
│                                         │
│  Changes:                               │
│  + Graham — Lead Vox + Guitar, DSC      │
│  + JT — Drums, USC                      │
│  + Terry — Bass + BGV, USL              │
│  ~ Matt — Keys + BGV, USR → MSR        │
│  - (removed) Bill — Drums, USC          │
│                                         │
│  [Apply]              [Reject]          │
└─────────────────────────────────────────┘
```

The diff view shows additions (+), modifications (~), and removals (-) compared to current config. User must explicitly approve each change. Rejected changes are fed back to the agent as context.

---

## API Route

### `POST /api/agent/chat`

Proxies the Claude API call. The API key is sent from the client per-request (never stored server-side).

```ts
// Request
{
  apiKey: string;           // user's Claude API key
  messages: Message[];      // conversation history
  currentConfig: AppConfig; // current show state for context
}

// Response: streamed Claude API response with tool_use blocks
```

**Why a server-side proxy?** The Claude API doesn't support browser CORS. The proxy adds the API key to the request header and streams the response back. The key transits the server but is never logged or stored.

### Rate Limiting

Client-side only — no server-side rate limiting since each user brings their own key:
- Debounce sends (500ms after last keystroke, or explicit send button)
- Disable send while a response is streaming
- Show token usage per message (from API response) so users can see their spend

---

## UI

### Chat Panel in Setup Tab

Collapsible panel at the top of the Setup tab, above the form sections:

```
┌─────────────────────────────────────────┐
│  AI Show Designer                   [▼] │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Describe your band, lineup, and │    │
│  │ stage layout in plain English.  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Your Claude API key: ••••••••••]      │
│                                         │
│  ┌─ Chat ──────────────────────────┐    │
│  │ You: We're a 7-piece called...  │    │
│  │                                 │    │
│  │ Agent: Done. I've set up 7...   │    │
│  │ ┌─ Preview: Stage Plot ──────┐  │    │
│  │ │ + Graham — DSC             │  │    │
│  │ │ + JT — USC                 │  │    │
│  │ │ [Apply] [Reject]           │  │    │
│  │ └───────────────────────────-┘  │    │
│  │                                 │    │
│  │ You: Terry needs power...       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌──────────────────────────┐ [Send]    │
│  │ Type a message...        │           │
│  └──────────────────────────┘           │
└─────────────────────────────────────────┘
```

**Below the chat panel,** the existing form sections (Stage Plot, Input List, etc.) update live as the user approves agent changes. The user can also edit forms directly — the agent sees those changes in its next turn.

### API Key Storage

- Stored in localStorage (key: `stageplot-claude-key`)
- Shown as masked input with show/hide toggle
- "Test Key" button makes a minimal API call to validate before first use
- Clear button to remove the key

### First-Time UX

1. User expands "AI Show Designer" panel
2. Prompted for Claude API key (with link to Anthropic console to get one)
3. Key validated with a test call
4. Chat is ready — placeholder suggests what to say

---

## System Prompt

```
You are a live sound engineer and stage manager assistant. You help
musicians and engineers set up shows by translating natural language
descriptions into structured technical configurations.

You understand:
- Stage positions: USR (upstage right), USC (upstage center), USL
  (upstage left), DSR (downstage right), DSC (downstage center),
  DSL (downstage left). Stage left/right is from the performer's
  perspective (audience's right = stage left = USR/DSR).
- Standard instrument mic'ing (SM57 on snare, kick drum mic, DI for
  bass and keys, SM58/Beta58 for vocals, condensers for overheads,
  clip mics for horns)
- Monitor mix conventions (lead vox gets their own mix, rhythm section
  often shares, horn sections often share)
- Power requirements (amps, keyboards, and pedal boards need power;
  acoustic drums, horns, and vocals typically don't)
- The "featured" flag is for the primary performer (usually lead
  vocalist) — highlighted visually on the stage plot

When the user describes their band, you should:
1. Set up stage positions based on their description
2. Infer reasonable defaults for anything not specified (mic types,
   stand types, monitor groupings)
3. Auto-number channels sequentially (drums first, then bass, keys,
   guitars, horns, vocals — standard FOH convention)
4. Ask clarifying questions only when genuinely ambiguous

Always use the provided tools to make changes. Never just describe
what you would do — actually do it via tool calls.

The current show configuration is provided in each message. Build on
what exists rather than starting over, unless the user asks for a
fresh start.
```

---

## Spatial Reasoning

The interesting challenge: the agent needs to understand relative spatial instructions.

| User says | Agent infers |
|---|---|
| "to the drummer's left" | If drummer is USC, "left" (from performer perspective) = USL |
| "opposite side of the stage" | If reference is USR, opposite = USL (or DSL if also downstage) |
| "behind the horn section" | If horns are DSR, "behind" = upstage = USR |
| "front and center" | DSC |
| "put the rhythm section upstage" | Drums USC, bass USL or USR, keys on the other side |
| "horn section stage right" | DSR or USR depending on context |

The system prompt includes these conventions. The model handles this well with standard stage direction vocabulary. Edge cases (e.g., "put them near Graham" without knowing Graham's position) are handled by asking a clarifying question.

---

## What the Agent Can't Do

- **Charts/Drive:** No access to Google Drive. Chart resolution is a separate system.
- **Print/Share:** Can't trigger print or generate share links. Those are user actions.
- **Undo:** No undo beyond rejecting a preview. The user can always edit forms directly.
- **Multi-show:** Agent works on the current show config only. No show library awareness.

---

## Data Model Changes

None. The agent reads and writes the existing `AppConfig` shape. No new types needed.

One new localStorage key: `stageplot-claude-key` for the API key.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Invalid API key | Test call fails. Show error with link to Anthropic console. |
| API rate limit hit | Show the error from Claude API. User waits or checks their plan. |
| Agent returns invalid config data | Validation before preview: check positions are valid StagePosition values, channels are numbers, etc. Invalid data shown as error, not applied. |
| User edits form while chat is open | Agent sees updated config in next turn. No conflict. |
| User rejects a change | "Rejected" message fed back to agent. Agent can ask why or try again. |
| Very long conversation (token limit) | Truncate oldest messages, keeping system prompt + current config + last N turns. Show "conversation trimmed" notice. |
| Network error mid-stream | Show partial response if any. "Retry" button resends the last message. |
| User pastes a full band roster | Agent should handle bulk input — parse all names/instruments/positions in one pass. |

---

## Security

- **API key in transit:** Sent to `/api/agent/chat` over HTTPS, used for one Claude API call, not stored server-side. Same security model as any BYOA integration.
- **No key in URL:** API key never included in shareable URLs or config encoding.
- **No key in logs:** Server route must not log request bodies.
- **Config injection:** Agent output is validated against the TypeScript interfaces before preview. Arbitrary JSON can't be injected into the config.

---

## Implementation Order

1. System prompt authoring + tool definitions
2. `POST /api/agent/chat` proxy route
3. Chat UI component (message list, input, send)
4. Preview/approve gate component (diff view, apply/reject)
5. API key management (storage, validation, masking)
6. Wire tool call results to `updateConfig`
7. Conversation management (truncation, retry)

---

## Future

- **Voice input:** Speech-to-text for hands-free setup at the venue. Browser SpeechRecognition API is free and works on mobile.
- **"Fix this" from Show tab:** Tap a problem on the stage plot → opens chat with context ("move Graham to a different position" pre-filled).
- **Template generation:** "Set up a standard 5-piece rock band" → full config in one shot.
- **Multi-show awareness:** "Copy last week's setup but swap the drummer for Alex."

---

## Out of Scope

- Hosting/running an AI model (BYOA only)
- Storing conversation history across sessions
- Multi-user collaborative chat
- Agent access to Google Drive or external services
