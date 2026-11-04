/**
 * The create page (`/new`): a mini-application that owns its slice (`new`),
 * twin of the edit page without a user to fetch. The router activates it with
 * the route in `enter`; it writes an empty form into the slice. Every write
 * answers "paint", and the paint handler diffs the slice and hands the
 * patches to the dom plugin without a target; the outlet's boundary scopes
 * them. Saving and cancelling navigate back to the users page.
 */
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { DomPlugin } from "@service-laboratory/pavlus/plugins/dom";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./user-new.pavlus";
import type { FormSlice } from "../state.ts";

export class UserNew extends Component<FormSlice> {
  view = view;

  /** The answer of a write: diff the slice, hand over the patches. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: FormSlice;
      next: FormSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The router activated this page: an empty form, a clean slate. */
  enter(): Effect[] {
    return [
      store.set(
        "form",
        { id: null, name: "", email: "", roleId: "" },
        { onSuccess: "paint" },
      ),
      store.set("error", "", { onSuccess: "paint" }),
    ];
  }

  setName(msg: Message): Effect[] {
    return [
      store.set("form.name", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setEmail(msg: Message): Effect[] {
    return [
      store.set("form.email", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setRole(msg: Message): Effect[] {
    return [
      store.set("form.roleId", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /**
   * A request, not a state change: nothing to paint yet. The answer comes
   * back as `created` / `failed`.
   */
  submit(_msg: Message, s: FormSlice): Effect[] {
    if (!s.form) return [];
    return [
      http.request({
        id: "create",
        method: "POST",
        url: "/api/users",
        body: {
          name: s.form.name,
          email: s.form.email,
          role_id: Number(s.form.roleId),
        },
        onSuccess: "created",
        onError: "failed",
      }),
    ];
  }

  /** Created: back to the users page (it reloads itself on the way in). */
  created(): Effect[] {
    return [router.navigate("/", { absolute: true })];
  }

  failed(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not save",
        { onSuccess: "paint" },
      ),
    ];
  }

  /** Dismissed: back to the users page. */
  cancel(): Effect[] {
    return [router.navigate("/", { absolute: true })];
  }
}
