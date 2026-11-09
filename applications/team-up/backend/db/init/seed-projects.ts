/**
 * The public world of the catalog: sixty projects with their owners and
 * their open slots — the demo the catalog page (`/projects`) shows.
 *
 * The owners are accounts of this seed (`<slug>-founder@projects.invalid`,
 * the demo password `teamup123`); the professions and the skills are the
 * ones of the directories (`seed.sql`). A project without slots is still in
 * the catalog — the "only with open slots" filter drops it.
 */
import type { Query } from "./query.ts";
import { hashPassword } from "./seed.ts";

/** The professions of the directory (seed.sql). */
const PROF = {
  backend: 1,
  frontend: 2,
  mobile: 3,
  design: 4,
  analytics: 5,
} as const;

/** The leaf skills of the directory (seed.sql). */
const SKILL = {
  postgres: 101,
  redis: 102,
  mongodb: 103,
  nodejs: 111,
  rust: 112,
  go: 113,
  python: 114,
  react: 121,
  vue: 122,
  typescript: 123,
  css: 124,
  swift: 131,
  swiftui: 132,
  kotlin: 141,
  compose: 142,
  figma: 151,
  photoshop: 152,
  blender: 153,
  tableau: 161,
  powerbi: 162,
} as const;

type Profession = keyof typeof PROF;
type Skill = keyof typeof SKILL;
type Grade = "junior" | "middle" | "senior" | "lead";
type Kind = "startup" | "company" | "part-time";
type Mode = "remote" | "office" | "hybrid";

/** One vacancy of a project. */
interface SeedSlot {
  /** The profession the seat is for. */
  p: Profession;
  /** The grade asked for. */
  b: Grade;
  /** What the seat does. */
  d: string;
  /** What it pays (nothing = the seat pays nothing yet). */
  pay?: "unpaid" | "equity" | "paid";
  from?: number;
  to?: number;
  /** The skills it asks for, with the level. */
  s: [Skill, number][];
}

/** One project of the catalog. */
interface SeedProject {
  name: string;
  slug: string;
  /** The founder's name (the account's owner). */
  owner: string;
  kind?: Kind;
  mode?: Mode;
  city?: string;
  tags?: string[];
  tagline: string;
  description: string;
  website?: string;
  /** The budget of a part-time job. */
  budget?: number;
  currency?: string;
  deadline?: string;
  status?: "active" | "paused" | "done" | "cancelled";
  /** The founder's role in the team (the card's "Designer · senior"). */
  role?: [Profession, Grade];
  slots?: SeedSlot[];
}

