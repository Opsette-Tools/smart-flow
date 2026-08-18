import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Button, Tooltip } from "antd";
import {
  BoldOutlined,
  ItalicOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
} from "@ant-design/icons";

interface Props {
  /** HTML. Owned by the parent (and by the doc), not by the editor. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * The summary editor — rich text, so bold and bullets are visible while editing
 * and survive a paste into Monday, Notion, Docs, or an email.
 *
 * The parent owns the value. Regenerating replaces it from outside, which the
 * sync effect below picks up; ordinary typing flows the other way through
 * onChange. The guard on that effect is what keeps the two from fighting.
 */
export function SummaryEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Headings would let a paste bring in sizes that fight the app's type
        // scale; the summary only ever needs bold, italic, and lists.
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      // Not part of StarterKit — without it the empty-editor class the CSS
      // hangs the placeholder on is never applied.
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "sf-summary-editor" },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Pull in changes that came from outside (Regenerate, or loading a saved doc).
  // Comparing against the editor's own HTML first is essential — without it,
  // every keystroke would round-trip and reset the cursor to the start.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const tool = (
    title: string,
    icon: React.ReactNode,
    isActive: boolean,
    run: () => void,
  ) => (
    <Tooltip title={title} key={title}>
      <Button
        type={isActive ? "primary" : "text"}
        size="small"
        icon={icon}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
        aria-label={title}
        aria-pressed={isActive}
      />
    </Tooltip>
  );

  return (
    <div className="sf-summary-shell">
      <div className="sf-summary-toolbar">
        {tool("Bold", <BoldOutlined />, editor.isActive("bold"), () =>
          editor.chain().focus().toggleBold().run(),
        )}
        {tool("Italic", <ItalicOutlined />, editor.isActive("italic"), () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {tool("Bulleted list", <UnorderedListOutlined />, editor.isActive("bulletList"), () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {tool("Numbered list", <OrderedListOutlined />, editor.isActive("orderedList"), () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
