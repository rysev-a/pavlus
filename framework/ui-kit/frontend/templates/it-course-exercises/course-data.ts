/** The course "Linux and Git basics": modules, lessons, theory and exercises. */
import type { OutlineModule } from "../../blocks/lesson-outline/outline.ts";
import { HOME, type Fs, makeFs } from "../../blocks/terminal-sim/fs.ts";
import { run } from "../../blocks/terminal-sim/commands.ts";
import type { Exercise, TerminalExercise } from "./checks.ts";

export const COURSE = {
  title: "Linux and Git basics",
  blurb:
    "Find your way around a terminal, make and move files, then keep the history of a project with git. Every lesson is a short read and a few exercises, and the last one of each is a real terminal.",
  /** The date on the certificate: the app has no clock. */
  date: "3 November 2026",
};

export type TheoryPart =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; title: string; lang: string; code: string }
  | {
      kind: "note";
      tone: "note" | "tip" | "warning" | "danger";
      title: string;
      text: string;
    };

export interface Lesson {
  id: string;
  module: string;
  title: string;
  summary: string;
  theory: TheoryPart[];
  exercises: Exercise[];
}

const h = (path: string): string => `${HOME}/${path}`;

const term = (
  id: string,
  xp: number,
  prompt: string,
  rest: Pick<TerminalExercise, "goals" | "hints" | "explain"> &
    Partial<Pick<TerminalExercise, "files" | "cwd" | "setup" | "intro">>,
): TerminalExercise => ({
  id,
  kind: "terminal",
  xp,
  prompt,
  files: rest.files ?? { [h("notes.txt")]: "Remember the milk.\n" },
  cwd: rest.cwd ?? HOME,
  setup: rest.setup ?? [],
  intro: rest.intro ?? [`Task: ${prompt}`],
  goals: rest.goals,
  hints: rest.hints,
  explain: rest.explain,
});

