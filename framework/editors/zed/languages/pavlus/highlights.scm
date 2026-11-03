; Pavlus templates. Capture names are the ones Zed themes support.

(comment) @comment

; ---- keywords and line markers -------------------------------------------

[
  "import"
  "from"
  "if"
  "else"
  "for"
  "in"
  "key"
] @keyword

(pipe) @punctuation.special
(embed_marker) @punctuation.special

; ---- imports and embedded children ----------------------------------------

(import_path) @string

; +Row, import Row ...: the component is a type-like name
(component_name) @constructor

; +outlet: the built-in routed child
((component_name) @keyword
  (#eq? @keyword "outlet"))

; +Row#users: the instance name (message prefix and state key)
(instance_name) @variable.special

(prop_name) @property

; ---- elements -------------------------------------------------------------

(tag_name) @tag
(class_name) @type
(id_name) @constant

; ---- attributes -----------------------------------------------------------

(attribute_name) @attribute
(class_toggle_name) @attribute

; @click.prevent=remove(user): the event is a label, the message a function
(event_name) @label
(message_id) @function

(attribute_string) @string
(string_content) @string
(escape) @string.escape

; ---- loops ----------------------------------------------------------------

(loop_variable) @variable.parameter

; ---- expressions ----------------------------------------------------------

(identifier) @variable
(property_identifier) @property

(call_expression
  function: (identifier) @function)

(call_expression
  function: (member_expression
    property: (property_identifier) @function))

(number) @number
(string) @string
(boolean) @boolean
[
  (null)
  (undefined)
] @constant.builtin

[
  "+"
  "-"
  "*"
  "/"
  "%"
  "=="
  "!="
  "==="
  "!=="
  "<"
  ">"
  "<="
  ">="
  "&&"
  "||"
  "??"
  "!"
  "?"
  ":"
  "?."
  "="
  "..."
] @operator

[
  "."
  ","
] @punctuation.delimiter

[
  "("
  ")"
  "["
  "]"
] @punctuation.bracket

; {expr} in text, attributes and props
(interpolation
  "{" @punctuation.special
  "}" @punctuation.special)
