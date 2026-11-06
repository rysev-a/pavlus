/**
 * The demo data of Orbit: 1000 people, their friends, walls, blog, photos,
 * chats, communities and a music library of 10000 songs. Pure and
 * deterministic: a tiny PRNG, no Math.random, no Date, no I/O. Same seed, same
 * database.
 */
import { gradient } from "./pictures.ts";
import { hashPassword, DEMO_ADMIN, DEMO_PASSWORD } from "./auth.ts";
import {
  type Album,
  type Artist,
  type Comment,
  type Community,
  type Conversation,
  type Db,
  type Friend,
  type Message,
  type Photo,
  type PhotoAlbum,
  type Playlist,
  type Post,
  type PostKind,
  type Score,
  type Song,
  type User,
  type Article,
  GAMES,
  GENRES,
  NOW,
  SEED_COUNTS,
  emptyDb,
} from "./schema.ts";

export { NOW };

// ---------------------------------------------------------------- random

interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  weighted(weights: readonly number[]): number;
  shuffle<T>(items: readonly T[]): T[];
}

function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)],
    chance: (p) => next() < p,
    weighted(weights) {
      let sum = 0;
      for (const w of weights) sum += w;
      let r = next() * sum;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// ----------------------------------------------------------------- dates

const DAY = 86400;
const pad = (n: number): string => String(n).padStart(2, "0");

function dayNumber(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civil(days: number): [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

/** Seconds since 1970 (no time zone) to `YYYY-MM-DDTHH:MM:SS`. */
function isoOf(secs: number): string {
  const days = Math.floor(secs / DAY);
  const s = secs - days * DAY;
  const [y, m, d] = civil(days);
  return `${y}-${pad(m)}-${pad(d)}T${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function secsOf(iso: string): number {
  const [y, m, d, h, mi, s] = iso.split(/[-T:]/).map(Number);
  return dayNumber(y, m, d) * DAY + h * 3600 + mi * 60 + s;
}

// ------------------------------------------------------------ word pools

const FIRST = [
  "Ann",
  "Ben",
  "Chloe",
  "Daniel",
  "Emma",
  "Finn",
  "Grace",
  "Henry",
  "Isla",
  "Jack",
  "Kate",
  "Leo",
  "Maya",
  "Nick",
  "Olivia",
  "Paul",
  "Ruby",
  "Sam",
  "Tessa",
  "Victor",
  "Wendy",
  "Zoe",
  "Oliver",
  "Amelia",
  "Lucas",
  "Charlotte",
  "Mateo",
  "Sofia",
  "Diego",
  "Valentina",
  "Carlos",
  "Lucia",
  "Javier",
  "Camila",
  "Andres",
  "Isabella",
  "Pablo",
  "Elena",
  "Marco",
  "Giulia",
  "Luca",
  "Chiara",
  "Matteo",
  "Francesca",
  "Hans",
  "Greta",
  "Jonas",
  "Lena",
  "Felix",
  "Anna",
  "Klaus",
  "Marie",
  "Pierre",
  "Camille",
  "Louis",
  "Manon",
  "Hugo",
  "Jeanne",
  "Antoine",
  "Ivan",
  "Olga",
  "Dmitri",
  "Natasha",
  "Pavel",
  "Katya",
  "Sergei",
  "Irina",
  "Tomas",
  "Petra",
  "Jakub",
  "Zofia",
  "Marek",
  "Agnieszka",
  "Aarav",
  "Priya",
  "Rohan",
  "Ananya",
  "Vikram",
  "Kavya",
  "Arjun",
  "Meera",
  "Rahul",
  "Sneha",
  "Imran",
  "Fatima",
  "Omar",
  "Layla",
  "Hassan",
  "Amira",
  "Karim",
  "Noor",
  "Yusuf",
  "Leyla",
  "Mehmet",
  "Elif",
  "Kemal",
  "Zeynep",
  "Wei",
  "Mei",
  "Jun",
  "Lin",
  "Hiro",
  "Yuki",
  "Kenji",
  "Sakura",
  "Haruto",
  "Aiko",
  "Min-jun",
  "Seo-yeon",
  "Ji-woo",
  "Hye",
  "Tuan",
  "Linh",
  "Anh",
  "Mai",
  "Budi",
  "Putri",
  "Chidi",
  "Amara",
  "Kwame",
  "Ama",
  "Tunde",
  "Folake",
  "Kofi",
  "Zainab",
  "Thabo",
  "Naledi",
  "Sipho",
  "Lerato",
  "Mohamed",
  "Nadia",
  "Erik",
  "Astrid",
  "Lars",
  "Freya",
  "Sven",
  "Ingrid",
  "Olaf",
  "Sigrid",
  "Mikko",
  "Aino",
  "Nils",
  "Elsa",
  "Joao",
  "Beatriz",
  "Tiago",
  "Ines",
  "Rui",
  "Marta",
  "Liam",
  "Aoife",
  "Conor",
  "Niamh",
  "Callum",
  "Fiona",
  "Declan",
  "Siobhan",
  "Gabriel",
  "Helena",
  "Ricardo",
  "Rafaela",
];

const LAST = [
  "Stone",
  "Reyes",
  "Martin",
  "Okafor",
  "Petrova",
  "Haddad",
  "Kim",
  "Lambert",
  "Costa",
  "Weber",
  "Nair",
  "Tanaka",
  "Fischer",
  "Novak",
  "Torres",
  "Murphy",
  "Ricci",
  "Adeyemi",
  "Singh",
  "Smith",
  "Johnson",
  "Brown",
  "Taylor",
  "Wilson",
  "Davies",
  "Evans",
  "Thomas",
  "Roberts",
  "Walker",
  "Wright",
  "Hall",
  "Green",
  "Baker",
  "Carter",
  "Turner",
  "Hughes",
  "Garcia",
  "Rodriguez",
  "Fernandez",
  "Lopez",
  "Gonzalez",
  "Sanchez",
  "Ramirez",
  "Flores",
  "Navarro",
  "Molina",
  "Ortega",
  "Silva",
  "Santos",
  "Oliveira",
  "Pereira",
  "Almeida",
  "Rossi",
  "Russo",
  "Ferrari",
  "Esposito",
  "Bianchi",
  "Romano",
  "Colombo",
  "Bruno",
  "Mueller",
  "Schmidt",
  "Schneider",
  "Wagner",
  "Becker",
  "Hoffmann",
  "Koch",
  "Richter",
  "Klein",
  "Wolf",
  "Dubois",
  "Moreau",
  "Laurent",
  "Simon",
  "Michel",
  "Leroy",
  "Roux",
  "Fournier",
  "Girard",
  "Bonnet",
  "Ivanov",
  "Smirnov",
  "Popov",
  "Sokolov",
  "Volkov",
  "Morozov",
  "Kowalski",
  "Nowak",
  "Wisniewski",
  "Dvorak",
  "Horvat",
  "Kovac",
  "Jovanovic",
  "Sharma",
  "Patel",
  "Gupta",
  "Reddy",
  "Iyer",
  "Mehta",
  "Kapoor",
  "Joshi",
  "Chopra",
  "Banerjee",
  "Khan",
  "Ahmed",
  "Rahman",
  "Hussain",
  "Nasser",
  "Mansour",
  "Aziz",
  "Yilmaz",
  "Kaya",
  "Demir",
  "Celik",
  "Sahin",
  "Wang",
  "Li",
  "Zhang",
  "Chen",
  "Liu",
  "Yang",
  "Huang",
  "Zhao",
  "Sato",
  "Suzuki",
  "Takahashi",
  "Watanabe",
  "Ito",
  "Yamamoto",
  "Nakamura",
  "Kobayashi",
  "Park",
  "Choi",
  "Jung",
  "Kang",
  "Nguyen",
  "Tran",
  "Le",
  "Pham",
  "Santoso",
  "Wijaya",
  "Mensah",
  "Boateng",
  "Owusu",
  "Diallo",
  "Traore",
  "Nkosi",
  "Dlamini",
  "Mokoena",
  "Abebe",
  "Bekele",
  "Hansen",
  "Johansen",
  "Andersen",
  "Larsen",
  "Nilsson",
  "Eriksson",
  "Lindqvist",
  "Virtanen",
  "Korhonen",
  "Joensen",
  "Byrne",
  "Doyle",
  "Kelly",
  "Walsh",
  "Quinn",
  "Fitzgerald",
  "Lindgren",
  "Berg",
  "Holm",
  "Ek",
];

const CITIES = [
  "Lisbon",
  "Madrid",
  "Barcelona",
  "Paris",
  "Lyon",
  "Berlin",
  "Hamburg",
  "Munich",
  "Vienna",
  "Zurich",
  "Rome",
  "Milan",
  "Naples",
  "Amsterdam",
  "Brussels",
  "Copenhagen",
  "Stockholm",
  "Oslo",
  "Helsinki",
  "Dublin",
  "Edinburgh",
  "London",
  "Manchester",
  "Warsaw",
  "Krakow",
  "Prague",
  "Budapest",
  "Bucharest",
  "Athens",
  "Istanbul",
  "Kyiv",
  "Tbilisi",
  "Cairo",
  "Casablanca",
  "Lagos",
  "Nairobi",
  "Accra",
  "Cape Town",
  "Dubai",
  "Tel Aviv",
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Dhaka",
  "Bangkok",
  "Hanoi",
  "Jakarta",
  "Singapore",
  "Manila",
  "Hong Kong",
  "Shanghai",
  "Seoul",
  "Tokyo",
  "Osaka",
  "Sydney",
  "Melbourne",
  "Auckland",
  "Toronto",
  "Vancouver",
  "New York",
  "Chicago",
  "Austin",
  "Mexico City",
  "Bogota",
  "Lima",
  "Buenos Aires",
  "Santiago",
  "Sao Paulo",
].slice(0, 60);

const INTERESTS = [
  "hiking",
  "photography",
  "jazz",
  "retro games",
  "cooking",
  "cycling",
  "reading",
  "painting",
  "chess",
  "travel",
  "gardening",
  "running",
  "yoga",
  "films",
  "board games",
  "coffee",
  "vinyl records",
  "climbing",
  "swimming",
  "football",
  "basketball",
  "tennis",
  "dancing",
  "karaoke",
  "sailing",
  "fishing",
  "camping",
  "astronomy",
  "coding",
  "drones",
  "anime",
  "comics",
  "podcasts",
  "poetry",
  "skateboarding",
  "baking",
  "tea",
  "birdwatching",
  "aquariums",
  "knitting",
  "pottery",
  "volunteering",
  "languages",
  "meditation",
  "thrifting",
  "electronic music",
  "folk music",
  "guitar",
  "piano",
  "street food",
];

const JOBS = [
  "design",
  "healthcare",
  "teaching",
  "software",
  "logistics",
  "finance",
  "architecture",
  "hospitality",
  "journalism",
  "research",
  "retail",
  "engineering",
];
const FOODS = [
  "pasta",
  "ramen",
  "tacos",
  "pancakes",
  "sushi",
  "dumplings",
  "curry",
  "pizza",
  "falafel",
  "soup",
  "risotto",
  "empanadas",
  "bao buns",
  "paella",
];
const PLACES = [
  "the lake",
  "the old town",
  "the market",
  "the park",
  "the beach",
  "the mountains",
  "a tiny cafe",
  "the library",
  "the harbour",
  "the botanical garden",
  "the river",
];
const DAYS = [
  "on Friday",
  "on Saturday",
  "on Sunday",
  "tomorrow",
  "tonight",
  "next week",
  "this weekend",
  "after work",
];
const THINGS = [
  "a new notebook",
  "an old camera",
  "a secondhand bike",
  "a houseplant",
  "vintage headphones",
  "a good umbrella",
  "a travel mug",
  "a pair of boots",
];
const VERDICTS = [
  "Highly recommended",
  "Not bad at all",
  "Would go again",
  "Five stars",
  "Mixed feelings, honestly",
  "Totally worth it",
  "Better than I expected",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const POOLS: Record<string, readonly string[]> = {
  interest: INTERESTS,
  food: FOODS,
  place: PLACES,
  day: DAYS,
  thing: THINGS,
  verdict: VERDICTS,
  month: MONTHS,
  weekday: WEEKDAYS,
  city: CITIES,
  job: JOBS,
};

const EMOJI = [
  "🌅",
  "🌲",
  "🏔️",
  "🌊",
  "🌸",
  "🍂",
  "❄️",
  "🌙",
  "☀️",
  "🔥",
  "🎈",
  "🍕",
  "🍜",
  "☕",
  "🎸",
  "🎹",
  "📷",
  "🚲",
  "🐶",
  "🐱",
  "🦊",
  "🐢",
  "🌻",
  "🌈",
  "🚀",
  "🎨",
  "📚",
  "🏖️",
  "🗺️",
  "🍰",
];

const ABOUT_A = [
  "I love {i1} and {i2}. Based in {city}, always up for a good conversation.",
  "{i1} enthusiast, {i2} beginner. Currently living in {city}.",
  "Just a regular person from {city} who spends too much time on {i1}.",
  "Into {i1}, {i2} and {i3}. Say hi!",
  "Coffee, {i1} and long walks. {city} is home.",
  "Working in {job}, dreaming about {i1}.",
  "Moved to {city} a few years ago and found {i1} on the way.",
  "{i1} on weekdays, {i2} on weekends.",
];
const ABOUT_B = [
  "Always happy to share tips.",
  "Message me if you want to meet up.",
  "Ask me about {i2}.",
  "Not very active here, but I read everything.",
  "Looking for people to share {i1} with.",
  "I answer messages in the evening.",
  "Open to new ideas and new friends.",
  "Please be kind, I am shy.",
];

const OWN_TEXTS = [
  "Finally tried {food} at {place}. {verdict}.",
  "Anyone up for {interest} {day}? I could use some company.",
  "Can't believe it is already November. Where did the year go?",
  "New week, new goal: more {interest}, less scrolling.",
  "Spent the morning at {place}. Quiet, sunny, perfect.",
  "Just got back from {city}. What a trip.",
  "Reading about {interest} again and now I want to buy {thing}.",
  "Coffee first, then {interest}.",
  "Does anyone have a good {interest} recommendation for a beginner?",
  "Rainy {weekday} and nothing to do except {interest}.",
  "Made {food} from scratch today. The kitchen is a disaster but it was worth it.",
  "Three things that made me happy today: {food}, a long walk, and an empty inbox.",
  "I think I am becoming a morning person. Send help.",
  "Missing {city} already. Who wants to visit with me?",
  "Today I learned that {interest} is much harder than it looks.",
  "Found {thing} at the market for almost nothing.",
  "Back at {interest} after a long break. My hands remember more than I thought.",
  "Is it just me or did {weekday} last about three days?",
  "Taking a break from the screen this weekend. See you on {weekday}.",
  "Thank you all for the birthday wishes! You are the best.",
  "Big news: I finally signed up for a {interest} class!",
  "Late night thoughts: {interest} is the best excuse to meet new people.",
  "Cooked for friends yesterday. Everybody asked for the {food} recipe.",
  "Starting a small project about {interest}. More soon.",
  "The view from {place} this morning. No filter needed.",
  "Lost my keys, found them in the fridge. Do not ask.",
  "Weekend plan: {interest}, {food}, repeat.",
  "Quick poll: {interest} or {interest2}? I cannot decide.",
  "Seven days without sugar. {verdict}, but I miss cake.",
  "It is impossible to be sad while eating {food} in {place}.",
  "Proud of myself: 10 days of {interest} in a row.",
  "Is anyone else in {city} going to the market {day}?",
  "Somebody please explain why {interest} is so addictive.",
  "Slow Sunday. Tea, a book, and the window open.",
  "Just realised I have been in {city} for exactly a year. Time flies.",
];

const FRIEND_TEXTS = [
  "Happy birthday, {name}! Have a great one.",
  "{name}, did you see this? Thought of you.",
  "Thanks for yesterday, {name}! Same time next week?",
  "Miss you, {name}. Let's catch up soon.",
  "{name}, I still owe you a coffee. {day}?",
  "Congrats, {name}! So proud of you.",
  "Hey {name}, do you still have the {interest} stuff?",
  "Great seeing you {day}, {name}.",
];

const COMMUNITY_TEXTS = [
  "Who else here is into {noun}? Introduce yourself!",
  "Weekly thread: share what you did with {noun} this week.",
  "Looking for a good beginner guide to {noun}. Any ideas?",
  "Met up with a few members {day} for {noun}. Great people, will do it again.",
  "Question for the experts: what is the one mistake to avoid in {noun}?",
  "New here! I just started with {noun}, be gentle.",
  "Small reminder: be kind, and no spam. {noun} is for everyone.",
  "Anyone near {city} want to meet {day} to talk about {noun}?",
  "Found a lovely little shop for {noun} in {city}. Highly recommended.",
  "Show us your {noun} setup, I will start.",
  "Does anyone have a favourite book or video about {noun}?",
  "Month in review: what worked for you in {noun}, what did not?",
];

const COMMENTS = [
  "Love this!",
  "Haha, same here.",
  "Where was this taken?",
  "Count me in {day}!",
  "Great shot.",
  "Thanks for sharing, saving it for later.",
  "I tried {food} there last month, agree.",
  "Welcome back!",
  "This made my day.",
  "Totally agree.",
  "Ha! Classic.",
  "Which {interest} gear do you use?",
  "So jealous right now.",
  "You always find the best places.",
  "Congrats {name}!",
  "Wow, I had no idea.",
  "Same, but with {food}.",
  "Please do more of these.",
  "Needed to read this today.",
  "Let's meet {day}, I will bring {thing}.",
  "Beautiful.",
  "Nice one, {name}.",
  "I second that.",
  "Bookmarked, thanks!",
  "Not sure about that, but I respect it.",
  "This is the way.",
];

const REPOST_NOTES = [
  "This.",
  "So true.",
  "Worth a read.",
  "Saving this.",
  "Look what I found.",
  "Everyone should see this.",
  "Couldn't say it better.",
  "Interesting, thoughts?",
];
const PICTURE_CAPTIONS = [
  "Today's colours.",
  "Mood.",
  "Made this on a lazy evening.",
  "Weekend vibes.",
  "Just because.",
  "Wallpaper material.",
  "Sunset, again.",
  "Quiet corner.",
];
const LINK_NOTES = [
  "Interesting read.",
  "Worth a look.",
  "Found this, thought some of you would like it.",
  "Good one for the weekend.",
  "Bookmark this.",
  "Learned something new today.",
];
const MUSIC_NOTES = [
  "Now playing: {song} by {artist}.",
  "{song} on repeat today.",
  "Can't stop listening to {artist}. Start with {song}.",
  "If you only listen to one song this week: {song}.",
  "Throwback: {song}, {artist}.",
];
const FRIEND_MUSIC_NOTES = [
  "{name}, this one is for you: {song} by {artist}.",
  "{name}, remember {song}?",
];
const PHOTO_NOTES = [
  "New photos from {album}.",
  "A few shots from {album}.",
  "Photo dump: {album}.",
  "",
  "Look at this one!",
];

const LINKS: [string, string][] = [
  ["The complete guide to sourdough baking", "breadbasket.example.org"],
  ["Ten trails you can reach by train", "trailnotes.example.com"],
  ["Why we still love old video games", "pixelpost.example.net"],
  ["A short history of jazz in five records", "bluenote-notes.example.org"],
  ["How to start running without hurting yourself", "runclub.example.com"],
  ["The quiet joy of film photography", "grainy.example.net"],
  ["Cheap and cheerful camping gear, tested", "campfire.example.org"],
  ["What I learned from a year of journaling", "pagebyday.example.com"],
  ["Beginner chess openings that work", "knightmoves.example.net"],
  ["A city guide to the best street food", "streetbites.example.org"],
  ["Houseplants that survive anything", "greenthumb.example.com"],
  ["Learn a language with ten minutes a day", "wordsmith.example.net"],
  ["The best small museums in Europe", "museumhop.example.org"],
  ["Making coffee at home like a pro", "beanbag.example.com"],
  ["Slow travel: stay longer, see more", "slowroad.example.net"],
  ["A gentle introduction to stargazing", "nightsky.example.org"],
  ["Ten podcasts worth your commute", "earbuds.example.com"],
  ["How synths shaped modern pop", "waveform.example.net"],
  ["Pottery for absolute beginners", "claydays.example.org"],
  ["Cycling in the rain: a survival guide", "wetwheels.example.com"],
  ["Birds you can spot from your window", "feathers.example.net"],
  ["Small habits that make mornings easier", "tinyhabits.example.org"],
  ["Remote work without losing your mind", "homedesk.example.com"],
  ["Poems for a rainy afternoon", "verseline.example.net"],
  ["How to read more books this year", "bookshelf.example.org"],
  ["The ultimate board games for two", "meeplehouse.example.com"],
  ["A weekend in the mountains on a budget", "peakweek.example.net"],
  [
    "Vinyl care: what the record shop will not tell you",
    "groovecare.example.org",
  ],
];

const CHAT_TITLES = [
  "Weekend plans",
  "Book club",
  "Road trip crew",
  "Family",
  "Hiking buddies",
  "Game night",
  "Office lunch",
  "Birthday surprise",
  "Study group",
  "Football Sunday",
  "Movie night",
  "Neighbours",
  "Cooking club",
  "Band practice",
  "Photo walks",
  "Holiday planning",
  "Running group",
  "Project Atlas",
  "Flatmates",
  "Old school friends",
  "Garden swap",
  "Coffee Thursdays",
  "Trip to the coast",
  "Wedding committee",
  "Language exchange",
  "Board games",
  "Saturday market",
  "Yoga crew",
  "Dinner party",
  "Camping trip",
];

const CHAT_GREET = [
  "hey",
  "hi!",
  "hello :)",
  "good morning",
  "yo, are you around?",
  "hey, long time no see",
  "hi everyone",
  "morning!",
];
const CHAT_QUESTION = [
  "are you free {day}?",
  "did you see the photo I sent?",
  "what time works for you?",
  "where should we meet?",
  "can you bring {thing}?",
  "how was {place}?",
  "did you get my message?",
  "anyone hungry? thinking about {food}",
  "who is coming {day}?",
  "what are you up to?",
  "do you still have {thing}?",
  "fancy some {interest} {day}?",
];
const CHAT_ANSWER = [
  "yes, sounds good",
  "maybe later, I'm at work",
  "can't {day}, sorry",
  "haha no way",
  "I'll check and tell you",
  "on my way",
  "ok!",
  "perfect, see you at {place}",
  "let's do it {day}",
  "good idea",
  "thanks!",
  "no worries",
  "not sure yet",
  "give me ten minutes",
  "I'm in",
  "count me out this time",
  "sure, why not",
  "of course",
  "let me think about it",
];
const CHAT_REACT = [
  "haha",
  "lol",
  "nice!",
  "wow",
  "that's great news",
  "oh no :(",
  "I love it",
  "same",
  "true",
  "fair enough",
  "ha, classic",
  "finally!",
];
const CHAT_EXTRA = [
  "just got home",
  "running a bit late",
  "bought {food} on the way",
  "look what I found: {thing}",
  "I'll send the photos later",
  "the weather is awful",
  "back in five",
];

// blog
const BLOG_TOPICS: [string, string][] = [
  ["travel", "slow travel"],
  ["photography", "street photography"],
  ["music", "playing guitar"],
  ["cooking", "cooking from scratch"],
  ["hiking", "hiking"],
  ["gaming", "retro gaming"],
  ["books", "reading"],
  ["films", "watching old films"],
  ["cycling", "commuting by bike"],
  ["coffee", "brewing coffee at home"],
  ["gardening", "growing vegetables"],
  ["fitness", "strength training"],
  ["art", "sketching every day"],
  ["technology", "building small apps"],
  ["design", "design"],
  ["writing", "keeping a journal"],
  ["pets", "adopting a rescue dog"],
  ["running", "running a first marathon"],
  ["yoga", "morning yoga"],
  ["history", "local history"],
  ["science", "popular science"],
  ["space", "amateur astronomy"],
  ["food", "street food"],
  ["fashion", "thrifting clothes"],
  ["diy", "fixing things myself"],
  ["minimalism", "living with less"],
  ["career", "changing careers"],
  ["languages", "language learning"],
  ["nature", "birdwatching"],
  ["productivity", "slow productivity"],
];
const TITLE_TPL = [
  "5 things I learned from {act}",
  "Why {act} is worth your time",
  "A beginner's guide to {act}",
  "My honest year of {act}",
  "Notes on {act}, written on a train",
  "The small joys of {act}",
  "{Act}: what nobody tells you",
  "Lessons from a year of {act}",
  "Thoughts on {act}",
  "{Act} on a budget",
  "What {act} taught me about patience",
];
const SENT_INTRO = [
  "I have been thinking about {act} for a long time, and this month I finally sat down to write about it.",
  "Most of what I know about {act} I learned by making mistakes, so let me save you a few.",
  "A friend asked me last week how I got into {act}, and the honest answer is: by accident.",
  "This is not an expert guide, just an honest account of {act} from someone who is still learning.",
];
const SENT_MID = [
  "The first thing you notice is how much time it takes, and how little of it feels wasted.",
  "I keep a small list of rules, and the first one is to start before you feel ready.",
  "It took me three months to stop comparing myself with people who had years of practice.",
  "Cheap tools are fine at the beginning; what matters is showing up regularly.",
  "What surprised me most was how many kind people share their knowledge for free.",
  "Some days it feels like nothing works, and then one evening everything clicks.",
  "I wrote down what I spent and what I got back, and the numbers were not what I expected.",
  "Bad weather, bad mood and bad timing will all get in the way, and that is fine.",
  "Last {month} I spent a week in {city} doing exactly this, and it changed how I plan my free time.",
  "My friends laughed at first, and now half of them ask me for advice.",
  "The best part is the small ritual around it: the tea, the notebook, the same chair by the window.",
  "If you only have twenty minutes, twenty minutes is enough.",
  "I used to think {interest} had nothing to do with it, but the two feed each other.",
  "Keeping notes helped more than any book I read on the subject.",
  "There is a point where the effort turns into habit, and after that it is almost free.",
  "Do not buy everything at once; wait until the hobby tells you what it needs.",
];
const SENT_END = [
  "If you have your own story about {act}, tell me in the comments.",
  "That is all for now; next time I will write about the gear.",
  "Thanks for reading, and see you in the next post.",
  "Try it for a month and let me know how it goes.",
  "I will keep updating this as I learn more.",
];

// community topics: [name, noun]
const COMMUNITY_DEFS: [string, string][] = [
  ["Street Photography", "street photography"],
  ["Weekend Hikers", "hiking trails"],
  ["Retro Gaming Club", "retro games"],
  ["Jazz Lounge", "jazz"],
  ["Home Bakers", "bread and baking"],
  ["Indie Film Society", "independent films"],
  ["Urban Gardeners", "balcony gardening"],
  ["Trail Runners", "trail running"],
  ["Board Game Night", "board games"],
  ["Coffee Nerds", "coffee"],
  ["Vinyl Diggers", "vinyl records"],
  ["Synth Workshop", "synthesizers"],
  ["Bookworms Anonymous", "books"],
  ["Cycling Crew", "cycling"],
  ["Mountain Climbers", "climbing"],
  ["Chess Corner", "chess"],
  ["Cooking Together", "home cooking"],
  ["Travel Stories", "travel"],
  ["Pet Lovers", "pets"],
  ["Sci-Fi Readers", "science fiction"],
  ["Open Source Hangout", "open source code"],
  ["Pixel Art Club", "pixel art"],
  ["Skatepark Friends", "skateboarding"],
  ["Yoga and Calm", "yoga"],
  ["Camping Buddies", "camping"],
  ["Sketchbook Swap", "sketching"],
  ["Folk Music Circle", "folk songs"],
  ["Metalheads United", "metal"],
  ["Hip-hop Heads", "hip-hop beats"],
  ["Electronic Underground", "techno and house"],
  ["Classical Evenings", "classical concerts"],
  ["Blues Porch", "blues guitar"],
  ["Language Exchange", "languages"],
  ["Astronomy Club", "stargazing"],
  ["Film Cameras", "film cameras"],
  ["Drone Flyers", "drones"],
  ["Fishing Spot", "fishing"],
  ["Sailing Friends", "sailing"],
  ["Tea House", "tea"],
  ["Vegan Kitchen", "vegan food"],
  ["Street Food Hunters", "street food"],
  ["Maker Space", "DIY projects"],
  ["Retro Computing", "old computers"],
  ["Anime Corner", "anime"],
  ["Comics and Manga", "comics"],
  ["Podcast Club", "podcasts"],
  ["Mindful Mornings", "meditation"],
  ["Remote Workers", "remote work"],
  ["Startup Garage", "startups"],
  ["Football Fans", "football"],
  ["Basketball Courts", "basketball"],
  ["Tennis Partners", "tennis"],
  ["Swimmers", "swimming"],
  ["Dance Floor", "dancing"],
  ["Karaoke Night", "karaoke"],
  ["Thrift and Vintage", "vintage finds"],
  ["Birdwatchers", "birdwatching"],
  ["Aquarium Hobby", "aquariums"],
  ["Motorcycle Garage", "motorcycles"],
  ["Tabletop RPG", "role-playing games"],
  ["Poetry Open Mic", "poetry"],
];
const COMMUNITY_DESC = [
  "A friendly place for people who love {noun}. Share your finds, ask questions and meet others.",
  "Everything about {noun}: tips, photos, meetups and honest opinions. Beginners are very welcome.",
  "We talk about {noun} every day. Be kind, stay on topic and have fun.",
  "A small but lively group around {noun}. Weekly threads and occasional meetups.",
];

// music
const ADJ = [
  "Velvet",
  "Electric",
  "Golden",
  "Silent",
  "Broken",
  "Neon",
  "Crimson",
  "Hollow",
  "Wild",
  "Paper",
  "Midnight",
  "Lazy",
  "Burning",
  "Frozen",
  "Little",
  "Distant",
  "Rusty",
  "Gentle",
  "Dizzy",
  "Savage",
  "Lucky",
  "Fading",
  "Bitter",
  "Sleepy",
  "Cosmic",
  "Plastic",
  "Shiny",
  "Cold",
  "Restless",
  "Hidden",
  "Blue",
  "Scarlet",
  "Honest",
  "Lonely",
  "Magic",
  "Slow",
  "Heavy",
  "Tender",
  "Pale",
  "Loud",
  "Secret",
  "Young",
  "Ancient",
  "Wooden",
  "Glass",
  "Sunny",
];
const NOUN = [
  "Echo",
  "River",
  "Tiger",
  "Garden",
  "Mirror",
  "Engine",
  "Harbor",
  "Ghost",
  "Candle",
  "Compass",
  "Ocean",
  "Window",
  "Thunder",
  "Shadow",
  "Feather",
  "Lantern",
  "Orchard",
  "Signal",
  "Anchor",
  "Meadow",
  "Rocket",
  "Pilot",
  "Mountain",
  "Sparrow",
  "Circus",
  "Kingdom",
  "Desert",
  "Highway",
  "Cathedral",
  "Parade",
  "Carousel",
  "Radio",
  "Satellite",
  "Violin",
  "Furnace",
  "Letter",
  "Storm",
  "Island",
  "Diamond",
  "Lighthouse",
  "Train",
  "Bridge",
  "Fire",
  "Moon",
  "Wolf",
  "Dream",
];
const VERB = [
  "Chase",
  "Hold",
  "Follow",
  "Break",
  "Remember",
  "Forget",
  "Leave",
  "Find",
  "Catch",
  "Call",
  "Carry",
  "Burn",
  "Wake",
  "Save",
  "Drive",
  "Paint",
  "Bring",
  "Turn",
  "Take",
  "Kiss",
  "Run From",
  "Dance With",
  "Wait For",
  "Dream Of",
];
const GERUND = [
  "Dancing",
  "Falling",
  "Running",
  "Drifting",
  "Waiting",
  "Burning",
  "Sleeping",
  "Breathing",
  "Walking",
  "Singing",
  "Floating",
  "Driving",
];
const TIME = [
  "Midnight",
  "Sunday",
  "Morning",
  "Winter",
  "Summer",
  "Friday",
  "Twilight",
  "Autumn",
  "Dawn",
  "Monday",
  "Saturday",
  "Last",
];
const PLACE_W = [
  "Paris",
  "Lisbon",
  "Tokyo",
  "Berlin",
  "Memphis",
  "Havana",
  "Dublin",
  "Rio",
  "Vienna",
  "Brooklyn",
  "Nashville",
  "Kingston",
  "Marseille",
  "Oslo",
  "Detroit",
];
const NAMES_S = [
  "Maria",
  "Johnny",
  "Rosie",
  "Eddie",
  "Lola",
  "Billy",
  "Carmen",
  "Sally",
  "Jolene",
  "Frankie",
  "Delilah",
  "Mona",
  "Nico",
  "Annie",
  "Rita",
  "Tommy",
];
const SONG_TPL: ((w: Words) => string)[] = [
  (w) => `${w.adj} ${w.noun}`,
  (w) => `${w.verb} the ${w.noun}`,
  (w) => `${w.noun} of ${w.noun2}`,
  (w) => `Last ${w.noun} in ${w.place}`,
  (w) => `${w.time} ${w.noun}`,
  (w) => `Don't ${w.verb} Me`,
  (w) => `${w.place} Nights`,
  (w) => `${w.gerund} in the ${w.noun}`,
  (w) => w.adj,
  (w) => w.name,
  (w) => `Letters to ${w.name}`,
  (w) => `${w.adj} ${w.noun2} Blues`,
  (w) => `When the ${w.noun} Calls`,
  (w) => `${w.noun} and ${w.noun2}`,
  (w) => `Take Me to ${w.place}`,
  (w) => `${w.adj} Hearts`,
  (w) => `${w.name}'s ${w.noun}`,
  (w) => `The ${w.adj} ${w.noun}`,
];
const ALBUM_TPL: ((w: Words) => string)[] = [
  (w) => `${w.adj} ${w.noun}s`,
  (w) => `Songs for ${w.place}`,
  (w) => `${w.noun} Season`,
  (w) => `The ${w.noun} Sessions`,
  (w) => `Live at ${w.place}`,
  (w) => `${w.time} Hours`,
  (w) => `${w.adj} ${w.noun2}`,
  (w) => `Letters from ${w.place}`,
  (w) => `Under the ${w.noun}`,
  (w) => `A Short History of ${w.noun}s`,
];
const COUNTRIES = [
  "USA",
  "UK",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Sweden",
  "Norway",
  "Finland",
  "Ireland",
  "Netherlands",
  "Brazil",
  "Argentina",
  "Mexico",
  "Japan",
  "South Korea",
  "India",
  "Nigeria",
  "South Africa",
  "Jamaica",
  "Cuba",
  "Iceland",
  "Portugal",
  "Poland",
  "Turkey",
  "Denmark",
  "Belgium",
  "Chile",
];
const GENRE_WEIGHTS = [
  14, 14, 8, 6, 4, 3, 8, 5, 4, 3, 4, 4, 3, 5, 4, 4, 3, 5, 8, 5,
];
const GENRE_GLYPH = [
  "🎸",
  "🎤",
  "🎧",
  "🎷",
  "🎺",
  "🎻",
  "🎹",
  "💿",
  "🔊",
  "🌙",
  "🪕",
  "🤠",
  "🌴",
  "🤘",
  "⚡",
  "❤️",
  "🕺",
  "🎶",
  "🌈",
  "💃",
];

const PLAYLIST_TPL = [
  "Late night drive",
  "Gym mix",
  "Sunday morning",
  "Focus",
  "Rainy day",
  "Road trip",
  "Cooking tunes",
  "Study session",
  "Party starter",
  "Wind down",
  "Walk in the park",
  "Throwbacks",
  "New finds",
  "Coffee shop",
  "Summer vibes",
  "Workday background",
];

const ALBUM_TITLES = [
  "Summer {year}",
  "Profile photos",
  "Pets",
  "Trip to {city}",
  "Family",
  "Food",
  "Hiking",
  "Winter {year}",
  "Autumn walks",
  "Birthday {year}",
  "Weekend in {city}",
  "Spring {year}",
  "Friends",
  "Street scenes",
  "Sunsets",
  "My cat",
  "Garden",
  "Road trip",
  "Beach days",
  "Old city",
  "Concerts",
  "Screenshots",
  "Project work",
  "Holidays {year}",
  "Selfies",
  "Cooking",
  "Nature",
  "Random",
];
const ALBUM_DESCS = [
  "",
  "",
  "",
  "Some of my favourites.",
  "Taken with my phone.",
  "Just a few memories.",
  "Not sorted yet.",
  "Best of the year.",
];
const CAPTIONS = [
  "Good times.",
  "Look at that light.",
  "This was a great day.",
  "Can you guess where?",
  "Me and my friend.",
  "One more, I promise.",
  "Sunday walk.",
  "Lucky shot.",
];

// ------------------------------------------------------------------ seed

type Words = ReturnType<typeof wordSet>;
function wordSet(rng: Rng) {
  return {
    adj: rng.pick(ADJ),
    noun: rng.pick(NOUN),
    noun2: rng.pick(NOUN),
    verb: rng.pick(VERB),
    gerund: rng.pick(GERUND),
    time: rng.pick(TIME),
    place: rng.pick(PLACE_W),
    name: rng.pick(NAMES_S),
  };
}

const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const CURATED = [
  "Ann Stone",
  "Ben Reyes",
  "Chloe Martin",
  "Daniel Okafor",
  "Elena Petrova",
  "Farid Haddad",
  "Grace Kim",
  "Hugo Lambert",
  "Ines Costa",
  "Jonas Weber",
  "Kavya Nair",
  "Liam Connor",
  "Mia Tanaka",
  "Noah Fischer",
  "Olga Novak",
  "Pablo Torres",
  "Quinn Murphy",
  "Rosa Ricci",
  "Sam Adeyemi",
  "Tara Singh",
];

export function seedDb(seed = 20261104): Db {
  const rng = createRng(seed);
  const db = emptyDb();
  const NOW_S = secsOf(NOW);
  const rand = (a: number, b: number): number =>
    rng.int(Math.floor(a), Math.max(Math.floor(a), Math.floor(b)));
  /** a random second in [a, b] */
  const between = rand;
  const pow = (p: number): number => rng.next() ** p;
  const fmt = (tpl: string, ctx: Record<string, string> = {}): string =>
    tpl.replace(
      /\{(\w+)\}/g,
      (_, k: string) =>
        ctx[k] ??
        (k === "interest2" ? rng.pick(INTERESTS) : rng.pick(POOLS[k] ?? ["?"])),
    );
  const sample = (n: number, hi: number): number[] => {
    // n distinct ints in [1, hi], ascending
    n = Math.min(n, hi);
    const set = new Set<number>();
    while (set.size < n) set.add(rng.int(1, hi));
    return [...set].sort((a, b) => a - b);
  };

  // ------------------------------------------------------------- users
  const N: number = SEED_COUNTS.users;
  const hash = hashPassword(DEMO_PASSWORD);
  const userSecs: number[] = [];
  {
    const raw: number[] = [];
    for (let i = 0; i < N; i++)
      raw.push(between(NOW_S - 3 * 365 * DAY, NOW_S - 3 * DAY));
    raw.sort((a, b) => a - b);
    userSecs.push(...raw);
  }
  const usedEmails = new Set<string>([DEMO_ADMIN]);
  const usedNames = new Set<string>(["Orbit Admin", ...CURATED]);
  for (const n of CURATED)
    usedEmails.add(`${n.split(" ").map(slug).join(".")}@example.com`);
  const banned = new Set<number>();
  while (banned.size < 15) banned.add(rng.int(100, N));
  const users: User[] = [];
  for (let id = 1; id <= N; id++) {
    let name: string;
    let email: string;
    if (id === 1) {
      name = "Orbit Admin";
      email = DEMO_ADMIN;
    } else if (id <= 21) {
      name = CURATED[id - 2];
      email = `${name.split(" ").map(slug).join(".")}@example.com`;
    } else {
      let f = rng.pick(FIRST);
      let l = rng.pick(LAST);
      for (let k = 0; k < 6 && usedNames.has(`${f} ${l}`); k++) {
        f = rng.pick(FIRST);
        l = rng.pick(LAST);
      }
      name = `${f} ${l}`;
      usedNames.add(name);
      const base = `${slug(f)}.${slug(l)}`;
      email = `${base}@example.com`;
      for (let k = 2; usedEmails.has(email); k++)
        email = `${base}${k}@example.com`;
      usedEmails.add(email);
    }
    const created = userSecs[id - 1];
    const isBanned = banned.has(id);
    const lastSeen = isBanned
      ? between(created, Math.min(NOW_S, created + 90 * DAY))
      : rng.chance(0.4)
        ? between(Math.max(created, NOW_S - 2 * DAY), NOW_S)
        : between(created, NOW_S);
    const interests = rng.shuffle(INTERESTS).slice(0, rng.int(2, 6));
    const city = rng.pick(CITIES);
    const aboutA = fmt(rng.pick(ABOUT_A), {
      i1: interests[0],
      i2: interests[1],
      i3: interests[2] ?? interests[0],
      city,
    });
    const about =
      id === 1
        ? "The administrator of Orbit."
        : rng.chance(0.8)
          ? `${aboutA} ${fmt(rng.pick(ABOUT_B), { i1: interests[0], i2: interests[1] })}`
          : aboutA;
    const hue = rng.int(0, 359);
    const handle = slug(name);
    users.push({
      id,
      name,
      email,
      passwordHash: hash,
      role: id === 1 ? "admin" : id >= 22 && id <= 33 ? "moderator" : "user",
      status: isBanned ? "banned" : "active",
      avatar: gradient(
        hue,
        hue + rng.int(30, 90),
        rng.chance(0.7) ? name.charAt(0) : rng.pick(EMOJI),
      ),
      about,
      city,
      birthday: `${rng.int(1960, 2008)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
      website: rng.chance(0.08) ? `https://${handle}.example.com` : "",
      phone: rng.chance(0.85)
        ? `+${rng.pick([1, 7, 31, 33, 34, 39, 44, 49, 55, 81, 82, 91])} ${rng.int(200, 999)} ${rng.int(100, 999)} ${rng.int(1000, 9999)}`
        : "",
      interests,
      createdAt: isoOf(created),
      lastSeen: isoOf(lastSeen),
    });
  }
  db.users = users;
  const firstName = (id: number): string => users[id - 1].name.split(" ")[0];
  /** how many users were registered by second t (ids 1..result) */
  const usersBefore = (t: number): number => {
    let lo = 0;
    let hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (userSecs[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const settled = usersBefore(NOW_S - 60 * DAY); // people old enough to chat, join, own

  // ----------------------------------------------------------- friends
  const clusterOf = new Int32Array(N + 1);
  const clusters: number[][] = [];
  {
    const order = rng.shuffle(Array.from({ length: N }, (_, i) => i + 1));
    for (let i = 0; i < order.length; ) {
      const size = rng.int(15, 40);
      const c = order.slice(i, i + size);
      for (const u of c) clusterOf[u] = clusters.length;
      clusters.push(c);
      i += size;
    }
  }
  const edgeKey = (a: number, b: number): number =>
    a < b ? a * 2048 + b : b * 2048 + a;
  const edges = new Set<number>();
  const friendRows: {
    userId: number;
    friendId: number;
    status: "accepted" | "pending";
    since: number;
  }[] = [];
  const addEdge = (
    a: number,
    b: number,
    status: "accepted" | "pending",
  ): boolean => {
    if (a === b || edges.has(edgeKey(a, b))) return false;
    edges.add(edgeKey(a, b));
    const base = Math.max(userSecs[a - 1], userSecs[b - 1]);
    const since = between(base, NOW_S - 2 * DAY);
    const flip = status === "pending" ? false : rng.chance(0.5);
    friendRows.push({
      userId: flip ? b : a,
      friendId: flip ? a : b,
      status,
      since,
    });
    return true;
  };
  const near = (a: number): number => {
    const c = clusters[clusterOf[a]];
    return rng.chance(0.7) ? rng.pick(c) : rng.int(1, N);
  };
  let accepted = 0;
  for (let k = 0; k < 40 && accepted < 24; k++)
    if (addEdge(2, near(2), "accepted")) accepted++;
  while (accepted < 6000) {
    const a = rng.chance(0.3) ? rng.int(1, 150) : rng.int(1, N);
    if (addEdge(a, near(a), "accepted")) accepted++;
  }
  let pending = 0;
  for (let k = 0; k < 4; )
    if (addEdge(rng.int(3, N), 2, "pending")) pending++, k++;
  for (let k = 0; k < 2; )
    if (addEdge(2, rng.int(3, N), "pending")) pending++, k++;
  while (pending < 300) {
    const a = rng.int(1, N);
    if (addEdge(a, near(a), "pending")) pending++;
  }
  friendRows.sort((a, b) => a.since - b.since);
  const adj: { id: number; since: number }[][] = Array.from(
    { length: N + 1 },
    () => [],
  );
  db.friends = friendRows.map((r, i): Friend => {
    if (r.status === "accepted") {
      adj[r.userId].push({ id: r.friendId, since: r.since });
      adj[r.friendId].push({ id: r.userId, since: r.since });
    }
    return {
      id: i + 1,
      userId: r.userId,
      friendId: r.friendId,
      status: r.status,
      since: isoOf(r.since),
    };
  });

  // ------------------------------------------------------- communities
  const communities: Community[] = [];
  const commCreated: number[] = [];
  const nComm = SEED_COUNTS.communities;
  for (let i = 0; i < nComm; i++) {
    const [name, noun] = COMMUNITY_DEFS[i % COMMUNITY_DEFS.length];
    const ownerId = i === 0 ? 2 : rng.int(1, 500);
    const size = rng.int(20, 20 + Math.floor(280 * pow(1.8)));
    const memberSet = new Set<number>([ownerId]);
    const mods = new Set<number>();
    if (i === 1) {
      mods.add(2);
      memberSet.add(2);
    }
    if (i > 1 && i < 6) memberSet.add(2);
    const wantMods = rng.int(1, 3);
    while (memberSet.size < size) memberSet.add(rng.int(1, N));
    const pool = [...memberSet];
    while (mods.size < wantMods) {
      const m = rng.pick(pool);
      if (m !== ownerId) mods.add(m);
    }
    const members = pool.sort((a, b) => a - b);
    const contacts = new Set<number>([ownerId, ...mods]);
    if (rng.chance(0.3)) contacts.add(rng.pick(members));
    const created = between(userSecs[ownerId - 1], NOW_S - 380 * DAY);
    commCreated.push(created);
    const hue = rng.int(0, 359);
    communities.push({
      id: i + 1,
      name,
      description: fmt(rng.pick(COMMUNITY_DESC), { noun }),
      wallpaper: gradient(hue, hue + rng.int(40, 120), rng.pick(EMOJI)),
      ownerId,
      moderatorIds: [...mods].sort((a, b) => a - b),
      memberIds: members,
      contactIds: [...contacts].sort((a, b) => a - b),
      createdAt: isoOf(created),
    });
  }
  db.communities = communities;
  const commWeights = communities.map((c) => c.memberIds.length);

  // ------------------------------------------------- photo albums, photos
  const prolificOwner = (): number =>
    rng.chance(0.4) ? rng.int(2, 120) : rng.int(1, N);
  const albumDraft: { ownerId: number; t: number }[] = [];
  for (let i = 0; i < 900; i++) {
    const ownerId = prolificOwner();
    albumDraft.push({
      ownerId,
      t: between(userSecs[ownerId - 1], NOW_S - 2 * DAY),
    });
  }
  albumDraft.sort((a, b) => a.t - b.t);
  const photoAlbums: PhotoAlbum[] = albumDraft.map((a, i) => {
    const title =
      i % 7 === 0
        ? "Profile photos"
        : fmt(rng.pick(ALBUM_TITLES), { year: String(rng.int(2023, 2026)) });
    return {
      id: i + 1,
      ownerId: a.ownerId,
      title,
      description: rng.pick(ALBUM_DESCS),
      createdAt: isoOf(a.t),
    };
  });
  db.photoAlbums = photoAlbums;
  const albumT = albumDraft.map((a) => a.t);
  const photoDraft: { albumIdx: number; t: number }[] = [];
  for (let i = 0; i < photoAlbums.length; i++)
    photoDraft.push({
      albumIdx: i,
      t: between(albumT[i], Math.min(NOW_S - 3600, albumT[i] + 60 * DAY)),
    });
  for (let k = photoDraft.length; k < 3500; k++) {
    const i = Math.floor(photoAlbums.length * pow(1.3));
    photoDraft.push({
      albumIdx: i,
      t: between(albumT[i], Math.min(NOW_S - 3600, albumT[i] + 60 * DAY)),
    });
  }
  photoDraft.sort((a, b) => a.t - b.t);
  const photos: Photo[] = photoDraft.map((p, i) => {
    const hue = rng.int(0, 359);
    return {
      id: i + 1,
      albumId: p.albumIdx + 1,
      ownerId: photoAlbums[p.albumIdx].ownerId,
      src: gradient(hue, hue + rng.int(30, 110), rng.pick(EMOJI)),
      caption: rng.chance(0.25) ? rng.pick(CAPTIONS) : "",
      createdAt: isoOf(p.t),
    };
  });
  db.photos = photos;
  const photoT = photoDraft.map((p) => p.t);

  // ------------------------------------------------------------- music
  const nArt = SEED_COUNTS.artists;
  const artists: Artist[] = [];
  const artistGenres: string[][] = [];
  const artistNames = new Set<string>();
  for (let i = 0; i < nArt; i++) {
    let name = "";
    for (let tries = 0; tries < 30; tries++) {
      const w = wordSet(rng);
      const kind = rng.int(0, 7);
      name =
        kind === 0
          ? `The ${w.adj} ${w.noun}s`
          : kind === 1
            ? `${w.adj} ${w.noun}`
            : kind === 2
              ? `${rng.pick(FIRST)} ${rng.pick(LAST)}`
              : kind === 3
                ? `${w.noun} & ${w.noun2}`
                : kind === 4
                  ? `DJ ${w.noun}`
                  : kind === 5
                    ? `${w.noun} Club`
                    : kind === 6
                      ? `${rng.pick(FIRST)} and the ${w.noun}s`
                      : `${w.adj} ${w.noun2}s`;
      if (!artistNames.has(name)) break;
      if (tries === 29)
        name = `${name} ${["II", "III", "IV", "V"][rng.int(0, 3)]}`;
    }
    artistNames.add(name);
    artists.push({ id: i + 1, name, country: rng.pick(COUNTRIES) });
    const g1 = rng.weighted(GENRE_WEIGHTS);
    const g = [GENRES[g1] as string];
    if (rng.chance(0.45)) {
      const g2 = rng.weighted(GENRE_WEIGHTS);
      if (g2 !== g1) g.push(GENRES[g2]);
    }
    artistGenres.push(g);
  }
  db.artists = artists;

  // albums: every artist has one, the rest skewed
  const albumCount = new Array<number>(nArt).fill(1);
  for (let k = nArt; k < SEED_COUNTS.albums; k++)
    albumCount[Math.floor(nArt * pow(1.4))]++;
  const albums: Album[] = [];
  for (let a = 0; a < nArt; a++) {
    const used = new Set<string>();
    let year = rng.int(1966, 2022);
    for (let k = 0; k < albumCount[a]; k++) {
      let title = "";
      for (let tries = 0; tries < 30; tries++) {
        title = rng.pick(ALBUM_TPL)(wordSet(rng));
        if (!used.has(title)) break;
        if (tries === 29) title += " (Deluxe)";
      }
      used.add(title);
      const hue = rng.int(0, 359);
      albums.push({
        id: albums.length + 1,
        artistId: a + 1,
        title,
        year: Math.min(2026, year),
        cover: gradient(
          hue,
          hue + rng.int(40, 150),
          GENRE_GLYPH[
            GENRES.indexOf(artistGenres[a][0] as (typeof GENRES)[number])
          ],
        ),
      });
      year += rng.int(1, 4);
    }
  }
  db.albums = albums;

  // songs: every album has at least three
  const perAlbum = new Array<number>(albums.length).fill(3);
  for (let k = albums.length * 3; k < SEED_COUNTS.songs; k++)
    perAlbum[Math.floor(albums.length * pow(1.2))]++;
  const songs: Song[] = [];
  const songsByGenre = new Map<string, number[]>();
  const titlesOf = new Map<number, Set<string>>();
  for (let b = 0; b < albums.length; b++) {
    const al = albums[b];
    let used = titlesOf.get(al.artistId);
    if (!used) titlesOf.set(al.artistId, (used = new Set()));
    for (let k = 0; k < perAlbum[b]; k++) {
      let title = "";
      for (let tries = 0; tries < 40; tries++) {
        title = rng.pick(SONG_TPL)(wordSet(rng));
        if (!used.has(title)) break;
        if (tries === 39) title += ` (Pt. ${used.size})`;
      }
      used.add(title);
      const g = artistGenres[al.artistId - 1];
      const genre = rng.chance(0.85)
        ? g[rng.int(0, g.length - 1)]
        : rng.pick(GENRES);
      const id = songs.length + 1;
      songs.push({
        id,
        albumId: al.id,
        artistId: al.artistId,
        title,
        genre,
        duration: Math.round((rng.int(90, 420) + rng.int(120, 300)) / 2),
        year: al.year,
      });
      let list = songsByGenre.get(genre);
      if (!list) songsByGenre.set(genre, (list = []));
      list.push(id);
    }
  }
  db.songs = songs;

  // --------------------------------------------------------- playlists
  const playlistDraft: {
    ownerId: number;
    t: number;
    songIds: number[];
    title: string;
  }[] = [];
  for (let i = 0; i < SEED_COUNTS.playlists; i++) {
    const ownerId = prolificOwner();
    const n = 3 + Math.floor(57 * pow(2));
    const genre = rng.pick(GENRES);
    const bucket = songsByGenre.get(genre) ?? [];
    const set = new Set<number>();
    while (set.size < n)
      set.add(
        rng.chance(0.7) && bucket.length > n
          ? rng.pick(bucket)
          : rng.int(1, songs.length),
      );
    const themed = rng.chance(0.3);
    playlistDraft.push({
      ownerId,
      t: between(userSecs[ownerId - 1], NOW_S - 2 * DAY),
      songIds: [...set],
      title: themed ? `${genre} favourites` : rng.pick(PLAYLIST_TPL),
    });
  }
  playlistDraft.sort((a, b) => a.t - b.t);
  db.playlists = playlistDraft.map(
    (p, i): Playlist => ({
      id: i + 1,
      ownerId: p.ownerId,
      title: p.title,
      songIds: p.songIds,
      createdAt: isoOf(p.t),
    }),
  );

  // ------------------------------------------------------------- posts
  const nPosts = 4000;
  const postT: number[] = [];
  for (let i = 0; i < nPosts; i++)
    postT.push(NOW_S - 3600 - Math.floor(365 * DAY * (1 - pow(0.7))));
  postT.sort((a, b) => a - b);
  const likers = (c: number): number[] => {
    const n = Math.min(c, Math.floor(41 * pow(3.5)));
    return sample(n, c);
  };
  const pickAuthor = (c: number): number => {
    let a = rng.chance(0.3) ? rng.int(2, Math.min(c, 150)) : rng.int(1, c);
    if (users[a - 1].status === "banned" && rng.chance(0.85)) a = rng.int(1, c);
    return a;
  };
  const posts: Post[] = [];
  const KINDS: PostKind[] = [
    "text",
    "music",
    "photo",
    "picture",
    "link",
    "repost",
  ];
  const KIND_W = [55, 10, 9, 7, 8, 11];
  for (let i = 0; i < nPosts; i++) {
    const t = postT[i];
    const c = usersBefore(t);
    let kind = KINDS[rng.weighted(KIND_W)];
    let authorId = 0;
    let photoId = 0;
    if (kind === "photo") {
      let n = 0; // photos created by t
      while (n < photos.length && photoT[n] <= t) n++;
      if (n === 0) kind = "text";
      else {
        const p = photos[rng.int(0, n - 1)];
        photoId = p.id;
        authorId = p.ownerId;
      }
    }
    if (!authorId) authorId = pickAuthor(c);
    let wallId = authorId;
    let communityId = 0;
    let friendName = "";
    let commNoun = "";
    if (kind !== "photo") {
      const r = rng.next();
      if (r >= 0.65 && r < 0.8) {
        const friends = adj[authorId].filter((f) => f.since <= t);
        if (friends.length) {
          wallId = rng.pick(friends).id;
          friendName = firstName(wallId);
          if (kind === "repost") kind = "text";
        }
      } else if (r >= 0.8) {
        const ci = rng.weighted(commWeights);
        if (commCreated[ci] < t) {
          const members = communities[ci].memberIds;
          for (let k = 0; k < 10; k++) {
            const m = rng.pick(members);
            if (userSecs[m - 1] <= t) {
              authorId = m;
              communityId = ci + 1;
              wallId = 0;
              commNoun = COMMUNITY_DEFS[ci % COMMUNITY_DEFS.length][1];
              break;
            }
          }
        }
      }
    }
    const author = users[authorId - 1];
    const ctx: Record<string, string> = {
      name: friendName,
      city: author.city,
      interest: rng.pick(author.interests),
      noun: commNoun,
    };
    const post: Post = {
      id: i + 1,
      authorId,
      wallId,
      communityId,
      kind,
      text: "",
      songId: 0,
      photoId,
      picture: "",
      url: "",
      linkTitle: "",
      repostOf: 0,
      createdAt: isoOf(t),
      likeIds: likers(c),
    };
    if (kind === "text") {
      post.text = communityId
        ? fmt(rng.pick(COMMUNITY_TEXTS), ctx)
        : friendName
          ? fmt(rng.pick(FRIEND_TEXTS), ctx)
          : fmt(rng.pick(OWN_TEXTS), ctx);
    } else if (kind === "music") {
      const s = songs[rng.int(0, songs.length - 1)];
      post.songId = s.id;
      const tpl = friendName
        ? rng.pick(FRIEND_MUSIC_NOTES)
        : rng.pick(MUSIC_NOTES);
      post.text = fmt(tpl, {
        ...ctx,
        song: s.title,
        artist: artists[s.artistId - 1].name,
      });
    } else if (kind === "photo") {
      const alb = photoAlbums[photos[photoId - 1].albumId - 1];
      post.text = fmt(rng.pick(PHOTO_NOTES), { album: alb.title });
    } else if (kind === "picture") {
      const hue = rng.int(0, 359);
      post.picture = gradient(hue, hue + rng.int(40, 140), rng.pick(EMOJI));
      post.text = rng.chance(0.5) ? rng.pick(PICTURE_CAPTIONS) : "";
    } else if (kind === "link") {
      const [title, domain] = rng.pick(LINKS);
      post.url = `https://${domain}/${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`;
      post.linkTitle = title;
      post.text = rng.chance(0.6) ? rng.pick(LINK_NOTES) : "";
    } else {
      for (let k = 0; k < 15 && !post.repostOf; k++) {
        if (i === 0) break;
        const o = posts[rng.int(0, i - 1)];
        if (o.authorId !== authorId && o.kind !== "repost")
          post.repostOf = o.id;
      }
      if (!post.repostOf) {
        post.kind = "text";
        post.text = fmt(rng.pick(OWN_TEXTS), ctx);
      } else post.text = rng.chance(0.5) ? rng.pick(REPOST_NOTES) : "";
    }
    posts.push(post);
  }
  db.posts = posts;

  // ---------------------------------------------------------- comments
  const cum: number[] = [];
  {
    let sum = 0;
    for (let i = 0; i < nPosts; i++) {
      sum += 0.05 + pow(3);
      cum.push(sum);
    }
  }
  const commentDraft: { postIdx: number; authorId: number; t: number }[] = [];
  for (let k = 0; k < 8000; k++) {
    const x = rng.next() * cum[nPosts - 1];
    let lo = 0;
    let hi = nPosts - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    const t0 = postT[lo];
    const delay = Math.floor(-Math.log(1 - rng.next()) * 2 * DAY) + 60;
    commentDraft.push({
      postIdx: lo,
      authorId: rng.int(1, usersBefore(t0)),
      t: Math.min(NOW_S - 30, t0 + delay),
    });
  }
  commentDraft.sort((a, b) => a.t - b.t);
  db.comments = commentDraft.map((d, i): Comment => {
    const p = posts[d.postIdx];
    const target = p.wallId || p.authorId;
    return {
      id: i + 1,
      postId: p.id,
      authorId: d.authorId,
      text: fmt(rng.pick(COMMENTS), {
        name: firstName(p.authorId === d.authorId ? target : p.authorId),
      }),
      createdAt: isoOf(d.t),
    };
  });

  // ---------------------------------------------------------- articles
  const articleDraft: { authorId: number; t: number }[] = [];
  for (let i = 0; i < 1200; i++) {
    const authorId = prolificOwner();
    articleDraft.push({
      authorId,
      t: between(
        Math.max(userSecs[authorId - 1], NOW_S - 730 * DAY),
        NOW_S - 3600,
      ),
    });
  }
  articleDraft.sort((a, b) => a.t - b.t);
  db.articles = articleDraft.map((d, i): Article => {
    const [mainTag, act] = rng.pick(BLOG_TOPICS);
    const ctx = { act, tag: mainTag, Act: cap(act) };
    const title = fmt(rng.pick(TITLE_TPL), ctx);
    const paragraphs: string[] = [];
    const midPool = rng.shuffle(SENT_MID);
    const nPar = rng.int(2, 4);
    for (let p = 0; p < nPar; p++) {
      const sents: string[] = [];
      if (p === 0) sents.push(fmt(rng.pick(SENT_INTRO), ctx));
      for (let k = rng.int(2, 4); k > 0; k--)
        sents.push(fmt(midPool.pop() as string, ctx));
      if (p === nPar - 1) sents.push(fmt(rng.pick(SENT_END), ctx));
      paragraphs.push(sents.join(" "));
    }
    const tags = [mainTag];
    const extra = rng.int(0, 3);
    for (let k = 0; k < extra; k++) {
      const t = rng.pick(BLOG_TOPICS)[0];
      if (!tags.includes(t)) tags.push(t);
    }
    const hue = rng.int(0, 359);
    return {
      id: i + 1,
      authorId: d.authorId,
      title,
      body: paragraphs.join("\n\n"),
      tags,
      cover: gradient(hue, hue + rng.int(40, 140), rng.pick(EMOJI)),
      createdAt: isoOf(d.t),
      likeIds: likers(usersBefore(d.t)),
    };
  });

  // ----------------------------------------------- conversations, chats
  const pairKey = (a: number, b: number): number =>
    a < b ? a * 2048 + b : b * 2048 + a;
  const dmPairs = new Set<number>();
  const convDraft: {
    kind: "dm" | "chat";
    members: number[];
    title: string;
    t: number;
  }[] = [];
  const addDm = (a: number, b: number): boolean => {
    if (a === b || dmPairs.has(pairKey(a, b))) return false;
    dmPairs.add(pairKey(a, b));
    convDraft.push({ kind: "dm", members: [a, b], title: "", t: 0 });
    return true;
  };
  for (let k = 0; k < 5; ) if (addDm(2, rng.int(3, settled))) k++;
  for (let k = 0; k < 2; ) if (addDm(1, rng.int(2, settled))) k++;
  for (let n = convDraft.length; n < 800; ) {
    const a = rng.int(1, settled);
    const fr = adj[a];
    const b =
      fr.length && rng.chance(0.7) ? rng.pick(fr).id : rng.int(1, settled);
    if (b <= settled && addDm(a, b)) n++;
  }
  for (let k = 0; k < 400; k++) {
    const size = rng.int(3, 12);
    const set = new Set<number>(k < 2 ? [2] : []);
    while (set.size < size) set.add(rng.int(1, settled));
    convDraft.push({
      kind: "chat",
      members: rng.shuffle([...set]),
      title:
        k < 30
          ? CHAT_TITLES[k]
          : `${rng.pick(CHAT_TITLES)} ${rng.pick(["", "2", "(old)", "again", "2026"])}`.trim(),
      t: 0,
    });
  }
  for (const d of convDraft) {
    const lo = Math.max(
      ...d.members.map((m) => userSecs[m - 1]),
      NOW_S - 365 * DAY,
    );
    d.t = between(lo, NOW_S - 2 * DAY);
  }
  convDraft.sort((a, b) => a.t - b.t);
  db.conversations = convDraft.map(
    (d, i): Conversation => ({
      id: i + 1,
      kind: d.kind,
      title: d.title,
      memberIds: d.members,
      createdAt: isoOf(d.t),
    }),
  );
  // message counts: at least 3 each, the rest by weight
  const nConv = convDraft.length;
  const weights = convDraft.map(
    (d) => pow(2) * (d.kind === "chat" ? 2.5 : 1) + 0.02,
  );
  const wsum = weights.reduce((a, b) => a + b, 0);
  const nMsg = 12000;
  const counts = weights.map(
    (w) => 3 + Math.floor(((nMsg - 3 * nConv) * w) / wsum),
  );
  for (let rest = nMsg - counts.reduce((a, b) => a + b, 0); rest > 0; rest--)
    counts[rng.int(0, nConv - 1)]++;
  const msgDraft: {
    conv: number;
    authorId: number;
    t: number;
    text: string;
    order: number;
  }[] = [];
  for (let ci = 0; ci < nConv; ci++) {
    const d = convDraft[ci];
    const n = counts[ci];
    const gaps: number[] = [];
    let total = 0;
    for (let k = 0; k < n; k++) {
      const g =
        k === 0
          ? rng.int(60, 3600)
          : rng.chance(0.75)
            ? rng.int(15, 600)
            : rng.int(1800, 3 * DAY);
      gaps.push(g);
      total += g;
    }
    const room = NOW_S - 60 - d.t;
    const scale = total > room ? room / total : 1;
    let t = d.t;
    let author = rng.pick(d.members);
    const ctx = { day: rng.pick(DAYS), place: rng.pick(PLACES) };
    for (let k = 0; k < n; k++) {
      t += Math.max(1, Math.floor(gaps[k] * scale));
      if (k > 0 && (d.kind === "chat" || rng.chance(0.75))) {
        const prev = author;
        author = rng.pick(d.members);
        if (d.kind === "dm" && author === prev)
          author = d.members[0] === prev ? d.members[1] : d.members[0];
      }
      const r = k === 0 ? 0 : rng.weighted([0, 25, 40, 20, 15]);
      const pool = [
        CHAT_GREET,
        CHAT_QUESTION,
        CHAT_ANSWER,
        CHAT_REACT,
        CHAT_EXTRA,
      ][r];
      msgDraft.push({
        conv: ci + 1,
        authorId: author,
        t: Math.min(t, NOW_S - 30),
        text: fmt(rng.pick(pool), rng.chance(0.5) ? ctx : {}),
        order: msgDraft.length,
      });
    }
  }
  msgDraft.sort((a, b) => a.t - b.t || a.order - b.order);
  db.messages = msgDraft.map(
    (m, i): Message => ({
      id: i + 1,
      conversationId: m.conv,
      authorId: m.authorId,
      text: m.text,
      createdAt: isoOf(m.t),
    }),
  );

  // ------------------------------------------------------------ scores
  const scoreDraft: {
    userId: number;
    game: (typeof GAMES)[number];
    score: number;
    t: number;
  }[] = [];
  for (let i = 0; i < 300; i++) {
    const userId = rng.chance(0.25) ? rng.int(2, 40) : rng.int(1, N);
    const game = rng.pick(GAMES);
    const score =
      game === "snake"
        ? rng.int(1, 60) * 10
        : game === "pacman"
          ? rng.int(5, 400) * 50
          : rng.int(2, 600) * 100;
    scoreDraft.push({
      userId,
      game,
      score,
      t: between(
        Math.max(userSecs[userId - 1], NOW_S - 365 * DAY),
        NOW_S - 600,
      ),
    });
  }
  scoreDraft.sort((a, b) => a.t - b.t);
  db.scores = scoreDraft.map(
    (s, i): Score => ({
      id: i + 1,
      userId: s.userId,
      game: s.game,
      score: s.score,
      at: isoOf(s.t),
    }),
  );

  db.session = [];
  return db;
}
