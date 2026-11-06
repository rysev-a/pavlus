---
summary: Schreibe ein Plugin Schritt für Schritt, vom Title-Plugin mit drei Zeilen über ein Storage-Plugin, das mit einer Message antwortet, bis zu einem Viewport-Plugin, das hinter sich aufräumt. Du lernst die Regeln, wie du ein Plugin mit einem falschen Kontext testest und wann du keins schreiben solltest.
---
## Das kleinste Plugin

Ein Plugin ist ein Objekt mit einem `name` und einer Funktion `handle`. Mehr braucht das Framework nicht. Hier ist ein Plugin, das den Titel des Browser-Tabs setzt:

```ts title.ts
import type { Plugin } from "@pavlus/frontend";

export const titlePlugin: Plugin = {
  name: "title",
  handle(effect) {
    document.title = String(effect.text);
  },
};
```

Du registrierst es zusammen mit den anderen:

```ts
createApp({
  app: shell,
  plugins: [createStorePlugin(initialState), new DomPlugin(), titlePlugin],
  mount: "#app",
});
```

Und ein handler bittet um einen Titel, indem er dafür einen Effekt zurückgibt:

```ts
count(msg: Message): Effect[] {
  return [{ plugin: "title", type: "set", text: `${msg.payload} left` }];
}
```

Das ist der ganze Weg. Der handler bleibt rein: Er gibt Daten zurück. Der Kern findet das Plugin, dessen `name` `"title"` ist, und ruft `handle(effect, ctx)` auf. Die eine Zeile mit `document.title` ist die einzige unreine Zeile in der ganzen Anwendung, und sie steht an einem Ort, an dem man sie leicht findet.

Es funktioniert, ist aber noch nicht gut. `effect.text` ist `unknown`, deshalb brauchten wir `String(...)`. Ein Tippfehler im handler (`txt` statt `text`) ist kein Kompilierfehler. Und `document` ist ein Global, das ein Test fälschen muss. Die nächsten Schritte beheben diese drei Dinge.

## Den Effekt typisieren und einen Effector mitliefern

Gib dem Plugin den Typ seiner Effekte. Ein Effekt ist eine Union von Objekten mit `plugin` und `type`; `Plugin<E>` nimmt diese Union. Dann der Effector: ein kleines Objekt aus Funktionen, die die Effekte bauen. Zuletzt nimm die Außenwelt, hier das Dokument, als Parameter mit einem Standardwert.

```ts title.ts
import type { Plugin } from "@pavlus/frontend";

export type TitleEffect = { plugin: "title"; type: "set"; text: string };

export const titleEffector = {
  set: (text: string): TitleEffect => ({ plugin: "title", type: "set", text }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect> {
  return {
    name: "title",
    handle(effect) {
      doc.title = effect.text;
    },
  };
}
```

Lies es von oben.

- `TitleEffect` ist die Form der Daten. `plugin: "title"` und `type: "set"` sind Literaltypen, der Effekt kann also nicht mit dem Effekt eines anderen Plugins verwechselt werden. Fügst du später einen zweiten Effekt hinzu, mache den Typ zu einer Union: `type TitleEffect = SetTitle | ResetTitle`, und `handle` kann über `effect.type` verzweigen.
- `titleEffector.set(text)` gibt genau das Objekt der ersten Version zurück, typisiert. Der handler liest sich jetzt als `title.set(...)`, und ein falsches Feld ist ein Kompilierfehler.
- `createTitlePlugin(doc)` ist eine Factory. Der Standard ist das globale `document`, aufgelöst, wenn die Factory aufgerufen wird. Auf einem Server ohne `document` erzeugst du dieses Plugin also einfach nicht. Ein Test übergibt ein jsdom-Dokument oder ein beliebiges Objekt mit einem Feld `title`.
- Der Rückgabetyp ist `Plugin<TitleEffect>`. In `handle` ist `effect.text` ein `string`.

Ein handler sieht jetzt aus wie die eingebauten:

```ts
import { titleEffector as title } from "./title.ts";

count(msg: Message): Effect[] {
  return [title.set(`${msg.payload} left`)];
}
```

> [!NOTE] Zwei Wege, einen Effekt zu typisieren
> Die Plugins des ui-kit schreiben `interface RandomEffect extends Effect`, was jedes zusätzliche Feld akzeptiert. Die Plugins des Frameworks nutzen eine Union exakter Objekttypen, was strenger ist: Ein Feld, das es nicht gibt, ist ein Fehler. Beide lassen sich `Effect` zuweisen, beide können also von einem handler zurückgegeben werden. Nutze die strenge Form für ein Plugin mit mehreren Effekten.

