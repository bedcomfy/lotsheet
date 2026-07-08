"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { FLAGS, flagName } from "../lib/grid";
import { OBJECT_CODES } from "../lib/objectCodes";

const FLAG_BY_CODE = FLAGS.reduce<Record<string, string[]>>((acc, flag) => {
  for (const code of flag.objectCodes || []) {
    acc[code] = [...(acc[code] || []), flag.id];
  }
  return acc;
}, {});

export default function ObjectCodesPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return OBJECT_CODES;
    return OBJECT_CODES.filter((item) =>
      `${item.code} ${item.description}`.toLowerCase().includes(q)
    );
  }, [q]);

  return (
    <main className="objectcodes">
      <section className="objectcodes__head">
        <div>
          <div className="homehero__eyebrow">Utilities</div>
          <h1>Object Codes</h1>
          <p>Search the maintenance object-code reference by number or description.</p>
        </div>
        <div className="objectcodes__search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code or description..."
            autoComplete="off"
          />
        </div>
      </section>

      <section className="objectcodes__bar">
        <span>{rows.length} of {OBJECT_CODES.length} codes</span>
        {q && <button className="btn" onClick={() => setQuery("")}>Clear</button>}
      </section>

      <section className="objectcodes__table" aria-label="Object codes">
        <div className="objectcodes__row objectcodes__row--head">
          <span>Object Code</span>
          <span>Description</span>
          <span>Flag Link</span>
        </div>
        {rows.map((item) => {
          const linkedFlags = FLAG_BY_CODE[item.code] || [];
          return (
            <article className="objectcodes__row" key={item.code}>
              <strong>{item.code}</strong>
              <span>{item.description}</span>
              <span className="objectcodes__flags">
                {linkedFlags.length
                  ? linkedFlags.map((id) => <em key={id}>{flagName(id)}</em>)
                  : <small>Not linked yet</small>}
              </span>
            </article>
          );
        })}
        {!rows.length && <div className="objectcodes__empty">No object codes match that search.</div>}
      </section>
    </main>
  );
}