export const LESSONS: Lesson[] = [
  {
    id: "where",
    module: "shell",
    title: "Where am I?",
    summary: "pwd, ls and cd",
    theory: [
      {
        kind: "p",
        text: "A terminal shows a prompt and waits for a command. Every command runs in a folder: the current folder, which the prompt shows. Three small commands are enough to find your way.",
      },
      {
        kind: "code",
        title: "Terminal",
        lang: "sh",
        code: "pwd          # print the folder you are in\nls           # list what is inside it\ncd docs      # go into the folder docs\ncd ..        # go one folder up\ncd           # go home",
      },
      {
        kind: "note",
        tone: "tip",
        title: "Paths",
        text: "cd takes a path. A path that starts with / begins at the top of the disk, any other path begins in the current folder, and ~ is your home folder. cd projects/site goes two folders down at once.",
      },
    ],
    exercises: [
      {
        id: "where-1",
        kind: "choice",
        xp: 10,
        hints: ["One of them has the letters of 'print working directory'."],
        explain: "pwd prints the working directory: the folder you are in.",
        ex: {
          prompt: "Which command prints the folder you are in?",
          mono: true,
          options: [
            { id: "a", text: "ls" },
            { id: "b", text: "pwd" },
            { id: "c", text: "cd" },
            { id: "d", text: "cat" },
          ],
          correct: ["b"],
        },
      },
      {
        id: "where-2",
        kind: "gaps",
        xp: 15,
        hints: [
          "Going up is two dots.",
          "The first line is cd with two dots, the second lists files, the third changes folder.",
        ],
        explain: "cd .. goes up, ls lists, cd docs goes into docs.",
        ex: {
          prompt: "Complete the commands.",
          code: true,
          template:
            "[[cd]] ..       # go one folder up\n[[ls]]          # list the files\n[[cd]] docs     # go into the folder docs",
        },
      },
      term("where-3", 25, "Go into the folder projects/site.", {
        files: {
          [h("projects/site/index.html")]: "<h1>Hello</h1>\n",
          [h("projects/blog/post.md")]: "# First\n",
          [h("notes.txt")]: "Remember the milk.\n",
        },
        goals: [
          {
            kind: "cwd",
            path: h("projects/site"),
            label: "You are in ~/projects/site",
          },
        ],
        hints: [
          "Use cd followed by the path of the folder.",
          "cd projects/site, or two steps: cd projects, then cd site.",
        ],
        explain: "The prompt shows ~/projects/site: you are there.",
      }),
    ],
  },
  {
    id: "making",
    module: "shell",
    title: "Making files and folders",
    summary: "mkdir, touch, echo and cat",
    theory: [
      {
        kind: "p",
        text: "mkdir makes a folder and touch makes an empty file. echo prints text, and a > sends that text into a file instead of the screen. cat shows a file.",
      },
      {
        kind: "code",
        title: "Terminal",
        lang: "sh",
        code: 'mkdir notes                   # a new folder\ntouch todo.txt                # an empty file\necho "buy milk" > todo.txt    # write text into a file\necho "call Sam" >> todo.txt   # add a line at the end\ncat todo.txt                  # show the file',
      },
      {
        kind: "note",
        tone: "warning",
        title: "One arrow or two",
        text: "A single > replaces the whole file. Two, >>, add to the end. Mixing them up is the most common way to lose a file.",
      },
    ],
    exercises: [
      {
        id: "making-1",
        kind: "choice",
        xp: 10,
        hints: ["Count the arrows: one replaces, two add."],
        explain:
          ">> appends: the file keeps what it had and gets one line more.",
        ex: {
          prompt: "What does echo hi >> log.txt do?",
          options: [
            { id: "a", text: "Replaces log.txt with the word hi" },
            { id: "b", text: "Adds the word hi at the end of log.txt" },
            { id: "c", text: "Prints hi twice" },
            { id: "d", text: "Makes a folder called log.txt" },
          ],
          correct: ["b"],
        },
      },
      {
        id: "making-2",
        kind: "order",
        xp: 15,
        hints: [
          "You cannot go into a folder before it exists.",
          "Make the folder, go in, write the file, then show it.",
        ],
        explain: "The folder first, then work inside it.",
        ex: {
          prompt:
            "Put the commands in order: make a folder app, go into it, write hello into main.txt and show the file.",
          mono: true,
          items: [
            { id: "mk", text: "mkdir app" },
            { id: "cd", text: "cd app" },
            { id: "echo", text: "echo hello > main.txt" },
            { id: "cat", text: "cat main.txt" },
          ],
        },
      },
      {
        id: "making-3",
        kind: "gaps",
        xp: 15,
        hints: ["Make a folder, an empty file, and show it."],
        explain: "mkdir, touch and cat do the three jobs.",
        ex: {
          prompt: "Make a folder, an empty file in it, and show the file.",
          code: true,
          template:
            "[[mkdir]] projects\n[[touch]] projects/a.txt\n[[cat]] projects/a.txt",
        },
      },
      term(
        "making-4",
        25,
        "Make a folder docs with a file readme.md inside it that contains the word Hello.",
        {
          goals: [
            { kind: "dir", path: h("docs"), label: "A folder docs exists" },
            {
              kind: "file",
              path: h("docs/readme.md"),
              label: "docs has a file readme.md",
            },
            {
              kind: "file",
              path: h("docs/readme.md"),
              contains: "Hello",
              label: "readme.md contains Hello",
            },
          ],
          hints: [
            "mkdir makes the folder; echo ... > file writes text into a file.",
            "mkdir docs, then echo Hello > docs/readme.md",
          ],
          explain: "A folder and a file with the right words inside.",
        },
      ),
    ],
  },
  {
    id: "moving",
    module: "shell",
    title: "Copying, moving and removing",
    summary: "cp, mv and rm",
    theory: [
      {
        kind: "p",
        text: "cp copies a file, mv moves it or renames it (the same command: a rename is a move to a new name), and rm removes it.",
      },
      {
        kind: "code",
        title: "Terminal",
        lang: "sh",
        code: "cp report.txt backup.txt     # copy\nmv backup.txt archive/       # move into a folder\nmv report.txt final.txt      # rename\nrm old.txt                   # delete a file\nrm -r old-folder             # delete a folder and what is in it",
      },
      {
        kind: "note",
        tone: "danger",
        title: "There is no trash can",
        text: "rm deletes at once and for good. Read the command twice before you press Enter, especially with -r.",
      },
    ],
    exercises: [
      {
        id: "moving-1",
        kind: "choice",
        xp: 10,
        hints: [
          "Think about which commands leave nothing behind under the old name.",
        ],
        explain:
          "rm deletes the file and mv takes it away from the old name. cp and cat leave it where it is.",
        ex: {
          prompt:
            "Which commands remove a file from its old name? Select all that apply.",
          mono: true,
          options: [
            { id: "a", text: "rm a.txt" },
            { id: "b", text: "cp a.txt b.txt" },
            { id: "c", text: "mv a.txt b.txt" },
            { id: "d", text: "cat a.txt" },
          ],
          correct: ["a", "c"],
        },
      },
      {
        id: "moving-2",
        kind: "gaps",
        xp: 15,
        hints: ["Rename is mv, copy is cp."],
        explain: "mv renames, cp copies, rm -r deletes a folder.",
        ex: {
          prompt:
            "Rename draft.txt to final.txt, copy it, and remove the folder drafts.",
          code: true,
          template:
            "[[mv]] draft.txt final.txt\n[[cp]] final.txt backup.txt\n[[rm]] -r drafts",
        },
      },
      term(
        "moving-3",
        25,
        "Rename draft.txt to final.txt and delete the folder old.",
        {
          files: {
            [h("draft.txt")]: "first idea\n",
            [h("old/x.txt")]: "stale\n",
            [h("old/y.txt")]: "stale\n",
          },
          goals: [
            {
              kind: "file",
              path: h("final.txt"),
              contains: "first idea",
              label: "final.txt has the text of the draft",
            },
            {
              kind: "missing",
              path: h("draft.txt"),
              label: "draft.txt is gone",
            },
            {
              kind: "missing",
              path: h("old"),
              label: "The folder old is gone",
            },
          ],
          hints: [
            "Renaming is moving: mv old-name new-name.",
            "A folder needs rm -r.",
          ],
          explain: "Renamed and cleaned up.",
        },
      ),
    ],
  },
  {
    id: "repo",
    module: "git",
    title: "Your first repository",
    summary: "git init and git status",
    theory: [
      {
        kind: "p",
        text: "git remembers every version of your files. A repository is an ordinary folder with a hidden folder called .git inside it, where the history lives. git init makes one; git status says what changed since the last save.",
      },
      {
        kind: "code",
        title: "Terminal",
        lang: "sh",
        code: "mkdir blog\ncd blog\ngit init       # start tracking this folder\ngit status     # what changed?",
      },
      {
        kind: "note",
        tone: "note",
        title: "Hidden files",
        text: "Names that start with a dot are hidden. ls -a shows them, and you will see .git appear after git init.",
      },
    ],
    exercises: [
      {
        id: "repo-1",
        kind: "choice",
        xp: 10,
        hints: ["It does not save, show or download anything: it starts."],
        explain: "git init starts a repository in the current folder.",
        ex: {
          prompt: "What does git init do?",
          options: [
            { id: "a", text: "Downloads a project from the internet" },
            { id: "b", text: "Starts a repository in the current folder" },
            { id: "c", text: "Saves your latest changes" },
            { id: "d", text: "Shows the history" },
          ],
          correct: ["b"],
        },
      },
      {
        id: "repo-2",
        kind: "order",
        xp: 15,
        hints: ["Make the folder and go into it before git init."],
        explain:
          "The folder first, then the repository inside it, then a look at the state.",
        ex: {
          prompt: "Start a project: put the commands in order.",
          mono: true,
          items: [
            { id: "mk", text: "mkdir blog" },
            { id: "cd", text: "cd blog" },
            { id: "init", text: "git init" },
            { id: "st", text: "git status" },
          ],
        },
      },
      term("repo-3", 25, "Turn the folder site into a git repository.", {
        files: { [h("site/index.html")]: "<h1>Hello</h1>\n" },
        goals: [
          {
            kind: "repo",
            path: h("site"),
            label: "The folder site is a git repository",
          },
        ],
        hints: [
          "git init works in the current folder, so go into site first.",
          "cd site, then git init",
        ],
        explain: "There is a .git folder inside site now.",
      }),
    ],
  },
  {
    id: "commit",
    module: "git",
    title: "Saving a snapshot",
    summary: "git add, git commit and git log",
    theory: [
      {
        kind: "p",
        text: "A change reaches the history in two steps. git add puts it in the staging area (the next snapshot), git commit saves the snapshot with a message. git log lists the snapshots, newest first.",
      },
      {
        kind: "code",
        title: "Terminal",
        lang: "sh",
        code: 'git add notes.txt              # stage a file\ngit commit -m "Add the notes"  # save a snapshot\ngit log --oneline              # the history',
      },
      {
        kind: "note",
        tone: "tip",
        title: "A good message",
        text: "A message says what the snapshot does, in a few words. git add . stages every change below the current folder at once.",
      },
    ],
    exercises: [
      {
        id: "commit-1",
        kind: "gaps",
        xp: 15,
        hints: ["Stage, save, look."],
        explain: "add stages, commit saves, log shows the history.",
        ex: {
          prompt: "Save the file in a commit and look at the history.",
          code: true,
          template:
            'git [[add]] notes.txt\ngit [[commit|ci]] -m "Add the notes"\ngit [[log]] --oneline',
        },
      },
      {
        id: "commit-2",
        kind: "order",
        xp: 15,
        hints: ["You cannot stage a change that is not made yet."],
        explain:
          "Edit, stage, check, commit. Looking at the status can also come right after the edit.",
        ex: {
          prompt: "Put the steps of saving a change in order.",
          mono: true,
          items: [
            { id: "edit", text: "echo more >> notes.txt" },
            { id: "add", text: "git add notes.txt" },
            { id: "status", text: "git status" },
            { id: "commit", text: 'git commit -m "Update the notes"' },
          ],
          alternatives: [["edit", "status", "add", "commit"]],
        },
      },
      {
        id: "commit-3",
        kind: "choice",
        xp: 10,
        hints: ["Something has to be staged before it can be saved."],
        explain:
          "git commit saves what is staged. Without git add the change is not part of the snapshot.",
        ex: {
          prompt:
            "You edited a file and ran git commit -m fix, but git says there is nothing to commit. What did you forget?",
          options: [
            { id: "a", text: "git push" },
            { id: "b", text: "git add, to stage the change" },
            { id: "c", text: "git init" },
            { id: "d", text: "A second branch" },
          ],
          correct: ["b"],
        },
      },
      term("commit-4", 25, 'Commit post.md with the message "First post".', {
        files: { [h("blog/post.md")]: "# Hello\n\nMy first post.\n" },
        cwd: h("blog"),
        setup: ["git init"],
        intro: [
          "The repository is ready. The file post.md is not saved yet.",
          'Task: commit post.md with the message "First post".',
        ],
        goals: [
          {
            kind: "tracked",
            path: h("blog"),
            file: "post.md",
            label: "post.md is saved in the history",
          },
          {
            kind: "message",
            path: h("blog"),
            contains: "First post",
            label: 'The commit message is "First post"',
          },
          {
            kind: "clean",
            path: h("blog"),
            label: "Nothing is left unsaved",
          },
        ],
        hints: [
          "Stage the file first, then commit.",
          'git add post.md, then git commit -m "First post"',
        ],
        explain: "post.md is in the history and the working tree is clean.",
      }),
    ],
  },
  {
    id: "branches",
    module: "git",
    title: "Branches",
    summary: "git branch, checkout and merge",
    theory: [
      {
        kind: "p",
        text: "A branch is a movable label on a commit. Work on a branch does not touch main until you merge it, so you can try an idea safely.",
      },
      {
        kind: "code",
        title: "Terminal",
        lang: "sh",
        code: "git branch                 # list the branches\ngit checkout -b feature    # make a branch and switch to it\ngit checkout main          # switch back\ngit merge feature          # bring its work into the current branch",
      },
      {
        kind: "note",
        tone: "note",
        title: "Where the files go",
        text: "When you switch branch, the files in the folder change to match it. Save your work with a commit before you switch.",
      },
    ],
    exercises: [
      {
        id: "branches-1",
        kind: "choice",
        xp: 10,
        hints: ["It must create the branch and also move you onto it."],
        explain:
          "checkout -b creates the branch and switches to it in one step.",
        ex: {
          prompt:
            "Which command creates a branch called login and switches to it?",
          mono: true,
          options: [
            { id: "a", text: "git branch login" },
            { id: "b", text: "git checkout -b login" },
            { id: "c", text: "git merge login" },
            { id: "d", text: "git log login" },
          ],
          correct: ["b"],
        },
      },
      {
        id: "branches-2",
        kind: "gaps",
        xp: 15,
        hints: ["Go back to main, merge, then tidy up."],
        explain:
          "Switch to main, merge the feature, delete the finished branch.",
        ex: {
          prompt:
            "Go back to main, merge feature into it, then delete the branch.",
          code: true,
          template:
            "git [[checkout|switch]] main\ngit [[merge]] feature\ngit [[branch]] -d feature",
        },
      },
      term(
        "branches-3",
        25,
        "Make a branch feature, add a file feature.txt on it and commit the file.",
        {
          files: { [h("app/app.txt")]: "v1\n" },
          cwd: h("app"),
          setup: ["git init", "git add app.txt", 'git commit -m "Start"'],
          intro: [
            "The repository has one commit on main.",
            "Task: make a branch feature, add feature.txt on it and commit the file.",
          ],
          goals: [
            {
              kind: "branch",
              path: h("app"),
              name: "feature",
              current: true,
              label: "You are on the branch feature",
            },
            {
              kind: "tracked",
              path: h("app"),
              file: "feature.txt",
              label: "feature.txt is saved in a commit",
            },
            {
              kind: "commits",
              path: h("app"),
              min: 2,
              label: "The history has a second commit",
            },
          ],
          hints: [
            "git checkout -b makes the branch and switches to it.",
            'git checkout -b feature, then touch feature.txt, git add feature.txt and git commit -m "Add feature"',
          ],
          explain: "The new file lives on feature; main is untouched.",
        },
      ),
    ],
  },
];

