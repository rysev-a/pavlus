import { type Children, Component } from "@pavlus/frontend";
import {
  type BookingState,
  part as bookingCalendar,
  bookingState,
} from "../../blocks/booking-calendar/booking-calendar.ts";
import {
  type GalleryState,
  part as gallery,
  galleryState,
  type Photo,
  type Shape,
} from "../../blocks/gallery/gallery.ts";
import type { LinkItem } from "../../blocks/link-list/link-list.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import view from "./photographer-portfolio.pavlus";

export interface PhotographerState {
  brand: string;
  nav: NavLink[];
  headline: string;
  bio: string;
  gallery: GalleryState;
  booking: BookingState;
  aboutTitle: string;
  about: string[];
  numbers: { value: string; label: string }[];
  contacts: LinkItem[];
}

const photo = (
  key: string,
  title: string,
  caption: string,
  category: string,
  tone: number,
  shape: Shape,
  emoji: string,
): Photo => ({ key, title, caption, category, tone, shape, emoji });

const photos: Photo[] = [
  photo(
    "w1",
    "First dance",
    "Sofia and Tiago, Lisbon",
    "weddings",
    3,
    "tall",
    "💃",
  ),
  photo(
    "t1",
    "Morning fog",
    "Douro valley, Portugal",
    "travel",
    2,
    "pano",
    "🌄",
  ),
  photo(
    "p1",
    "Studio light",
    "Portrait of Ines",
    "portraits",
    5,
    "square",
    "🧑‍🎨",
  ),
  photo(
    "w2",
    "Garden vows",
    "Quinta da Regaleira, Sintra",
    "weddings",
    0,
    "wide",
    "💍",
  ),
  photo("e1", "Opening night", "Teatro Aberto", "events", 4, "wide", "🎭"),
  photo("t2", "Rooftops", "Porto at golden hour", "travel", 1, "tall", "🏙️"),
  photo(
    "p2",
    "Quiet hands",
    "A potter in Alentejo",
    "portraits",
    6,
    "tall",
    "🏺",
  ),
  photo(
    "w3",
    "The long table",
    "Dinner under the olive trees",
    "weddings",
    7,
    "wide",
    "🍷",
  ),
  photo("e2", "Encore", "Jazz festival, Cascais", "events", 5, "square", "🎷"),
  photo("t3", "Salt flats", "Rio Maior at dawn", "travel", 3, "wide", "🧂"),
  photo(
    "p3",
    "Family, three generations",
    "Sunday in Évora",
    "portraits",
    0,
    "wide",
    "👨‍👩‍👧",
  ),
  photo("w4", "Confetti", "Leaving the chapel", "weddings", 4, "square", "🎊"),
  photo(
    "e3",
    "Launch party",
    "Startup anniversary, LX Factory",
    "events",
    2,
    "tall",
    "🥂",
  ),
  photo("t4", "Lighthouse", "Cabo da Roca", "travel", 7, "tall", "🗼"),
  photo(
    "p4",
    "The violinist",
    "Backstage portrait",
    "portraits",
    1,
    "square",
    "🎻",
  ),
  photo(
    "e4",
    "Marathon finish",
    "Lisbon Half, 21 km",
    "events",
    6,
    "pano",
    "🏃",
  ),
];

export const initial: PhotographerState = {
  brand: "Lucia Ferreira",
  nav: [
    { label: "Gallery", href: "#gallery" },
    { label: "Booking", href: "#booking" },
    { label: "About", href: "#about" },
    { label: "Contact", href: "#contact" },
  ],
  headline: "Light, honestly kept.",
  bio: "I photograph weddings, people and places the way they felt, not the way they posed. Based in Lisbon, working wherever the light is good.",
  gallery: galleryState(photos, {
    weddings: "Weddings",
    portraits: "Portraits",
    travel: "Travel",
    events: "Events",
  }),
  booking: bookingState("2026-11-03"),
  aboutTitle: "Fourteen years behind the lens.",
  about: [
    "I came to photography from journalism, and I still work like a reporter: arrive early, stay quiet, and wait for the moment that tells the story.",
    "Every session ends with a private online gallery, and every wedding with a printed album made from the photographs you picked.",
  ],
  numbers: [
    { value: "240", label: "weddings photographed" },
    { value: "38", label: "countries visited" },
    { value: "7 days", label: "to your first gallery" },
  ],
  contacts: [
    {
      title: "lucia@ferreira.photo",
      note: "Bookings, prints and press",
      href: "mailto:lucia@ferreira.photo",
    },
    {
      title: "Instagram",
      note: "Behind the scenes",
      href: "https://instagram.com/",
    },
    {
      title: "Print shop",
      note: "Signed prints on cotton paper",
      href: "https://example.com/prints",
    },
  ],
};

/** The gallery and the booking calendar are children with their own state. */
export class PhotographerPortfolio extends Component<PhotographerState> {
  view = view;

  children: Children<PhotographerState> = {
    gallery: { component: gallery, key: "gallery" },
    booking: { component: bookingCalendar, key: "booking" },
  };
}

export const page = new PhotographerPortfolio();