## Ein Plugin, das antwortet

Das Title-Plugin antwortet nie. Die meisten Plugins tun es: Die Arbeit braucht Zeit, oder sie kann scheitern. Die Regel ist dieselbe wie bei den eingebauten. Der Effekt benennt die Messages, mit denen geantwortet wird, und das Plugin ruft `ctx.dispatch` auf.

Schreiben wir ein Plugin für `localStorage`. Es hat zwei Effekte: `load` liest einen key und antwortet mit dem Wert, `save` schreibt ihn. Ein Wert wird als JSON gespeichert.

```ts storage.ts
import type { Plugin } from "@pavlus/frontend";

export type StorageEffect =
  | {
      plugin: "storage";
      type: "load";
      key: string;
      onSuccess: string;
      onError: string;
    }
  | {
      plugin: "storage";
      type: "save";
      key: string;
      value: unknown;
      onError?: string;
    };

export const storageEffector = {
  load: (key: string, onSuccess: string, onError: string): StorageEffect => ({
    plugin: "storage",
    type: "load",
    key,
    onSuccess,
    onError,
  }),
  save: (key: string, value: unknown, onError?: string): StorageEffect => ({
    plugin: "storage",
    type: "save",
    key,
    value,
    ...(onError !== undefined && { onError }),
  }),
};

export interface StorageOptions {
  /** Defaults to `localStorage`; replace it in tests. */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export function createStoragePlugin(
  opts: StorageOptions = {},
): Plugin<StorageEffect> {
  return {
    name: "storage",
    handle(effect, ctx) {
      const storage = opts.storage ?? localStorage;
      try {
        if (effect.type === "load") {
          const text = storage.getItem(effect.key);
          ctx.dispatch({
            id: effect.onSuccess,
            payload: text === null ? null : JSON.parse(text),
          });
        } else {
          storage.setItem(effect.key, JSON.stringify(effect.value));
        }
      } catch (error) {
        if (effect.onError) {
          ctx.dispatch({ id: effect.onError, payload: String(error) });
        }
      }
    },
  };
}
```

Was bemerkenswert ist:

- **Antwortnamen.** `load` hat `onSuccess` und `onError`, die Standardnamen. Einem Child wird sein Message-Präfix vor diese Felder gestellt, sodass die Antwort ihren Weg zurück zum Child findet. Ein Feld namens `onDone` würde kein Präfix bekommen, und die Antwort ginge an die Wurzel. Nutze `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` oder `onChange`.
- **Ein Fehlschlag ist eine Message.** Das `try`/`catch` macht aus einer Exception (ein gesperrter Speicher, ein Wert, der kein JSON ist) die Message `onError` mit dem Grund. Die Anwendung entscheidet, was zu tun ist. Nichts wird in den Kern geworfen. Bei `save` ist `onError` optional: Hat niemand danach gefragt, wird der Fehler verworfen.
- **Die Welt ist eine Option.** `storage` ist standardmäßig das globale `localStorage`, gelesen, wenn der Effekt behandelt wird, und ein Test übergibt ein einfaches Objekt mit `getItem` und `setItem`.
- **Die Antwort darf synchron sein.** `ctx.dispatch` innerhalb von `handle` ist sicher. Der Kern stellt die Message in die Queue und verarbeitet sie nach der aktuellen, sodass der handler, der das `load` angefordert hat, schon fertig ist.
- **Ein fehlender key ist kein Fehler.** `getItem` gibt `null` zurück, und die Antwort ist `null`. Der handler entscheidet, was das bedeutet.

Der Code, der es benutzt, besteht aus zwei handlern, einer fragt, einer empfängt:

```ts
load(): Effect[] {
  return [storage.load("todos", "loaded", "loadFailed")];
}

loaded(msg: Message): Effect[] {
  const items = Array.isArray(msg.payload) ? msg.payload : [];
  return [store.set("items", items)];
}
```

Der Ablauf ist der übliche Kreislauf. `load` gibt einen `storage`-Effekt zurück; das Plugin liest den key und dispatcht `{ id: "loaded", payload: [...] }`; im nächsten Durchlauf speichert `loaded` den Wert. Kein Promise, kein Callback und kein State außerhalb des Stores.

## Ein Plugin mit einem falschen Kontext testen

Ein Plugin nimmt einen Kontext, und ein Kontext sind drei Funktionen. Ein Test kann einen in vier Zeilen bauen:

