// The static pages of the public site (the original teamUP): the home, the
// about page and the 404.
//
// Every text of these pages goes through the translator, and the titles with
// a mark (`{{ t.tr("Strong <span>teams</span> …")|safe }}`) become a list of
// parts: the accented ones are the words between the tags.

import {
  type HttpReq,
  httpEffector,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { BlogService, type PostRow } from "../db/services/blog-service.ts";
import { type Locale, localeOf, Tr, trOf } from "../i18n/mod.ts";
import { excerpt } from "../lib/views.ts";

/** How many posts the landing shows. */
const LANDING_POSTS = 3;

/** One part of a marked text. */
export interface RichPart {
  text: string;
  /** The accented part (the word in the blue of the original). */
  accent: boolean;
  /** A line break before this part (the original's `<br />`). */
  br?: boolean;
}

const TAGS = /<\/?(?:span|strong)>|<br\s*\/?>/gi;

/**
 * The parts of a marked text. The string is translated FIRST (the tags are
 * part of the translated text) and split after that.
 */
export function richParts(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let accent = false;
  let br = false;
  let last = 0;
  for (const match of text.matchAll(TAGS)) {
    const chunk = text.slice(last, match.index);
    if (chunk !== "") {
      parts.push({ text: chunk, accent, br });
      br = false;
    }
    const tag = match[0].toLowerCase();
    if (tag.startsWith("<br")) br = true;
    else if (tag.startsWith("</")) accent = false;
    else accent = true;
    last = match.index + match[0].length;
  }
  const tail = text.slice(last);
  if (tail !== "") parts.push({ text: tail, accent, br });
  return parts;
}

/** The card of a post on the landing. */
function landingPost(tr: Tr, post: PostRow, index: number) {
  return {
    pid: post.pid,
    title: post.title,
    excerpt: excerpt(post.content, 120),
    image: `/images/blog__img${index > 0 ? index : ""}.webp`,
  };
}

/** The language the request parked. */
const localeOfSlice = (message: Message, state: ServerState): Locale => {
  const rid = message.ctx?.rid;
  const slice = state.requests[typeof rid === "string" ? rid : ""] ?? {};
  return (slice.locale as Locale | undefined) ?? "en";
};

export class SitePagesAPI {
  /** GET /api/public/home */
  "pages.home"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [
      requestsEffector.set("locale", localeOf(req)),
      BlogService.all("pages.posts"),
    ];
  }

  /** The language of the request rides on the slice: the reply of the db
   * carries the rows, not the request. */
  "pages.posts.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = new Tr(localeOfSlice(message, state));
    const posts = rowsOf<PostRow>(message)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, LANDING_POSTS)
      .map((p, i) => landingPost(tr, p, i));
    return [
      httpEffector.makeResponse(200, {
        hero: {
          badge: tr.tr("Find your team"),
          title: richParts(
            tr.tr("Strong <span>teams</span> for strong <span>ideas</span>"),
          ),
          lead: tr.tr(
            "A platform where project authors find like-minded people and talented specialists find room to grow.",
          ),
          buttons: [
            {
              text: tr.tr("Launch a project"),
              href: "/app/projects/new",
              bg: true,
            },
            {
              text: tr.tr("I want to join a project"),
              href: "/projects",
              bg: false,
            },
          ],
          members: richParts(
            tr.tr(
              "<strong>100+</strong> members <br /> have already found their team",
            ),
          ),
        },
        difficult: {
          title: richParts(
            tr.tr(
              "Is it hard to <span>build a team</span> <br /> for a project?",
            ),
          ),
          blocks: [
            {
              title: tr.tr("For founders"),
              text: tr.tr(
                "You have an idea but no people. Freelance marketplaces are expensive, and friends lack the skills.",
              ),
              hue: "violet",
              image: "/images/difficult__img.webp",
            },
            {
              title: tr.tr("For specialists"),
              text: tr.tr(
                "I want to join a great project but do not know where to look or how to offer myself.",
              ),
              hue: "blue",
              image: "/images/difficult__img2.webp",
            },
            {
              title: tr.tr("For HR"),
              text: tr.tr(
                "I spend hours looking for a narrow specialist on LinkedIn, although we already have a pool of projects.",
              ),
              hue: "yellow",
              image: "/images/difficult__img3.webp",
            },
          ],
        },
        job: {
          title: richParts(tr.tr("<span>How</span> the service works")),
          steps: [
            {
              n: "1",
              title: tr.tr("Describe the goal"),
              text: tr.tr(
                "Create a project or a profile and say who you are looking for.",
              ),
              image: "/images/job__img.webp",
            },
            {
              n: "2",
              title: tr.tr("Choose a role"),
              text: tr.tr(
                "Show in what capacity you want to take part in a project.",
              ),
              image: "/images/job__img2.webp",
            },
            {
              n: "3",
              title: tr.tr("Find matches"),
              text: tr.tr("Use filters by skills, domain, level and tasks."),
              image: "/images/job__img3.webp",
            },
            {
              n: "4",
              title: tr.tr("Build the team"),
              text: tr.tr("Invite members and start working on the project."),
              image: "/images/job__img4.webp",
            },
          ],
          inner: [
            {
              kicker: tr.tr("For specialists"),
              title: tr.tr("Want to join great projects?"),
              items: [
                tr.tr("Find interesting projects"),
                tr.tr("Show your skills"),
                tr.tr("Join teams"),
              ],
              button: tr.tr("Find a project"),
              href: "/projects",
              hue: "blue",
              images: [
                "/images/job__inner__img.webp",
                "/images/job__inner__img__mb.webp",
              ],
            },
            {
              kicker: tr.tr("For founders"),
              title: tr.tr("Have an idea? Build your team"),
              items: [
                tr.tr("Describe the project, the goal and the roles"),
                tr.tr("Find specialists"),
                tr.tr("Invite members"),
              ],
              button: tr.tr("Launch a project"),
              href: "/app/projects/new",
              hue: "violet",
              images: [
                "/images/job__inner__img2.webp",
                "/images/job__inner__img__mb2.webp",
              ],
            },
          ],
        },
        blog: {
          title: tr.tr("Blog"),
          all: tr.tr("View all"),
          posts,
        },
        reviews: {
          title: richParts(tr.tr("What <span>people say about us</span>")),
          items: [
            {
              name: tr.tr("Ekaterina L."),
              role: tr.tr("UX/UI designer"),
              text: tr.tr(
                "I was not looking for just a project “for my portfolio” but for something real — with a living team, an idea and a chance to influence the product. I ended up in an early-stage startup: I design the interface, take part in product discussions and see my decisions turn straight into a real MVP. It is a completely different level of experience.",
              ),
              image: "/images/reviews__img.webp",
              hue: "violet",
              small: false,
            },
            {
              name: tr.tr("Ivan I."),
              role: tr.tr("Startup founder"),
              text: tr.tr(
                "In a week I put together a team of three developers. They got involved quickly and helped develop the idea.",
              ),
              image: "/images/reviews__img2.webp",
              hue: "blue",
              small: true,
            },
            {
              name: tr.tr("Maria S."),
              role: tr.tr("Analyst"),
              text: tr.tr(
                "I applied to a fitness project and a couple of days later I was on a call with the team.",
              ),
              image: "/images/reviews__img3.webp",
              hue: "blue",
              small: true,
            },
            {
              name: tr.tr("Daniil K."),
              role: tr.tr("HR specialist"),
              text: tr.tr(
                "The skills filter cut off the irrelevant applications at once and sped up the search a lot.",
              ),
              image: "/images/reviews__img4.webp",
              hue: "blue",
              small: true,
            },
            {
              name: tr.tr("Dmitry S."),
              role: tr.tr("Startup founder"),
              text: tr.tr(
                "I was looking for people not just “for a task” but for a team. I found those who are really interested in the project.",
              ),
              image: "/images/reviews__img5.webp",
              hue: "blue",
              small: true,
            },
          ],
        },
      }),
    ];
  }

  /** GET /api/public/about */
  "pages.about"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    return [
      httpEffector.makeResponse(200, {
        title: richParts(
          tr.tr("A service where ideas <span>find teams</span>"),
        ),
        lead: tr.tr(
          "TeamUp is a platform where project authors find like-minded people and talented specialists find room to grow.",
        ),
        text: tr.tr(
          "Founders publish ideas and describe who they need. Specialists create a profile, show their skills and join projects. HR find motivated people for their tasks. Everything you need to get started is in one service.",
        ),
        tag: tr.tr("About"),
        cards: [
          {
            title: tr.tr("For founders"),
            text: tr.tr(
              "Publish a project, describe the goal and the roles, invite members who share your idea.",
            ),
            hue: "violet",
          },
          {
            title: tr.tr("For specialists"),
            text: tr.tr(
              "Create a profile with your skills, find projects that match your interests and join the ones that inspire you.",
            ),
            hue: "blue",
          },
          {
            title: tr.tr("For HR"),
            text: tr.tr(
              "Quickly find specialists by skills and level, invite people to open positions in your projects.",
            ),
            hue: "yellow",
          },
        ],
        join: { text: tr.tr("Join TeamUp"), href: "/app/signup" },
        benefits: [
          {
            title: richParts(tr.tr("What you <span>get</span>")),
            groups: [
              {
                subtitle: tr.tr("For those looking for a project or a team"),
                cards: [
                  {
                    title: tr.tr("Great projects, not routine"),
                    text: tr.tr(
                      "Build cool things instead of corporate tasks: in startups your contribution is visible in the product right away.",
                    ),
                    hue: "violet",
                  },
                  {
                    title: tr.tr("New technologies"),
                    text: tr.tr(
                      "Try fresh languages, frameworks and approaches that you never get to in regular work.",
                    ),
                    hue: "blue",
                  },
                  {
                    title: tr.tr("Skill growth"),
                    text: tr.tr(
                      "Level up programming, design, communication and management on real tasks.",
                    ),
                    hue: "yellow",
                  },
                  {
                    title: tr.tr("Friends and like-minded people"),
                    text: tr.tr(
                      "Find people you want to work with, learn with and simply spend time with.",
                    ),
                    hue: "violet",
                  },
                ],
              },
              {
                subtitle: tr.tr("For those looking for people"),
                cards: [
                  {
                    title: tr.tr("Fast search"),
                    text: tr.tr(
                      "Filter members by skills and levels and write to suitable people directly.",
                    ),
                    hue: "blue",
                  },
                  {
                    title: tr.tr("Invitations to positions"),
                    text: tr.tr(
                      "Invite experts exactly where they are needed — to open roles in your projects.",
                    ),
                    hue: "yellow",
                  },
                  {
                    title: tr.tr("Commercial projects"),
                    text: tr.tr(
                      "Put together commercial projects with open positions and fill them in days, not months.",
                    ),
                    hue: "violet",
                  },
                ],
              },
            ],
          },
        ],
        faq: {
          title: richParts(tr.tr("Frequently asked <span>questions</span>")),
          items: [
            {
              question: tr.tr("What is TeamUp?"),
              answer: tr.tr(
                "TeamUp is a service for finding teams and members. Founders publish projects and describe the people they need, and specialists create a profile with their skills and apply to interesting projects.",
              ),
            },
            {
              question: tr.tr("Who can use the service?"),
              answer: tr.tr(
                "Anyone who wants to create projects or take part in them: startup founders, developers, designers, analysts, marketers and other specialists, as well as HR who need motivated people for their tasks.",
              ),
            },
            {
              question: tr.tr("How much does TeamUp cost?"),
              answer: tr.tr(
                "The service is free for members: signing up, creating a profile and taking part in projects cost nothing.",
              ),
            },
            {
              question: tr.tr("How do I find a team for my idea?"),
              answer: tr.tr(
                "Sign up and create a project page: describe the goal, the tasks and the roles to fill. The service helps you find suitable members and you can invite them to the team.",
              ),
            },
            {
              question: tr.tr("How do I find a project to join?"),
              answer: tr.tr(
                "Fill in your profile: add your skills, level and what interests you. Set up the filters and apply to the projects that suit you.",
              ),
            },
            {
              question: tr.tr("Do I need experience to join a project?"),
              answer: tr.tr(
                "No. Many teams look for people who are ready to learn and take responsibility. Set your level in the profile — there are projects for any experience.",
              ),
            },
            {
              question: tr.tr("Can I take part in several projects at once?"),
              answer: tr.tr(
                "Yes, there is no limit: choose the projects that interest you and agree on the workload with the teams.",
              ),
            },
          ],
        },
      }),
    ];
  }

  /** GET /api/public/not-found */
  "pages.notFound"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    return [
      httpEffector.makeResponse(200, {
        title: tr.tr("Page not found"),
        text: tr.tr(
          "Looks like there is no such page. Go back to the home page, read the blog or browse the projects.",
        ),
        links: [
          { text: tr.tr("home page"), href: "/" },
          { text: tr.tr("blog"), href: "/blog" },
          { text: tr.tr("projects"), href: "/projects" },
        ],
      }),
    ];
  }

  "pages.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
