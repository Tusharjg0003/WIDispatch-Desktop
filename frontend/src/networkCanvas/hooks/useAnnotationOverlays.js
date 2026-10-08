import { useCallback, useEffect, useRef, useState } from "react";
import { snapPosition } from "../../cytoscape/canvasGeometry";
import { escapeNoteHtml, noteHtmlToText, sanitizeNoteHtml } from "../lib/noteHtml";

const NOTE_DEFAULT = { w: 200, h: 90 };
const NOTE_MIN = { w: 80, h: 40 };
const BOX_DEFAULT = { w: 240, h: 160 };
const BOX_MIN = { w: 80, h: 60 };
const GROUP_PADDING = 50;

// Notes and group boxes as HTML overlays (SWIIMS syncNoteOverlays /
// handleNoteGripMouseDown / resizeGroupBoxFromHandle and the group-box
// grab/drag/free handlers):
//  - a note is a contentEditable rich-text editor that tracks its node through
//    pan and zoom, grows with its text, and moves by its grip (Alt skips snap);
//  - a group box carries the nodes inside it when dragged, and resizes from
//    its corner handle.
export default function useAnnotationOverlays({ cyRef, cyReady, snapToGridRef, readOnly, onCommit }) {
  const [overlays, setOverlays] = useState({ notes: [], boxes: [] });
  const activeEditorRef = useRef(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const sync = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const zoom = cy.zoom() || 1;
    const scale = Math.min(1.6, Math.max(0.55, zoom));
    const notes = cy.nodes('[type="note"]').filter((n) => n.visible()).map((node) => {
      const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      const data = node.data();
      const editor = activeEditorRef.current === node.id() ? document.querySelector(`[data-note-editor-id="${node.id()}"]`) : null;
      return {
        id: node.id(),
        html: editor?.innerHTML ?? (data.noteHtml ? sanitizeNoteHtml(data.noteHtml) : escapeNoteHtml(data.label || "")),
        selected: node.selected(),
        font: data.noteFont || "sans",
        size: data.noteSize || "normal",
        bold: data.noteBold === "true" || data.noteBold === true,
        italic: data.noteItalic === "true" || data.noteItalic === true,
        underline: data.noteUnderline === "true" || data.noteUnderline === true,
        left: bb.x1,
        top: bb.y1,
        width: bb.w,
        height: bb.h,
        scale,
      };
    });
    const boxes = cy.nodes('[type="group-box"]').filter((n) => n.visible()).map((node) => {
      const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
      return { id: node.id(), selected: node.selected(), left: bb.x1, top: bb.y1, width: bb.w, height: bb.h, label: node.data("label") || "" };
    });
    setOverlays({ notes, boxes });
  }, [cyRef]);

  // Re-sync on anything that moves, resizes, restyles or (de)selects them.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return undefined;
    // rAF for smooth tracking during pan/zoom, with a timer fallback: rAF is
    // paused while the window is hidden, and the overlays must still be right
    // when it comes back.
    let frame = null;
    let timer = null;
    const run = () => {
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      frame = null;
      timer = null;
      sync();
    };
    const schedule = () => {
      if (frame || timer) return;
      frame = requestAnimationFrame(run);
      timer = setTimeout(run, 60);
    };
    schedule();
    const events = "viewport add remove position data select unselect style";
    cy.on(events, schedule);
    return () => {
      cy.removeListener(events, schedule);
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [cyRef, cyReady, sync]);

  // ── Group box carries its contents (SWIIMS grab/drag/free handlers) ──────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return undefined;
    let carry = null;
    const onGrab = (evt) => {
      const box = evt.target;
      if (box.data("type") !== "group-box") return;
      const bb = box.boundingBox({ includeLabels: false, includeOverlays: false });
      const inside = cy.nodes().filter((n) => {
        if (n.id() === box.id() || n.data("type") === "group-box") return false;
        if (n.selected()) return false; // already moving with the selection
        const p = n.position();
        return p.x >= bb.x1 && p.x <= bb.x2 && p.y >= bb.y1 && p.y <= bb.y2;
      });
      carry = {
        id: box.id(),
        start: { ...box.position() },
        members: inside.map((n) => ({ node: n, pos: { ...n.position() } })),
      };
    };
    const onDrag = (evt) => {
      if (!carry || evt.target.id() !== carry.id) return;
      const p = evt.target.position();
      const dx = p.x - carry.start.x;
      const dy = p.y - carry.start.y;
      cy.batch(() => carry.members.forEach(({ node, pos }) => node.position({ x: pos.x + dx, y: pos.y + dy })));
    };
    const onFree = (evt) => {
      if (carry && evt.target.id() === carry.id) carry = null;
    };
    cy.on("grab", "node", onGrab);
    cy.on("drag", "node", onDrag);
    cy.on("free", "node", onFree);
    return () => {
      cy.removeListener("grab", "node", onGrab);
      cy.removeListener("drag", "node", onDrag);
      cy.removeListener("free", "node", onFree);
    };
  }, [cyRef, cyReady]);

  // ── Note editing ────────────────────────────────────────────────────────
  const commitNote = useCallback(
    (noteId, element) => {
      const cy = cyRef.current;
      const node = cy?.getElementById(noteId);
      if (!node || !node.length || !element) return;
      const html = sanitizeNoteHtml(element.innerHTML);
      if (html === (node.data("noteHtml") || "")) return;
      const text = noteHtmlToText(html) || "Note";
      node.data({ noteHtml: html, label: text, displayLabel: text });
      commitRef.current?.();
    },
    [cyRef]
  );

  const onNoteFocus = useCallback(
    (noteId) => {
      activeEditorRef.current = noteId;
      const cy = cyRef.current;
      const node = cy?.getElementById(noteId);
      if (node && node.length && !node.selected()) {
        cy.$(":selected").unselect();
        node.select();
      }
    },
    [cyRef]
  );

  const onNoteBlur = useCallback(
    (noteId, element) => {
      if (activeEditorRef.current === noteId) activeEditorRef.current = null;
      commitNote(noteId, element);
    },
    [commitNote]
  );

  // Auto-grow: keep the node at least as tall as its text (model units).
  const onNoteInput = useCallback(
    (noteId, element) => {
      const cy = cyRef.current;
      const node = cy?.getElementById(noteId);
      if (!node || !node.length || !element) return;
      const zoom = cy.zoom() || 1;
      const needed = Math.ceil(element.scrollHeight / zoom) + 4;
      const current = Number(node.data("boxHeight")) || NOTE_DEFAULT.h;
      if (needed > current) node.data("boxHeight", Math.max(NOTE_MIN.h, needed));
    },
    [cyRef]
  );

  /** Drag by the grip (the body is contentEditable, so it can't be the handle). */
  const startNoteDrag = useCallback(
    (event, noteId) => {
      if (event.button !== 0 || readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      const cy = cyRef.current;
      const node = cy?.getElementById(noteId);
      if (!node || !node.length) return;
      const zoom = cy.zoom() || 1;
      const start = { x: event.clientX, y: event.clientY };
      const origin = { ...node.position() };
      const onMove = (e) => {
        let next = { x: origin.x + (e.clientX - start.x) / zoom, y: origin.y + (e.clientY - start.y) / zoom };
        if (snapToGridRef?.current && !e.altKey) next = snapPosition(next);
        node.position(next);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        commitRef.current?.();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [cyRef, readOnly, snapToGridRef]
  );

  /** Resize a note or group box from its bottom-right handle, top-left fixed. */
  const startResize = useCallback(
    (event, nodeId) => {
      if (event.button !== 0 || readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      const cy = cyRef.current;
      const node = cy?.getElementById(nodeId);
      if (!node || !node.length) return;
      const isNote = node.data("type") === "note";
      const def = isNote ? NOTE_DEFAULT : BOX_DEFAULT;
      const min = isNote ? NOTE_MIN : BOX_MIN;
      const zoom = cy.zoom() || 1;
      const w0 = Number(node.data("boxWidth")) || def.w;
      const h0 = Number(node.data("boxHeight")) || def.h;
      const c0 = { ...node.position() };
      const topLeft = { x: c0.x - w0 / 2, y: c0.y - h0 / 2 };
      const start = { x: event.clientX, y: event.clientY };
      const onMove = (e) => {
        const w = Math.max(min.w, w0 + (e.clientX - start.x) / zoom);
        const h = Math.max(min.h, h0 + (e.clientY - start.y) / zoom);
        cy.batch(() => {
          node.data({ boxWidth: Math.round(w), boxHeight: Math.round(h) });
          node.position({ x: topLeft.x + w / 2, y: topLeft.y + h / 2 });
        });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        commitRef.current?.();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [cyRef, readOnly]
  );

  /** Rich-text command on the focused note; false when no note editor is focused. */
  const execNoteCommand = useCallback((command) => {
    const active = document.activeElement;
    if (!active || !active.hasAttribute?.("data-note-editor-id")) return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;
    document.execCommand(command, false);
    return true;
  }, []);

  return {
    overlays,
    sync,
    commitNote,
    onNoteFocus,
    onNoteBlur,
    onNoteInput,
    startNoteDrag,
    startResize,
    execNoteCommand,
  };
}

/** Bounding box for a group box around the given nodes (SWIIMS 50 padding). */
export function groupBoxAround(collection) {
  const bb = collection.boundingBox({ includeLabels: true, includeOverlays: false });
  const w = Math.round(bb.w + GROUP_PADDING * 2);
  const h = Math.round(bb.h + GROUP_PADDING * 2);
  return { position: { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 }, boxWidth: w, boxHeight: h };
}