const PROJECTS: SeedProject[] = [
  {
    name: "Orbit Labs",
    slug: "orbit-labs-public",
    owner: "Lena Weber",
    kind: "startup",
    mode: "remote",
    city: "Berlin",
    tags: ["devtools", "rust"],
    tagline: "A rust-flavoured tools studio",
    description:
      "We build small sharp dev-tools for teams that ship every day. Two founders, four people, one obsession: fewer clicks.",
    website: "https://orbitlabs.example",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "Storage and sync for the desktop app",
        pay: "equity",
        s: [
          ["rust", 7],
          ["postgres", 6],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The console: views, forms, the patch timeline",
        pay: "paid",
        from: 4000,
        to: 6000,
        s: [
          ["react", 6],
          ["typescript", 7],
        ],
      },
    ],
  },
  {
    name: "Nord HR",
    slug: "nord-hr-public",
    owner: "Erik Lund",
    kind: "company",
    mode: "office",
    city: "Copenhagen",
    tags: ["hr", "recruiting"],
    tagline: "We match tech people with nordic companies",
    description:
      "A small recruiting house for the nordic tech scene. We place forty people a year and we know every company by heart.",
    website: "https://nordhr.example",
    slots: [
      {
        p: "frontend",
        b: "senior",
        d: "The candidate's portal and the employer's board",
        pay: "paid",
        from: 6000,
        to: 9000,
        s: [
          ["react", 8],
          ["typescript", 8],
        ],
      },
      {
        p: "analytics",
        b: "junior",
        d: "The funnel: who applies, who gets hired",
        pay: "paid",
        from: 3000,
        s: [
          ["python", 5],
          ["tableau", 5],
        ],
      },
    ],
  },
  {
    name: "Copy Boost",
    slug: "copy-boost-public",
    owner: "Marta Kovac",
    kind: "part-time",
    mode: "remote",
    tags: ["marketing", "copywriting"],
    tagline: "Landing pages that sell, in a week",
    description:
      "A part-time job: one landing page a week, a clear brief, a fair fee. The rest of the week is yours.",
    budget: 3000,
    currency: "EUR",
    deadline: "2026-12-20",
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The page itself: the hero, the form, the button",
        pay: "paid",
        from: 3000,
        s: [
          ["figma", 6],
          ["css", 5],
        ],
      },
    ],
  },
  {
    name: "Solar Grid",
    slug: "solar-grid",
    owner: "Jonas Berg",
    kind: "startup",
    mode: "hybrid",
    city: "Berlin",
    tags: ["energy", "hardware", "iot"],
    tagline: "Smart inverters for small solar plants",
    description:
      "We put cheap inverters on the roofs of small plants and read them from the cloud. The hardware is done; the cloud is not.",
    website: "https://solargrid.example",
    role: ["backend", "middle"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The readings: a million a day, one dashboard",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["go", 6],
          ["postgres", 6],
          ["redis", 5],
        ],
      },
      {
        p: "mobile",
        b: "middle",
        d: "The app the plant owners look at",
        pay: "paid",
        from: 4500,
        s: [
          ["kotlin", 5],
          ["compose", 5],
        ],
      },
    ],
  },
  {
    name: "Paperless",
    slug: "paperless",
    owner: "Anna Ivanova",
    kind: "startup",
    mode: "remote",
    city: "Tallinn",
    tags: ["documents", "ocr"],
    tagline: "Scans, reads and files your papers",
    description:
      "An archive for the papers of small offices: scan, read, file, find. We are two people and a very good parser.",
    role: ["backend", "lead"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The parser: the layout of any invoice",
        pay: "equity",
        s: [
          ["python", 7],
          ["postgres", 6],
        ],
      },
      {
        p: "design",
        b: "junior",
        d: "The interface: a pile of papers becomes a list",
        pay: "unpaid",
        s: [["figma", 4]],
      },
    ],
  },
  {
    name: "Trip Teller",
    slug: "trip-teller",
    owner: "Ravi Menon",
    kind: "startup",
    mode: "remote",
    tags: ["travel", "maps"],
    tagline: "The trip of your life, planned in an evening",
    description:
      "We plan a week of travel from a wish list: the trains, the beds, the weather. The map is the product.",
    website: "https://tripteller.example",
    role: ["frontend", "senior"],
    slots: [
      {
        p: "frontend",
        b: "middle",
        d: "The map view and the day planner",
        pay: "equity",
        s: [
          ["react", 7],
          ["typescript", 7],
        ],
      },
      {
        p: "analytics",
        b: "middle",
        d: "What people actually do in a city",
        pay: "unpaid",
        s: [
          ["python", 6],
          ["powerbi", 5],
        ],
      },
    ],
  },
  {
    name: "Green Basket",
    slug: "green-basket",
    owner: "Olga Petrova",
    kind: "company",
    mode: "office",
    city: "Moscow",
    tags: ["food", "delivery"],
    tagline: "The grocery of the neighbourhood, in an hour",
    description:
      "A grocery delivery service for five districts. We buy, we pack, we deliver — the software ties it together.",
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The orders, the routes, the stock",
        pay: "paid",
        from: 8000,
        to: 12000,
        s: [
          ["postgres", 7],
          ["redis", 6],
          ["python", 5],
        ],
      },
      {
        p: "design",
        b: "middle",
        d: "The shopping list and the delivery screen",
        pay: "paid",
        from: 6000,
        s: [
          ["figma", 7],
          ["photoshop", 4],
        ],
      },
    ],
  },
  {
    name: "Quiet Room",
    slug: "quiet-room",
    owner: "Dana Ellis",
    kind: "startup",
    mode: "remote",
    tags: ["audio", "wellbeing"],
    tagline: "Soundproof rooms you can book by the hour",
    description:
      "We run eight studios in three cities and a booking app that nobody has to think about.",
    role: ["design", "middle"],
    status: "paused",
    slots: [
      {
        p: "frontend",
        b: "junior",
        d: "The booking calendar and the payments",
        pay: "paid",
        from: 2000,
        s: [
          ["vue", 4],
          ["css", 4],
        ],
      },
      {
        p: "design",
        b: "senior",
        d: "The brand and the studios' look",
        pay: "equity",
        s: [
          ["figma", 8],
          ["photoshop", 6],
        ],
      },
    ],
  },
  {
    name: "Ledger Loop",
    slug: "ledger-loop",
    owner: "Pavel Novak",
    kind: "startup",
    mode: "hybrid",
    city: "Prague",
    tags: ["fintech", "accounting"],
    tagline: "Bookkeeping that closes itself",
    description:
      "A bookkeeping service for small studios: the bank speaks, the books are written, the accountant sleeps.",
    website: "https://ledgerloop.example",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The bank feeds and the double entry",
        pay: "paid",
        from: 9000,
        to: 13000,
        s: [
          ["rust", 7],
          ["postgres", 7],
        ],
      },
      {
        p: "analytics",
        b: "middle",
        d: "The reports the accountant reads",
        pay: "paid",
        from: 5000,
        s: [
          ["python", 6],
          ["tableau", 6],
        ],
      },
    ],
  },
  {
    name: "Step Studio",
    slug: "step-studio",
    owner: "Ines Duarte",
    kind: "part-time",
    mode: "remote",
    tags: ["fitness", "video"],
    tagline: "Fitness clips, cut to the beat",
    description:
      "A part-time gig: cut the workouts of the studio's coaches into short clips. Twenty clips a month.",
    budget: 2500,
    currency: "EUR",
    deadline: "2027-01-15",
    slots: [
      {
        p: "design",
        b: "junior",
        d: "The clips: cuts, subtitles, the cover",
        pay: "paid",
        from: 2500,
        s: [
          ["blender", 3],
          ["photoshop", 4],
        ],
      },
    ],
  },
  {
    name: "Civic Map",
    slug: "civic-map",
    owner: "Nils Haugen",
    kind: "startup",
    mode: "remote",
    city: "Oslo",
    tags: ["civic", "open-source"],
    tagline: "What the city spends its money on",
    description:
      "An open map of every municipal budget: where the money goes, who decides, how it changes.",
    website: "https://civicmap.example",
    role: ["analytics", "senior"],
    slots: [
      {
        p: "frontend",
        b: "middle",
        d: "The map and the budget explorer",
        pay: "equity",
        s: [
          ["react", 6],
          ["css", 5],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The scrapers of the municipal registries",
        pay: "equity",
        s: [
          ["python", 6],
          ["mongodb", 5],
        ],
      },
    ],
  },
  {
    name: "Fresh Route",
    slug: "fresh-route",
    owner: "Sofia Lima",
    kind: "company",
    mode: "office",
    city: "Lisbon",
    tags: ["logistics", "food"],
    tagline: "The cold chain, watched",
    description:
      "We deliver the food of the restaurants to the hotels. The vans are ours; the software that watches them is what we build.",
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The tracking of the vans and the cold chain",
        pay: "paid",
        from: 4000,
        to: 6000,
        s: [
          ["go", 6],
          ["redis", 5],
        ],
      },
      {
        p: "mobile",
        b: "senior",
        d: "The driver's app: the route, the proof of delivery",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["kotlin", 7],
          ["swift", 6],
        ],
      },
    ],
  },
  {
    name: "Lantern",
    slug: "lantern",
    owner: "Yuri Sokolov",
    kind: "startup",
    mode: "remote",
    tags: ["education", "language"],
    tagline: "A language tutor that never sleeps",
    description:
      "Voice conversations with a tutor that remembers what you said last week. We are building the memory first.",
    role: ["backend", "middle"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The memory of the learner and the sessions",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["python", 6],
          ["postgres", 6],
          ["redis", 6],
        ],
      },
      {
        p: "mobile",
        b: "junior",
        d: "The daily fifteen minutes",
        pay: "unpaid",
        s: [["swift", 4]],
      },
    ],
  },
  {
    name: "Meadow",
    slug: "meadow",
    owner: "Clara Braun",
    kind: "startup",
    mode: "hybrid",
    city: "Munich",
    tags: ["agriculture", "sensors"],
    tagline: "The soil tells you what it needs",
    description:
      "Sensors in the field, a weekly report for the farmer, and a marketplace for what the soil is missing.",
    website: "https://meadow.example",
    role: ["analytics", "middle"],
    slots: [
      {
        p: "analytics",
        b: "senior",
        d: "From the readings to the advice",
        pay: "paid",
        from: 7000,
        to: 9000,
        s: [
          ["python", 7],
          ["powerbi", 6],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The readings of ten thousand fields",
        pay: "equity",
        s: [
          ["go", 5],
          ["postgres", 4],
        ],
      },
    ],
  },
  {
    name: "Pixel Perfect",
    slug: "pixel-perfect",
    owner: "Nina Volkova",
    kind: "company",
    mode: "remote",
    city: "Tbilisi",
    tags: ["design", "agency"],
    tagline: "A design studio with a bench",
    description:
      "We take on the brand of a product team and staff it: a designer, a motion artist, a frontender.",
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The brand of a fintech, from the logo to the app",
        pay: "paid",
        from: 3000,
        to: 4500,
        s: [
          ["figma", 7],
          ["blender", 4],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The marketing site and the design system",
        pay: "paid",
        from: 3000,
        s: [
          ["react", 6],
          ["typescript", 6],
        ],
      },
    ],
  },
  {
    name: "Book Nook",
    slug: "book-nook",
    owner: "Hugo Martins",
    kind: "part-time",
    mode: "remote",
    tags: ["books", "editorial"],
    tagline: "Cover design, one book a month",
    description:
      "A part-time job for an illustrator: a cover, a spine, a blurb layout. The publisher pays per title.",
    budget: 1800,
    currency: "EUR",
    deadline: "2026-12-01",
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The cover and the interior",
        pay: "paid",
        from: 1800,
        s: [
          ["photoshop", 7],
          ["blender", 5],
        ],
      },
    ],
  },
  {
    name: "Signal Room",
    slug: "signal-room",
    owner: "Ada Nowak",
    kind: "startup",
    mode: "remote",
    tags: ["messaging", "privacy"],
    tagline: "Messages that expire where they should",
    description:
      "A messenger for the teams that cannot keep a server: end-to-end, expiring, auditable.",
    role: ["backend", "lead"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The delivery, the keys, the audit",
        pay: "equity",
        s: [
          ["rust", 8],
          ["postgres", 6],
        ],
      },
      {
        p: "mobile",
        b: "senior",
        d: "The iOS client of the messenger",
        pay: "paid",
        from: 6000,
        to: 8000,
        s: [
          ["swift", 8],
          ["swiftui", 7],
        ],
      },
    ],
  },
  {
    name: "Good Grain",
    slug: "good-grain",
    owner: "Tom Baker",
    kind: "company",
    mode: "office",
    city: "Manchester",
    tags: ["food", "wholesale"],
    tagline: "Flour for the bakers of the north",
    description:
      "A mill and twenty bakers. The orders come by fax, the invoices by post — we would like to stop both.",
    slots: [
      {
        p: "backend",
        b: "junior",
        d: "The orders, the routes, the invoices",
        pay: "paid",
        from: 2500,
        s: [
          ["nodejs", 4],
          ["postgres", 4],
        ],
      },
      {
        p: "analytics",
        b: "junior",
        d: "How much of what goes where",
        pay: "unpaid",
        s: [
          ["python", 4],
          ["tableau", 4],
        ],
      },
    ],
  },
  {
    name: "Atlas of Skills",
    slug: "atlas-of-skills",
    owner: "Vera Lindgren",
    kind: "startup",
    mode: "remote",
    tags: ["careers", "education"],
    tagline: "What you can do, not what you studied",
    description:
      "A map of the skills of a country, built from the portfolios of the people who live there.",
    website: "https://atlasofskills.example",
    role: ["analytics", "lead"],
    slots: [
      {
        p: "analytics",
        b: "middle",
        d: "The skill graph and its clusters",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["python", 7],
          ["postgres", 5],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The atlas itself: the map and the profiles",
        pay: "equity",
        s: [
          ["vue", 6],
          ["css", 6],
        ],
      },
    ],
  },
  {
    name: "Rust & Roses",
    slug: "rust-and-roses",
    owner: "Marta Silva",
    kind: "startup",
    mode: "hybrid",
    city: "Porto",
    tags: ["retail", "ecommerce"],
    tagline: "Flowers that arrive before the occasion",
    description:
      "A flower shop with a fleet of vans and a scheduler that promises nothing it cannot keep.",
    role: ["frontend", "middle"],
    slots: [
      {
        p: "frontend",
        b: "middle",
        d: "The shop and the delivery calendar",
        pay: "paid",
        from: 2500,
        s: [
          ["vue", 6],
          ["css", 6],
        ],
      },
      {
        p: "backend",
        b: "junior",
        d: "The stock of every flower of every day",
        pay: "unpaid",
        s: [["python", 4]],
      },
    ],
  },
  {
    name: "Coastline",
    slug: "coastline",
    owner: "Lars Eriksen",
    kind: "startup",
    mode: "remote",
    tags: ["marine", "data"],
    tagline: "The sea, measured",
    description:
      "We read the buoys, the satellites and the fish and we tell the ports what the water will do.",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The readings of the buoys, minute by minute",
        pay: "paid",
        from: 7000,
        to: 9500,
        s: [
          ["go", 7],
          ["postgres", 6],
        ],
      },
      {
        p: "analytics",
        b: "middle",
        d: "The models of the water",
        pay: "paid",
        from: 5000,
        s: [
          ["python", 7],
          ["tableau", 5],
        ],
      },
    ],
  },
  {
    name: "Second Hand",
    slug: "second-hand",
    owner: "Ahmed Nasser",
    kind: "company",
    mode: "remote",
    city: "Dubai",
    tags: ["marketplace", "recycling"],
    tagline: "The things you no longer need, next door",
    description:
      "A marketplace of used things with a courier: the seller drops, we carry, the buyer waves.",
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The listings, the payments, the courier",
        pay: "paid",
        from: 4000,
        to: 6000,
        s: [
          ["nodejs", 6],
          ["mongodb", 5],
          ["redis", 5],
        ],
      },
      {
        p: "design",
        b: "junior",
        d: "The photos of the things",
        pay: "unpaid",
        s: [["photoshop", 3]],
      },
    ],
  },
  {
    name: "Kindred Care",
    slug: "kindred-care",
    owner: "Elena Volkova",
    kind: "company",
    mode: "office",
    city: "Prague",
    tags: ["health", "care"],
    tagline: "Nurses and the families that need them",
    description:
      "We find the nurse for the family that needs one, and we keep the paperwork honest.",
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The shifts, the nurses, the families",
        pay: "paid",
        from: 4500,
        to: 6500,
        s: [
          ["postgres", 6],
          ["nodejs", 5],
        ],
      },
      {
        p: "design",
        b: "middle",
        d: "The family app: simple, warm, clear",
        pay: "paid",
        from: 3500,
        s: [["figma", 6]],
      },
    ],
  },
  {
    name: "Byte Sized",
    slug: "byte-sized",
    owner: "Ken Watanabe",
    kind: "startup",
    mode: "remote",
    tags: ["games", "indie"],
    tagline: "Small games, big feelings",
    description:
      "A two-person studio making pocket games about long journeys. The next one needs a sound designer.",
    role: ["design", "senior"],
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The characters and the world of the next game",
        pay: "equity",
        s: [
          ["figma", 7],
          ["blender", 6],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The web build of the game",
        pay: "unpaid",
        s: [["typescript", 5]],
      },
    ],
  },
  {
    name: "Clinic Cloud",
    slug: "clinic-cloud",
    owner: "Sara Lindholm",
    kind: "company",
    mode: "hybrid",
    city: "Helsinki",
    tags: ["health", "saas"],
    tagline: "The clinic's day, on one screen",
    description:
      "Software for private clinics: the reception, the room, the bill. We sell it to the clinics of the north.",
    website: "https://cliniccloud.example",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The records and the billing of a clinic",
        pay: "paid",
        from: 6000,
        to: 8500,
        s: [
          ["postgres", 8],
          ["go", 6],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The reception's screen",
        pay: "paid",
        from: 4500,
        s: [
          ["react", 6],
          ["typescript", 6],
        ],
      },
    ],
  },
  {
    name: "Wild Kitchen",
    slug: "wild-kitchen",
    owner: "Luca Ferri",
    kind: "part-time",
    mode: "remote",
    tags: ["food", "video"],
    tagline: "Recipes shot in your kitchen",
    description:
      "A part-time job: cook three recipes from the menu and film them. The studio writes, you cook.",
    budget: 1500,
    currency: "EUR",
    deadline: "2026-11-30",
    status: "done",
    slots: [
      {
        p: "design",
        b: "junior",
        d: "The styling and the shots of the dishes",
        pay: "paid",
        from: 1500,
        s: [["photoshop", 4]],
      },
    ],
  },
  {
    name: "Metric & Co",
    slug: "metric-and-co",
    owner: "David Rosen",
    kind: "company",
    mode: "office",
    city: "Warsaw",
    tags: ["consulting", "data"],
    tagline: "Numbers you can act on",
    description:
      "A small consultancy that installs the dashboards nobody reads. We also build them, when nobody else will.",
    slots: [
      {
        p: "analytics",
        b: "senior",
        d: "The models behind the advice",
        pay: "paid",
        from: 8000,
        to: 11000,
        s: [
          ["python", 8],
          ["powerbi", 7],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The pipes that fill the dashboards",
        pay: "paid",
        from: 6000,
        s: [
          ["python", 6],
          ["postgres", 6],
        ],
      },
    ],
  },
  {
    name: "Drift",
    slug: "drift",
    owner: "Ilya Zaitsev",
    kind: "startup",
    mode: "remote",
    tags: ["mobility", "scooters"],
    tagline: "Scooters that park themselves",
    description:
      "A fleet of scooters that find their own parking spots in the city centre. The hardware works; the map does not.",
    role: ["mobile", "senior"],
    slots: [
      {
        p: "mobile",
        b: "middle",
        d: "The rider's app and the map of the free spots",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["kotlin", 6],
          ["compose", 6],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "Where the scooters are, every second",
        pay: "equity",
        s: [
          ["go", 6],
          ["redis", 7],
        ],
      },
    ],
  },
  {
    name: "Paper Kitchen",
    slug: "paper-kitchen",
    owner: "Greta Fischer",
    kind: "startup",
    mode: "remote",
    city: "Vienna",
    tags: ["publishing", "recipes"],
    tagline: "Recipes that print well",
    description:
      "A publisher of cookbooks that live on paper and on the screen. We need a layout engine and a chef.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The page layouts of the books",
        pay: "paid",
        from: 2800,
        s: [
          ["figma", 6],
          ["photoshop", 5],
        ],
      },
      {
        p: "backend",
        b: "junior",
        d: "The shopping list of every recipe",
        pay: "unpaid",
        s: [["nodejs", 4]],
      },
    ],
  },
  {
    name: "Skyline Labs",
    slug: "skyline-labs",
    owner: "Marco Rossi",
    kind: "startup",
    mode: "hybrid",
    city: "Milan",
    tags: ["drones", "maps"],
    tagline: "The city from above, every week",
    description:
      "We fly the drones and draw the maps: the construction sites, the roofs, the traffic. The clients are the cities.",
    role: ["backend", "middle"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The processing of a hundred flights a week",
        pay: "paid",
        from: 6000,
        to: 8000,
        s: [
          ["rust", 7],
          ["postgres", 6],
        ],
      },
      {
        p: "analytics",
        b: "middle",
        d: "What changed since the last flight",
        pay: "equity",
        s: [
          ["python", 6],
          ["postgres", 5],
        ],
      },
    ],
  },
  {
    name: "Tide Table",
    slug: "tide-table",
    owner: "Ruth Alvarez",
    kind: "startup",
    mode: "remote",
    tags: ["marine", "forecast"],
    tagline: "The sea forecast for the sailors",
    description:
      "A forecast for the small boats: the tide, the swell, the wind. Two people and a very old dataset.",
    role: ["analytics", "senior"],
    slots: [
      {
        p: "analytics",
        b: "middle",
        d: "The forecast of the swell",
        pay: "equity",
        s: [
          ["python", 7],
          ["tableau", 5],
        ],
      },
      {
        p: "frontend",
        b: "junior",
        d: "The map and the table of the tides",
        pay: "unpaid",
        s: [
          ["react", 4],
          ["css", 4],
        ],
      },
    ],
  },
  {
    name: "Bright Start",
    slug: "bright-start",
    owner: "Sofia Reyes",
    kind: "company",
    mode: "office",
    city: "Barcelona",
    tags: ["education", "children"],
    tagline: "The after-school club, in the app",
    description:
      "Twenty clubs in the city and one app for the parents: the schedule, the menu, the photos of the day.",
    slots: [
      {
        p: "mobile",
        b: "middle",
        d: "The parents' app",
        pay: "paid",
        from: 4000,
        to: 5500,
        s: [
          ["swift", 6],
          ["swiftui", 5],
        ],
      },
      {
        p: "backend",
        b: "junior",
        d: "The attendance and the menus",
        pay: "paid",
        from: 2500,
        s: [
          ["nodejs", 4],
          ["postgres", 4],
        ],
      },
    ],
  },
  {
    name: "Foundry Road",
    slug: "foundry-road",
    owner: "Jack Miller",
    kind: "startup",
    mode: "remote",
    tags: ["hardware", "music"],
    tagline: "Pedals that make a laptop sound like a studio",
    description:
      "MIDI pedals for the people who play with a laptop. The firmware is the product.",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The firmware and the updater",
        pay: "equity",
        s: [
          ["rust", 6],
          ["go", 5],
        ],
      },
      {
        p: "design",
        b: "middle",
        d: "The pedal itself: the box and the knobs",
        pay: "paid",
        from: 3000,
        s: [
          ["figma", 6],
          ["photoshop", 4],
        ],
      },
    ],
  },
  {
    name: "Harbor Legal",
    slug: "harbor-legal",
    owner: "Rachel Stein",
    kind: "company",
    mode: "office",
    city: "Amsterdam",
    tags: ["legal", "saas"],
    tagline: "Contracts that read themselves",
    description:
      "A legal service for small companies: a lawyer, a template, and software that finds the risky clause.",
    website: "https://harborlegal.example",
    role: ["backend", "middle"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The clause library and the checks",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["python", 6],
          ["postgres", 6],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The reading room of the contract",
        pay: "paid",
        from: 4000,
        s: [
          ["react", 6],
          ["typescript", 6],
        ],
      },
    ],
  },
  {
    name: "Sunset Cinema",
    slug: "sunset-cinema",
    owner: "Paulo Ferreira",
    kind: "part-time",
    mode: "remote",
    tags: ["film", "events"],
    tagline: "A cinema in the open air, once a month",
    description:
      "A part-time job: run the projector, welcome the guests, sell the popcorn. One evening a month.",
    budget: 1200,
    currency: "EUR",
    deadline: "2026-12-31",
    // the season is over: the catalog shows it, the "looking" chip does not
  },
  {
    name: "Iron Harvest",
    slug: "iron-harvest",
    owner: "Boris Kovac",
    kind: "startup",
    mode: "hybrid",
    city: "Brno",
    tags: ["industry", "logistics"],
    tagline: "The parts of the machines of the region",
    description:
      "A marketplace for the spare parts of the factories around Brno. We index thirty years of catalogues.",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The search over the old catalogues",
        pay: "paid",
        from: 6000,
        to: 8000,
        s: [
          ["rust", 7],
          ["postgres", 7],
        ],
      },
      {
        p: "analytics",
        b: "middle",
        d: "What the factories order and when",
        pay: "equity",
        s: [
          ["python", 6],
          ["powerbi", 5],
        ],
      },
    ],
  },
  {
    name: "Nimbus Notes",
    slug: "nimbus-notes",
    owner: "Emma Wilson",
    kind: "startup",
    mode: "remote",
    tags: ["notes", "saas"],
    tagline: "Notes that never lose a thing",
    description:
      "A notebook for people who write a lot: fast, local-first, and it keeps every version of every page.",
    role: ["frontend", "senior"],
    slots: [
      {
        p: "frontend",
        b: "senior",
        d: "The editor and its offline mode",
        pay: "paid",
        from: 6000,
        to: 8000,
        s: [
          ["typescript", 8],
          ["react", 7],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The sync and the versions",
        pay: "equity",
        s: [
          ["go", 6],
          ["postgres", 5],
        ],
      },
    ],
  },
  {
    name: "Brick by Brick",
    slug: "brick-by-brick",
    owner: "Olga Mikhaylova",
    kind: "startup",
    mode: "hybrid",
    city: "Saint Petersburg",
    tags: ["construction", "b2b"],
    tagline: "The building site, in the phone",
    description:
      "The daily report of a building site: the workers, the materials, the delays. Forty sites use it now.",
    role: ["mobile", "senior"],
    slots: [
      {
        p: "mobile",
        b: "senior",
        d: "The foreman's app, offline first",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["kotlin", 7],
          ["compose", 6],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The reports of forty sites",
        pay: "equity",
        s: [
          ["python", 5],
          ["postgres", 5],
        ],
      },
    ],
  },
  {
    name: "Quiet Hours",
    slug: "quiet-hours",
    owner: "Thomas Berg",
    kind: "startup",
    mode: "remote",
    tags: ["focus", "productivity"],
    tagline: "A calendar that protects the deep work",
    description:
      "A calendar that defends the mornings: it moves the meetings and keeps the block free. Two people, a good idea.",
    role: ["backend", "middle"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The rules and the calendar providers",
        pay: "equity",
        s: [
          ["go", 5],
          ["redis", 5],
        ],
      },
      {
        p: "design",
        b: "middle",
        d: "The interface that says no",
        pay: "unpaid",
        s: [["figma", 5]],
      },
    ],
  },
  {
    name: "Salt & Cedar",
    slug: "salt-and-cedar",
    owner: "Anna Lindgren",
    kind: "company",
    mode: "office",
    city: "Gothenburg",
    tags: ["food", "retail"],
    tagline: "The bakery that sends its recipes to the shops",
    description:
      "A bakery with eight shops and a kitchen that cannot bake enough. The recipes and the stock live in one place.",
    slots: [
      {
        p: "backend",
        b: "junior",
        d: "The stock of eight shops",
        pay: "paid",
        from: 2800,
        s: [
          ["nodejs", 4],
          ["postgres", 4],
        ],
      },
      {
        p: "design",
        b: "junior",
        d: "The labels of the shelves",
        pay: "unpaid",
        s: [["photoshop", 3]],
      },
    ],
  },
  {
    name: "Deep Field",
    slug: "deep-field",
    owner: "Adam Weiss",
    kind: "startup",
    mode: "remote",
    tags: ["astronomy", "open-source"],
    tagline: "The sky, one photograph at a time",
    description:
      "A telescope on a mountain, a camera on a schedule and a public archive of the night sky.",
    website: "https://deepfield.example",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The archive: a petabyte of the night",
        pay: "equity",
        s: [
          ["go", 6],
          ["postgres", 5],
        ],
      },
      {
        p: "frontend",
        b: "middle",
        d: "The public browser of the sky",
        pay: "unpaid",
        s: [
          ["react", 5],
          ["css", 5],
        ],
      },
    ],
  },
  {
    name: "Market Pulse",
    slug: "market-pulse",
    owner: "Nina Petrova",
    kind: "company",
    mode: "remote",
    city: "Tallinn",
    tags: ["retail", "analytics"],
    tagline: "What the shop sold, before the shop knows",
    description:
      "The prices of the shops around the corner, every hour. The chains call us when they wonder why.",
    role: ["analytics", "senior"],
    slots: [
      {
        p: "analytics",
        b: "senior",
        d: "The models of the price of a thing",
        pay: "paid",
        from: 6500,
        to: 8500,
        s: [
          ["python", 8],
          ["postgres", 6],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The crawlers of the shops",
        pay: "paid",
        from: 4500,
        s: [
          ["nodejs", 6],
          ["redis", 5],
        ],
      },
    ],
  },
  {
    name: "Slow Ferry",
    slug: "slow-ferry",
    owner: "Erik Hansen",
    kind: "startup",
    mode: "remote",
    tags: ["travel", "sustainability"],
    tagline: "The crossing, without the carbon",
    description:
      "We sell the slow crossings between the islands and pay the captains to go the long way.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "junior",
        d: "The identity and the timetables",
        pay: "unpaid",
        s: [["figma", 5]],
      },
      {
        p: "frontend",
        b: "junior",
        d: "The booking of the crossings",
        pay: "unpaid",
        s: [
          ["vue", 4],
          ["css", 4],
        ],
      },
    ],
  },
  {
    name: "Second Story",
    slug: "second-story",
    owner: "Emma Clarke",
    kind: "startup",
    mode: "remote",
    tags: ["books", "community"],
    tagline: "The reading club of the neighbourhood",
    description:
      "A book club with a small publishing arm: we print what the club reads and pay the authors a share.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The covers and the little magazine",
        pay: "equity",
        s: [
          ["figma", 6],
          ["photoshop", 5],
        ],
      },
      {
        p: "backend",
        b: "junior",
        d: "The memberships and the shipments",
        pay: "unpaid",
        s: [["nodejs", 3]],
      },
    ],
  },
  {
    name: "Forge Metrics",
    slug: "forge-metrics",
    owner: "Anton Petrov",
    kind: "company",
    mode: "office",
    city: "Bucharest",
    tags: ["saas", "manufacturing"],
    tagline: "The numbers of the factory floor",
    description:
      "Sensors on the machines, one screen for the plant manager. The hardware is cheap; the software is the point.",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The readings of ten thousand machines",
        pay: "paid",
        from: 7000,
        to: 9500,
        s: [
          ["rust", 8],
          ["postgres", 6],
        ],
      },
      {
        p: "analytics",
        b: "middle",
        d: "The downtime and its causes",
        pay: "paid",
        from: 4500,
        s: [
          ["python", 6],
          ["powerbi", 6],
        ],
      },
    ],
  },
  {
    name: "The Long Table",
    slug: "the-long-table",
    owner: "Lucia Moretti",
    kind: "part-time",
    mode: "remote",
    tags: ["food", "community"],
    tagline: "Dinner for strangers, once a week",
    description:
      "A part-time job: cook for twelve strangers every Thursday, and keep the table a good one.",
    budget: 900,
    currency: "EUR",
    deadline: "2026-11-25",
    slots: [
      {
        p: "design",
        b: "junior",
        d: "The posters and the menu",
        pay: "paid",
        from: 900,
        s: [
          ["photoshop", 3],
          ["figma", 3],
        ],
      },
    ],
  },
  {
    name: "Wide Open",
    slug: "wide-open",
    owner: "Peter Nilsen",
    kind: "startup",
    mode: "remote",
    tags: ["outdoors", "logistics"],
    tagline: "The last kilometre, on a bicycle",
    description:
      "We deliver the heavy boxes by bike in the old town and the vans carry the rest.",
    role: ["mobile", "middle"],
    slots: [
      {
        p: "mobile",
        b: "middle",
        d: "The rider's app and the routes",
        pay: "paid",
        from: 4000,
        to: 5500,
        s: [
          ["swift", 5],
          ["swiftui", 5],
        ],
      },
      {
        p: "backend",
        b: "junior",
        d: "The parcels and the routes of the day",
        pay: "unpaid",
        s: [["python", 4]],
      },
    ],
  },
  {
    name: "Kindling",
    slug: "kindling",
    owner: "Ruth Okonkwo",
    kind: "startup",
    mode: "remote",
    tags: ["climate", "energy"],
    tagline: "Heat pumps for the houses of the 1970s",
    description:
      "Old blocks, cold radiators, a heat pump and a grant. We do the maths and the paperwork for the houses.",
    role: ["analytics", "middle"],
    slots: [
      {
        p: "analytics",
        b: "middle",
        d: "The calculation of every house",
        pay: "equity",
        s: [
          ["python", 6],
          ["postgres", 4],
        ],
      },
      {
        p: "frontend",
        b: "junior",
        d: "The report the owner reads",
        pay: "unpaid",
        s: [
          ["vue", 4],
          ["css", 4],
        ],
      },
    ],
  },
  {
    name: "Copper Kettle",
    slug: "copper-kettle",
    owner: "Marta Nowak",
    kind: "company",
    mode: "office",
    city: "Kraków",
    tags: ["food", "wholesale"],
    tagline: "The coffee of the office buildings",
    description:
      "We roast, we deliver and we keep the machine of every floor working. The route is the product.",
    slots: [
      {
        p: "backend",
        b: "junior",
        d: "The subscriptions and the machines",
        pay: "paid",
        from: 2600,
        s: [
          ["nodejs", 4],
          ["postgres", 4],
        ],
      },
      {
        p: "design",
        b: "junior",
        d: "The brand of the bags",
        pay: "unpaid",
        s: [["photoshop", 3]],
      },
    ],
  },
  {
    name: "Open Water",
    slug: "open-water",
    owner: "Tomasz Kaczor",
    kind: "startup",
    mode: "remote",
    tags: ["sport", "community"],
    tagline: "The swimming pool of the neighbourhood",
    description:
      "A public pool with a booking app and a coach who teaches the ones who never learned to swim.",
    role: ["frontend", "middle"],
    slots: [
      {
        p: "frontend",
        b: "junior",
        d: "The lanes and the timetable",
        pay: "paid",
        from: 2200,
        s: [
          ["react", 4],
          ["typescript", 4],
        ],
      },
      {
        p: "design",
        b: "junior",
        d: "The posters of the season",
        pay: "unpaid",
        s: [["figma", 3]],
      },
    ],
  },
  {
    name: "Hearthside",
    slug: "hearthside",
    owner: "Brigid Kelly",
    kind: "startup",
    mode: "remote",
    tags: ["community", "events"],
    tagline: "The dinners of the neighbourhood, one table",
    description:
      "We cook with the neighbours and eat with the neighbours. Every month, one long table, thirty strangers.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The identity and the tickets",
        pay: "equity",
        s: [["figma", 6]],
      },
      {
        p: "backend",
        b: "junior",
        d: "The guests and the tables",
        pay: "unpaid",
        s: [
          ["python", 4],
          ["postgres", 3],
        ],
      },
    ],
  },
  {
    name: "Northbound",
    slug: "northbound",
    owner: "Erik Dahl",
    kind: "startup",
    mode: "hybrid",
    city: "Umeå",
    tags: ["logistics", "forestry"],
    tagline: "The trucks of the timber roads",
    description:
      "The forest roads are narrow and the loads are heavy; the plan of the route is worth more than the truck.",
    role: ["analytics", "senior"],
    // the team is complete: the catalog shows it without the "looking" chip
  },
  {
    name: "Threadbare",
    slug: "threadbare",
    owner: "Ivy Chen",
    kind: "company",
    mode: "remote",
    tags: ["fashion", "repair"],
    tagline: "The clothes, mended",
    description:
      "A mending service and a shop of the mended. We keep the garment in the wardrobe and out of the bin.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "senior",
        d: "The look of the shop and the bags",
        pay: "paid",
        from: 3000,
        s: [
          ["photoshop", 7],
          ["figma", 5],
        ],
      },
      {
        p: "frontend",
        b: "junior",
        d: "The shop and the repair orders",
        pay: "unpaid",
        s: [["css", 4]],
      },
    ],
  },
  {
    name: "Low Tide",
    slug: "low-tide",
    owner: "Caleb Stone",
    kind: "startup",
    mode: "remote",
    tags: ["coast", "environment"],
    tagline: "What the sea leaves behind",
    description:
      "We walk the beaches and map what the sea brings: the plastics, the seeds, the changes of the line.",
    role: ["analytics", "middle"],
    slots: [
      {
        p: "analytics",
        b: "middle",
        d: "The models of the coastline",
        pay: "equity",
        s: [
          ["python", 6],
          ["tableau", 5],
        ],
      },
      {
        p: "backend",
        b: "middle",
        d: "The archive of the walks",
        pay: "unpaid",
        s: [
          ["nodejs", 5],
          ["postgres", 4],
        ],
      },
    ],
  },
  {
    name: "Small Hours",
    slug: "small-hours",
    owner: "Nora Lindgren",
    kind: "part-time",
    mode: "remote",
    tags: ["writing", "night"],
    tagline: "The night shift of the transcripts",
    description:
      "A part-time job: transcribe the recordings of the small hours, from midnight to six.",
    budget: 1400,
    currency: "EUR",
    deadline: "2026-12-10",
    slots: [
      {
        p: "backend",
        b: "junior",
        d: "The upload and the speakers",
        pay: "paid",
        from: 1400,
        s: [["python", 4]],
      },
    ],
  },
  {
    name: "Ferry & Co",
    slug: "ferry-and-co",
    owner: "Danil Sokolov",
    kind: "company",
    mode: "office",
    city: "Vladivostok",
    tags: ["logistics", "freight"],
    tagline: "The freight of the eastern ports",
    description:
      "We move the containers of the eastern ports and keep the papers straight. The customs part is the hard part.",
    role: ["backend", "middle"],
    slots: [
      {
        p: "backend",
        b: "middle",
        d: "The declarations and the customs rules",
        pay: "paid",
        from: 5000,
        to: 7000,
        s: [
          ["python", 6],
          ["postgres", 6],
        ],
      },
      {
        p: "analytics",
        b: "junior",
        d: "How long the goods wait",
        pay: "unpaid",
        s: [
          ["python", 4],
          ["tableau", 4],
        ],
      },
    ],
  },
  {
    name: "Kindred Words",
    slug: "kindred-words",
    owner: "Marta Lindgren",
    kind: "startup",
    mode: "remote",
    tags: ["language", "education"],
    tagline: "The words of the people who moved here",
    description:
      "A dictionary of the languages of the neighbourhood, written by the people who speak them.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The pages of the dictionary",
        pay: "equity",
        s: [
          ["figma", 6],
          ["photoshop", 4],
        ],
      },
      {
        p: "frontend",
        b: "junior",
        d: "The search and the audio",
        pay: "unpaid",
        s: [
          ["react", 4],
          ["css", 4],
        ],
      },
    ],
  },
  {
    name: "Grey Matter",
    slug: "grey-matter",
    owner: "Sam Okafor",
    kind: "startup",
    mode: "remote",
    tags: ["research", "ai"],
    tagline: "The reading room of the machine",
    description:
      "We make the models explain themselves: what they read, what they forgot and why they answered so.",
    role: ["backend", "senior"],
    slots: [
      {
        p: "backend",
        b: "senior",
        d: "The traces of the answers",
        pay: "paid",
        from: 7000,
        to: 9000,
        s: [
          ["rust", 7],
          ["python", 7],
          ["postgres", 6],
        ],
      },
      {
        p: "frontend",
        b: "senior",
        d: "The reading room of the traces",
        pay: "equity",
        s: [
          ["typescript", 8],
          ["react", 7],
        ],
      },
    ],
  },
  {
    name: "Old Mill",
    slug: "old-mill",
    owner: "Bridget Doyle",
    kind: "company",
    mode: "hybrid",
    city: "Cork",
    tags: ["food", "workshop"],
    tagline: "The mill, the bakery and the café",
    description:
      "A hundred-year-old mill with a new bakery in it. The bread is good; the booking of the tours is a mess.",
    role: ["frontend", "middle"],
    status: "cancelled",
    slots: [
      {
        p: "frontend",
        b: "junior",
        d: "The tours and the shop",
        pay: "paid",
        from: 2400,
        s: [
          ["vue", 4],
          ["css", 4],
        ],
      },
      {
        p: "design",
        b: "junior",
        d: "The signs of the mill",
        pay: "unpaid",
        s: [["photoshop", 3]],
      },
    ],
  },
  {
    name: "Signal Fire",
    slug: "signal-fire",
    owner: "Petra Novak",
    kind: "startup",
    mode: "remote",
    tags: ["community", "events"],
    tagline: "The meetup of the makers",
    description:
      "A monthly evening of people who make things and show them. We need a host and a hall.",
    role: ["design", "middle"],
    slots: [
      {
        p: "design",
        b: "middle",
        d: "The posters and the stage",
        pay: "equity",
        s: [
          ["figma", 6],
          ["blender", 4],
        ],
      },
      {
        p: "backend",
        b: "junior",
        d: "The tickets and the signups",
        pay: "unpaid",
        s: [["nodejs", 4]],
      },
    ],
  },
];