```ts storage.test.ts
import type { Message, PluginContext } from "@pavlus/frontend";
import { expect, test } from "vitest";
import { createStoragePlugin, storageEffector as storage } from "./storage.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("storage loads, saves and reports errors", () => {
  const data: Record<string, string> = { a: '{"n":1}', bad: "{oops" };
  const plugin = createStoragePlugin({
    storage: {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => void (data[key] = value),
    },
  });
  const { ctx, sent } = fakeContext();
  plugin.handle(storage.load("a", "ok", "failed"), ctx);
  plugin.handle(storage.load("missing", "ok", "failed"), ctx);
  plugin.handle(storage.load("bad", "ok", "failed"), ctx);
  plugin.handle(storage.save("b", [1, 2]), ctx);
  expect(sent).toEqual([
    { id: "ok", payload: { n: 1 } },
    { id: "ok", payload: null },
    { id: "failed", payload: expect.stringContaining("SyntaxError") },
  ]);
  expect(data.b).toBe("[1,2]");
});
```

Der Test übergibt einen falschen `storage` aus einem einfachen Objekt, ruft `handle` mit Effekten auf, die der Effector gebaut hat, und vergleicht, was dispatcht wurde, mit einer Liste. Er prüft die drei Fälle, auf die es ankommt: einen Wert, der existiert, einen key, der fehlt, und einen Wert, der kein JSON ist. Es gibt keine Anwendung, keinen Browser-Speicher und keine Mocking-Bibliothek.

Zwei weitere Arten von Tests sind nützlich, und beide passen in wenige Zeilen:

```ts title.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type PluginContext,
} from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { createTitlePlugin, titleEffector as title } from "./title.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the title plugin sets document.title", () => {
  const { ctx } = fakeContext();
  createTitlePlugin(document).handle(title.set("3 left"), ctx);
  expect(document.title).toBe("3 left");
});

test("a handler asks for a title, the app performs it", () => {
  const app = createApp({
    app: (message: Message): Effect[] =>
      message.id === "count" ? [title.set(`${message.payload} left`)] : [],
    plugins: [createStorePlugin({}), createTitlePlugin(document)],
  });
  app.dispatch({ id: "count", payload: 2 });
  expect(document.title).toBe("2 left");
});
```

Der zweite Test startet den echten Kern mit dem echten Title-Plugin: Ein handler gibt den Effekt zurück, und der Dokumenttitel ändert sich. Nutze ihn für ein Plugin, das von einer Anwendung benutzt wird. Nutze den falschen Kontext für das Plugin allein.

## Ein Plugin, das aufräumt

`title` und `storage` halten nichts. Ein Plugin, das einen Listener, einen Timer oder einen Socket registriert, besitzt etwas und muss es zurückgeben. Der Kern ruft `dispose()` auf, wenn die Anwendung beendet wird, in umgekehrter Reihenfolge der Registrierung.

Hier ist ein Plugin, das die Größe des Fensters meldet. Der Effekt `listen` startet einen `resize`-Listener, `stop` entfernt ihn.

```ts viewport.ts
import type { Plugin } from "@pavlus/frontend";

export type ViewportEffect =
  | { plugin: "viewport"; type: "listen"; onChange: string }
  | { plugin: "viewport"; type: "stop" };

export const viewportEffector = {
  listen: (onChange: string): ViewportEffect => ({
    plugin: "viewport",
    type: "listen",
    onChange,
  }),
  stop: (): ViewportEffect => ({ plugin: "viewport", type: "stop" }),
};

export function createViewportPlugin(
  win: Window = window,
): Plugin<ViewportEffect> {
  let stop: (() => void) | undefined;
  const size = () => ({ width: win.innerWidth, height: win.innerHeight });

  return {
    name: "viewport",
    handle(effect, ctx) {
      stop?.();
      stop = undefined;
      if (effect.type === "stop") return;
      const report = () =>
        ctx.dispatch({ id: effect.onChange, payload: size() });
      win.addEventListener("resize", report);
      stop = () => win.removeEventListener("resize", report);
      report();
    },
    dispose() {
      stop?.();
    },
  };
}
```

Drei Punkte sind daraus mitzunehmen.

1. Das Plugin hält den Weg, seine eigene Arbeit rückgängig zu machen, `stop`, in einer Variablen der Factory. Diese Variable ist der private State des Plugins. Anwendungscode sieht sie nie.
2. Jedes `handle` ruft zuerst `stop?.()` auf. Erneut zu lauschen **ersetzt** den vorherigen Listener, wie beim Router-Plugin. Ohne das würden zwei `listen`-Effekte zwei Meldungen für ein Resize ergeben.
3. `dispose` entfernt den Listener. Ohne es verliert ein Test, der zehn Anwendungen erzeugt und beendet, zehn Listener.

