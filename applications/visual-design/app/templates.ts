// What a new project starts from: the two documents, the diagram and the interface
// (wired to it: the interface is the front desk of that diagram's backend).
import { demoOf as flowDemo } from "../../../framework/ui-kit/frontend/templates/flow-studio/demos.ts";
import {
  emptyModel as emptyFlow,
  projectText as flowText,
} from "../../../framework/ui-kit/frontend/templates/flow-studio/model.ts";
import { coffeeUi } from "../../../framework/ui-kit/frontend/templates/visual-builder/demo-coffee.ts";
import { usersUi } from "../../../framework/ui-kit/frontend/templates/visual-builder/demo-users.ts";
import { projectText as uiText } from "../../../framework/ui-kit/frontend/templates/visual-builder/io.ts";
import { emptyModel as emptyUi } from "../../../framework/ui-kit/frontend/templates/visual-builder/model.ts";

export type TemplateId = "blank" | "users" | "coffee";

export interface Template {
  id: TemplateId;
  title: string;
  about: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    title: "Blank",
    about: "An empty diagram and an empty page: draw the data flow first.",
  },
  {
    id: "users",
    title: "Users CRUD",
    about:
      "The simplest whole example: a table of users loaded from the backend, and create, update and remove. A diagram of four routes over one table, and one page wired to it.",
  },
  {
    id: "coffee",
    title: "Coffee shop CRM",
    about:
      "Customers with loyalty points, the menu, orders and a dashboard: the diagram of the backend and the front desk wired to it.",
  },
];

export const isTemplate = (v: unknown): v is TemplateId =>
  TEMPLATES.some((t) => t.id === v);

/** the documents of a new project */
export function docsOf(
  template: TemplateId,
  name: string,
): { flow: string; interface: string } {
  if (template === "users") {
    const flow = { ...flowDemo("users-crud").make(), name: `${name}: diagram` };
    return {
      flow: flowText(flow),
      interface: uiText({ ...usersUi(), name, flow }),
    };
  }
  if (template === "coffee") {
    const flow = { ...flowDemo("coffee").make(), name: `${name}: diagram` };
    return {
      flow: flowText(flow),
      interface: uiText({ ...coffeeUi(), name, flow }),
    };
  }
  return {
    flow: flowText({ ...emptyFlow(), name: `${name}: diagram` }),
    interface: uiText({ ...emptyUi(), name }),
  };
}
