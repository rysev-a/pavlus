import type { ChatMessage } from "../../blocks/chat-thread/chat-thread.ts";
import type { Comment } from "../../blocks/comment-thread/comment-thread.ts";
import type { Conversation } from "../../blocks/conversation-list/conversation-list.ts";
import type { Post } from "../../blocks/feed-post/feed-post.ts";
import type { Note } from "../../blocks/notification-list/notification-list.ts";
import type { Story } from "../../blocks/story-row/story-row.ts";
import type { Topic } from "../../blocks/trend-list/trend-list.ts";

export interface Person {
  id: string;
  name: string;
  tone: number;
  headline: string;
  bio: string;
  place: string;
  posts: number;
  followers: number;
  following: number;
}

export const ME = "alex";

export const PEOPLE: Person[] = [
  {
    id: "alex",
    name: "Alex Morgan",
    tone: 1,
    headline: "Designer who runs on coffee and Sunday rides",
    bio: "Making small interfaces for small teams. Currently trying to learn bread.",
    place: "Brooklyn, NY",
    posts: 3,
    followers: 412,
    following: 188,
  },
  {
    id: "maya",
    name: "Maya Ortiz",
    tone: 2,
    headline: "Muralist and illustrator",
    bio: "Painting big walls and small zines. Commissions open for spring.",
    place: "Valencia, Spain",
    posts: 212,
    followers: 3480,
    following: 291,
  },
  {
    id: "tomas",
    name: "Tomás Reyes",
    tone: 3,
    headline: "Cyclist, commuter, podcast addict",
    bio: "I ride 40 km a day and have opinions about all of it.",
    place: "Lisbon, Portugal",
    posts: 640,
    followers: 1290,
    following: 402,
  },
  {
    id: "hana",
    name: "Hana Sato",
    tone: 4,
    headline: "Street photographer",
    bio: "Night walks, wet pavements, vending machines.",
    place: "Tokyo, Japan",
    posts: 905,
    followers: 8820,
    following: 175,
  },
  {
    id: "nina",
    name: "Nina Alvarez",
    tone: 5,
    headline: "Climbing coach and trail runner",
    bio: "Saturday mornings are for the gym. Come say hi.",
    place: "Denver, CO",
    posts: 331,
    followers: 2104,
    following: 266,
  },
  {
    id: "ines",
    name: "Ines Moreau",
    tone: 1,
    headline: "Pastry chef, bread nerd",
    bio: "Test batch number three. This one is it.",
    place: "Lyon, France",
    posts: 478,
    followers: 5230,
    following: 311,
  },
  {
    id: "kofi",
    name: "Kofi Mensah",
    tone: 2,
    headline: "Producer and DJ",
    bio: "Mixes for long drives and short deadlines.",
    place: "Accra, Ghana",
    posts: 156,
    followers: 1760,
    following: 98,
  },
  {
    id: "leo",
    name: "Leo Park",
    tone: 3,
    headline: "Backend engineer, weekend baker",
    bio: "Debugging by day, sourdough by night.",
    place: "Seoul, South Korea",
    posts: 87,
    followers: 640,
    following: 220,
  },
  {
    id: "priya",
    name: "Priya Nair",
    tone: 4,
    headline: "Open source maintainer",
    bio: "Maintaining things so you do not have to.",
    place: "Bengaluru, India",
    posts: 294,
    followers: 3902,
    following: 140,
  },
];

export const nameOf = (id: string): string =>
  PEOPLE.find((p) => p.id === id)?.name ?? id;

export interface FeedPost extends Post {
  /** Hours since posted: the order of the feed. */
  hours: number;
}

const post = (
  id: string,
  handle: string,
  hours: number,
  ago: string,
  text: string,
  more: Partial<Post> = {},
): FeedPost => {
  const who = PEOPLE.find((p) => p.id === handle) ?? (PEOPLE[0] as Person);
  return {
    id,
    name: who.name,
    handle,
    tone: who.tone,
    ago,
    text,
    mood: "",
    photo: "",
    phototone: who.tone,
    likes: 0,
    liked: false,
    comments: 0,
    shares: 0,
    shared: false,
    ...more,
    hours,
  };
};

