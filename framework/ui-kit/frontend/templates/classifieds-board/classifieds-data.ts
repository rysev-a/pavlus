import type { Listing } from "../../blocks/listing-card/listing-card.ts";

/** A listing on the board: the card's fields, plus its age and who owns it. */
export interface Item extends Listing {
  /** Hours since it was posted: the sort key for "newest". */
  hours: number;
  mine: boolean;
}

export const CATEGORIES = [
  "Electronics",
  "Home",
  "Fashion",
  "Vehicles",
  "Sports",
  "Books & hobbies",
];

/** Pure: `5` → `5 h ago`, `30` → `Yesterday`. */
export function agoLabel(hours: number): string {
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return `${Math.floor(hours / 24)} days ago`;
}

const item = (
  id: string,
  title: string,
  price: number,
  category: string,
  location: string,
  emoji: string,
  tone: number,
  seller: string,
  hours: number,
  description: string,
  badge = "",
  mine = false,
): Item => ({
  id,
  title,
  price,
  category,
  location,
  emoji,
  tone,
  seller,
  hours,
  description,
  badge,
  mine,
  ago: agoLabel(hours),
});

export const ITEMS: Item[] = [
  item(
    "l1",
    "Vintage film camera, Olympus OM-1",
    180,
    "Electronics",
    "Brooklyn, NY",
    "📷",
    1,
    "Nora K.",
    2,
    "Fully working 35mm SLR with a 50mm f/1.8 lens. Fresh light seals, a leather case and two rolls of film included. Collection only, or I can meet in Manhattan.",
    "Top",
  ),
  item(
    "l2",
    "Solid oak dining table, seats six",
    450,
    "Home",
    "Austin, TX",
    "🪑",
    2,
    "Mike R.",
    26,
    "Heavy oak table, 180 by 90 cm, a few scratches that add character. Chairs sold separately. You must collect: it comes apart with a screwdriver.",
    "New",
  ),
  item(
    "l3",
    "Road bike, 56 cm, Shimano 105",
    620,
    "Vehicles",
    "Portland, OR",
    "🚲",
    3,
    "Lena S.",
    5,
    "Aluminium frame, carbon fork, 2x11 gears, ridden about 1,500 km. New chain and brake pads this spring. Pedals not included.",
    "Top",
  ),
  item(
    "l4",
    "Moving boxes, free to a good home",
    0,
    "Home",
    "Denver, CO",
    "📦",
    4,
    "Ana P.",
    72,
    "About thirty boxes in assorted sizes, flattened and ready to go. Take all or some. Please message first to arrange a time.",
  ),
  item(
    "l5",
    "Leather jacket, size M, barely worn",
    95,
    "Fashion",
    "Chicago, IL",
    "🧥",
    5,
    "Tom B.",
    9,
    "Genuine leather biker jacket, worn three times. Too small for me. Smoke and pet free home.",
  ),
  item(
    "l6",
    "Acoustic guitar with gig bag",
    140,
    "Books & hobbies",
    "Nashville, TN",
    "🎸",
    1,
    "Jess W.",
    50,
    "Dreadnought, spruce top, a warm sound. Comes with a padded gig bag, a capo and a tuner. Small mark on the back, nothing structural.",
    "New",
  ),
  item(
    "l7",
    "27 inch 4K monitor, IPS",
    210,
    "Electronics",
    "Seattle, WA",
    "🖥️",
    2,
    "Raj M.",
    4,
    "Great colours, USB-C with 65W charging, height-adjustable stand. Bought last year, receipt available.",
  ),
  item(
    "l8",
    "Yoga mat and two blocks",
    25,
    "Sports",
    "San Diego, CA",
    "🧘",
    4,
    "Dana F.",
    120,
    "Thick non-slip mat with a carry strap and two cork blocks. Cleaned and ready.",
  ),
  item(
    "l9",
    "Mid-century armchair, teal velvet",
    280,
    "Home",
    "Brooklyn, NY",
    "🛋️",
    3,
    "Ivy L.",
    14,
    "Restored walnut legs, new velvet upholstery. Very comfortable, a real statement piece.",
    "Top",
  ),
  item(
    "l10",
    "Trail running shoes, size 10",
    55,
    "Sports",
    "Boulder, CO",
    "👟",
    5,
    "Sam K.",
    30,
    "Ran about 100 km in them. Excellent grip, plenty of life left. Selling because they are a half size too large.",
  ),
  item(
    "l11",
    "Complete Tolkien paperback set",
    40,
    "Books & hobbies",
    "Madison, WI",
    "📚",
    1,
    "Beth H.",
    96,
    "The Hobbit and The Lord of the Rings in a boxed set, all in good condition with a few creased spines.",
  ),
  item(
    "l12",
    "2015 Honda Civic, 82,000 miles",
    7400,
    "Vehicles",
    "Phoenix, AZ",
    "🚗",
    2,
    "Carlos V.",
    8,
    "One owner, full service history, new tyres. Clean title, no accidents. Test drives on weekends.",
    "Top",
  ),
  item(
    "m1",
    "Handmade ceramic mugs, set of four",
    36,
    "Home",
    "Brooklyn, NY",
    "☕",
    4,
    "Ann Lee",
    40,
    "Wheel-thrown stoneware mugs in speckled glaze, dishwasher safe. Each one is slightly different.",
    "",
    true,
  ),
  item(
    "m2",
    "Mechanical keyboard, brown switches",
    70,
    "Electronics",
    "Brooklyn, NY",
    "⌨️",
    5,
    "Ann Lee",
    6,
    "75% layout, hot-swappable, with a coiled cable and two spare keycap sets.",
    "New",
    true,
  ),
];

export interface Message {
  id: number;
  from: string;
  about: string;
  text: string;
  ago: string;
  unread: boolean;
}

export const MESSAGES: Message[] = [
  {
    id: 1,
    from: "Priya N.",
    about: "Mechanical keyboard, brown switches",
    text: "Hi! Is the keyboard still available? I can pick it up on Saturday.",
    ago: "1 h ago",
    unread: true,
  },
  {
    id: 2,
    from: "Luca G.",
    about: "Handmade ceramic mugs, set of four",
    text: "Lovely mugs. Would you take $30 for the set if I collect today?",
    ago: "Yesterday",
    unread: true,
  },
  {
    id: 3,
    from: "Marketly team",
    about: "Welcome",
    text: "Welcome to Marketly. Add a clear photo and a fair price, and your first listing will sell faster.",
    ago: "3 days ago",
    unread: false,
  },
];
