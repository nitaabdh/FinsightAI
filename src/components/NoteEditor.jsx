import { useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import "./NoteEditor.css";

// ─── Toolbar Button ───────────────────────────────────────────────────────────
function ToolBtn({ onClick, active, title, children }) {
  return (
    <button
      className={`ne-tool-btn${active ? " active" : ""}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function NoteEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList:     { keepMarks: true },
        orderedList:    { keepMarks: true },
        horizontalRule: {},
        strike:         {},
      }),
      Underline,
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync content dari luar (saat buka note beda)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || "");
    }
  }, [content]);

  if (!editor) return null;

  const tools = [
    {
      group: "format",
      items: [
        { icon: "B",  title: "Bold",          active: editor.isActive("bold"),          action: () => editor.chain().focus().toggleBold().run() },
        { icon: "I",  title: "Italic",         active: editor.isActive("italic"),        action: () => editor.chain().focus().toggleItalic().run() },
        { icon: "U",  title: "Underline",      active: editor.isActive("underline"),     action: () => editor.chain().focus().toggleUnderline().run() },
        { icon: "S",  title: "Strikethrough",  active: editor.isActive("strike"),        action: () => editor.chain().focus().toggleStrike().run() },
      ],
    },
    {
      group: "list",
      items: [
        { icon: "•—", title: "Bullet list",   active: editor.isActive("bulletList"),    action: () => editor.chain().focus().toggleBulletList().run() },
        { icon: "1—", title: "Ordered list",  active: editor.isActive("orderedList"),   action: () => editor.chain().focus().toggleOrderedList().run() },
      ],
    },
    {
      group: "block",
      items: [
        { icon: "—",  title: "Horizontal rule", active: false,                          action: () => editor.chain().focus().setHorizontalRule().run() },
      ],
    },
  ];

  return (
    <div className="ne-wrapper">
      <div className="ne-toolbar">
        {tools.map((group, gi) => (
          <div key={gi} className="ne-tool-group">
            {group.items.map((t, ti) => (
              <ToolBtn key={ti} onClick={t.action} active={t.active} title={t.title}>
                <span className={`ne-icon ne-icon--${t.title.toLowerCase().replace(/\s/g,"-")}`}>
                  {t.icon}
                </span>
              </ToolBtn>
            ))}
          </div>
        ))}
      </div>
      <EditorContent editor={editor} className="ne-content" />
    </div>
  );
}
