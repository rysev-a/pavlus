// The simplest whole example: a table of users that is loaded from the backend, and what
// you do with it: create a user, change one, remove one. One page, made of what the editor
// has to offer: state keys, a data table (header labels, check boxes, search, pages, two row
// actions that one chain tells apart with "Only when"), and two forms with their fields.
// There is no mock route: it is linked to the Flow Studio diagram of the same name, which
// is its backend, and the preview runs that diagram against its own table.
import { usersDemo } from "../flow-studio/demo-users.ts";
import { builder, http, key, notice, set } from "./build.ts";
import { type Action, type Model, blankField } from "./model.ts";

const ERR = { errKey: "apiError", loadingKey: "loading" } as const;
const FAIL: Action[] = [notice("{error}")];

/** the users, from the backend, into the table */
const loadUsers = (): Action =>
  http("GET", "/users", {
    okKey: "users",
    okPath: "users",
    ...ERR,
    catch: FAIL,
  });

export function usersUi(): Model {
  const b = builder(0);

  const heading = b.el("heading", 0, 0, 12, 1, { text: "Users", level: "1" });
  // the list is asked for when the page opens
  heading.events.load = [loadUsers()];

  const page = b.page("Users", "/", [
    b.section(
      "empty",
      "Users",
      [
        heading,
        b.el(
          "table",
          0,
          1,
          12,
          7,
          {
            source: "state.users",
            columns: "id|number, name:Full name, email:Email address",
            search: "yes",
            pageSize: "5",
            select: "yes",
            rowActions: "Edit, Delete",
            empty: "No users yet.",
          },
          {
            events: {
              // one event for both buttons; `action` says which one was pressed
              rowAction: [
                // Edit: the row is the user to change, in the form of the selected user
                { ...set("selected", "row"), when: 'action == "Edit"' },
                { ...set("editForm", "row"), when: 'action == "Edit"' },
                // Delete: the row goes
                {
                  ...http("DELETE", "/users/{row.id}", {
                    ...ERR,
                    then: [notice("Deleted {row.name}"), loadUsers()],
                    catch: FAIL,
                  }),
                  when: 'action == "Delete"',
                },
              ],
            },
          },
        ),
        b.el(
          "form",
          0,
          8,
          6,
          7,
          {
            title: "New user",
            submitLabel: "Create user",
            errorsKey: "formErrors",
            okText: "",
          },
          {
            bind: "newForm",
            fields: [
              {
                ...blankField("name", "Name", "text", "yes"),
                placeholder: "Ada Lovelace",
                description: "The full name, as it is shown.",
              },
              {
                ...blankField("email", "Email", "email", "yes"),
                placeholder: "ada@example.com",
              },
            ],
            events: {
              submit: [
                http("POST", "/users", {
                  body: "state.newForm",
                  okKey: "lastUser",
                  okPath: "user",
                  ...ERR,
                  then: [
                    notice("Created {state.lastUser.name}"),
                    set("newForm", "obj()"),
                    loadUsers(),
                  ],
                  catch: FAIL,
                }),
              ],
            },
          },
        ),
        b.el(
          "form",
          6,
          8,
          6,
          7,
          {
            title: "Selected user",
            submitLabel: "Save changes",
            errorsKey: "editErrors",
            okText: "",
          },
          {
            bind: "editForm",
            fields: [
              blankField("name", "Name", "text", "yes"),
              blankField("email", "Email", "email", "yes"),
            ],
            events: {
              submit: [
                http("PATCH", "/users/{state.editForm.id}", {
                  body: "state.editForm",
                  okKey: "lastUser",
                  okPath: "user",
                  ...ERR,
                  then: [
                    notice("Saved {state.lastUser.name}"),
                    set("selected", "state.lastUser"),
                    loadUsers(),
                  ],
                  catch: FAIL,
                }),
              ],
            },
          },
        ),
      ],
      { rows: 16 },
    ),
  ]);

  return {
    name: "Users CRUD",
    pages: [page],
    keys: [
      key("users", "json", "[]"),
      key("selected", "json", "null"),
      key("newForm", "json", "{}"),
      key("editForm", "json", "{}"),
      key("formErrors", "json", "{}"),
      key("editErrors", "json", "{}"),
      key("lastUser", "json", "null"),
      key("loading", "boolean", "false"),
      key("apiError", "json", "null"),
    ],
    mocks: [],
    mockOn: true,
    // the diagram is the backend
    flow: usersDemo(),
    apiBase: "",
    seq: b.seq(),
  };
}
