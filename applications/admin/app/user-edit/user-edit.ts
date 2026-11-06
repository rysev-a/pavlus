/**
 * The edit page (`/:id/edit`): a mini-application that owns its slice
 * (`edit`). The router activates it with the route in `enter`; it fetches the
 * user and fills the form — until then the slice's `form` is null and the
 * template shows a placeholder. Every write answers "paint", and the paint
 * handler diffs the slice (the answer arrives already sliced) and hands the
 * patches to the dom plugin without a target; the outlet's boundary scopes
 * them. Saving and cancelling do not write the slice: they navigate back to
 * the users page.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { FormSlice, User } from "../state.ts";
import view from "./user-edit.pavlus";

export class UserEdit extends Component<FormSlice> {
  view = view;

  /** The answer of a write: diff the slice, hand over the patches. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: FormSlice;
      next: FormSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The router activated this page: fetch the user the route names. */
  enter(msg: Message): Effect[] {
    const id = Number(
      (msg.payload as { params?: Record<string, string> }).params?.id,
    );
    return [
      http.request({
        id: "user",
        url: `/api/users/${id}`,
        onSuccess: "filled",
        onError: "missing",
      }),
    ];
  }

  /** The user is in: fill the form (its inputs are strings). */
  filled(msg: Message, s: FormSlice): Effect[] {
    const u = (msg.payload as { data: User }).data;
    return [
      store.set(
        "form",
        { id: u.id, name: u.name, email: u.email, roleId: String(u.role_id) },
        { onSuccess: "paint" },
      ),
      store.set("error", "", { onSuccess: "paint" }),
    ];
  }

  /** No such user: the placeholder says so, nothing to edit. */
  missing(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the user",
        { onSuccess: "paint" },
      ),
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
   * back as `saved` / `failed`.
   */
  submit(_msg: Message, s: FormSlice): Effect[] {
    if (!s.form) return [];
    return [
      http.request({
        id: "save",
        method: "PUT",
        url: `/api/users/${s.form.id}`,
        body: {
          name: s.form.name,
          email: s.form.email,
          role_id: Number(s.form.roleId),
        },
        onSuccess: "saved",
        onError: "failed",
      }),
    ];
  }

  /** Saved: back to the users page (it reloads itself on the way in). */
  saved(): Effect[] {
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
