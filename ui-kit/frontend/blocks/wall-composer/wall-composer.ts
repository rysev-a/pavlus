import { Component } from "@service-laboratory/pavlus";
import view from "./wall-composer.pavlus";

const kinds = (active: string) =>
  [
    ["text", "Message"],
    ["music", "Music"],
    ["photo", "Photo"],
    ["picture", "Picture"],
    ["link", "Link"],
  ].map(([id, label]) => ({ id, label, active: id === active }));

const base = {
  text: "",
  placeholder: "Add a few words (optional)",
  error: "",
  canSend: false,
  songQuery: "",
  songs: [] as {
    id: number;
    title: string;
    artist: string;
    selected: boolean;
  }[],
  pickedSong: "",
  hasSearch: false,
  photos: [],
  noPhotos: false,
  pictures: [] as {
    i: number;
    style: string;
    glyph: string;
    selected: boolean;
  }[],
  url: "",
  linkTitle: "",
};

export const initial = {
  music: {
    ...base,
    kinds: kinds("music"),
    kind: "music",
    songQuery: "blue",
    hasSearch: true,
    pickedSong: "Blue Hours - The Night Owls",
    canSend: true,
    songs: [
      { id: 1, title: "Blue Hours", artist: "The Night Owls", selected: true },
      {
        id: 2,
        title: "Blue Monday Again",
        artist: "Kilo Mike",
        selected: false,
      },
    ],
  },
  picture: {
    ...base,
    kinds: kinds("picture"),
    kind: "picture",
    pictures: [
      {
        i: 0,
        style:
          "background: linear-gradient(135deg, hsl(20 70% 55%), hsl(340 70% 42%))",
        glyph: "🌅",
        selected: true,
      },
      {
        i: 1,
        style:
          "background: linear-gradient(135deg, hsl(200 70% 55%), hsl(240 70% 42%))",
        glyph: "🌊",
        selected: false,
      },
      {
        i: 2,
        style:
          "background: linear-gradient(135deg, hsl(120 70% 55%), hsl(160 70% 42%))",
        glyph: "🌲",
        selected: false,
      },
    ],
  },
};

export class WallComposerPage extends Component<typeof initial> {
  view = view;
}
export const page = new WallComposerPage();
