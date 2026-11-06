import type { Question } from "../../blocks/quiz-question/quiz-question.ts";

export interface Test {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  level: string;
  /** The time limit, in minutes. */
  minutes: number;
  /** The pass mark, in percent. */
  pass: number;
  questions: Question[];
}

const q = (
  id: string,
  text: string,
  options: string[],
  correct: string,
  explanation: string,
): Question => ({
  id,
  text,
  options: options.map((t, i) => ({ id: "abcde"[i], text: t })),
  correct: correct.split(""),
  explanation,
});

export const TESTS: Test[] = [
  {
    id: "js",
    title: "JavaScript basics",
    blurb:
      "Types, arrays, equality and scope: what every first-year developer meets.",
    emoji: "🧪",
    level: "Beginner",
    minutes: 5,
    pass: 70,
    questions: [
      q(
        "js1",
        "What does typeof null return?",
        ['"null"', '"object"', '"undefined"', '"number"'],
        "b",
        'It is a famous quirk from the first version of the language: typeof null is "object". Check for null with === null.',
      ),
      q(
        "js2",
        "Which of these values are falsy?",
        ["0", '"0" (a string)', "null", "[] (an empty array)", "NaN"],
        "ace",
        'The falsy values are false, 0, "", null, undefined and NaN. A string "0" and an empty array are objects or non-empty strings, so they are truthy.',
      ),
      q(
        "js3",
        "What is the result of [1, 2, 3].map((n) => n * 2)?",
        ["[2, 4, 6]", "6", "[1, 2, 3]", "undefined"],
        "a",
        "map returns a new array with the callback applied to every element. It does not change the original.",
      ),
      q(
        "js4",
        "Which statements about const are true?",
        [
          "A const variable cannot be reassigned",
          "An object held by a const can still be changed",
          "const variables are hoisted and usable before their line",
          "const is block scoped",
        ],
        "abd",
        "const stops reassignment, not mutation, and it is block scoped. Before its declaration line it sits in the temporal dead zone: using it throws a ReferenceError.",
      ),
      q(
        "js5",
        'What does "5" + 3 evaluate to?',
        ["8", '"53"', "NaN", "TypeError"],
        "b",
        'With a string on one side, + concatenates: the number is turned into "3" and the result is "53". Minus would give 2.',
      ),
      q(
        "js6",
        "Which method adds an element to the end of an array?",
        ["unshift()", "push()", "concat()", "shift()"],
        "b",
        "push() appends and returns the new length. unshift() adds at the front, shift() removes from the front and concat() returns a new array.",
      ),
      q(
        "js7",
        "What is a pure function?",
        [
          "A function that always returns a number",
          "A function with the same output for the same input and no side effects",
          "A function declared with the function keyword",
          "A function that never takes arguments",
        ],
        "b",
        "A pure function depends only on its arguments and changes nothing outside. That makes it easy to test and to reason about.",
      ),
    ],
  },
  {
    id: "geo",
    title: "World geography",
    blurb: "Capitals, rivers, oceans and borders from every continent.",
    emoji: "🌍",
    level: "Easy",
    minutes: 4,
    pass: 60,
    questions: [
      q(
        "g1",
        "What is the capital of Australia?",
        ["Sydney", "Melbourne", "Canberra", "Perth"],
        "c",
        "Canberra was built as a compromise between Sydney and Melbourne, which both wanted to be the capital.",
      ),
      q(
        "g2",
        "Which of these rivers flow through more than one country?",
        ["Danube", "Rhine", "Seine", "Nile"],
        "abd",
        "The Danube crosses ten countries, the Rhine runs through several, and the Nile flows through eleven. The Seine stays in France.",
      ),
      q(
        "g3",
        "Which is the largest ocean?",
        ["Atlantic", "Indian", "Arctic", "Pacific"],
        "d",
        "The Pacific covers about a third of the planet, more than all the land put together.",
      ),
      q(
        "g4",
        "Which countries have a border with Switzerland?",
        ["Germany", "Spain", "Italy", "Austria", "Belgium"],
        "acd",
        "Switzerland borders Germany, France, Italy, Austria and Liechtenstein. Spain and Belgium are not neighbours.",
      ),
      q(
        "g5",
        "Which mountain range separates Europe from Asia in the north?",
        ["The Alps", "The Urals", "The Andes", "The Carpathians"],
        "b",
        "The Ural Mountains run from the Arctic Ocean south through Russia and Kazakhstan and mark the traditional boundary.",
      ),
      q(
        "g6",
        "What is the smallest country in the world by area?",
        ["Monaco", "Vatican City", "San Marino", "Malta"],
        "b",
        "Vatican City covers only about 0.44 square kilometres. Monaco is second.",
      ),
    ],
  },
  {
    id: "logic",
    title: "Logic and reasoning",
    blurb: "Sequences, syllogisms and a few traps for hurried readers.",
    emoji: "🧩",
    level: "Medium",
    minutes: 6,
    pass: 66,
    questions: [
      q(
        "l1",
        "What number comes next? 2, 6, 12, 20, 30, ...",
        ["38", "40", "42", "44"],
        "c",
        "The gaps grow by 2 each time: 4, 6, 8, 10, so the next gap is 12 and 30 + 12 = 42. They are n times (n + 1).",
      ),
      q(
        "l2",
        "All bloops are razzies. All razzies are lazzies. Which statements must be true?",
        [
          "All bloops are lazzies",
          "All lazzies are bloops",
          "Some lazzies are razzies",
          "No bloop is a lazzie",
        ],
        "ac",
        "The chain bloops, razzies, lazzies is transitive, so every bloop is a lazzie. The reverse is not given. Razzies are lazzies, so some lazzies are razzies.",
      ),
      q(
        "l3",
        "A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much is the ball?",
        ["$0.10", "$0.05", "$0.15", "$0.01"],
        "b",
        "If the ball is $0.05 the bat is $1.05 and together they are $1.10. At $0.10 the bat would be $1.10 and the total $1.20.",
      ),
      q(
        "l4",
        "Which of these are prime numbers?",
        ["21", "23", "29", "33", "37"],
        "bce",
        "23, 29 and 37 have no divisors but 1 and themselves. 21 is 3 times 7 and 33 is 3 times 11.",
      ),
      q(
        "l5",
        "If it rains, the street is wet. The street is wet. What follows?",
        [
          "It rained",
          "It did not rain",
          "Nothing for sure: something else may have wet it",
          "The street is dry",
        ],
        "c",
        "That is the fallacy of affirming the consequent. A wet street can have other causes, such as a street cleaner or a burst pipe.",
      ),
      q(
        "l6",
        "How many months have at least 28 days?",
        ["1", "2", "11", "12"],
        "d",
        "All twelve. February has 28 days at least, and every other month has more.",
      ),
    ],
  },
  {
    id: "space",
    title: "Space and science",
    blurb: "Planets, light and the periodic table, with a few surprises.",
    emoji: "🚀",
    level: "Medium",
    minutes: 5,
    pass: 66,
    questions: [
      q(
        "s1",
        "Which planet has the shortest year?",
        ["Venus", "Mercury", "Mars", "Earth"],
        "b",
        "Mercury circles the Sun in about 88 Earth days, the fastest of the planets.",
      ),
      q(
        "s2",
        "Which of these are gas giants or ice giants?",
        ["Jupiter", "Mars", "Neptune", "Saturn", "Mercury"],
        "acd",
        "Jupiter and Saturn are gas giants, Neptune is an ice giant. Mars and Mercury are rocky.",
      ),
      q(
        "s3",
        "What is the chemical symbol for gold?",
        ["Go", "Gd", "Au", "Ag"],
        "c",
        "Au comes from the Latin aurum. Ag is silver, from argentum.",
      ),
      q(
        "s4",
        "Roughly how long does light from the Sun take to reach Earth?",
        ["8 seconds", "8 minutes", "8 hours", "8 days"],
        "b",
        "About 8 minutes and 20 seconds: the Sun is 150 million kilometres away and light travels at 300,000 kilometres a second.",
      ),
      q(
        "s5",
        "Which of these are states of matter?",
        ["Solid", "Plasma", "Liquid", "Fusion"],
        "abc",
        "Solid, liquid, gas and plasma are states of matter. Fusion is a process, not a state.",
      ),
      q(
        "s6",
        "What force keeps the planets in orbit around the Sun?",
        ["Magnetism", "Friction", "Gravity", "Inertia alone"],
        "c",
        "Gravity pulls each planet toward the Sun, and its sideways speed keeps it falling around the Sun instead of into it.",
      ),
    ],
  },
];
