/**
 * The Docs section: which pages there are, in which order, in which group,
 * and how each is titled in each language. The text of a page is a Markdown
 * file per language (`content/<lang>/<slug>.md`); this file is the one list
 * of pages, so the menu is there before any text is loaded.
 */

export const LANGS = ["en", "es", "de", "ru", "zh"] as const;
export type Lang = (typeof LANGS)[number];

/** The name of each language, in itself (for the switcher). */
export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  ru: "Русский",
  zh: "中文",
};

type Titles = Record<Lang, string>;
const t = (en: string, es: string, de: string, ru: string, zh: string): Titles => ({
  en,
  es,
  de,
  ru,
  zh,
});

export const GROUPS = {
  start: t("Start here", "Primeros pasos", "Erste Schritte", "Начало", "开始"),
  syntax: t(
    "Template syntax",
    "Sintaxis de plantillas",
    "Template-Syntax",
    "Синтаксис шаблонов",
    "模板语法",
  ),
  compiler: t(
    "Template compiling",
    "Compilación de plantillas",
    "Template-Kompilierung",
    "Компиляция шаблонов",
    "模板编译",
  ),
  concepts: t(
    "Core concepts",
    "Conceptos básicos",
    "Kernkonzepte",
    "Основные понятия",
    "核心概念",
  ),
  plugins: t("Plugins", "Plugins", "Plugins", "Плагины", "插件"),
  guides: t("Guides", "Guías", "Anleitungen", "Руководства", "指南"),
} as const;
export type GroupId = keyof typeof GROUPS;

export interface DocPageInfo {
  slug: string;
  group: GroupId;
  title: Titles;
}

export const PAGES: DocPageInfo[] = [
  {
    slug: "overview",
    group: "start",
    title: t(
      "Overview of the framework",
      "Visión general del framework",
      "Überblick über das Framework",
      "Обзор фреймворка",
      "框架概览",
    ),
  },
  {
    slug: "quick-start",
    group: "start",
    title: t("Quick start", "Inicio rápido", "Schnellstart", "Быстрый старт", "快速开始"),
  },
  {
    slug: "syntax-elements",
    group: "syntax",
    title: t(
      "Elements, text and attributes",
      "Elementos, texto y atributos",
      "Elemente, Text und Attribute",
      "Элементы, текст и атрибуты",
      "元素、文本与属性",
    ),
  },
  {
    slug: "syntax-expressions",
    group: "syntax",
    title: t(
      "Expressions and interpolation",
      "Expresiones e interpolación",
      "Ausdrücke und Interpolation",
      "Выражения и интерполяция",
      "表达式与插值",
    ),
  },
  {
    slug: "syntax-events",
    group: "syntax",
    title: t(
      "Events and messages",
      "Eventos y mensajes",
      "Events und Nachrichten",
      "События и сообщения",
      "事件与消息",
    ),
  },
  {
    slug: "syntax-control-flow",
    group: "syntax",
    title: t(
      "Conditions and loops",
      "Condicionales y bucles",
      "Bedingungen und Schleifen",
      "Условия и циклы",
      "条件与循环",
    ),
  },
  {
    slug: "syntax-components",
    group: "syntax",
    title: t(
      "Components, imports and outlets",
      "Componentes, imports y outlets",
      "Komponenten, Imports und Outlets",
      "Компоненты, импорты и outlet",
      "组件、导入与出口",
    ),
  },
  {
    slug: "syntax-reference",
    group: "syntax",
    title: t(
      "Syntax reference",
      "Referencia de sintaxis",
      "Syntax-Referenz",
      "Справочник по синтаксису",
      "语法参考",
    ),
  },
  {
    slug: "compiler-pipeline",
    group: "compiler",
    title: t(
      "The compilation pipeline",
      "El pipeline de compilación",
      "Die Kompilierungs-Pipeline",
      "Конвейер компиляции",
      "编译流水线",
    ),
  },
  {
    slug: "compiler-parser",
    group: "compiler",
    title: t(
      "Parsing: from text to AST",
      "Parseo: del texto al AST",
      "Parsing: vom Text zum AST",
      "Разбор: от текста к AST",
      "解析：从文本到 AST",
    ),
  },
  {
    slug: "compiler-analysis",
    group: "compiler",
    title: t(
      "Dependency analysis",
      "Análisis de dependencias",
      "Abhängigkeitsanalyse",
      "Анализ зависимостей",
      "依赖分析",
    ),
  },
  {
    slug: "compiler-render",
    group: "compiler",
    title: t(
      "Code generation: render",
      "Generación de código: render",
      "Codegenerierung: render",
      "Генерация кода: render",
      "代码生成：render",
    ),
  },
  {
    slug: "compiler-diff",
    group: "compiler",
    title: t(
      "Code generation: diff and patches",
      "Generación de código: diff y parches",
      "Codegenerierung: diff und Patches",
      "Генерация кода: diff и патчи",
      "代码生成：diff 与补丁",
    ),
  },
  {
    slug: "compiler-control-flow",
    group: "compiler",
    title: t(
      "Compiling if, for and embeds",
      "Compilar if, for y embeds",
      "if, for und Embeds kompilieren",
      "Компиляция if, for и embed",
      "编译 if、for 与嵌入",
    ),
  },
  {
    slug: "compiler-tooling",
    group: "compiler",
    title: t(
      "API, Vite plugin and errors",
      "API, plugin de Vite y errores",
      "API, Vite-Plugin und Fehler",
      "API, плагин Vite и ошибки",
      "API、Vite 插件与错误",
    ),
  },
  {
    slug: "compiler-playground",
    group: "compiler",
    title: t(
      "Live playground",
      "Playground en vivo",
      "Live-Playground",
      "Живая песочница",
      "在线实验场",
    ),
  },
  {
    slug: "concepts-architecture",
    group: "concepts",
    title: t(
      "Architecture: pure code and effects",
      "Arquitectura: código puro y efectos",
      "Architektur: reiner Code und Effekte",
      "Архитектура: чистый код и эффекты",
      "架构：纯代码与副作用",
    ),
  },
  {
    slug: "concepts-components",
    group: "concepts",
    title: t(
      "Components and state",
      "Componentes y estado",
      "Komponenten und State",
      "Компоненты и состояние",
      "组件与状态",
    ),
  },
  {
    slug: "concepts-messages",
    group: "concepts",
    title: t(
      "Messages and child components",
      "Mensajes y componentes hijos",
      "Nachrichten und Kindkomponenten",
      "Сообщения и дочерние компоненты",
      "消息与子组件",
    ),
  },
  {
    slug: "concepts-routing",
    group: "concepts",
    title: t("Routing", "Enrutamiento", "Routing", "Маршрутизация", "路由"),
  },
  {
    slug: "concepts-ssr",
    group: "concepts",
    title: t(
      "Server-side rendering",
      "Renderizado en servidor",
      "Server-Side-Rendering",
      "Серверный рендеринг",
      "服务端渲染",
    ),
  },
  {
    slug: "plugins-overview",
    group: "plugins",
    title: t(
      "How plugins work",
      "Cómo funcionan los plugins",
      "Wie Plugins funktionieren",
      "Как работают плагины",
      "插件如何工作",
    ),
  },
  {
    slug: "plugins-reference",
    group: "plugins",
    title: t(
      "Built-in plugins",
      "Plugins incluidos",
      "Eingebaute Plugins",
      "Встроенные плагины",
      "内置插件",
    ),
  },
  {
    slug: "plugins-custom",
    group: "plugins",
    title: t(
      "Writing your own plugin",
      "Escribir tu propio plugin",
      "Eigene Plugins schreiben",
      "Свой плагин",
      "编写自己的插件",
    ),
  },
  {
    slug: "guide-todo-app",
    group: "guides",
    title: t(
      "Guide: a complete app",
      "Guía: una aplicación completa",
      "Anleitung: eine komplette App",
      "Руководство: полное приложение",
      "指南：完整应用",
    ),
  },
  {
    slug: "guide-troubleshooting",
    group: "guides",
    title: t(
      "Troubleshooting and FAQ",
      "Solución de problemas y FAQ",
      "Fehlersuche und FAQ",
      "Решение проблем и FAQ",
      "故障排查与常见问题",
    ),
  },
];

