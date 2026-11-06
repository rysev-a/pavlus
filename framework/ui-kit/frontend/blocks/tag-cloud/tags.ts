export interface CloudTag {
  tag: string;
  count: number;
  /** 1 (rare) to 5 (the most used). */
  size: number;
  active: boolean;
}

/** Pure: how many entries use each tag (lists of tags in, counts out). */
export function countTags(lists: string[][]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const list of lists) {
    for (const tag of new Set(list)) counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return counts;
}

/** Pure: the weight 1..5 of a count between the least and the most used. */
export function sizeOf(count: number, min: number, max: number): number {
  if (max <= min) return 3;
  return 1 + Math.round(((count - min) / (max - min)) * 4);
}

/** Pure: the cloud, in alphabetical order, with a size for every tag. */
export function cloud(
  counts: Record<string, number>,
  active: string,
): CloudTag[] {
  const values = Object.values(counts);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, count]) => ({
      tag,
      count,
      size: sizeOf(count, min, max),
      active: tag === active,
    }));
}
