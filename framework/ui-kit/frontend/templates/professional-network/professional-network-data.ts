import type { ChatMessage } from "../../blocks/chat-thread/chat-thread.ts";
import type { Comment } from "../../blocks/comment-thread/comment-thread.ts";
import type { Conversation } from "../../blocks/conversation-list/conversation-list.ts";
import type { Position } from "../../blocks/experience-list/experience-list.ts";
import type { Post } from "../../blocks/feed-post/feed-post.ts";
import type { JobData } from "../../blocks/job-card/job-card.ts";
import type { Skill } from "../../blocks/skill-endorse/skill-endorse.ts";

export const ME = "riley";

export interface Member {
  id: string;
  name: string;
  tone: number;
  headline: string;
  place: string;
  about: string;
  connections: number;
  positions: Position[];
  skills: Skill[];
}

const pos = (
  id: string,
  role: string,
  company: string,
  companyId: string,
  emoji: string,
  tone: number,
  start: number,
  end: number,
  place: string,
  text: string,
): Position => ({
  id,
  role,
  company,
  companyId,
  emoji,
  tone,
  start,
  end,
  place,
  text,
});

export const MEMBERS: Member[] = [
  {
    id: "riley",
    name: "Riley Chen",
    tone: 4,
    headline: "Product designer at Northwind",
    place: "Lisbon, Portugal",
    about:
      "I design onboarding and billing flows for B2B products. Before that, six years of research and prototyping. Open to mentoring junior designers.",
    connections: 3,
    positions: [
      pos(
        "rp1",
        "Product designer",
        "Northwind",
        "northwind",
        "🧭",
        2,
        2022.05,
        0,
        "Remote",
        "Own the activation and billing flows. Cut time to first value from 9 days to 3.",
      ),
      pos(
        "rp2",
        "UX researcher",
        "Harbor Health",
        "harbor",
        "⚓",
        5,
        2018.09,
        2022.04,
        "Porto",
        "Ran 120 interviews and turned them into the product roadmap.",
      ),
    ],
    skills: [
      {
        id: "rs1",
        name: "Product design",
        count: 38,
        by: ["Ana Pires", "Ravi Nair"],
      },
      {
        id: "rs2",
        name: "User research",
        count: 24,
        by: ["Mia Sol", "Dana Cruz"],
      },
      { id: "rs3", name: "Prototyping", count: 11, by: ["Leo Park"] },
    ],
  },
  {
    id: "ana",
    name: "Ana Pires",
    tone: 1,
    headline: "Engineering manager at Lumo Studio",
    place: "Lisbon, Portugal",
    about:
      "Leading a team of nine building mobile apps. I care about calm releases and kind code review.",
    connections: 512,
    positions: [
      pos(
        "ap1",
        "Engineering manager",
        "Lumo Studio",
        "lumo",
        "💡",
        4,
        2021.01,
        0,
        "Lisbon",
        "Grew the mobile team from 3 to 9 without losing the Friday release.",
      ),
      pos(
        "ap2",
        "Senior engineer",
        "Orbit Labs",
        "orbit",
        "🪐",
        3,
        2016.03,
        2020.12,
        "Remote",
        "Built the sync engine behind the offline mode.",
      ),
    ],
    skills: [
      {
        id: "as1",
        name: "Engineering management",
        count: 52,
        by: ["Riley Chen", "Ravi Nair"],
      },
      { id: "as2", name: "Mobile development", count: 31, by: ["Leo Park"] },
    ],
  },
  {
    id: "ravi",
    name: "Ravi Nair",
    tone: 2,
    headline: "Staff engineer at Orbit Labs",
    place: "Bengaluru, India",
    about: "Distributed systems, queues and the occasional flame graph.",
    connections: 890,
    positions: [
      pos(
        "vp1",
        "Staff engineer",
        "Orbit Labs",
        "orbit",
        "🪐",
        3,
        2019.06,
        0,
        "Bengaluru",
        "Technical lead of the data pipeline that moves 2 billion events a day.",
      ),
    ],
    skills: [
      {
        id: "vs1",
        name: "Distributed systems",
        count: 67,
        by: ["Ana Pires", "Omar Haddad"],
      },
      { id: "vs2", name: "TypeScript", count: 28, by: ["Riley Chen"] },
    ],
  },
  {
    id: "mia",
    name: "Mia Sol",
    tone: 5,
    headline: "Lead UX researcher at Harbor Health",
    place: "Porto, Portugal",
    about:
      "Turning conversations with patients into software that does not make them feel lost.",
    connections: 268,
    positions: [
      pos(
        "mp1",
        "Lead UX researcher",
        "Harbor Health",
        "harbor",
        "⚓",
        5,
        2020.02,
        0,
        "Porto",
        "Built the research practice from one person to a team of five.",
      ),
    ],
    skills: [
      {
        id: "ms1",
        name: "User research",
        count: 44,
        by: ["Riley Chen", "Dana Cruz"],
      },
      {
        id: "ms2",
        name: "Workshop facilitation",
        count: 15,
        by: ["Sofia Rossi"],
      },
    ],
  },
  {
    id: "leo",
    name: "Leo Park",
    tone: 3,
    headline: "Technical recruiter at Northwind",
    place: "Seoul, South Korea",
    about: "I help engineers and designers find teams that fit. DMs open.",
    connections: 1430,
    positions: [
      pos(
        "lp1",
        "Technical recruiter",
        "Northwind",
        "northwind",
        "🧭",
        2,
        2020.09,
        0,
        "Remote",
        "Hired 41 people across 6 countries.",
      ),
    ],
    skills: [
      {
        id: "ls1",
        name: "Technical recruiting",
        count: 73,
        by: ["Ana Pires", "Ravi Nair"],
      },
    ],
  },
  {
    id: "dana",
    name: "Dana Cruz",
    tone: 1,
    headline: "Head of design at Lumo Studio",
    place: "Lisbon, Portugal",
    about: "Design leader. Mentor. Terrible at saying no to a good brief.",
    connections: 740,
    positions: [
      pos(
        "dp1",
        "Head of design",
        "Lumo Studio",
        "lumo",
        "💡",
        4,
        2019.04,
        0,
        "Lisbon",
        "Built the studio design system used by 14 clients.",
      ),
    ],
    skills: [
      {
        id: "ds1",
        name: "Design leadership",
        count: 58,
        by: ["Riley Chen", "Mia Sol"],
      },
    ],
  },
  {
    id: "omar",
    name: "Omar Haddad",
    tone: 2,
    headline: "Data scientist at Orbit Labs",
    place: "Amman, Jordan",
    about: "Forecasting, experiments, and explaining p-values to executives.",
    connections: 305,
    positions: [
      pos(
        "op1",
        "Data scientist",
        "Orbit Labs",
        "orbit",
        "🪐",
        3,
        2021.08,
        0,
        "Remote",
        "Shipped the churn model that saved an estimated 1.2 million a year.",
      ),
    ],
    skills: [
      { id: "os1", name: "Machine learning", count: 36, by: ["Ravi Nair"] },
    ],
  },
  {
    id: "sofia",
    name: "Sofia Rossi",
    tone: 4,
    headline: "Product manager at Harbor Health",
    place: "Milan, Italy",
    about:
      "Product manager who still opens the analytics dashboard before breakfast.",
    connections: 421,
    positions: [
      pos(
        "sp1",
        "Product manager",
        "Harbor Health",
        "harbor",
        "⚓",
        5,
        2019.11,
        0,
        "Milan",
        "Launched the booking feature used by 80 clinics.",
      ),
    ],
    skills: [
      { id: "ss1", name: "Product management", count: 49, by: ["Mia Sol"] },
    ],
  },
];

