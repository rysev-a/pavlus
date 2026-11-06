import { Component } from "@pavlus/frontend";
import view from "./song-table.pavlus";

const row = (
  n: number,
  title: string,
  artist: string,
  album: string,
  genre: string,
  year: number,
  length: string,
) => ({
  key: n,
  id: n,
  pos: n - 1,
  n,
  title,
  artist,
  artistId: n,
  album,
  albumId: n,
  genre,
  year,
  length,
  current: n === 2,
  playing: n === 2,
  first: n === 1,
  last: n === 4,
});

export interface SongTableState {
  library: Record<string, unknown>;
  playlist: Record<string, unknown>;
}

const rows = [
  row(
    1,
    "Glass Harbour",
    "Nova Lindqvist",
    "Low Tide Letters",
    "Indie",
    2019,
    "3:34",
  ),
  row(
    2,
    "Paper Lanterns",
    "The Quiet Orchard",
    "Small Hours",
    "Folk",
    2021,
    "3:07",
  ),
  row(
    3,
    "Midnight Tram to Oslo",
    "Halden",
    "Night Lines",
    "Ambient",
    2018,
    "4:03",
  ),
  row(4, "Copper Sun", "Ines Marquez", "Salt & Honey", "Latin", 2022, "3:18"),
];

export const initial: SongTableState = {
  library: {
    rows,
    showNumber: false,
    showAlbum: true,
    showGenre: true,
    showYear: true,
    sortable: true,
    sortKey: "title",
    sortDir: "asc",
    canEdit: false,
    empty: "No songs",
  },
  playlist: {
    rows,
    showNumber: true,
    showAlbum: true,
    showGenre: false,
    showYear: false,
    sortable: false,
    sortKey: "",
    sortDir: "asc",
    canEdit: true,
    empty: "The playlist is empty",
  },
};

export class SongTablePage extends Component<SongTableState> {
  view = view;
}

export const page = new SongTablePage();