export const POSTS: FeedPost[] = [
  post(
    "p1",
    "maya",
    2,
    "2h",
    "Finally finished the mural on Dock Street. Eleven days, forty cans, one very patient ladder. #mural",
    {
      mood: "😊 feeling proud",
      photo: "🎨",
      phototone: 2,
      likes: 128,
      comments: 3,
      shares: 6,
    },
  ),
  post(
    "p2",
    "tomas",
    5,
    "5h",
    "Hot take: the best commute is the one where you get a seat and a podcast you actually like. #sundayride",
    { likes: 41, liked: true, comments: 1, shares: 1 },
  ),
  post(
    "p3",
    "hana",
    7,
    "7h",
    "Shibuya at midnight, no filter. The rain did all the work. #nightwalk",
    { photo: "🌃", phototone: 4, likes: 603, comments: 2, shares: 41 },
  ),
  post(
    "p4",
    "ines",
    9,
    "9h",
    "Test batch number three. This one is it: open crumb, blistered crust, and a smell that got the neighbors knocking. #sourdough",
    {
      mood: "🏆 feeling proud",
      photo: "🥐",
      phototone: 5,
      likes: 312,
      comments: 2,
      shares: 18,
    },
  ),
  post(
    "p5",
    "alex",
    14,
    "14h",
    "Sketching the new onboarding on the train. Paper first, always. #design",
    { likes: 24, comments: 1 },
  ),
  post(
    "p6",
    "nina",
    20,
    "20h",
    "Saturday 10:00 at the climbing gym. Beginners welcome, I will bring the chalk. #climbing",
    { photo: "🧗", phototone: 3, likes: 87, comments: 1, shares: 9 },
  ),
  post(
    "p7",
    "kofi",
    27,
    "Yesterday",
    "New mix is up. Headphones recommended, car speakers also fine. #mix",
    { mood: "🎉 feeling excited", likes: 69, comments: 0, shares: 12 },
  ),
  post(
    "p8",
    "priya",
    31,
    "Yesterday",
    "Release day. Fourteen contributors, two years, one very long changelog. Thank you all. #opensource",
    { likes: 540, comments: 0, shares: 75 },
  ),
  post(
    "p9",
    "leo",
    52,
    "2 days ago",
    "Week four of the starter. Her name is Doughy McDoughface and she is thriving. #sourdough",
    { photo: "🍞", phototone: 1, likes: 33, comments: 0, shares: 1 },
  ),
  post(
    "p10",
    "alex",
    70,
    "3 days ago",
    "Sunday ride along the river, 62 km, zero flats. #sundayride",
    { mood: "😊 feeling happy", likes: 52, comments: 0, shares: 2 },
  ),
];

const c = (
  id: string,
  by: string,
  text: string,
  ago: string,
  likes: number,
  liked = false,
): Comment => {
  const who = PEOPLE.find((p) => p.id === by) ?? (PEOPLE[0] as Person);
  return { id, name: who.name, tone: who.tone, text, ago, likes, liked };
};

export const COMMENTS: Record<string, Comment[]> = {
  p1: [
    c("c1", "hana", "The colors against that grey wall are unreal.", "1h", 9),
    c("c2", "tomas", "I ride past it every day. Hats off.", "1h", 4, true),
    c("c3", "nina", "Eleven days? Worth every one.", "40m", 2),
  ],
  p2: [
    c("c4", "maya", "A seat AND a podcast. You are living the dream.", "4h", 3),
  ],
  p3: [
    c("c5", "kofi", "That blue. Where is the vending machine?", "6h", 11),
    c("c6", "alex", "Saving this one for my wall.", "5h", 1),
  ],
  p4: [
    c("c7", "leo", "Recipe please, I am begging.", "8h", 6),
    c("c8", "ines", "Sending it over tonight!", "7h", 3),
  ],
  p5: [c("c9", "maya", "Paper first is the only way.", "12h", 5)],
  p6: [c("c10", "alex", "I am in. Do I need my own shoes?", "18h", 0)],
};