export const memberOf = (id: string): Member =>
  MEMBERS.find((m) => m.id === id) ?? (MEMBERS[0] as Member);

export interface Company {
  id: string;
  name: string;
  emoji: string;
  tone: number;
  tagline: string;
  about: string;
  place: string;
  followers: number;
  employees: number;
}

export const COMPANIES: Company[] = [
  {
    id: "lumo",
    name: "Lumo Studio",
    emoji: "💡",
    tone: 4,
    tagline: "Product design for small teams",
    about:
      "A 24 person studio making apps people keep. We hire designers and engineers twice a year.",
    place: "Lisbon, Portugal",
    followers: 12400,
    employees: 24,
  },
  {
    id: "northwind",
    name: "Northwind",
    emoji: "🧭",
    tone: 2,
    tagline: "Billing software that explains itself",
    about:
      "Northwind helps 3,000 companies send invoices customers actually read. Fully remote since day one.",
    place: "Remote",
    followers: 48200,
    employees: 210,
  },
  {
    id: "orbit",
    name: "Orbit Labs",
    emoji: "🪐",
    tone: 3,
    tagline: "Data pipelines without the pager",
    about:
      "We move and model event data for teams that would rather be building product.",
    place: "Bengaluru, India",
    followers: 21050,
    employees: 95,
  },
  {
    id: "harbor",
    name: "Harbor Health",
    emoji: "⚓",
    tone: 5,
    tagline: "Care that is easy to book",
    about:
      "Harbor connects patients with clinics in nine countries, with software the clinics enjoy using.",
    place: "Porto, Portugal",
    followers: 9300,
    employees: 60,
  },
];

