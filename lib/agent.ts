// Agent codesigner — system prompt, tool definitions, and types
// See docs/design-agent-codesigner.md for full design

export const SYSTEM_PROMPT = `You are a live sound engineer and stage manager assistant. You help musicians and engineers set up shows by translating natural language descriptions into structured technical configurations.

You understand:
- Stage positions — a 3x3 zone grid:
  Upstage:   USR (upstage right), USC (upstage center), USL (upstage left)
  Mid-stage: MSR (mid-stage right), MSC (mid-stage center), MSL (mid-stage left)
  Downstage: DSR (downstage right), DSC (downstage center), DSL (downstage left)

  Do NOT use PIT, FOH, or OTHER — those exist in the type system but are not renderable in the stage plot UI.

  Stage left/right is from the performer's perspective facing the audience. Audience's right = stage left = USL/MSL/DSL. Audience's left = stage right = USR/MSR/DSR.

- ZONE PHILOSOPHY: The stage plot is a spatial overview, not a detailed inventory. Each position is a ZONE, not a chair. A zone can represent one person or a section of players. When there are more people than positions, group them by section into a zone and use the zone's name/role to describe the group (e.g., name: "Horns", role: "Sax, Tpt, Tbn"). Individual detail (per-player mics, channels, stands) belongs in the Input List, not the stage plot.

  Each position must have exactly one occupant — the stage plot renderer uses position as a unique key, so duplicates silently overwrite. With 9 zones, most bands fit comfortably. For very large ensembles (big bands, orchestras), use zones for sections (e.g., "Brass" at MSR, "Strings" at MSL, "Woodwinds" at USR) and detail individuals in the Input List.

  The mid-stage row renders conditionally — it only appears when at least one MS position is occupied. For small bands (6 or fewer), prefer using just US + DS rows to keep the plot compact.

- Standard instrument mic'ing (SM57 on snare, kick drum mic, DI for bass and keys, SM58/Beta58 for vocals, condensers for overheads, clip mics for horns)
- Monitor mix conventions (lead vox gets their own mix, rhythm section often shares, horn sections often share)
- Power requirements (amps, keyboards, and pedal boards need power; acoustic drums, horns, and vocals typically don't)
- The "featured" flag is for the primary performer (usually lead vocalist) — highlighted visually on the stage plot

When the user describes their band, you should:
1. Set up stage positions based on their description, using the zone model — group sections into zones, detail individuals in inputs
2. Infer reasonable defaults for anything not specified (mic types, stand types, monitor groupings)
3. Auto-number channels sequentially (drums first, then bass, keys, guitars, horns, vocals — standard FOH convention)
4. Ask clarifying questions only when genuinely ambiguous

Data conventions:
- SetlistSong.lead is a required string. For instrumental tracks, use "Instrumental" as the lead value. For multi-lead, use "+" to separate names (e.g., "Graham + Rachel").

Always use the provided tools to make changes. Never just describe what you would do — actually do it via tool calls.

The current show configuration is provided in each message. Build on what exists rather than starting over, unless the user asks for a fresh start.`;

const POS_ENUM = ['USR', 'USC', 'USL', 'MSR', 'MSC', 'MSL', 'DSR', 'DSC', 'DSL'];

export const TOOLS = [
  {
    name: 'update_stage_plot',
    description: 'Replace the entire stage plot with a new set of positions. Each position is a zone — can represent one person or a section.',
    input_schema: {
      type: 'object' as const,
      properties: {
        stagePlot: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string' as const, description: 'Person or section name' },
              pos: { type: 'string' as const, enum: POS_ENUM, description: 'Stage zone position' },
              role: { type: 'string' as const, description: 'Instrument(s) or role description' },
              mix: { type: 'number' as const, description: 'Monitor mix number' },
              power: { type: 'boolean' as const, description: 'Needs AC power drop' },
              featured: { type: 'boolean' as const, description: 'Primary performer highlight' },
            },
            required: ['name', 'pos', 'role', 'mix'],
          },
        },
      },
      required: ['stagePlot'],
    },
  },
  {
    name: 'update_inputs',
    description: 'Replace the entire input list (channel list for FOH).',
    input_schema: {
      type: 'object' as const,
      properties: {
        inputs: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              ch: { type: 'number' as const, description: 'Channel number' },
              inst: { type: 'string' as const, description: 'Instrument or source' },
              mic: { type: 'string' as const, description: 'Microphone or DI type' },
              stand: { type: 'string' as const, description: 'Stand type' },
              notes: { type: 'string' as const, description: 'Notes (e.g., player name, position)' },
            },
            required: ['ch', 'inst', 'mic', 'stand'],
          },
        },
      },
      required: ['inputs'],
    },
  },
  {
    name: 'update_monitors',
    description: 'Replace the entire monitor mix list.',
    input_schema: {
      type: 'object' as const,
      properties: {
        monitors: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              mix: { type: 'number' as const, description: 'Mix number' },
              name: { type: 'string' as const, description: 'Who gets this mix' },
              needs: { type: 'string' as const, description: 'What they need in the mix' },
            },
            required: ['mix', 'name', 'needs'],
          },
        },
      },
      required: ['monitors'],
    },
  },
  {
    name: 'update_setlist',
    description: 'Replace the entire setlist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        setlist: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              position: { type: 'number' as const, description: 'Song order (1-based)' },
              title: { type: 'string' as const, description: 'Song title' },
              lead: { type: 'string' as const, description: 'Lead singer(s) or "Instrumental"' },
              notes: { type: 'string' as const, description: 'Key, artist, arrangement notes' },
              sceneNote: { type: 'string' as const, description: 'Engineer cue (e.g., "save scene after")' },
            },
            required: ['position', 'title', 'lead'],
          },
        },
      },
      required: ['setlist'],
    },
  },
  {
    name: 'update_notes',
    description: 'Replace the general notes section.',
    input_schema: {
      type: 'object' as const,
      properties: {
        notes: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              label: { type: 'string' as const, description: 'Note category (e.g., "Power", "Stands")' },
              text: { type: 'string' as const, description: 'Note content' },
            },
            required: ['label', 'text'],
          },
        },
      },
      required: ['notes'],
    },
  },
  {
    name: 'update_show_info',
    description: 'Update show metadata (band name, date, venue, lineup).',
    input_schema: {
      type: 'object' as const,
      properties: {
        showInfo: {
          type: 'object' as const,
          properties: {
            bandName: { type: 'string' as const },
            eventDate: { type: 'string' as const, description: 'ISO date (e.g., "2026-06-15")' },
            venue: { type: 'string' as const },
          },
        },
        lineup: { type: 'string' as const, description: 'e.g., "7-Piece Band"' },
      },
    },
  },
];

// Types for chat messages (mirrors Claude API message format)
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export type ToolName = 'update_stage_plot' | 'update_inputs' | 'update_monitors' | 'update_setlist' | 'update_notes' | 'update_show_info';
