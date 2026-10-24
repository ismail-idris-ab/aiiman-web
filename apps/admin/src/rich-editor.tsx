import {
  CODE_LANGUAGES,
  isAllowedHref,
  isCodeLanguage,
  normaliseDoc,
  type Doc,
} from "@aiiman/shared";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Callout } from "./callout";

/** Only what the shared document model allows; images and embeds come later. */
const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    // Shiki ids, so the site highlights exactly what was picked here.
    codeBlock: {
      defaultLanguage: "plaintext",
      languageClassPrefix: "language-",
    },
    horizontalRule: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => isAllowedHref(url),
    },
  }),
  Callout,
];

interface Tool {
  label: string;
  /** Short text on the button; `label` is its accessible name. */
  text: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

function askLink(editor: Editor) {
  const current = editor.getAttributes("link").href as string | undefined;
  const answer = window.prompt(
    "Link address (https://…, mailto:… or a site path like /writing). Leave empty to remove the link.",
    current ?? "https://",
  );
  if (answer === null) return;
  const href = answer.trim();
  const chain = editor.chain().focus().extendMarkRange("link");
  if (href === "" || href === "https://") {
    chain.unsetLink().run();
  } else if (isAllowedHref(href)) {
    chain.setLink({ href }).run();
  } else {
    window.alert(
      "That address can't be linked. Use https://, mailto: or a path starting with /.",
    );
  }
}

function askCalloutTitle(editor: Editor) {
  const current = editor.getAttributes("callout").title as string | null;
  const answer = window.prompt("Callout title (optional)", current ?? "");
  if (answer !== null) editor.chain().focus().setCalloutTitle(answer).run();
}

const TOOLS: Tool[] = [
  ...([2, 3, 4] as const).map((level) => ({
    label: `Heading ${level}`,
    text: `H${level}`,
    isActive: (editor: Editor) => editor.isActive("heading", { level }),
    run: (editor: Editor) =>
      editor.chain().focus().toggleHeading({ level }).run(),
  })),
  {
    label: "Bold",
    text: "B",
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    label: "Italic",
    text: "I",
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    label: "Inline code",
    text: "</>",
    isActive: (editor) => editor.isActive("code"),
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    label: "Link",
    text: "Link",
    isActive: (editor) => editor.isActive("link"),
    run: askLink,
  },
  {
    label: "Bulleted list",
    text: "• List",
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    text: "1. List",
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Quote",
    text: "Quote",
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Callout",
    text: "Callout",
    isActive: (editor) => editor.isActive("callout"),
    run: (editor) => editor.chain().focus().toggleCallout().run(),
  },
  {
    label: "Code block",
    text: "Code",
    isActive: (editor) => editor.isActive("codeBlock"),
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

export function RichEditor({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: Doc;
  onChange: (doc: Doc) => void;
  describedBy?: string | undefined;
}) {
  const editor = useEditor({
    extensions,
    content: value,
    // The admin's CSP has no 'unsafe-inline' styles; editor styles live in styles.css.
    injectCSS: false,
    editorProps: {
      attributes: {
        id,
        class: "rich-editor-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": `${id}-label`,
        ...(describedBy === undefined
          ? {}
          : { "aria-describedby": describedBy }),
      },
    },
    // What the editor emits goes through the same allowlist the API applies.
    onUpdate: ({ editor: current }) =>
      onChange(normaliseDoc(current.getJSON())),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const language: unknown = current.getAttributes("codeBlock").language;
      return {
        active: TOOLS.map((tool) => tool.isActive(current)),
        inCallout: current.isActive("callout"),
        // null outside a code block.
        codeLanguage: current.isActive("codeBlock")
          ? isCodeLanguage(language)
            ? language
            : "plaintext"
          : null,
      };
    },
  });

  return (
    <div className="rich-editor">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((tool, index) => (
          <button
            key={tool.label}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            aria-pressed={state?.active[index] ?? false}
            onClick={() => tool.run(editor)}
          >
            {tool.text}
          </button>
        ))}
        {state?.inCallout ? (
          <button type="button" onClick={() => askCalloutTitle(editor)}>
            Callout title
          </button>
        ) : null}
        {state?.codeLanguage == null ? null : (
          <select
            aria-label="Code language"
            value={state.codeLanguage}
            onChange={(event) =>
              editor
                .chain()
                .focus()
                .updateAttributes("codeBlock", { language: event.target.value })
                .run()
            }
          >
            {Object.entries(CODE_LANGUAGES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