export const companyOf = (id: string): Company =>
  COMPANIES.find((c) => c.id === id) ?? (COMPANIES[0] as Company);

const job = (
  id: string,
  title: string,
  companyId: string,
  place: string,
  kind: string,
  salaryK: number,
  hours: number,
  ago: string,
  tags: string[],
  level: string,
): JobData => {
  const c = companyOf(companyId);
  return {
    id,
    title,
    company: c.name,
    companyId,
    emoji: c.emoji,
    tone: c.tone,
    place,
    kind,
    salaryK,
    hours,
    ago,
    tags,
    level,
  };
};

export const JOBS: JobData[] = [
  job(
    "j1",
    "Senior product designer",
    "lumo",
    "Lisbon",
    "Hybrid",
    95,
    20,
    "1d ago",
    ["Figma", "Design systems"],
    "Senior",
  ),
  job(
    "j2",
    "Frontend engineer",
    "northwind",
    "Remote",
    "Remote",
    120,
    70,
    "3d ago",
    ["TypeScript", "Vite"],
    "Mid",
  ),
  job(
    "j3",
    "Junior UX researcher",
    "harbor",
    "Porto",
    "On-site",
    42,
    30,
    "1d ago",
    ["Interviews", "Surveys"],
    "Junior",
  ),
  job(
    "j4",
    "Staff data engineer",
    "orbit",
    "Remote",
    "Remote",
    165,
    96,
    "4d ago",
    ["Kafka", "SQL"],
    "Senior",
  ),
  job(
    "j5",
    "Product manager, booking",
    "harbor",
    "Milan",
    "Hybrid",
    88,
    52,
    "2d ago",
    ["Roadmaps", "Analytics"],
    "Mid",
  ),
  job(
    "j6",
    "Mobile engineer (React Native)",
    "lumo",
    "Lisbon",
    "Hybrid",
    78,
    8,
    "8h ago",
    ["React Native", "TypeScript"],
    "Mid",
  ),
  job(
    "j7",
    "Billing support specialist",
    "northwind",
    "Remote",
    "Remote",
    48,
    120,
    "5d ago",
    ["Support", "SaaS"],
    "Junior",
  ),
  job(
    "j8",
    "Data analyst",
    "orbit",
    "Bengaluru",
    "On-site",
    35,
    40,
    "2d ago",
    ["SQL", "Dashboards"],
    "Junior",
  ),
];

