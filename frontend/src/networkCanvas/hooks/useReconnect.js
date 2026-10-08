import { useCallback, useEffect, useRef, useState } from "react";

export const RECONNECT_MODE = "reconnect";
const ANNOTATION_TYPES = new Set(["note", "group-box"]);

// Change Source / Change Destination (SWIIMS beginReconnect): pick a pipe end
// from the right-click menu, then click the node it should attach to. The
// pipe is rebuilt with the same id and data on the new endpoint, with its
// bends cleared (they were expressed against the old endpoints).
export default function useReconnect({ cyRef, cyReady, mode, setMode, onToast, onChanged }) {
  const [pending, setPending] = useState(null); // { edgeId, end: "source" | "target" }
  const pendingRef = useRef(null);
  const modeRef = useRef(mode);
  const cbRef = useRef({ setMode, onToast, onChanged });
  modeRef.current = mode;
  cbRef.current = { setMode, onToast, onChanged };

  const clear = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.$(".reconnect-source").removeClass("reconnect-source");
    pendingRef.current = null;
    setPending(null);
  }, [cyRef]);

  useEffect(() => {
    if (mode !== RECONNECT_MODE && pendingRef.current) clear();
  }, [mode, clear]);

  const begin = useCallback(
    (edge, end) => {
      const cy = cyRef.current;
      if (!cy || !edge || !edge.length) return;
      cbRef.current.setMode(RECONNECT_MODE);
      const next = { edgeId: edge.id(), end };
      pendingRef.current = next;
      setPending(next);
      edge.addClass("reconnect-source");
      cbRef.current.onToast?.(`Click the node that should become this pipe's ${end === "source" ? "source" : "destination"}. Esc to cancel.`);
    },
    [cyRef]
  );

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return undefined;
    const onNodeTap = (evt) => {
      if (modeRef.current !== RECONNECT_MODE || !pendingRef.current) return;
      const node = evt.target;
      if (ANNOTATION_TYPES.has(node.data("type"))) return;
      const { edgeId, end } = pendingRef.current;
      const edge = cy.getElementById(edgeId);
      if (!edge.length) {
        clear();
        cbRef.current.setMode("select");
        return;
      }
      const otherEnd = end === "source" ? edge.data("target") : edge.data("source");
      if (node.id() === otherEnd) {
        cbRef.current.onToast?.("A pipe cannot start and end on the same node.");
        return;
      }
      const data = { ...edge.data(), [end]: node.id() };
      delete data.cyedgebendeditingWeights;
      delete data.cyedgebendeditingDistances;
      delete data.bendPointPositions;
      const classes = edge.classes().filter((c) => !/^edgebendediting-|^reconnect-source$/.test(c));
      cy.batch(() => {
        edge.remove();
        const rebuilt = cy.add({ group: "edges", data, classes });
        cy.$(":selected").unselect();
        rebuilt.select();
      });
      clear();
      cbRef.current.setMode("select");
      cbRef.current.onChanged?.();
      cbRef.current.onToast?.(`Pipe ${end === "source" ? "source" : "destination"} changed.`);
    };
    cy.on("tap", "node", onNodeTap);
    return () => cy.removeListener("tap", "node", onNodeTap);
  }, [cyRef, cyReady, clear]);

  return { pending, begin, cancel: clear };
}