Der Test steuert es mit dem echten window von jsdom:

```ts viewport.test.ts
import type { Message, PluginContext } from "@pavlus/frontend";
import { expect, test } from "vitest";
import {
  createViewportPlugin,
  viewportEffector as viewport,
} from "./viewport.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the viewport plugin reports the size, and stops when disposed", () => {
  const { ctx, sent } = fakeContext();
  const plugin = createViewportPlugin(window);
  plugin.handle(viewport.listen("resized"), ctx);
  expect(sent).toEqual([
    { id: "resized", payload: { width: 1024, height: 768 } },
  ]);

  Object.assign(window, { innerWidth: 500 });
  window.dispatchEvent(new Event("resize"));
  expect(sent.at(-1)).toEqual({
    id: "resized",
    payload: { width: 500, height: 768 },
  });

  plugin.dispose?.();
  window.dispatchEvent(new Event("resize"));
  expect(sent).toHaveLength(2);
});
```

Nutze dasselbe Muster für alles mit einer Identität. Ein Plugin, das eine Chart-Bibliothek umhüllt, würde eine Map von id zu Chart führen, ein Chart ersetzen, wenn dieselbe id erneut gezeichnet wird, und alle in `dispose` zerstören.

## Ein echtes lesen: random

Das ui-kit hat ein Plugin, das kurz genug ist, um es in einem Zug zu lesen. Ein handler kann `Math.random()` nicht aufrufen, weil dieselbe Message verschiedene Effekte ergäbe. Er bittet also ein Plugin um eine Zahl und erhält sie als Message zurück:

```ts random.ts
import type { Effect, Plugin } from "@pavlus/frontend";

/**
 * The application is pure: it cannot call `Math.random()`. It asks this plugin
 * for a number and gets it back as a message, like an HTTP answer.
 */
export interface RandomEffect extends Effect {
  plugin: "random";
  type: "int";
  /** The answer is an integer from 0 up to, not including, `max`. */
  max: number;
  /** The id of the message that carries the answer as its payload. */
  replyTo: string;
}

export const randomEffector = {
  int: (max: number, replyTo: string): RandomEffect => ({
    plugin: "random",
    type: "int",
    max,
    replyTo,
  }),
};

export function createRandomPlugin(
  random: () => number = Math.random,
): Plugin<RandomEffect, unknown> {
  return {
    name: "random",
    handle(effect, ctx) {
      if (effect.type !== "int") return;
      ctx.dispatch({
        id: effect.replyTo,
        payload: Math.min(effect.max - 1, Math.floor(random() * effect.max)),
      });
    },
  };
}
```

- `RandomEffect` erweitert `Effect`, zusätzliche Felder sind also erlaubt. `max` ist, wie viele Werte gewünscht sind, `replyTo` ist die Message, die die Antwort trägt.
- `randomEffector.int(max, replyTo)` ist der einzige Weg, wie die Anwendung den Effekt baut.
- `createRandomPlugin(random)` nimmt die Zufallsquelle als Parameter, mit `Math.random` als Standard. Das ist die Nahtstelle zum Testen: Übergib `() => 0` oder `() => 0.999999`, und die Antwort ist bekannt.
- `handle` tut eine Sache und antwortet per `ctx.dispatch`. Das `Math.min` hält die Antwort unter `max`, auch wenn eine eigene Quelle genau 1 zurückgibt.

Es wird vom Zufalls-Button der Seite Theming benutzt. Der handler fragt, und ein anderer handler empfängt die Antwort:

```ts
"theming.random"(): Effect[] {
  return [randomEffector.int(allThemes().length, "randomPicked")];
}

randomPicked(msg: Message, state: AppState): Effect[] {
  const pick = allThemes()[msg.payload as number];
  return pick
    ? this._choose(withTheme(state.look, pick.palette, pick.mode))
    : [];
}
```

und der Test des ui-kit prüft es mit einer festen Zufallsquelle:

```ts
const sent: unknown[] = [];
const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
const plugin = createRandomPlugin(() => 0.999999);
plugin.handle(randomEffector.int(100, "randomPicked"), ctx);
createRandomPlugin(() => 0).handle(
  randomEffector.int(100, "randomPicked"),
  ctx,
);
expect(sent).toEqual([
  { id: "randomPicked", payload: 99 },
  { id: "randomPicked", payload: 0 },
]);
```

Beachte, dass der Test nur `dispatch` braucht, der falsche Kontext ist also `{ dispatch }`. Die anderen drei Plugins des ui-kit (theme, source, docs) sind in der [Plugin-Referenz](page:plugins-reference) beschrieben.

## Die Regeln