export const STORIES: Story[] = [
  {
    id: "s1",
    label: "Maya",
    tone: 2,
    emoji: "🎨",
    text: "Day eleven on the wall. Almost there.",
    ago: "2h",
  },
  {
    id: "s2",
    label: "Tomás",
    tone: 3,
    emoji: "🚲",
    text: "Sunday ride along the river.",
    ago: "4h",
  },
  {
    id: "s3",
    label: "Hana",
    tone: 4,
    emoji: "🌃",
    text: "Shibuya at midnight, no filter.",
    ago: "5h",
  },
  {
    id: "s4",
    label: "Ines",
    tone: 1,
    emoji: "🥐",
    text: "Test batch number three. This one is it.",
    ago: "7h",
  },
  {
    id: "s5",
    label: "Kofi",
    tone: 2,
    emoji: "🎧",
    text: "New mix is up. Headphones recommended.",
    ago: "9h",
  },
  {
    id: "s6",
    label: "Nina",
    tone: 5,
    emoji: "🧗",
    text: "Chalk bag packed. See you Saturday.",
    ago: "11h",
  },
];

export const MY_STORY: Story = {
  id: "s0",
  label: "You",
  tone: 1,
  emoji: "✨",
  text: "Hello from my first story.",
  ago: "now",
};

export const TOPICS: Topic[] = [
  { id: "sundayride", tag: "#sundayride", posts: 5320 },
  { id: "sourdough", tag: "#sourdough", posts: 2410 },
  { id: "nightwalk", tag: "#nightwalk", posts: 1180 },
  { id: "mural", tag: "#mural", posts: 980 },
  { id: "climbing", tag: "#climbing", posts: 760 },
];

export const SUGGESTED = ["ines", "kofi", "leo", "priya"];
export const START_FOLLOWING = ["maya", "tomas", "hana", "nina"];

export const NOTES: Note[] = [
  {
    id: "n1",
    name: "Hana Sato",
    tone: 4,
    glyph: "heart",
    text: "liked your post about the new onboarding.",
    ago: "10m",
    unread: true,
  },
  {
    id: "n2",
    name: "Maya Ortiz",
    tone: 2,
    glyph: "message",
    text: 'commented: "Paper first is the only way."',
    ago: "35m",
    unread: true,
  },
  {
    id: "n3",
    name: "Kofi Mensah",
    tone: 2,
    glyph: "user",
    text: "started following you.",
    ago: "2h",
    unread: true,
  },
  {
    id: "n4",
    name: "Nina Alvarez",
    tone: 5,
    glyph: "star",
    text: "invited you to Saturday at the climbing gym.",
    ago: "5h",
    unread: false,
  },
  {
    id: "n5",
    name: "Tomás Reyes",
    tone: 3,
    glyph: "repeat",
    text: "shared your ride from last Sunday.",
    ago: "Yesterday",
    unread: false,
  },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: "nina",
    name: "Nina Alvarez",
    tone: 5,
    preview: "10:00 works. I will bring the chalk.",
    time: "09:15",
    unread: 2,
    online: true,
  },
  {
    id: "maya",
    name: "Maya Ortiz",
    tone: 2,
    preview: "Come see the mural before the rain!",
    time: "Yesterday",
    unread: 0,
    online: false,
  },
  {
    id: "crew",
    name: "Sunday riders",
    tone: 3,
    preview: "Tomás: who has the pump?",
    time: "Mon",
    unread: 5,
    online: false,
  },
];

export const MESSAGES: Record<string, ChatMessage[]> = {
  nina: [
    {
      id: "a1",
      mine: false,
      text: "Are we still on for the climbing gym on Saturday?",
      time: "09:12",
    },
    {
      id: "a2",
      mine: true,
      text: "Yes! Morning session, 10:00?",
      time: "09:14",
    },
    {
      id: "a3",
      mine: false,
      text: "10:00 works. I will bring the chalk.",
      time: "09:15",
    },
  ],
  maya: [
    {
      id: "b1",
      mine: true,
      text: "The mural is stunning. How long did the last layer take?",
      time: "Yesterday",
    },
    {
      id: "b2",
      mine: false,
      text: "Come see the mural before the rain!",
      time: "Yesterday",
    },
  ],
  crew: [
    {
      id: "d1",
      mine: false,
      text: "Route is 55 km this week, flat as a pancake.",
      time: "Mon",
    },
    { id: "d2", mine: false, text: "Tomás: who has the pump?", time: "Mon" },
  ],
};
