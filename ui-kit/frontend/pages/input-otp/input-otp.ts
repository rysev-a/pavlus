import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./input-otp.pavlus";

const LENGTH = 6;

export interface OtpState {
  code: string;
  /** Derived from `code`: one slot per digit, filled from the left. */
  slots: { index: number; char: string }[];
  complete: boolean;
}

const slotsOf = (code: string) =>
  Array.from({ length: LENGTH }, (_, index) => ({
    index,
    char: code[index] ?? "",
  }));

export const initial: OtpState = {
  code: "",
  slots: slotsOf(""),
  complete: false,
};

export class InputOtp extends Component<OtpState> {
  view = view;

  change(msg: Message): Effect[] {
    const code = (msg.event?.value ?? "").replace(/\D/g, "").slice(0, LENGTH);
    return [
      store.set("code", code),
      store.set("slots", slotsOf(code)),
      store.set("complete", code.length === LENGTH),
    ];
  }
}

export const page = new InputOtp();
