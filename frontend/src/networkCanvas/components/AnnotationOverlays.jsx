import React, { memo, useLayoutEffect, useRef } from "react";

const NOTE_FONT_FAMILY = {
  sans: 'var(--font-wtt), "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SFMono-Regular", Consolas, monospace',
};
const NOTE_FONT_PX = { small: 10, normal: 11, large: 13, xlarge: 15 };

// The contentEditable body. HTML is applied imperatively and only when it
// differs from what the user already has, so a React re-render can never
// clobber text mid-typing (SWIIMS NoteEditor).
const NoteEditor = memo(function NoteEditor({ noteId, html, readOnly, onFocus, onBlur, onInput }) {
  const ref = useRef(null);
  const appliedRef = useRef(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || html === appliedRef.current) return;
    if (el.innerHTML !== html && document.activeElement !== el) el.innerHTML = html ?? "";
    appliedRef.current = html;
  }, [html]);
  return (
    <div
      ref={ref}
      data-note-editor-id={noteId}
      className="nb-note__editor"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Note text"
      onFocus={() => onFocus(noteId)}
      onBlur={(e) => onBlur(noteId, e.currentTarget)}
      onInput={(e) => onInput(noteId, e.currentTarget)}
      // Typing must never reach the canvas shortcuts (Delete, arrows, F, Z…).
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
});

export default function AnnotationOverlays({ api, readOnly }) {
  const { overlays } = api;
  return (
    <div className="nb-annotations" aria-hidden={false}>
      {overlays.boxes.map((box) => (
        <div
          key={box.id}
          className={`nb-groupbox${box.selected ? " is-selected" : ""}`}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        >
          {box.selected && !readOnly && (
            <span
              className="nb-annotation__resize"
              title="Drag to resize"
              onMouseDown={(e) => api.startResize(e, box.id)}
            />
          )}
        </div>
      ))}
      {overlays.notes.map((note) => (
        <div
          key={note.id}
          className={`nb-note${note.selected ? " is-selected" : ""}`}
          style={{
            left: note.left,
            top: note.top,
            width: note.width,
            minHeight: note.height,
            "--note-scale": note.scale,
            fontFamily: NOTE_FONT_FAMILY[note.font] || NOTE_FONT_FAMILY.sans,
            fontSize: `calc(${NOTE_FONT_PX[note.size] || 11}px * var(--note-scale))`,
            fontWeight: note.bold ? 700 : 400,
            fontStyle: note.italic ? "italic" : "normal",
            textDecoration: note.underline ? "underline" : "none",
          }}
        >
          {!readOnly && (
            <span
              className="nb-note__grip"
              title="Drag to move (hold Alt to ignore the grid)"
              onMouseDown={(e) => api.startNoteDrag(e, note.id)}
            >
              ⋮⋮
            </span>
          )}
          <NoteEditor
            noteId={note.id}
            html={note.html}
            readOnly={readOnly}
            onFocus={api.onNoteFocus}
            onBlur={api.onNoteBlur}
            onInput={api.onNoteInput}
          />
          {note.selected && !readOnly && (
            <span className="nb-annotation__resize" title="Drag to resize" onMouseDown={(e) => api.startResize(e, note.id)} />
          )}
        </div>
      ))}
    </div>
  );
}
