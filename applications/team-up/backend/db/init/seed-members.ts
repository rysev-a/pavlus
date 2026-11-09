/**
 * The public world of the members directory (`/users`): a community of
 * members with a city, a status, professions with a grade, rated skills and
 * the labels the directory filters by (the original teamUP's labels).
 *
 * The seed writes the accounts too (a `users` row with a scrypt hash — the
 * demo password `teamup123`; nobody has to sign in as them), the profiles
 * and the profession and skill rows of every member. The emails are
 * `<slug>@members.invalid`, so they never clash with the demo world's.
 */
import { hashPassword } from "./seed.ts";
import type { Query } from "./query.ts";

/** The labels of the directory (the original's): the domains and the
 * professions a member may carry. */
const LABELS = {
  backend: ["Backend", "Backend developer"],
  frontend: ["Frontend", "Frontend developer"],
  mobile: ["Mobile", "Mobile developer"],
  design: ["Design", "Designer"],
} as const;

/** One member of the public world. */
interface MemberSeed {
  slug: string;
  name: string;
  city: string;
  status: string;
  /** The professions of the member: the directory's slug and the grade. */
  professions: [string, string][];
  /** The rated skills: the skill's slug and the level (1..10). */
  skills: [string, number][];
  /** The labels of the member (the profession's name and the domains). */
  labels: string[];
  bio: string;
  birthYear: number;
}

