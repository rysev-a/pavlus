import { computed, html, match, render, show, signal } from "../../src/mod.ts";

function Counter(props: { start?: number; step?: number }) {
  const count = signal(props.start ?? 0);
  const step = props.step ?? 1;
  const double = computed(() => count() * 2);
  const mood = computed(() =>
    count() < 0
      ? "negative"
      : count() === 0
        ? "zero"
        : count() > 9
          ? "big"
          : "positive",
  );

  return html`
    <main>
      <h1>Maximus counter</h1>
      <div
        class=${() => ({ value: true, neg: count() < 0 })}
        data-testid="value"
      >
        ${count}
      </div>
      <div>
        <button
          class="secondary"
          @click=${() => count.update((n) => n - step)}
          aria-label="decrement"
        >
          −
        </button>
        <button
          @click=${() => count.update((n) => n + step)}
          aria-label="increment"
        >
          +
        </button>
        <button
          class="secondary"
          ?disabled=${() => count() === 0}
          @click=${() => count.set(0)}
        >
          reset
        </button>
      </div>
      <p>
        double is <strong>${double}</strong>,
        ${match(mood, {
          zero: () => "nothing yet",
          positive: () => "going up",
          big: () => html`<em>that is a lot</em>`,
          negative: () => "below zero",
        })}
      </p>
      ${show(
        () => count() >= 10,
        () => html`<p data-testid="badge">🎉 reached ten</p>`,
      )}
    </main>
  `;
}

render(() => Counter({ start: 0 }), document.getElementById("app")!);
