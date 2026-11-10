/** Collects lines with indentation. */
export class Writer {
  lines: string[] = [];
  depth: number;

  constructor(depth = 0) {
    this.depth = depth;
  }

  line(text: string): void {
    this.lines.push(text === "" ? "" : "  ".repeat(this.depth) + text);
  }

  /** Lines that were written at the right depth already (see `capture`). */
  raw(lines: string[]): void {
    this.lines.push(...lines);
  }

  indent(fn: () => void): void {
    this.depth++;
    fn();
    this.depth--;
  }

  block(header: string, fn: () => void, close = "}"): void {
    this.line(`${header} {`);
    this.indent(fn);
    this.line(close);
  }

  /** `if (a) {} else if (b) {} else {}`; the first test must not be null. */
  chain(branches: { test: string | null; body: () => void }[]): void {
    branches.forEach((b, i) => {
      const head = b.test === null ? "{" : `if (${b.test}) {`;
      this.line(i === 0 ? head : `} else ${head}`);
      this.indent(b.body);
    });
    this.line("}");
  }

  /** A call on one line when it fits, one argument per line otherwise. */
  call(open: string, args: string[], close: string): void {
    const oneLine = `${open}${args.join(", ")}${close}`;
    if (oneLine.length + this.depth * 2 <= 100) return this.line(oneLine);
    this.line(open);
    this.indent(() => args.forEach((a) => this.line(`${a},`)));
    this.line(close);
  }

  /** One entry per line. */
  entries(open: string, entries: string[], close: string): void {
    this.line(open);
    this.indent(() => entries.forEach((e) => this.line(`${e},`)));
    this.line(close);
  }
}