const MEMBERS: MemberSeed[] = [
  {
    slug: "nikita-borisov",
    name: "Nikita Borisov",
    city: "Moscow",
    status: "searching",
    professions: [["backend", "senior"]],
    skills: [
      ["postgres", 9],
      ["redis", 8],
      ["rust", 7],
      ["go", 6],
    ],
    labels: [...LABELS.backend, "SaaS", "Marketplace"],
    bio: "Ten years of backend work: APIs, queues, storage. Looking for a team that ships.",
    birthYear: 1993,
  },
  {
    slug: "alina-orlova",
    name: "Alina Orlova",
    city: "Saint Petersburg",
    status: "open",
    professions: [["frontend", "senior"]],
    skills: [
      ["react", 9],
      ["typescript", 9],
      ["css", 8],
      ["vue", 6],
    ],
    labels: [...LABELS.frontend, "E-commerce", "Marketplace"],
    bio: "Interfaces that sell: design systems, forms, the checkout nobody hates.",
    birthYear: 1995,
  },
  {
    slug: "dmitry-sokolov",
    name: "Dmitry Sokolov",
    city: "Moscow",
    status: "not-searching",
    professions: [["mobile", "lead"]],
    skills: [
      ["swift", 10],
      ["swiftui", 9],
      ["kotlin", 8],
      ["compose", 7],
    ],
    labels: [...LABELS.mobile, "FinTech", "HealthTech"],
    bio: "Ios and Android, from the first sketch to the release. Leading a small team.",
    birthYear: 1989,
  },
  {
    slug: "sofia-ivanova",
    name: "Sofia Ivanova",
    city: "Kazan",
    status: "searching",
    professions: [["design", "middle"]],
    skills: [
      ["figma", 8],
      ["photoshop", 6],
      ["blender", 4],
    ],
    labels: [...LABELS.design, "EdTech", "HealthTech"],
    bio: "Product designer: research, prototypes, design systems. I draw before I code.",
    birthYear: 1998,
  },
  {
    slug: "artem-kuznetsov",
    name: "Artem Kuznetsov",
    city: "Novosibirsk",
    status: "open",
    professions: [["analytics", "middle"]],
    skills: [
      ["tableau", 7],
      ["powerbi", 6],
      ["python", 7],
      ["postgres", 5],
    ],
    labels: ["Marketer", "Product", "E-commerce"],
    bio: "Numbers first: dashboards, experiments, and the story they tell.",
    birthYear: 1996,
  },
  {
    slug: "elena-morozova",
    name: "Elena Morozova",
    city: "Yerevan",
    status: "searching",
    professions: [["backend", "middle"]],
    skills: [
      ["nodejs", 7],
      ["python", 6],
      ["postgres", 6],
      ["mongodb", 5],
    ],
    labels: [...LABELS.backend, "EdTech"],
    bio: "Backend developer into APIs and clean data models. Python and Node both.",
    birthYear: 1999,
  },
  {
    slug: "maxim-romanov",
    name: "Maxim Romanov",
    city: "Moscow",
    status: "open",
    professions: [["frontend", "middle"]],
    skills: [
      ["vue", 8],
      ["typescript", 7],
      ["css", 6],
    ],
    labels: [...LABELS.frontend, "SaaS"],
    bio: "Vue and TypeScript; I like small bundles and fast pages.",
    birthYear: 1997,
  },
  {
    slug: "olga-belova",
    name: "Olga Belova",
    city: "Saint Petersburg",
    status: "not-searching",
    professions: [["design", "senior"]],
    skills: [
      ["figma", 9],
      ["photoshop", 7],
      ["blender", 5],
    ],
    labels: [...LABELS.design, "GameDev", "Product manager"],
    bio: "Designer of games and products; ten years of art direction and UI.",
    birthYear: 1991,
  },
  {
    slug: "ivan-petrov",
    name: "Ivan Petrov",
    city: "Samara",
    status: "searching",
    professions: [["mobile", "middle"]],
    skills: [
      ["kotlin", 7],
      ["compose", 7],
      ["typescript", 5],
    ],
    labels: [...LABELS.mobile, "Ecotech", "SaaS"],
    bio: "Android and cross-platform; I write the app and the pipeline behind it.",
    birthYear: 2000,
  },
  {
    slug: "irina-novikova",
    name: "Irina Novikova",
    city: "Yekaterinburg",
    status: "open",
    professions: [["analytics", "senior"]],
    skills: [
      ["python", 9],
      ["postgres", 8],
      ["tableau", 8],
      ["powerbi", 7],
    ],
    labels: ["Product", "Product manager", "FinTech"],
    bio: "Data analyst and product thinker: from a raw table to a decision.",
    birthYear: 1992,
  },
  {
    slug: "pavel-zaitsev",
    name: "Pavel Zaitsev",
    city: "Moscow",
    status: "searching",
    professions: [["backend", "lead"]],
    skills: [
      ["rust", 9],
      ["go", 8],
      ["postgres", 8],
      ["redis", 8],
    ],
    labels: [...LABELS.backend, "FinTech", "HealthTech"],
    bio: "Team lead of backend engineers. Rust, Go, and a healthy dose of Postgres.",
    birthYear: 1990,
  },
  {
    slug: "natalia-sokolova",
    name: "Natalia Sokolova",
    city: "Kazan",
    status: "not-searching",
    professions: [["frontend", "junior"]],
    skills: [
      ["react", 5],
      ["css", 5],
      ["typescript", 4],
    ],
    labels: [...LABELS.frontend, "EdTech"],
    bio: "A junior frontender with a portfolio and a lot of curiosity.",
    birthYear: 2003,
  },
  {
    slug: "andrey-volkov",
    name: "Andrey Volkov",
    city: "Novosibirsk",
    status: "open",
    professions: [["design", "junior"]],
    skills: [
      ["figma", 5],
      ["photoshop", 4],
    ],
    labels: [...LABELS.design, "Ecotech"],
    bio: "Just out of a design course: eager, quick, and careful with details.",
    birthYear: 2004,
  },
  {
    slug: "yulia-egorova",
    name: "Yulia Egorova",
    city: "Saint Petersburg",
    status: "searching",
    professions: [["mobile", "senior"]],
    skills: [
      ["swift", 9],
      ["swiftui", 8],
      ["kotlin", 6],
    ],
    labels: [...LABELS.mobile, "HealthTech", "Product"],
    bio: "Ios and Android, medical apps and their long release cycles.",
    birthYear: 1994,
  },
  {
    slug: "timur-akhmatov",
    name: "Timur Akhmatov",
    city: "Samara",
    status: "open",
    professions: [["backend", "junior"]],
    skills: [
      ["python", 4],
      ["postgres", 4],
      ["nodejs", 3],
    ],
    labels: [...LABELS.backend, "E-commerce"],
    bio: "The first job in the backend; I want a team that teaches.",
    birthYear: 2002,
  },
  {
    slug: "kate-mikhaylova",
    name: "Kate Mikhailova",
    city: "Moscow",
    status: "searching",
    professions: [["design", "middle"]],
    skills: [
      ["figma", 7],
      ["blender", 6],
      ["photoshop", 5],
    ],
    labels: [...LABELS.design, "GameDev"],
    bio: "Interface and 3d: I make the product look like the idea behind it.",
    birthYear: 1998,
  },
  {
    slug: "roman-kovalev",
    name: "Roman Kovalev",
    city: "Yerevan",
    status: "open",
    professions: [["frontend", "senior"]],
    skills: [
      ["react", 9],
      ["typescript", 8],
      ["vue", 8],
      ["css", 7],
    ],
    labels: [...LABELS.frontend, "SaaS", "FinTech"],
    bio: "Front-end architect: performance, accessibility, and a calm release day.",
    birthYear: 1992,
  },
  {
    slug: "polina-rodina",
    name: "Polina Rodina",
    city: "Kazan",
    status: "not-searching",
    professions: [["analytics", "junior"]],
    skills: [
      ["python", 4],
      ["tableau", 3],
      ["powerbi", 3],
    ],
    labels: ["Marketer", "E-commerce"],
    bio: "Marketing analyst: where the clicks come from and where they go.",
    birthYear: 2001,
  },
  {
    slug: "sergey-ilyin",
    name: "Sergey Ilyin",
    city: "Samara",
    status: "searching",
    professions: [["backend", "senior"]],
    skills: [
      ["go", 8],
      ["postgres", 9],
      ["redis", 7],
      ["mongodb", 6],
    ],
    labels: [...LABELS.backend, "Marketplace", "Ecotech"],
    bio: "High load: catalogs, orders, payments. Go and Postgres are my tools.",
    birthYear: 1991,
  },
  {
    slug: "maria-kim",
    name: "Maria Kim",
    city: "Saint Petersburg",
    status: "open",
    professions: [["mobile", "middle"]],
    skills: [
      ["kotlin", 6],
      ["swift", 6],
      ["compose", 5],
    ],
    labels: [...LABELS.mobile, "EdTech", "Product"],
    bio: "Cross-platform apps for education; I care about the first-run experience.",
    birthYear: 1999,
  },
  {
    slug: "denis-fomin",
    name: "Denis Fomin",
    city: "Yekaterinburg",
    status: "searching",
    professions: [["frontend", "middle"]],
    skills: [
      ["typescript", 7],
      ["react", 6],
      ["css", 6],
    ],
    labels: [...LABELS.frontend, "GameDev", "EdTech"],
    bio: "Games and learning: interfaces that keep people busy on purpose.",
    birthYear: 1996,
  },
  {
    slug: "lidia-fedorova",
    name: "Lidia Fedorova",
    city: "Moscow",
    status: "not-searching",
    professions: [["design", "lead"]],
    skills: [
      ["figma", 10],
      ["photoshop", 8],
      ["blender", 7],
    ],
    labels: [...LABELS.design, "Product manager", "SaaS"],
    bio: "Design lead: I build the team, the system and the pace of the work.",
    birthYear: 1988,
  },
  {
    slug: "artem-belov",
    name: "Artem Belov",
    city: "Novosibirsk",
    status: "open",
    professions: [["backend", "middle"]],
    skills: [
      ["nodejs", 6],
      ["mongodb", 6],
      ["redis", 5],
    ],
    labels: [...LABELS.backend, "SaaS", "Marketplace"],
    bio: "Node in production: queues, caching, and the occasional 3 a.m. page.",
    birthYear: 1997,
  },
  {
    slug: "veronika-lisina",
    name: "Veronika Lisina",
    city: "Kazan",
    status: "searching",
    professions: [["analytics", "middle"]],
    skills: [
      ["python", 7],
      ["postgres", 6],
      ["tableau", 5],
    ],
    labels: ["Product", "E-commerce", "Marketer"],
    bio: "Product analyst: I look for the reason behind every number.",
    birthYear: 2000,
  },
  {
    slug: "nikolay-rybakov",
    name: "Nikolay Rybakov",
    city: "Samara",
    status: "not-searching",
    professions: [["mobile", "lead"]],
    skills: [
      ["swift", 9],
      ["kotlin", 9],
      ["compose", 8],
      ["swiftui", 7],
    ],
    labels: [...LABELS.mobile, "FinTech", "HealthTech"],
    bio: "Mobile lead: releases, review culture, and a team that ships weekly.",
    birthYear: 1989,
  },
  {
    slug: "alisa-tikhonova",
    name: "Alisa Tikhonova",
    city: "Moscow",
    status: "open",
    professions: [["frontend", "junior"]],
    skills: [
      ["css", 4],
      ["vue", 3],
      ["typescript", 3],
    ],
    labels: [...LABELS.frontend, "E-commerce"],
    bio: "The very beginning of a career: I make pages that look right.",
    birthYear: 2004,
  },
  {
    slug: "georgy-orlov",
    name: "Georgy Orlov",
    city: "Yerevan",
    status: "searching",
    professions: [["design", "middle"]],
    skills: [
      ["figma", 7],
      ["photoshop", 6],
    ],
    labels: [...LABELS.design, "Ecotech", "SaaS"],
    bio: "B2b interfaces: dense screens, clear hierarchy, no decoration without a reason.",
    birthYear: 1997,
  },
  {
    slug: "svetlana-ponomareva",
    name: "Svetlana Ponomareva",
    city: "Saint Petersburg",
    status: "open",
    professions: [["backend", "senior"]],
    skills: [
      ["postgres", 9],
      ["python", 8],
      ["redis", 7],
      ["mongodb", 7],
    ],
    labels: [...LABELS.backend, "FinTech", "HealthTech"],
    bio: "Data-heavy backends: reporting, migrations and the boring parts that matter.",
    birthYear: 1993,
  },
  {
    slug: "egor-maltsev",
    name: "Egor Maltsev",
    city: "Yekaterinburg",
    status: "searching",
    professions: [["frontend", "senior"]],
    skills: [
      ["react", 8],
      ["typescript", 9],
      ["css", 8],
      ["nodejs", 6],
    ],
    labels: [...LABELS.frontend, "SaaS", "Product"],
    bio: "Full-stack leaning to the front: the whole product in my head.",
    birthYear: 1994,
  },
  {
    slug: "daria-kozenko",
    name: "Daria Kozenko",
    city: "Novosibirsk",
    status: "not-searching",
    professions: [["design", "middle"]],
    skills: [
      ["figma", 7],
      ["blender", 5],
      ["photoshop", 5],
    ],
    labels: [...LABELS.design, "GameDev", "Marketplace"],
    bio: "Game and marketplace interfaces: art, motion and a lot of iteration.",
    birthYear: 1998,
  },
  {
    slug: "kirill-antonov",
    name: "Kirill Antonov",
    city: "Moscow",
    status: "open",
    professions: [["backend", "lead"]],
    skills: [
      ["rust", 9],
      ["go", 9],
      ["redis", 8],
      ["postgres", 8],
    ],
    labels: [...LABELS.backend, "FinTech", "GameDev"],
    bio: "Infrastructure and services; I like boring technology and fast releases.",
    birthYear: 1990,
  },
  {
    slug: "julia-akimova",
    name: "Julia Akimova",
    city: "Samara",
    status: "searching",
    professions: [["mobile", "junior"]],
    skills: [
      ["kotlin", 4],
      ["compose", 4],
      ["swift", 3],
    ],
    labels: [...LABELS.mobile, "EdTech", "Ecotech"],
    bio: "A junior mobile developer: I write the screens and learn the rest.",
    birthYear: 2003,
  },
  {
    slug: "oleg-gusev",
    name: "Oleg Gusev",
    city: "Kazan",
    status: "open",
    professions: [["analytics", "senior"]],
    skills: [
      ["python", 8],
      ["tableau", 9],
      ["powerbi", 8],
      ["postgres", 7],
    ],
    labels: ["Marketer", "Product manager", "Marketplace"],
    bio: "Analytics for a marketplace: cohorts, prices and the weekly report.",
    birthYear: 1992,
  },
  {
    slug: "vera-semenova",
    name: "Vera Semenova",
    city: "Saint Petersburg",
    status: "not-searching",
    professions: [["frontend", "middle"]],
    skills: [
      ["vue", 7],
      ["css", 7],
      ["typescript", 6],
    ],
    labels: [...LABELS.frontend, "HealthTech", "EdTech"],
    bio: "Healthcare products: clear forms, careful words, no surprises.",
    birthYear: 1999,
  },
  {
    slug: "boris-ponomarenko",
    name: "Boris Ponomarenko",
    city: "Yerevan",
    status: "searching",
    professions: [["backend", "middle"]],
    skills: [
      ["go", 6],
      ["mongodb", 6],
      ["redis", 5],
    ],
    labels: [...LABELS.backend, "Ecotech", "SaaS"],
    bio: "Services and integrations; I like a clean contract and a fast deploy.",
    birthYear: 1996,
  },
  {
    slug: "anna-kulikova",
    name: "Anna Kulikova",
    city: "Moscow",
    status: "open",
    professions: [["design", "junior"]],
    skills: [
      ["figma", 5],
      ["photoshop", 4],
    ],
    labels: [...LABELS.design, "Product", "E-commerce"],
    bio: "Junior designer with a good eye for grids and a stubborn love of spacing.",
    birthYear: 2002,
  },
  {
    slug: "stanislav-zaytsev",
    name: "Stanislav Zaitsev",
    city: "Yekaterinburg",
    status: "searching",
    professions: [["mobile", "senior"]],
    skills: [
      ["kotlin", 8],
      ["swift", 8],
      ["compose", 7],
      ["typescript", 5],
    ],
    labels: [...LABELS.mobile, "FinTech", "GameDev"],
    bio: "Two platforms, one product: I keep the ios and android apps in step.",
    birthYear: 1993,
  },
  {
    slug: "polina-grigoreva",
    name: "Polina Grigoreva",
    city: "Novosibirsk",
    status: "not-searching",
    professions: [["analytics", "middle"]],
    skills: [
      ["powerbi", 6],
      ["tableau", 6],
      ["python", 6],
    ],
    labels: ["Product", "EdTech", "Marketer"],
    bio: "Dashboards for education: retention, cohorts and the weekly demo.",
    birthYear: 1997,
  },
  {
    slug: "victor-nazarov",
    name: "Victor Nazarov",
    city: "Samara",
    status: "open",
    professions: [["frontend", "middle"]],
    skills: [
      ["react", 7],
      ["typescript", 6],
      ["vue", 5],
    ],
    labels: [...LABELS.frontend, "Marketplace", "SaaS"],
    bio: "Marketplaces: search, filters and the cart that always works.",
    birthYear: 1995,
  },
  {
    slug: "sofia-laktionova",
    name: "Sofia Laktionova",
    city: "Saint Petersburg",
    status: "searching",
    professions: [["design", "senior"]],
    skills: [
      ["figma", 9],
      ["blender", 6],
      ["photoshop", 7],
    ],
    labels: [...LABELS.design, "GameDev", "Ecotech"],
    bio: "Design systems and 3d: the details that make a product feel finished.",
    birthYear: 1990,
  },
  {
    slug: "denis-ustinov",
    name: "Denis Ustinov",
    city: "Kazan",
    status: "open",
    professions: [["backend", "senior"]],
    skills: [
      ["python", 9],
      ["postgres", 8],
      ["redis", 7],
      ["rust", 5],
    ],
    labels: [...LABELS.backend, "EdTech", "FinTech"],
    bio: "Backend of a learning platform: video, progress and a lot of events.",
    birthYear: 1992,
  },
  {
    slug: "irina-sokolova",
    name: "Irina Sokolova",
    city: "Moscow",
    status: "not-searching",
    professions: [["mobile", "middle"]],
    skills: [
      ["swift", 6],
      ["swiftui", 6],
      ["compose", 5],
    ],
    labels: [...LABELS.mobile, "E-commerce", "HealthTech"],
    bio: "Shopping and health apps; I like a smooth checkout and clear states.",
    birthYear: 1998,
  },
  {
    slug: "mikhail-zaytsev",
    name: "Mikhail Zaitsev",
    city: "Yerevan",
    status: "searching",
    professions: [["design", "middle"]],
    skills: [
      ["figma", 6],
      ["photoshop", 6],
      ["blender", 4],
    ],
    labels: [...LABELS.design, "SaaS", "Product manager"],
    bio: "Design for a young saas: I make the first screens look like a product.",
    birthYear: 1999,
  },
  {
    slug: "vera-sokolova",
    name: "Vera Sokolova",
    city: "Novosibirsk",
    status: "open",
    professions: [["analytics", "lead"]],
    skills: [
      ["python", 9],
      ["tableau", 9],
      ["postgres", 8],
      ["powerbi", 8],
    ],
    labels: ["Product manager", "Marketer", "Marketplace"],
    bio: "Leading the analysts: the data, the questions and the answers.",
    birthYear: 1989,
  },
  {
    slug: "gleb-nikitin",
    name: "Gleb Nikitin",
    city: "Saint Petersburg",
    status: "searching",
    professions: [["backend", "junior"]],
    skills: [
      ["nodejs", 4],
      ["redis", 3],
      ["postgres", 4],
    ],
    labels: [...LABELS.backend, "GameDev"],
    bio: "A junior backend who reads the code first and asks afterwards.",
    birthYear: 2001,
  },
  {
    slug: "kristina-belova",
    name: "Kristina Belova",
    city: "Moscow",
    status: "open",
    professions: [["frontend", "senior"]],
    skills: [
      ["react", 9],
      ["typescript", 9],
      ["css", 8],
      ["vue", 7],
    ],
    labels: [...LABELS.frontend, "E-commerce", "FinTech"],
    bio: "Front-end of a fintech: forms, tables and the confidence to ship.",
    birthYear: 1991,
  },
  {
    slug: "dmitry-larin",
    name: "Dmitry Larin",
    city: "Samara",
    status: "not-searching",
    professions: [["mobile", "middle"]],
    skills: [
      ["kotlin", 6],
      ["compose", 5],
      ["typescript", 4],
    ],
    labels: [...LABELS.mobile, "EdTech", "GameDev"],
    bio: "Educational games for android; the fun part is the level design.",
    birthYear: 1997,
  },
  {
    slug: "ludmila-orlova",
    name: "Ludmila Orlova",
    city: "Yekaterinburg",
    status: "open",
    professions: [["design", "middle"]],
    skills: [
      ["figma", 7],
      ["photoshop", 6],
    ],
    labels: [...LABELS.design, "HealthTech", "Product"],
    bio: "Medical products: calm interfaces, clear states, no dark patterns.",
    birthYear: 1996,
  },
  {
    slug: "artur-karimov",
    name: "Artur Karimov",
    city: "Yerevan",
    status: "searching",
    professions: [["analytics", "junior"]],
    skills: [
      ["python", 4],
      ["powerbi", 3],
      ["tableau", 3],
    ],
    labels: ["Marketer", "Ecotech"],
    bio: "A junior analyst who asks what the number really means.",
    birthYear: 2003,
  },
  {
    slug: "nadya-ivanova",
    name: "Nadya Ivanova",
    city: "Kazan",
    status: "not-searching",
    professions: [["backend", "senior"]],
    skills: [
      ["rust", 8],
      ["go", 7],
      ["postgres", 8],
      ["redis", 6],
    ],
    labels: [...LABELS.backend, "Ecotech", "Marketplace"],
    bio: "Systems that stay up: Rust services, queues and a lot of careful testing.",
    birthYear: 1993,
  },
  {
    slug: "egor-sazonov",
    name: "Egor Sazonov",
    city: "Novosibirsk",
    status: "open",
    professions: [["frontend", "middle"]],
    skills: [
      ["typescript", 7],
      ["vue", 6],
      ["css", 6],
    ],
    labels: [...LABELS.frontend, "EdTech", "SaaS"],
    bio: "TypeScript everywhere, from the button to the build pipeline.",
    birthYear: 1998,
  },
  {
    slug: "zoya-petrova",
    name: "Zoya Petrova",
    city: "Moscow",
    status: "searching",
    professions: [["mobile", "middle"]],
    skills: [
      ["swift", 7],
      ["swiftui", 6],
      ["compose", 5],
    ],
    labels: [...LABELS.mobile, "Product", "E-commerce"],
    bio: "Product-minded mobile developer: I argue with the design on purpose.",
    birthYear: 1999,
  },
];