export const POSTS: (Post & { hours: number })[] = [
  {
    id: "u1",
    name: "Ana Pires",
    handle: "ana",
    tone: 1,
    ago: "3h",
    hours: 3,
    text: "Lumo is hiring a senior product designer and a mobile engineer. Remote-friendly within Europe, real ownership, no pager. Happy to answer questions in the comments.",
    mood: "📣 hiring",
    photo: "",
    phototone: 1,
    likes: 143,
    liked: false,
    comments: 2,
    shares: 21,
    shared: false,
  },
  {
    id: "u2",
    name: "Ravi Nair",
    handle: "ravi",
    tone: 2,
    ago: "6h",
    hours: 6,
    text: "Two years ago our pipeline fell over twice a week. Last month it fell over zero times. The fix was boring: smaller batches, better backpressure, and a team that was allowed to stop shipping features for a quarter.",
    mood: "",
    photo: "",
    phototone: 2,
    likes: 612,
    liked: true,
    comments: 1,
    shares: 88,
    shared: false,
  },
  {
    id: "u3",
    name: "Mia Sol",
    handle: "mia",
    tone: 5,
    ago: "1d",
    hours: 24,
    text: "Five interviews with night-shift nurses changed our whole booking flow. If you only talk to the people who sign the contract, you will build for the wrong person.",
    mood: "💡 insight",
    photo: "",
    phototone: 5,
    likes: 287,
    liked: false,
    comments: 1,
    shares: 34,
    shared: false,
  },
  {
    id: "u4",
    name: "Riley Chen",
    handle: "riley",
    tone: 4,
    ago: "2d",
    hours: 48,
    text: "Wrapped a year of redesigning billing at Northwind. Support tickets about invoices are down 31 percent. Thank you to every customer who sat through an interview.",
    mood: "🏅 milestone",
    photo: "",
    phototone: 4,
    likes: 96,
    liked: false,
    comments: 0,
    shares: 7,
    shared: false,
  },
  {
    id: "u5",
    name: "Sofia Rossi",
    handle: "sofia",
    tone: 4,
    ago: "3d",
    hours: 72,
    text: "We launched online booking for 80 clinics. The first clinic to switch told us it saved their front desk two hours a day.",
    mood: "🏅 milestone",
    photo: "",
    phototone: 4,
    likes: 204,
    liked: false,
    comments: 0,
    shares: 19,
    shared: false,
  },
];

export const COMMENTS: Record<string, Comment[]> = {
  u1: [
    {
      id: "q1",
      name: "Dana Cruz",
      tone: 1,
      text: "Best team I know. Apply, folks.",
      ago: "2h",
      likes: 12,
      liked: false,
    },
    {
      id: "q2",
      name: "Riley Chen",
      tone: 4,
      text: "Is the design role open to Portugal-based candidates?",
      ago: "1h",
      likes: 1,
      liked: false,
    },
  ],
  u2: [
    {
      id: "q3",
      name: "Omar Haddad",
      tone: 2,
      text: "Backpressure is the unsung hero of every system.",
      ago: "5h",
      likes: 8,
      liked: false,
    },
  ],
  u3: [
    {
      id: "q4",
      name: "Sofia Rossi",
      tone: 4,
      text: "This is why we started shadowing the front desk.",
      ago: "20h",
      likes: 5,
      liked: false,
    },
  ],
};

export const CONVERSATIONS: Conversation[] = [
  {
    id: "leo",
    name: "Leo Park",
    tone: 3,
    preview: "Hi Riley, I saw your work on billing...",
    time: "10:12",
    unread: 1,
    online: true,
  },
  {
    id: "ana",
    name: "Ana Pires",
    tone: 1,
    preview: "Thanks for the intro!",
    time: "Yesterday",
    unread: 0,
    online: false,
  },
];

export const MESSAGES: Record<string, ChatMessage[]> = {
  leo: [
    {
      id: "a1",
      mine: false,
      text: "Hi Riley, I saw your work on billing flows. We have a lead role opening next month. Open to a quick chat?",
      time: "10:12",
    },
  ],
  ana: [
    {
      id: "b1",
      mine: true,
      text: "Ana, sending you Mia's profile. She would be great for the research talk.",
      time: "Mon",
    },
    { id: "b2", mine: false, text: "Thanks for the intro!", time: "Yesterday" },
  ],
};

export const START_CONNECTIONS = ["ana", "ravi", "mia"];
export const START_INVITES = ["leo", "dana"];
export const SUGGESTIONS = ["omar", "sofia"];
