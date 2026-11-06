// The plugin mailer: sends the receipts of the orders. It talks to Mail server.
// A stub made from the manifest of the design: replace the TODOs with the real client.
import type { Plugin } from "@service-laboratory/pavlus";

export type MailerEffect = {
  plugin: "mailer";
  type: "send";
  detail: string;
  replyTo?: string;
  onError?: string;
  ctx?: { rid?: string };
};

export const mailerEffector = {
  /** send an email */
  send: (detail: string) =>
    ({ plugin: "mailer", type: "send", detail }) as MailerEffect,
};

export function createMailerPlugin(): Plugin<MailerEffect, unknown> {
  return {
    name: "mailer",
    handle(effect, ctx) {
      switch (effect.type) {
        case "send":
          // TODO: send an email (talks to Mail server)
          console.log("[mailer] send:", effect.detail);
          return;
          return;
      }
    },
  };
}