/** A date of the world: the members join one by one, over two years. */
const dateOf = (days: number): string =>
  new Date(Date.UTC(2024, 0, 1 + days)).toISOString().slice(0, 19);

/**
 * The public world of the directory: the accounts, the profiles and the
 * professions and skills of every member.
 */
export async function seedMembers(query: Query): Promise<void> {
  const professions = new Map<string, number>();
  for (const row of await query<{ slug: string; id: number }>(
    `select slug, id from professions`,
  )) {
    professions.set(row.slug, row.id);
  }
  const skills = new Map<string, number>();
  for (const row of await query<{ slug: string; id: number }>(
    `select slug, id from skills`,
  )) {
    skills.set(row.slug, row.id);
  }

  for (const [index, member] of MEMBERS.entries()) {
    const email = `${member.slug}@members.invalid`;
    const [account] = await query<{ id: number }>(
      `insert into users (email, name, password_hash) values ($1,$2,$3) returning id`,
      [email, member.name, hashPassword("teamup123")],
    );
    const userId = account.id;
    // the dates of the sorts: the registration, the update and the last sign-in
    const created = index * 14;
    const updated = created + 20 + (index % 40);
    const lastLogin = index % 11 === 0 ? null : 700 + (index % 90);
    await query(
      `insert into profiles (user_id, slug, city, bio, status, labels, birth_year,
                             created_at, updated_at, last_login_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        userId,
        member.slug,
        member.city,
        member.bio,
        member.status,
        member.labels,
        member.birthYear,
        dateOf(created),
        dateOf(updated),
        lastLogin === null ? null : dateOf(lastLogin),
      ],
    );
    for (const [slug, bucket] of member.professions) {
      const professionId = professions.get(slug);
      if (!professionId) continue;
      await query(
        `insert into profiles_professions (user_id, profession_id, bucket) values ($1,$2,$3)`,
        [userId, professionId, bucket],
      );
    }
    for (const [slug, level] of member.skills) {
      const skillId = skills.get(slug);
      if (!skillId) continue;
      await query(
        `insert into profiles_skills (user_id, skill_id, level) values ($1,$2,$3)`,
        [userId, skillId, level],
      );
    }
  }
}