1. **Ein Plugin hat einen Namen und eine Familie von Effekten.** Benenne es nach der Welt, mit der es spricht (`storage`, `viewport`, `title`), nicht nach dem Feature, das es benutzt.
2. **Nicht entscheiden, ausführen.** Ein Plugin führt einen Effekt aus. Es liest nicht den State der Anwendung, um zu wählen, was zu tun ist. Was es braucht, kommt in den Effekt. `ctx.getState()` gibt es, weil das DOM-Plugin rendern muss, aber ein Plugin, das nach dem State verzweigt, hat Anwendungslogik aus dem reinen Kern herausgeholt, wo sie sich nicht mit einer einfachen Funktion testen lässt.
3. **Antworte per `ctx.dispatch`, mit einer Message-id aus dem Effekt.** Gib aus `handle` keinen Wert zurück, halte keinen Callback bereit, den die Anwendung aufruft, und benenne die Message nicht im Plugin. Der Effekt entscheidet, wer die Antwort erhält.
4. **Nutze die Standard-Antwortnamen**, damit Kinder ihr Präfix bekommen.
5. **Erwartete Fehlschläge sind Messages.** Fange sie ab und dispatche `onError`. Lass einen Bug (einen Effekt in falscher Form) werfen. Denk daran, dass ein Fehler in einem Promise oder einem Timer-Callback vom Kern nicht gesehen wird: Fange ihn selbst ab.
6. **Nimm die Welt als Option.** `fetch`, `storage`, `window`, `document`, eine Uhr, eine Zufallsquelle. Der Standard ist das Global, aufgelöst, wenn der Effekt behandelt oder die Factory aufgerufen wird.
7. **Besitze deine Ressourcen und gib sie frei.** Halte Listener, Timer und Sockets in der Factory, mache Operationen über die id ersetzbar und räume in `dispose` auf.
8. **Liefere einen Effector mit.** Exportiere für eine Bibliothek ein Interface für den Effector und eine damit annotierte Konstante, denn JSR verlangt einen expliziten Typ an jeder exportierten Konstante, und das Interface ist ein guter Ort für Doc-Kommentare.

> [!WARNING] Verändere den State nicht aus einem Plugin
> Ein Plugin hat keine Möglichkeit, den State zu ändern, und sollte auch keine suchen. Nur das Plugin `store` ändert ihn, als Reaktion auf einen Effekt `store.set`, den dein handler zurückgegeben hat. Hat ein Plugin ein Ergebnis zu teilen, dispatcht es eine Message, und ein handler macht daraus `store.set`.

## Wann du kein Plugin schreiben solltest

Ein Plugin ist für die Außenwelt. Ist die Arbeit eine Berechnung, ist ein Plugin der falsche Ort, und eine Funktion ist einfacher. Nutze diese Tabelle, bevor du anfängst:

| Du willst | Nutze |
| --- | --- |
| Ein Datum formatieren, eine Liste sortieren, eine Summe berechnen | Eine reine Funktion, die ein handler aufruft |
| Einen aus dem State abgeleiteten Wert halten (eine gefilterte Liste) | Berechne ihn im handler, speichere ihn mit `store.set` |
| Eine API aufrufen | Das Plugin `http` |
| Warten, wiederholen, entprellen | Das Plugin `time` |
| Ein Eingabefeld fokussieren | `dom.focus` |
| Die URL ändern | Das Plugin `router` |
| Etwas zeigen oder verbergen, eine Klasse umschalten | Eine Bedingung im Template, vom State gesteuert |
| Geschäftsregeln, Validierung | Ein handler |
| Eine Browser-API, einen Speicher, ein Gerät, eine Drittanbieter-Bibliothek mit Seiteneffekten ansprechen | Ein Plugin |

Ertappst du dich dabei, ein `if` über Anwendungsdaten in `handle` zu schreiben, gehört dieser Code in einen handler.

## Was du gelernt hast

- Ein Plugin ist `{ name, handle }`. Typisiere seine Effekte als Union, baue sie mit einem Effector und nimm die Außenwelt als Option.
- Zum Antworten benennt der Effekt die Antwort-Messages mit den Standardfeldern, und das Plugin ruft `ctx.dispatch` auf. Fehlschläge sind Messages.
- Ein Plugin, das eine Ressource besitzt, speichert den Weg, sie rückgängig zu machen, und gibt sie in `dispose` frei. Teste mit einem falschen Kontext aus drei Funktionen.
- Entscheide nicht in einem Plugin, fasse den State nicht an und schreibe kein Plugin für etwas, das eine Funktion kann.

Weiter: [Anleitung: eine komplette App](page:guide-todo-app).