export async function seedProjects(query: Query): Promise<void> {
  const password = hashPassword("teamup123");
  for (const [index, project] of PROJECTS.entries()) {
    const email = `${project.slug}-founder@projects.invalid`;
    const owner = (
      await query<{ id: number }>(
        `insert into users (email, name, password_hash) values ($1,$2,$3)
         returning id`,
        [email, project.owner, password],
      )
    )[0].id;
    await query(
      `insert into profiles (user_id, slug, city, status) values ($1,$2,$3,'not-searching')`,
      [owner, `${project.slug}-founder`, project.city ?? ""],
    );
    if (project.role) {
      await query(`insert into profiles_professions values ($1,$2,$3)`, [
        owner,
        PROF[project.role[0]],
        project.role[1],
      ]);
    }
    // the creation day: the newest projects of the list are the last ones
    const created = `2026-${String(1 + (index % 11)).padStart(2, "0")}-${String(
      1 + ((index * 7) % 28),
    ).padStart(2, "0")}`;
    const row = (
      await query<{ id: number }>(
        `insert into projects (owner_id, slug, name, tagline, description, kind,
                              tags, status, work_mode, city, website, budget,
                              budget_currency, deadline, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         returning id`,
        [
          owner,
          project.slug,
          project.name,
          project.tagline,
          project.description,
          project.kind ?? "startup",
          project.tags ?? [],
          project.status ?? "active",
          project.mode ?? "remote",
          project.city ?? "",
          project.website ?? "",
          project.budget ?? null,
          project.currency ?? null,
          project.deadline ?? null,
          created,
        ],
      )
    )[0].id;
    for (const slot of project.slots ?? []) {
      const slotRow = (
        await query<{ id: number }>(
          `insert into slots (project_id, profession_id, bucket, description,
                              pay, pay_from, pay_to, currency)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           returning id`,
          [
            row,
            PROF[slot.p],
            slot.b,
            slot.d,
            slot.pay ?? null,
            slot.from ?? null,
            slot.to ?? null,
            slot.pay === "paid" ? "EUR" : null,
          ],
        )
      )[0].id;
      for (const [skill, level] of slot.s) {
        await query(`insert into slot_skills values ($1,$2,$3)`, [
          slotRow,
          SKILL[skill],
          level,
        ]);
      }
    }
  }
}
