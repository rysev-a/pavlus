import type { Route } from "@service-laboratory/pavlus";
import { presetLook, initialLook } from "../../ui-kit/frontend/theme.ts";
import type { Look } from "../../ui-kit/frontend/theming.ts";
import { meta } from "../../ui-kit/frontend/templates/phone-retail-crm/meta.ts";
import { initialCrm, type RoutedCrmState } from "./crm.ts";

export interface AppState {
  /** Where we are; `null` until the router plugin reports it. */
  route: Route | null;
  /** The look of the page: the template's own (blue, plain sans), light or dark as the system prefers. */
  look: Look;
  /** The CRM, under the key its routed entry uses. */
  crm: RoutedCrmState;
}

export function initialState(prefersDark = false): AppState {
  return {
    route: null,
    look: presetLook(meta.look, prefersDark ? "dark" : "light"),
    crm: initialCrm(),
  };
}

export { initialLook };
