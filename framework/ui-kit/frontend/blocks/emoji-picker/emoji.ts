// The emoji of the picker, with a name or two to search by. Pure data and
// functions.
export interface Emoji {
  e: string;
  /** Words to search by. */
  n: string;
}

export interface EmojiGroup {
  id: string;
  name: string;
  /** The emoji on the tab. */
  icon: string;
  list: Emoji[];
}

const E = (e: string, n: string): Emoji => ({ e, n });

export const GROUPS: EmojiGroup[] = [
  {
    id: "smileys",
    name: "Smileys",
    icon: "😀",
    list: [
      E("😀", "grin happy"),
      E("😃", "smile happy"),
      E("😄", "laugh smile"),
      E("😁", "beam grin"),
      E("😆", "laughing squint"),
      E("😅", "sweat relief"),
      E("😂", "joy tears laugh lol"),
      E("🙂", "slight smile"),
      E("😉", "wink"),
      E("😊", "blush smile"),
      E("😍", "heart eyes love"),
      E("🥰", "love hearts"),
      E("😘", "kiss"),
      E("😎", "cool sunglasses"),
      E("🤔", "think thinking hmm"),
      E("😴", "sleep tired"),
      E("😮", "wow surprised"),
      E("😢", "cry sad tear"),
      E("😭", "sob crying"),
      E("😡", "angry mad"),
      E("🥳", "party celebrate"),
      E("🤯", "mind blown"),
    ],
  },
  {
    id: "gestures",
    name: "People",
    icon: "👋",
    list: [
      E("👋", "wave hello bye"),
      E("👍", "thumbs up yes ok"),
      E("👎", "thumbs down no"),
      E("👏", "clap applause"),
      E("🙌", "raised hands hooray"),
      E("🙏", "pray thanks please"),
      E("🤝", "handshake deal"),
      E("💪", "strong muscle"),
      E("✌️", "peace victory"),
      E("🤞", "fingers crossed luck"),
      E("👀", "eyes look"),
      E("🧠", "brain smart"),
    ],
  },
  {
    id: "nature",
    name: "Nature",
    icon: "🌿",
    list: [
      E("🌲", "tree pine forest"),
      E("🌿", "herb plant"),
      E("🌸", "blossom flower"),
      E("🌻", "sunflower"),
      E("🍂", "leaves autumn fall"),
      E("⛰️", "mountain hike"),
      E("🌊", "wave sea"),
      E("🔥", "fire hot"),
      E("☀️", "sun sunny"),
      E("🌙", "moon night"),
      E("⭐", "star"),
      E("🌈", "rainbow"),
      E("🐶", "dog puppy"),
      E("🐱", "cat kitten"),
      E("🦊", "fox"),
      E("🐻", "bear"),
    ],
  },
  {
    id: "food",
    name: "Food",
    icon: "🍕",
    list: [
      E("🍕", "pizza"),
      E("🍔", "burger"),
      E("🍜", "ramen noodles soup"),
      E("🍣", "sushi"),
      E("🌮", "taco"),
      E("🥐", "croissant"),
      E("🍎", "apple"),
      E("🍓", "strawberry"),
      E("☕", "coffee"),
      E("🍵", "tea"),
      E("🍫", "chocolate"),
      E("🍰", "cake dessert"),
      E("🍺", "beer"),
      E("🍷", "wine"),
    ],
  },
  {
    id: "objects",
    name: "Objects",
    icon: "💡",
    list: [
      E("💡", "idea light bulb"),
      E("📎", "paperclip attach"),
      E("📌", "pin"),
      E("📚", "books"),
      E("💻", "laptop computer"),
      E("📱", "phone"),
      E("🎧", "headphones music"),
      E("🎬", "movie film"),
      E("🎁", "gift present"),
      E("🎉", "party tada celebrate"),
      E("🚀", "rocket launch"),
      E("✅", "check done"),
      E("❌", "cross no"),
      E("⚠️", "warning"),
      E("❤️", "heart love red"),
      E("💔", "broken heart"),
    ],
  },
];

export const RECENT_MAX = 8;

/** Pure: put an emoji first in the recent list (no duplicates, at most 8). */
export function pushRecent(recent: string[], emoji: string): string[] {
  return [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
}

/** Pure: the emoji whose name contains every word of the query. */
export function searchEmoji(query: string): Emoji[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return GROUPS.flatMap((g) => g.list).filter((x) =>
    words.every((w) => x.n.includes(w)),
  );
}

export interface PickerView {
  tabs: { id: string; name: string; icon: string; active: boolean }[];
  emojis: Emoji[];
  title: string;
  recent: Emoji[];
}

/** Pure: what the picker shows for a group (or a search) and the recent emoji. */
export function pickerView(
  group: string,
  query: string,
  recent: string[],
): PickerView {
  const searching = query.trim() !== "";
  const current = GROUPS.find((g) => g.id === group) ?? GROUPS[0];
  const all = GROUPS.flatMap((g) => g.list);
  return {
    tabs: GROUPS.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      active: !searching && g.id === current.id,
    })),
    emojis: searching ? searchEmoji(query) : current.list,
    title: searching ? `Results for "${query.trim()}"` : current.name,
    recent: recent
      .map((e) => all.find((x) => x.e === e))
      .filter((x): x is Emoji => x !== undefined),
  };
}
