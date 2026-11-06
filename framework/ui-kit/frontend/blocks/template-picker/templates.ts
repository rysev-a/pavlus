export interface TemplateDef {
  id: string;
  name: string;
  description: string;
}

export interface TemplateOption extends TemplateDef {
  selected: boolean;
}

/** Pure: the options with one chosen (an unknown id chooses none). */
export function templateOptions(
  defs: TemplateDef[],
  selected: string,
): TemplateOption[] {
  return defs.map((d) => ({ ...d, selected: d.id === selected }));
}
