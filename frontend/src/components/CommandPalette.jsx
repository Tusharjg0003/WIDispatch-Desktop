import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Braces, Command, LoaderCircle, Network, Search, SlidersHorizontal, X } from "lucide-react";
import { fetchWorkspaceSearch } from "../api/operations";
import { StatusBadge } from "./ui/WorkspacePrimitives";

const typeLabel = {
  module: "Modules",
  asset: "Assets",
  network: "Networks",
  simulation: "Simulation configurations",
};

const typeIcon = {
  module: Command,
  asset: Box,
  network: Network,
  simulation: SlidersHorizontal,
};

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchWorkspaceSearch({ query, signal: controller.signal })
        .then((data) => {
          setResults(data.results || []);
          setActiveIndex(0);
        })
        .catch((requestError) => {
          if (requestError.name !== "AbortError") setError(requestError.message || "Search is unavailable");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, query ? 180 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const grouped = useMemo(() => results.reduce((groups, item, index) => {
    const key = item.type || "module";
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...item, resultIndex: index });
    return groups;
  }, {}), [results]);

  if (!open) return null;

  const choose = (item) => {
    navigate(item.path);
    onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") onClose();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  };

  return (
    <div className="command-palette" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="command-palette__dialog" role="dialog" aria-modal="true" aria-label="Search WIDispatch" onKeyDown={handleKeyDown}>
        <div className="command-palette__search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets, networks, simulations, or modules…"
            aria-label="Search WIDispatch"
            aria-controls="command-results"
            aria-activedescendant={results[activeIndex] ? `command-result-${activeIndex}` : undefined}
          />
          {loading && <LoaderCircle className="command-palette__loader" size={17} aria-label="Searching" />}
          <button type="button" onClick={onClose} aria-label="Close search"><X size={17} /></button>
        </div>

        <div id="command-results" className="command-palette__results" role="listbox">
          {error && <div className="command-palette__state command-palette__state--error">{error}</div>}
          {!error && !loading && results.length === 0 && (
            <div className="command-palette__state">
              <Braces size={22} />
              <strong>No matching workspace item</strong>
              <span>Try an asset name, ID, network, or module.</span>
            </div>
          )}
          {!error && Object.entries(grouped).map(([type, items]) => (
            <div className="command-palette__group" key={type}>
              <p>{typeLabel[type] || type}</p>
              {items.map((item) => {
                const Icon = typeIcon[item.type] || Box;
                const selected = item.resultIndex === activeIndex;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    id={`command-result-${item.resultIndex}`}
                    className={selected ? "is-active" : ""}
                    key={`${item.type}-${item.id}`}
                    onMouseEnter={() => setActiveIndex(item.resultIndex)}
                    onClick={() => choose(item)}
                  >
                    <span className="command-palette__result-icon"><Icon size={16} /></span>
                    <span className="command-palette__result-copy">
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </span>
                    {item.status && <StatusBadge status={item.status} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <footer className="command-palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </footer>
      </section>
    </div>
  );
}
