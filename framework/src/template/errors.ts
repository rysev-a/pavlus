/** Error thrown for malformed templates. Carries a 1-based source position. */
export class TemplateError extends Error {
  readonly line: number;
  readonly col: number;

  constructor(message: string, line: number, col: number) {
    super(`${message} (line ${line}, col ${col})`);
    this.name = "TemplateError";
    this.line = line;
    this.col = col;
  }
}
