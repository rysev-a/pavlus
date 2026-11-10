import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./input-otp.pavlus";

const LENGTH = 6;

export interface OtpState {
  code: string;
  /** Derived from `code` — see `derive`. */
  slots: { index: number; char: string }[];
  complete: boolean;
  stateLabel: string;
  codeLabel: string;
}

/** Everything that follows from the code — the one place. */
function derive(code: string): Omit<OtpState, "code"> {
  return {
    slots: Array.from({ length: LENGTH }, (_, index) => ({
      index,
      char: code[index] ?? "",
    })),
    complete: code.length === LENGTH,
    stateLabel: code.length === LENGTH ? "Code complete: " : "Typed: ",
    codeLabel: code || "nothing",
  };
}

export const initial: OtpState = { code: "", ...derive("") };

export class InputOtp extends Component<OtpState> {
  view = view;

  change(msg: Message): Effect[] {
    const code = (msg.event?.value ?? "").replace(/\D/g, "").slice(0, LENGTH);
    return [
      store.set("code", code),
      ...Object.entries(derive(code)).map(([k, v]) => store.set(k, v)),
    ];
  }
}

export const page = new InputOtp();
