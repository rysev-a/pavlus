/** What the playground starts with (and what Reset brings back). */
export const PLAYGROUND_TEMPLATE = `h1.title Hello, {user.name}!
p You have {count} unread {count === 1 ? "message" : "messages"}.
ul.items
  for item, i in items key item.id
    li(class:done=item.done)
      | {i + 1}. {item.title}
if count > 0
  button(@click=read(count)) Mark as read
else
  p.empty All caught up
`;

export const PLAYGROUND_STATE = `{
  "user": { "name": "Ann" },
  "count": 2,
  "items": [
    { "id": 1, "title": "Write the docs", "done": true },
    { "id": 2, "title": "Compile them", "done": false }
  ]
}`;
