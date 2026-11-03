import type { Comment } from "../../blocks/comment-thread/comment-thread.ts";
import type { PhotoData, Shape } from "../../blocks/photo-card/photo-card.ts";

export interface Author {
  id: string;
  name: string;
  tone: number;
  headline: string;
  bio: string;
  place: string;
  followers: number;
  following: number;
}

export const ME = "jordan";

export const AUTHORS: Author[] = [
  {
    id: "jordan",
    name: "Jordan Lee",
    tone: 1,
    headline: "Weekend photographer",
    bio: "Chasing blue hours with a second-hand camera.",
    place: "Portland, OR",
    followers: 318,
    following: 92,
  },
  {
    id: "hana",
    name: "Hana Sato",
    tone: 4,
    headline: "Street photographer",
    bio: "Night walks, wet pavements, vending machines.",
    place: "Tokyo, Japan",
    followers: 8820,
    following: 175,
  },
  {
    id: "ines",
    name: "Ines Moreau",
    tone: 3,
    headline: "Food and market photographer",
    bio: "Light on oranges, steam on bread.",
    place: "Lyon, France",
    followers: 5230,
    following: 311,
  },
  {
    id: "kofi",
    name: "Kofi Mensah",
    tone: 2,
    headline: "Mountain and trail photographer",
    bio: "If there is a ridge, I am probably on it.",
    place: "Accra, Ghana",
    followers: 1760,
    following: 98,
  },
  {
    id: "maya",
    name: "Maya Ortiz",
    tone: 5,
    headline: "Muralist with a camera",
    bio: "Documenting walls before and after paint.",
    place: "Valencia, Spain",
    followers: 3480,
    following: 291,
  },
  {
    id: "nina",
    name: "Nina Alvarez",
    tone: 1,
    headline: "Sea and sky",
    bio: "Sailing, then photographing the sailing.",
    place: "Cadiz, Spain",
    followers: 2104,
    following: 266,
  },
];

export const authorOf = (id: string): Author =>
  AUTHORS.find((a) => a.id === id) ?? (AUTHORS[0] as Author);

const ph = (
  id: string,
  title: string,
  authorId: string,
  tone: number,
  tone2: number,
  emoji: string,
  shape: Shape,
  likes: number,
  album: string,
  tags: string[],
): PhotoData => ({
  id,
  title,
  author: authorOf(authorId).name,
  authorId,
  tone,
  tone2,
  emoji,
  shape,
  likes,
  tags,
  album,
});

export const PHOTOS: PhotoData[] = [
  ph("f1", "Blue hour", "hana", 4, 5, "🌃", "tall", 214, "Tokyo", [
    "#city",
    "#night",
    "#bluehour",
  ]),
  ph("f2", "Market morning", "ines", 3, 1, "🍊", "square", 96, "Lyon", [
    "#market",
    "#food",
  ]),
  ph("f3", "Ridge walk", "kofi", 2, 4, "🏔️", "wide", 331, "Alps", [
    "#hiking",
    "#mountains",
  ]),
  ph("f4", "Quiet harbor", "nina", 5, 2, "⛵", "square", 58, "Coast", [
    "#sea",
    "#bluehour",
  ]),
  ph("f5", "Rain on glass", "hana", 5, 4, "🌧️", "tall", 187, "Tokyo", [
    "#rain",
    "#night",
  ]),
  ph("f6", "Fresh bread", "ines", 1, 3, "🥖", "wide", 142, "Lyon", [
    "#food",
    "#morning",
  ]),
  ph("f7", "Wall number nine", "maya", 2, 5, "🎨", "tall", 276, "Street", [
    "#mural",
    "#street",
  ]),
  ph("f8", "Last light", "nina", 1, 5, "🌅", "wide", 402, "Coast", [
    "#sunset",
    "#sea",
  ]),
  ph("f9", "Summit snack", "kofi", 3, 2, "🍫", "square", 77, "Alps", [
    "#hiking",
    "#food",
  ]),
  ph("f10", "Neon alley", "hana", 5, 1, "🏮", "tall", 521, "Tokyo", [
    "#night",
    "#street",
  ]),
  ph("f11", "Lilac field", "ines", 5, 4, "🌸", "square", 166, "Lyon", [
    "#flowers",
    "#morning",
  ]),
  ph("f12", "Sketch day", "jordan", 3, 2, "✏️", "wide", 24, "Studio", [
    "#studio",
    "#morning",
  ]),
  ph("f13", "Bridge at six", "jordan", 4, 1, "🌉", "tall", 61, "Street", [
    "#city",
    "#bluehour",
  ]),
  ph("f14", "Cat on a wall", "maya", 1, 2, "🐈", "square", 233, "Street", [
    "#street",
    "#cats",
  ]),
];

export const COMMENTS: Record<string, Comment[]> = {
  f1: [
    {
      id: "k1",
      name: "Ines Moreau",
      tone: 3,
      text: "That deep blue is unreal. What time was this?",
      ago: "3h",
      likes: 6,
      liked: false,
    },
    {
      id: "k2",
      name: "Kofi Mensah",
      tone: 2,
      text: "Saving this for my next trip.",
      ago: "1h",
      likes: 2,
      liked: true,
    },
  ],
  f3: [
    {
      id: "k3",
      name: "Hana Sato",
      tone: 4,
      text: "I felt the wind just looking at it.",
      ago: "5h",
      likes: 4,
      liked: false,
    },
  ],
  f8: [
    {
      id: "k4",
      name: "Maya Ortiz",
      tone: 5,
      text: "Wallpaper material.",
      ago: "1d",
      likes: 9,
      liked: false,
    },
    {
      id: "k5",
      name: "Jordan Lee",
      tone: 1,
      text: "The gradient on the water, wow.",
      ago: "20h",
      likes: 1,
      liked: false,
    },
  ],
};

export const EMOJIS = ["🌄", "🌊", "🌲", "🏙️", "🍜", "🦋", "🚲", "🎡"];

export const TONES = [
  { id: "1", label: "Sunrise" },
  { id: "2", label: "Forest" },
  { id: "3", label: "Meadow" },
  { id: "4", label: "Ocean" },
  { id: "5", label: "Dusk" },
];
