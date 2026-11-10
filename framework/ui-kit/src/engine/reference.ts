import type { StageDoc } from "./types.ts";

/** The reference is written in two files (the front half and the back half of the pipeline). */
const files = import.meta.glob<{ FRONT?: StageDoc[]; BACK?: StageDoc[] }>(
  "./reference-*.ts",
  { eager: true },
);

export const STAGES: StageDoc[] = Object.values(files).flatMap((m) => [
  ...(m.FRONT ?? []),
  ...(m.BACK ?? []),
]);
