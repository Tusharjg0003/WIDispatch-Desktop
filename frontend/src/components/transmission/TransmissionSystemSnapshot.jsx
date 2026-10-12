import React, { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import { bindCyTheme, buildCyStyle } from "../../cytoscape/buildCyStyle";
import { applyEntitySymbol } from "../../cytoscape/entitySymbol";
import { asArray } from "../../lib/transmissionSystems";
import "./TransmissionSystemSnapshot.css";

// Read-only drawing of a transmission system: the saved canvas nodes and the
// pipes tagged with the system, at their saved positions (or a simple grid
// when some positions are missing). Not interactive — it is a picture.

const snapshotFallbackPosition = (index) => ({
  x: (index % 3) * 220,
  y: Math.floor(index / 3) * 84,
});
const cloneData = (value) => (value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value);

export default function TransmissionSystemSnapshot({ system, height }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const graph = useMemo(() => {
    const rawNodes = Array.from(system?.snapshotNodes?.values?.() || []);
    const rawEdges = asArray(system?.snapshotEdges).filter((edge) => edge.source && edge.target);
    if (!rawNodes.length || !rawEdges.length) return { nodes: [], edges: [], usedSavedPositions: false };

    const nodeIds = new Set(rawNodes.map((node) => node.id));
    const edges = rawEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const allNodesHaveSavedPositions = rawNodes.every((node) => {
      const x = Number(node.position?.x);
      const y = Number(node.position?.y);
      return Number.isFinite(x) && Number.isFinite(y);
    });
    const positioned = rawNodes.map((node, index) => {
      const x = Number(node.position?.x);
      const y = Number(node.position?.y);
      if (allNodesHaveSavedPositions) return { ...node, x, y };
      const fallback = snapshotFallbackPosition(index);
      return { ...node, ...fallback };
    });
    const nodes = positioned.map((node) => ({ ...node, data: cloneData(node.data || {}) }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    return {
      nodes,
      edges: edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)),
      usedSavedPositions: allNodesHaveSavedPositions,
    };
  }, [system]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !graph.nodes.length || !graph.edges.length) return undefined;

    const cy = cytoscape({
      container,
      style: buildCyStyle(),
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autoungrabify: true,
      autounselectify: true,
      userPanningEnabled: false,
      userZoomingEnabled: false,
    });
    cyRef.current = cy;
    const unbindTheme = bindCyTheme(cy);

    cy.batch(() => {
      graph.nodes.forEach((node) => {
        const data = {
          ...node.data,
          id: node.id,
          label: node.label,
          displayLabel: node.data?.displayLabel || node.data?.label || node.label,
          type: node.data?.type || node.type || node.data?.category || "node",
          category: node.data?.category || node.data?.type || node.type || "node",
        };
        const cyNode = cy.add({
          group: "nodes",
          data,
          position: { x: node.x, y: node.y },
        });
        applyEntitySymbol(cyNode);
      });
      graph.edges.forEach((edge) => {
        cy.add({
          group: "edges",
          data: {
            ...edge.data,
            id: edge.id,
            source: edge.source,
            target: edge.target,
            kind: edge.data?.kind || "pipe",
            label: edge.data?.label || edge.label || "",
            displayLabel: edge.data?.displayLabel || edge.data?.label || edge.label || "",
          },
        });
      });
    });

    const fit = () => {
      // The frame can fire after an unmount (e.g. a quick tab switch).
      if (cy.destroyed()) return;
      cy.resize();
      if (cy.elements().length) cy.fit(cy.elements(), 26);
    };
    const frame = requestAnimationFrame(fit);

    return () => {
      cancelAnimationFrame(frame);
      unbindTheme();
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [graph]);

  if (!graph.nodes.length || !graph.edges.length) {
    return <div className="transmission-system-detail__empty">No saved topology snapshot yet.</div>;
  }

  return (
    <div className="transmission-snapshot">
      <div className="transmission-snapshot__canvas" ref={containerRef} style={height ? { height } : undefined} aria-label="Transmission system network snapshot" />
      <div className="transmission-snapshot__meta">
        <span>{graph.nodes.length} saved nodes</span>
        <span>{graph.edges.length} pipe segments</span>
        <span>{graph.usedSavedPositions ? "saved positions" : "import layout preview"}</span>
      </div>
    </div>
  );
}
