/**
 * Tree-sitter grammar for pavlus templates.
 *
 * The language is indentation based, but every construct fits on one line, so
 * the grammar is line based and needs no external scanner: indentation is
 * whitespace and the tree is flat (a list of lines). That is all syntax
 * highlighting needs. Nesting is the compiler's job (src/template/parser.ts).
 *
 * Whitespace-sensitive spots mirror the compiler:
 *  - `.class`, `#id` and `(` directly after a tag are selectors/attributes;
 *    after a space they are text. That is `token.immediate` with a lexical
 *    precedence so they beat the text-word token.
 *  - `//` starts a comment when preceded by whitespace (or at line start),
 *    except on `|` lines, where everything is text.
 */

const PREC = {
  ternary: 0,
  coalesce: 1,
  or: 2,
  and: 3,
  equality: 4,
  relational: 5,
  additive: 6,
  multiplicative: 7,
  unary: 8,
  postfix: 9,
};

const commaSep = (rule) => optional(seq(rule, repeat(seq(',', rule))));

module.exports = grammar({
  name: "pavlus",

  // Newlines are significant (they end a line); other whitespace is not.
  extras: ($) => [/[ \t\f]+/, $.comment],

  rules: {
    source_file: ($) =>
      seq(
        repeat(seq(optional($._line), $._newline)),
        optional($._line),
      ),

    _newline: () => /\r?\n/,

    // Beats a text word (so `p hi // note` has a comment) but not `pipe_text`.
    comment: () => token(prec(1, /\/\/[^\r\n]*/)),

    _line: ($) =>
      choice(
        $.import_line,
        $.if_line,
        $.else_if_line,
        $.else_line,
        $.for_line,
        $.text_line,
        $.pipe_line,
        $.embed_line,
        $.element_line,
      ),

    // ---- structure lines -------------------------------------------------

    // import Row from "./row.pavlus"
    import_line: ($) =>
      seq("import", $.component_name, "from", $.import_path),

    import_path: () => token(choice(/"[^"\r\n]*"/, /'[^'\r\n]*'/)),

    // if expr[:]
    if_line: ($) => seq("if", $._expression, optional(":")),

    // else if expr[:]
    else_if_line: ($) => seq("else", "if", $._expression, optional(":")),

    // else[:]
    else_line: () => seq("else", optional(":")),

    // for item[, index] in expr [key expr][:]
    for_line: ($) =>
      seq(
        "for",
        $.loop_variable,
        optional(seq(",", $.loop_variable)),
        "in",
        $._expression,
        optional(seq("key", $._expression)),
        optional(":"),
      ),

    loop_variable: () => /[A-Za-z_$][\w$]*/,

    // {expr} lines, with optional trailing text
    text_line: ($) => seq($.interpolation, repeat($._inline_part)),

    // | text with {interpolation}
    pipe_line: ($) =>
      seq(alias("|", $.pipe), repeat(choice($.pipe_text, $.interpolation, $.escape))),

    // Everything up to `{` or a backslash escape, `//` included.
    pipe_text: () => token(prec(2, /([^{\\\r\n]|\\[^{}\r\n])+/)),

    // ---- embedded children ----------------------------------------------

    // +Name#instance(props)   +{expr}#instance(props)
    embed_line: ($) =>
      seq(
        alias("+", $.embed_marker),
        choice($.component_name, $.interpolation),
        optional($.instance_name),
        optional($.props),
      ),

    component_name: () => /[A-Za-z_$][\w$]*/,

    instance_name: () => token.immediate(prec(2, /#[A-Za-z_$][\w$]*/)),

    props: ($) =>
      seq(
        token.immediate(prec(2, "(")),
        repeat(choice($.prop, $.spread, ",")),
        ")",
      ),

    prop: ($) => seq($.prop_name, optional(seq("=", $._attr_value))),

    prop_name: () => /[A-Za-z_$][\w$]*/,

    spread: ($) => seq("...", $._expression),

    // ---- elements --------------------------------------------------------

    element_line: ($) =>
      seq(
        choice(
          seq($.tag_name, repeat($._selector)),
          seq($._first_selector, repeat($._selector)),
        ),
        optional($.attributes),
        repeat($._inline_part),
      ),

    tag_name: () => /[A-Za-z][\w-]*/,

    _first_selector: ($) =>
      choice(
        alias(/\.[\w-]+/, $.class_name),
        alias(/#[\w-]+/, $.id_name),
      ),

    _selector: ($) =>
      choice(
        alias(token.immediate(prec(2, /\.[\w-]+/)), $.class_name),
        alias(token.immediate(prec(2, /#[\w-]+/)), $.id_name),
      ),

    attributes: ($) =>
      seq(
        token.immediate(prec(2, "(")),
        repeat(choice($.attribute, $.event_attribute, $.class_toggle, ",")),
        ")",
      ),

    attribute: ($) => seq($.attribute_name, optional(seq("=", $._attr_value))),

    attribute_name: () => /[A-Za-z_][\w-]*(:[\w-]+)*/,

    // class:active=cond
    class_toggle: ($) =>
      seq(alias(token(prec(1, /class:[\w-]+/)), $.class_toggle_name), "=", $._attr_value),

    // @click.prevent=remove(user)
    event_attribute: ($) =>
      seq(
        $.event_name,
        optional(seq("=", choice($.handler, alias($._braced_handler, $.interpolation)))),
      ),

    event_name: () => /@[\w-]+(\.[\w-]+)*/,

    _braced_handler: ($) => seq("{", $.handler, "}"),

    handler: ($) => seq($.message_id, optional($.handler_arguments)),

    message_id: () => /[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*/,

    handler_arguments: ($) => seq(token.immediate("("), commaSep($._expression), ")"),

    // Quoted values are text with interpolations. The quote has a lexical
    // precedence over expression strings so `"a {b}"` is never one string.
    _attr_value: ($) =>
      choice($.attribute_string, $.interpolation, $._expression),

    attribute_string: ($) =>
      choice(
        seq(
          token(prec(3, '"')),
          repeat(choice(alias(/[^"{\\\r\n]+/, $.string_content), $.interpolation, $.escape)),
          '"',
        ),
        seq(
          token(prec(3, "'")),
          repeat(choice(alias(/[^'{\\\r\n]+/, $.string_content), $.interpolation, $.escape)),
          "'",
        ),
      ),

    // ---- text ------------------------------------------------------------

    _inline_part: ($) => choice($.text, $.interpolation, $.escape),

    // A run of non-space characters; whitespace between words is skipped, so
    // a `// comment` after whitespace is still found.
    text: () => /([^\s{\\]|\\[^{}\s])+/,

    escape: () => /\\[{}]/,

    interpolation: ($) => seq("{", $._expression, "}"),

    // ---- expressions -----------------------------------------------------

    _expression: ($) =>
      choice(
        $.ternary_expression,
        $.binary_expression,
        $.unary_expression,
        $.call_expression,
        $.member_expression,
        $.index_expression,
        $.parenthesized_expression,
        $.array,
        $.identifier,
        $.number,
        $.string,
        $.boolean,
        $.null,
        $.undefined,
      ),

    ternary_expression: ($) =>
      prec.right(
        PREC.ternary,
        seq($._expression, "?", $._expression, ":", $._expression),
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ["??", PREC.coalesce],
          ["||", PREC.or],
          ["&&", PREC.and],
          ["==", PREC.equality],
          ["!=", PREC.equality],
          ["===", PREC.equality],
          ["!==", PREC.equality],
          ["<", PREC.relational],
          [">", PREC.relational],
          ["<=", PREC.relational],
          [">=", PREC.relational],
          ["+", PREC.additive],
          ["-", PREC.additive],
          ["*", PREC.multiplicative],
          ["/", PREC.multiplicative],
          ["%", PREC.multiplicative],
        ].map(([op, p]) =>
          prec.left(p, seq(field("left", $._expression), field("operator", op), field("right", $._expression)))
        ),
      ),

    unary_expression: ($) =>
      prec(PREC.unary, seq(field("operator", choice("!", "-", "+")), field("argument", $._expression))),

    call_expression: ($) =>
      prec(
        PREC.postfix,
        seq(field("function", $._expression), "(", commaSep($._expression), ")"),
      ),

    member_expression: ($) =>
      prec(
        PREC.postfix,
        seq(
          field("object", $._expression),
          choice(".", "?."),
          field("property", alias($.identifier, $.property_identifier)),
        ),
      ),

    index_expression: ($) =>
      prec(PREC.postfix, seq(field("object", $._expression), "[", $._expression, "]")),

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    array: ($) => seq("[", commaSep($._expression), "]"),

    identifier: () => /[A-Za-z_$][\w$]*/,

    number: () => /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/,

    string: () => token(choice(/"([^"\\\r\n]|\\.)*"/, /'([^'\\\r\n]|\\.)*'/)),

    boolean: () => choice("true", "false"),
    null: () => "null",
    undefined: () => "undefined",
  },
});
