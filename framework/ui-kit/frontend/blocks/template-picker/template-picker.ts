import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./template-picker.pavlus";
import {
  type TemplateDef,
  type TemplateOption,
  templateOptions,
} from "./templates.ts";

export const LAYOUTS: TemplateDef[] = [
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Banner, a few paragraphs and one button.",
  },
  {
    id: "promo",
    name: "Promo",
    description: "A big centered offer with a single call to action.",
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "Plain text with a bar on the left.",
  },
];

export interface TemplatePickerState {
  options: TemplateOption[];
  message: string;
}

export const initial: TemplatePickerState = {
  options: templateOptions(LAYOUTS, "newsletter"),
  message: "Newsletter is selected.",
};

export class TemplatePickerPage extends Component<TemplatePickerState> {
  view = view;

  "picker.pick"(msg: Message): Effect[] {
    const id = msg.payload as string;
    return patch({
      options: templateOptions(LAYOUTS, id),
      message: `${id} is selected.`,
    });
  }
}

export const page = new TemplatePickerPage();