export const DEFAULT_PAGE = "overview";
export const docPath = (slug: string): string => `/docs/${slug}`;
export const pageInfo = (slug: string): DocPageInfo | undefined =>
  PAGES.find((p) => p.slug === slug);

/** `/docs` and `/docs/<slug>` → the slug (the first page for `/docs`). */
export function slugOf(path: string): string {
  const m = /^\/docs(?:\/([\w-]+))?\/?$/.exec(path);
  return m?.[1] ?? DEFAULT_PAGE;
}

export interface DocNavItem {
  path: string;
  title: string;
  description: string;
}
export interface DocNavGroup {
  title: string;
  items: DocNavItem[];
}

/** The sidebar of the Docs section in a language (same shape as the other sections'). */
export function docsNav(lang: Lang): DocNavGroup[] {
  const groups: DocNavGroup[] = [];
  for (const p of PAGES) {
    const title = GROUPS[p.group][lang];
    let g = groups.find((x) => x.title === title);
    if (!g) groups.push((g = { title, items: [] }));
    g.items.push({ path: docPath(p.slug), title: p.title[lang], description: "" });
  }
  return groups;
}

export interface Neighbour {
  slug: string;
  title: string;
}

/** The page before and the page after, in the order of the menu. */
export function neighbours(
  slug: string,
  lang: Lang,
): { prev: Neighbour | null; next: Neighbour | null } {
  const at = PAGES.findIndex((p) => p.slug === slug);
  const pick = (p: DocPageInfo | undefined): Neighbour | null =>
    p ? { slug: p.slug, title: p.title[lang] } : null;
  return {
    prev: at > 0 ? pick(PAGES[at - 1]) : null,
    next: at >= 0 ? pick(PAGES[at + 1]) : null,
  };
}

/** The language the visitor used before, else the browser's, else English. */
export function initialLang(win: Window = window): Lang {
  try {
    const saved = win.localStorage.getItem("ui-kit-docs-lang");
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    // storage blocked
  }
  const nav = (win.navigator?.language ?? "en").slice(0, 2).toLowerCase();
  return (LANGS as readonly string[]).includes(nav) ? (nav as Lang) : "en";
}
