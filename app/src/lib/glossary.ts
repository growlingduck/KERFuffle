/**
 * KERFuffle's shop vocabulary, explained once. Each entry says what the term
 * is and what it changes on the cut list, in the words of
 * docs/calculation-rules.md (and docs/sheet-optimizer.md for the saw). The
 * info tips beside fields and rules read their text from here, and so will the
 * help screen (prompt 18). Change a rule's meaning there first, then here.
 */

export interface GlossaryEntry {
  /** The term as the screen names it: "About {term}". */
  term: string;
  /** One or two sentences: what it is, and what it changes on the cut list. */
  text: string;
}

export const GLOSSARY = {
  boxHeight: {
    term: 'Height, overall',
    text: 'Floor to the top of the countertop. A base cabinet’s box is this minus the toe kick and the countertop, and a tall cabinet’s minus the toe kick only, as the tape under the sizes works out; the back, sides, front and laminate are cut to box height, and wall cabinets use the full height.',
  },
  run: {
    term: 'Run',
    text: 'A straight row of base and tall cabinets that stand on one shared ladder base, like “Sink wall”. Cabinets with the same run name share one set of base rails, sleepers and kick skin on the cut list; a base or tall cabinet with no run gets its own.',
  },
  tallCabinet: {
    term: 'Tall cabinet',
    text: 'A pantry, oven or utility cabinet that stands on the floor like a base cabinet, on the same base, and fills both the base and the wall rows of the wall. It has no countertop, so its box is the overall height minus the toe kick, and it always gets a full top.',
  },
  fixedShelves: {
    term: 'Fixed shelves',
    text: 'Structural shelves in a tall cabinet, fastened like the bottom and spaced evenly up the inside; the adjustable shelves are shared among the sections they make. Each is cut from box stock, the width between the sides long and as deep as the box to the back.',
  },
  midNailer: {
    term: 'Mid nailer',
    text: 'A second nailer, under the lowest fixed shelf, so an inset back can be screwed at mid-height too. It is the same size as the top nailer and adds one to the cut list; applied backs have no nailers.',
  },
  splitBack: {
    term: 'Split back',
    text: 'A tall back cut as two pieces that meet at the middle of the lowest fixed shelf, for a back longer than the sheet. The two pieces add up to the one-piece back; it needs at least one fixed shelf.',
  },
  finishedEnds: {
    term: 'Finished ends',
    text: 'A cabinet end that shows, so its outside face is laminated. Each finished end adds one side laminate piece to the cut list, cut oversize like all laminate.',
  },
  panelThickness: {
    term: 'Panel thickness',
    text: 'The sheet stock the box is built from. The top, bottom and shelves fit between the sides and the sides stop at the back, so it changes their lengths and widths as well as every panel’s thickness.',
  },
  toeKick: {
    term: 'Toe kick',
    text: 'The recess at the floor under a base or tall cabinet. It comes off the overall height to give box height, and sets the height of the base rails, sleepers, kick board or notch.',
  },
  countertop: {
    term: 'Countertop',
    text: 'The top that sits on a base cabinet. Its thickness comes off the overall height to give box height; wall cabinets ignore it.',
  },
  shelfClearance: {
    term: 'Shelf clearance',
    text: 'The gap left at each end of a shelf so it drops in easily. Shelves are cut twice this shorter than the space between the sides.',
  },
  shelfSetback: {
    term: 'Shelf setback',
    text: 'How far shelves sit back from the cabinet front. Shelves are cut this much narrower, front to back.',
  },
  shelfThickness: {
    term: 'Shelf thickness',
    text: 'The stock shelves are cut from in cabinets narrower than the wide-shelf width. It stays the same when the panels are thinner, and the cut list warns you so you can check which stock the shelves come from.',
  },
  wideShelves: {
    term: 'Wide shelves',
    text: 'Shelves in a wide cabinet (36″ and wider unless the shop changed it) are cut from thicker stock (1″) so they don’t sag. Only the shelf thickness changes on the cut list.',
  },
  laminateOversize: {
    term: 'Laminate oversize',
    text: 'Extra laminate left past every edge and trimmed flush after gluing. Every laminate piece is cut twice this longer and twice this wider than the face it covers.',
  },
  laminate: {
    term: 'Laminate',
    text: 'The thin sheet glued to the front and to each finished end. It is listed oversize so it can be trimmed flush, and never shows a thickness.',
  },
  constructionMethod: {
    term: 'Construction method',
    text: 'How every cabinet in the job is built: on a separate ladder base, on leveling legs, or with the sides run to the floor and notched for the toe kick. It decides which base parts are on the cut list, how long base and tall cabinet sides are, and whether end laminate runs to the floor.',
  },
  ladderBase: {
    term: 'Ladder base',
    text: 'A separate base of a front and a back rail, toe-kick tall, with sleepers between, built once per run. It adds rails, sleepers and a kick skin to the cut list; a run longer than the longest platform is split into sections.',
  },
  back: {
    term: 'Back',
    text: 'An applied back is screwed on behind the box, full width, and the sides stop at it. An inset back sits in a groove, so the sides, top and bottom run full depth and the box gets a nailer.',
  },
  backThickness: {
    term: 'Back thickness',
    text: 'The same as the panels unless it is set, e.g. 1/4″ for an inset back. It changes the back’s thickness and how deep the sides, top, bottom and shelves are.',
  },
  backGroove: {
    term: 'Groove depth',
    text: 'How deep an inset back sits in the sides, top and bottom. The back is cut one groove depth bigger than the opening at each edge.',
  },
  backDadoInset: {
    term: 'Dado inset',
    text: 'How far a dado back sits in from the back edge, leaving room for the nailer behind it. Shelves stop this much sooner, so they come out narrower.',
  },
  nailer: {
    term: 'Nailer',
    text: 'The hanging rail under the top that an inset back is too thin to screw through. It adds one part per cabinet: the width between the sides long, and this tall.',
  },
  baseTop: {
    term: 'Base top',
    text: 'A base cabinet’s top is either a full panel or two stretchers, front and back. Stretchers replace the top on the cut list with two narrow strips the width between the sides long.',
  },
  kickDepth: {
    term: 'Kick depth',
    text: 'How far the toe-kick face sits back from the cabinet front. It shortens the ladder-base sleepers and sets how deep the notch is on sides that run to the floor.',
  },
  kickSkin: {
    term: 'Kick skin',
    text: 'The finished face over a ladder base’s front rail, one piece per platform section. This sets its thickness on the cut list.',
  },
  sleeperSpacing: {
    term: 'Sleeper spacing',
    text: 'Sleepers run front to back between a ladder base’s rails, one at each end. More are added until no gap, center to center, is over this, which sets how many are on the cut list.',
  },
  platformLength: {
    term: 'Longest platform',
    text: 'A ladder base longer than this is cut into the fewest sections that fit, joined at a cabinet seam where one works. Each section gets its own rails, sleepers and kick skin.',
  },
  legs: {
    term: 'Leveling legs',
    text: 'The box stands on adjustable legs with a clip-on kick board, so there are no rails or sleepers to cut. Legs and clips are hardware, not on the cut list; wide boxes get more legs.',
  },
  sawProfile: {
    term: 'Saw profile',
    text: 'How a saw cuts: its kerf, the trim taken off each sheet edge, and which way the first cut goes. The sheet layouts fit parts on sheets with the job’s own copy of it.',
  },
  kerf: {
    term: 'Kerf',
    text: 'The width the blade takes out at every cut. The layouts leave one kerf between neighboring parts, so a wider kerf can mean fewer parts fit on a sheet.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export function isGlossaryKey(key: string): key is GlossaryKey {
  return Object.hasOwn(GLOSSARY, key);
}

/**
 * The status symbols, which the screens use without words beside them. Each
 * one is named for screen readers and in its tooltip.
 */
export const SYMBOLS = {
  warning: { glyph: '△', label: 'Warning', text: 'Something to check. Nothing is blocked.' },
  differs: { glyph: '◆', label: 'Differs from shop defaults', text: 'A rule or setting that isn’t what the shop uses now.' },
  needsFix: { glyph: '⚠', label: 'Needs a fix', text: 'A size or setting that can’t be used as it is. Fix it to get parts.' },
} as const;

export type SymbolKey = keyof typeof SYMBOLS;
