import type { Lang } from "./pages.ts";

/** The words of the Docs chrome (not of the pages) in each language. */
export interface Ui {
  docs: string;
  onThisPage: string;
  previous: string;
  next: string;
  loading: string;
  failed: string;
  language: string;
  tone: Record<"note" | "tip" | "warning" | "danger", string>;
  demo: {
    template: string;
    state: string;
    html: string;
    module: string;
    ast: string;
    vnodes: string;
    patches: string;
    noPatches: string;
    error: string;
  };
  playground: {
    template: string;
    state: string;
    run: string;
    reset: string;
    stateError: string;
    hint: string;
  };
}

export const UI: Record<Lang, Ui> = {
  en: {
    docs: "Docs",
    onThisPage: "On this page",
    previous: "Previous",
    next: "Next",
    loading: "Loading the page...",
    failed: "This page could not be loaded.",
    language: "Language",
    tone: { note: "Note", tip: "Tip", warning: "Warning", danger: "Danger" },
    demo: {
      template: "Template",
      state: "State",
      html: "Result (HTML of render(state))",
      module: "Generated module",
      ast: "AST and what each node reads",
      vnodes: "The vnodes render(state) returns",
      patches: "Patches from diff(prev, next)",
      noPatches: "No patches: nothing to change.",
      error: "The compiler stopped:",
    },
    playground: {
      template: "Template (.pavlus)",
      state: "State (JSON)",
      run: "Compile and run",
      reset: "Reset",
      stateError: "The state is not valid JSON:",
      hint: "Edit the template or the state: the result below is compiled by the real compiler, in your browser.",
    },
  },
  es: {
    docs: "Docs",
    onThisPage: "En esta página",
    previous: "Anterior",
    next: "Siguiente",
    loading: "Cargando la página...",
    failed: "No se pudo cargar esta página.",
    language: "Idioma",
    tone: { note: "Nota", tip: "Consejo", warning: "Aviso", danger: "Peligro" },
    demo: {
      template: "Plantilla",
      state: "Estado",
      html: "Resultado (HTML de render(state))",
      module: "Módulo generado",
      ast: "AST y qué lee cada nodo",
      vnodes: "Los vnodes que devuelve render(state)",
      patches: "Parches de diff(prev, next)",
      noPatches: "Sin parches: no hay nada que cambiar.",
      error: "El compilador se detuvo:",
    },
    playground: {
      template: "Plantilla (.pavlus)",
      state: "Estado (JSON)",
      run: "Compilar y ejecutar",
      reset: "Restablecer",
      stateError: "El estado no es JSON válido:",
      hint: "Edita la plantilla o el estado: el resultado de abajo lo compila el compilador real, en tu navegador.",
    },
  },
  de: {
    docs: "Docs",
    onThisPage: "Auf dieser Seite",
    previous: "Zurück",
    next: "Weiter",
    loading: "Seite wird geladen...",
    failed: "Diese Seite konnte nicht geladen werden.",
    language: "Sprache",
    tone: { note: "Hinweis", tip: "Tipp", warning: "Warnung", danger: "Gefahr" },
    demo: {
      template: "Template",
      state: "State",
      html: "Ergebnis (HTML von render(state))",
      module: "Generiertes Modul",
      ast: "AST und was jeder Knoten liest",
      vnodes: "Die vnodes, die render(state) liefert",
      patches: "Patches von diff(prev, next)",
      noPatches: "Keine Patches: nichts zu ändern.",
      error: "Der Compiler hat abgebrochen:",
    },
    playground: {
      template: "Template (.pavlus)",
      state: "State (JSON)",
      run: "Kompilieren und ausführen",
      reset: "Zurücksetzen",
      stateError: "Der State ist kein gültiges JSON:",
      hint: "Ändere das Template oder den State: das Ergebnis unten kompiliert der echte Compiler, in deinem Browser.",
    },
  },
  ru: {
    docs: "Документация",
    onThisPage: "На этой странице",
    previous: "Назад",
    next: "Далее",
    loading: "Загрузка страницы...",
    failed: "Не удалось загрузить страницу.",
    language: "Язык",
    tone: { note: "Заметка", tip: "Совет", warning: "Внимание", danger: "Опасно" },
    demo: {
      template: "Шаблон",
      state: "Состояние",
      html: "Результат (HTML от render(state))",
      module: "Сгенерированный модуль",
      ast: "AST и что читает каждый узел",
      vnodes: "vnodes, которые возвращает render(state)",
      patches: "Патчи от diff(prev, next)",
      noPatches: "Патчей нет: менять нечего.",
      error: "Компилятор остановился:",
    },
    playground: {
      template: "Шаблон (.pavlus)",
      state: "Состояние (JSON)",
      run: "Скомпилировать и запустить",
      reset: "Сбросить",
      stateError: "Состояние — не корректный JSON:",
      hint: "Измените шаблон или состояние: результат ниже собирает настоящий компилятор, прямо в вашем браузере.",
    },
  },
  zh: {
    docs: "文档",
    onThisPage: "本页内容",
    previous: "上一页",
    next: "下一页",
    loading: "正在加载页面……",
    failed: "无法加载此页面。",
    language: "语言",
    tone: { note: "注意", tip: "提示", warning: "警告", danger: "危险" },
    demo: {
      template: "模板",
      state: "状态",
      html: "结果（render(state) 的 HTML）",
      module: "生成的模块",
      ast: "AST 以及每个节点读取的内容",
      vnodes: "render(state) 返回的 vnodes",
      patches: "diff(prev, next) 返回的补丁",
      noPatches: "没有补丁：无需更改。",
      error: "编译器已停止：",
    },
    playground: {
      template: "模板 (.pavlus)",
      state: "状态 (JSON)",
      run: "编译并运行",
      reset: "重置",
      stateError: "状态不是有效的 JSON：",
      hint: "修改模板或状态：下方结果由真正的编译器在你的浏览器中编译。",
    },
  },
};
