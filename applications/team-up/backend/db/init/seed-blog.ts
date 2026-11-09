/**
 * The blog of the public site: the demo posts of the original teamUP
 * (`seed.rs`, the English set). The Russian set is loaded on demand by the
 * back office, as in the original.
 *
 * The posts are written with a fixed pid (`seed-1` … `seed-6`), so a repeat
 * of the seed rewrites the same rows instead of doubling them.
 */
import type { Query } from "./query.ts";

/** One demo post: the pid, the title, the date, the text and the tags. */
interface PostSeed {
  pid: string;
  title: string;
  date: string;
  content: string;
  tags: string[];
}

const POSTS: PostSeed[] = [
  {
    pid: "seed-1",
    title: "People for the start",
    date: "2026-09-12",
    content:
      "How to tell who your project really needs, where to look for people for the team, and why “just enthusiasts” are often not enough.",
    tags: ["Team", "Founders"],
  },
  {
    pid: "seed-2",
    title: "Not just an idea",
    date: "2026-09-05",
    content:
      "How to describe a startup so that it is clear what you are building, why it is needed and why people should join you.",
    tags: ["Idea", "Pitch", "Founders"],
  },
  {
    pid: "seed-3",
    title: "A team without chaos",
    date: "2026-08-27",
    content:
      "We work out how to agree on roles, responsibility and expectations before everyone starts arguing in work chats.",
    tags: ["Team", "Processes"],
  },
  {
    pid: "seed-4",
    title: "How to assess skills without interviews",
    date: "2026-08-15",
    content:
      "Trial tasks, portfolios and short calls: ways to tell that a person will cope, without stretching the hiring over a month.",
    tags: ["Hiring", "HR", "Skills"],
  },
  {
    pid: "seed-5",
    title: "A side project as a career elevator",
    date: "2026-07-30",
    content:
      "Why taking part in a startup is often worth more than a line in a résumé: real responsibility, a live product and a team that grows with you.",
    tags: ["Career", "Experience"],
  },
  {
    pid: "seed-6",
    title: "A design system on pure enthusiasm",
    date: "2026-07-18",
    content:
      "How two designers and one frontend developer built a single product style from scratch and did not fall out over color tokens.",
    tags: ["Design", "Processes", "Experience"],
  },
];

/** The demo posts of the blog. */
export async function seedBlog(query: Query): Promise<void> {
  for (const post of POSTS) {
    await query(
      `insert into posts (pid, title, content, date, tags)
       values ($1,$2,$3,$4,$5)
       on conflict (pid) do update
       set title = excluded.title, content = excluded.content,
           date = excluded.date, tags = excluded.tags`,
      [post.pid, post.title, post.content, post.date, post.tags],
    );
  }
}