export const MODULES: (OutlineModule & { blurb: string })[] = [
  {
    id: "shell",
    title: "The command line",
    summary: "Move around, make, copy and remove files",
    blurb: "",
    lessons: [],
  },
  {
    id: "git",
    title: "Git basics",
    summary: "Keep the history of a project",
    blurb: "",
    lessons: [],
  },
].map((m) => ({
  ...m,
  lessons: LESSONS.filter((l) => l.module === m.id).map((l) => ({
    id: l.id,
    title: l.title,
    exercises: l.exercises.length,
    xp: l.exercises.reduce((n, e) => n + e.xp, 0),
  })),
}));

export const lessonById = (id: string): Lesson | undefined =>
  LESSONS.find((l) => l.id === id);

/** Pure: the lesson after this one in course order, or null at the end. */
export function lessonAfter(id: string): Lesson | null {
  const at = LESSONS.findIndex((l) => l.id === id);
  return at >= 0 && at < LESSONS.length - 1 ? LESSONS[at + 1] : null;
}

export const TOTAL_XP = LESSONS.flatMap((l) => l.exercises).reduce(
  (n, e) => n + e.xp,
  0,
);

/** Pure: the starting file system of a terminal exercise, after its setup commands. */
export function startOf(ex: TerminalExercise): { fs: Fs; cwd: string } {
  let fs = makeFs(ex.files);
  let cwd = ex.cwd;
  for (const command of ex.setup) {
    const r = run(fs, cwd, command);
    fs = r.fs;
    cwd = r.cwd;
  }
  return { fs, cwd };
}
