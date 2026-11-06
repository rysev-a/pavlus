// The section library ("Tilda blocks"): ready-made sections, each with its own
// 12-column grid. Adding one may add the state keys it needs.
import { builder, http, key, notice, withKeys } from "./build.ts";
import type { Model, Section, SectionKind } from "./model.ts";

const SALES = JSON.stringify([
  { label: "Jan", value: 12 },
  { label: "Feb", value: 19 },
  { label: "Mar", value: 15 },
  { label: "Apr", value: 24 },
]);
const ROWS = JSON.stringify([
  { id: 1, name: "Ada", role: "Engineer" },
  { id: 2, name: "Linus", role: "Maintainer" },
  { id: 3, name: "Grace", role: "Admiral" },
]);

/** A new section of `kind` (and the model with the keys it needs). */
export function makeSection(
  m: Model,
  kind: SectionKind,
): { model: Model; section: Section } {
  const b = builder(m.seq);
  let model = m;
  let section: Section;
  switch (kind) {
    case "hero":
      section = b.section(
        "hero",
        "Hero",
        [
          b.el("heading", 1, 1, 7, 2, {
            text: "Build something people love",
            level: "1",
          }),
          b.el("text", 1, 3, 6, 2, {
            text: "One short line that explains what you do and why it matters.",
          }),
          b.el("button", 1, 5, 3, 1, { text: "Get started" }),
          b.el("link", 4, 5, 3, 1, { text: "Learn more" }),
          b.el(
            "image",
            8,
            1,
            4,
            5,
            { alt: "Product picture" },
            { hide: { mobile: true } },
          ),
        ],
        { rows: 7, bg: "muted", pad: "lg" },
      );
      break;
    case "features":
      section = b.section(
        "features",
        "Features",
        [
          b.el(
            "heading",
            0,
            0,
            12,
            1,
            { text: "Why it works", level: "2" },
            { style: { align: "center" } },
          ),
          b.el("card", 0, 1, 4, 3, {
            title: "Fast",
            text: "Loads in a blink.",
          }),
          b.el("card", 4, 1, 4, 3, {
            title: "Simple",
            text: "Nothing to learn.",
          }),
          b.el("card", 8, 1, 4, 3, {
            title: "Yours",
            text: "Change every part.",
          }),
        ],
        { rows: 4, pad: "md" },
      );
      break;
    case "pricing":
      model = withKeys(model, [
        key(
          "plans",
          "json",
          JSON.stringify([
            { name: "Free", price: "$0", note: "For a try" },
            { name: "Team", price: "$12", note: "Per seat" },
            { name: "Company", price: "$49", note: "Per seat" },
          ]),
        ),
      ]);
      section = b.section(
        "pricing",
        "Pricing",
        [
          b.el(
            "heading",
            0,
            0,
            12,
            1,
            { text: "Pricing", level: "2" },
            { style: { align: "center" } },
          ),
          b.el("repeater", 0, 1, 12, 4, {
            source: "state.plans",
            title: "{item.name} {item.price}",
            text: "{item.note}",
            footer: "Choose",
          }),
        ],
        { rows: 5, bg: "muted" },
      );
      break;
    case "form":
      model = withKeys(model, [
        key("lead", "json", '{"name":"","email":"","message":""}'),
        key("leadErrors", "json", "{}"),
        key("sending", "boolean", "false"),
      ]);
      section = b.section(
        "form",
        "Contact form",
        [
          b.el(
            "heading",
            3,
            0,
            6,
            1,
            { text: "Talk to us", level: "2" },
            { style: { align: "center" } },
          ),
          b.el(
            "form",
            3,
            1,
            6,
            8,
            {
              title: "Contact",
              submitLabel: "Send",
              errorsKey: "leadErrors",
              okText: "Thanks, {state.lead.name}!",
            },
            {
              bind: "lead",
              fields: [
                {
                  name: "name",
                  label: "Name",
                  type: "text",
                  required: "yes",
                  minLength: "2",
                  maxLength: "",
                  min: "",
                  max: "",
                  pattern: "",
                  message: "",
                  options: "",
                },
                {
                  name: "email",
                  label: "Email",
                  type: "email",
                  required: "yes",
                  minLength: "",
                  maxLength: "",
                  min: "",
                  max: "",
                  pattern: "",
                  message: "",
                  options: "",
                },
                {
                  name: "message",
                  label: "Message",
                  type: "textarea",
                  required: "no",
                  minLength: "10",
                  maxLength: "200",
                  min: "",
                  max: "",
                  pattern: "",
                  message: "",
                  options: "",
                },
              ],
              events: {
                submit: [
                  http("POST", "/api/leads", {
                    body: "state.lead",
                    loadingKey: "sending",
                    then: [notice("Sent")],
                    catch: [notice("Could not send: {error}")],
                  }),
                ],
              },
            },
          ),
        ],
        { rows: 9, pad: "md" },
      );
      break;
    case "table":
      model = withKeys(model, [
        key("rows", "json", ROWS),
        key("q", "string", ""),
      ]);
      section = b.section(
        "table",
        "Data table",
        [
          b.el("heading", 0, 0, 6, 1, { text: "People", level: "2" }),
          b.el(
            "input",
            8,
            0,
            4,
            2,
            { label: "Search", placeholder: "Type a name" },
            { bind: "q" },
          ),
          b.el("table", 0, 2, 12, 6, {
            source: "state.rows",
            columns: "id, name, role",
            filter: "contains(row.name, state.q)",
            pageSize: "5",
          }),
        ],
        { rows: 8 },
      );
      break;
    case "dashboard":
      model = withKeys(model, [key("sales", "json", SALES)]);
      section = b.section(
        "dashboard",
        "Dashboard",
        [
          b.el("kpi", 0, 0, 4, 2, {
            label: "Total",
            value: '{sum(state.sales, "value")}',
            delta: "all months",
          }),
          b.el("kpi", 4, 0, 4, 2, {
            label: "Best month",
            value: '{max(state.sales, "value")}',
          }),
          b.el("kpi", 8, 0, 4, 2, {
            label: "Months",
            value: "{len(state.sales)}",
          }),
          b.el("chart", 0, 2, 7, 6, {
            kind: "bar",
            title: "Sales",
            source: "state.sales",
          }),
          b.el("chart", 7, 2, 5, 6, {
            kind: "pie",
            title: "Share",
            source: "state.sales",
          }),
        ],
        { rows: 8 },
      );
      break;
    case "footer":
      section = b.section(
        "footer",
        "Footer",
        [
          b.el("text", 0, 0, 8, 1, { text: "Made with the Visual Builder." }),
          b.el("link", 8, 0, 2, 1, { text: "Terms" }),
          b.el("link", 10, 0, 2, 1, { text: "Privacy" }),
        ],
        { rows: 1, bg: "secondary", pad: "sm" },
      );
      break;
    default:
      section = b.section("empty", "Section", [], { rows: 4 });
  }
  return { model: { ...model, seq: b.seq() }, section };
}
