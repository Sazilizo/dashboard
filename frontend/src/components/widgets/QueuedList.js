import React, { useEffect, useState } from "react";
import { getMutations } from "../../utils/tableCache";

export default function QueuedList({ table }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function fetch() {
      const muts = await getMutations();
      if (!mounted) return;
      setItems(muts.filter((m) => m.table === table));
    }
    fetch();

    // listen to broadcast channel for immediate updates
    const bc = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("offline-sync") : null;
    const onMsg = (ev) => {
      if (ev?.data?.table === table || ev?.data?.type === "synced") {
        fetch();
      }
    };
    if (bc) bc.addEventListener("message", onMsg);

    const iv = setInterval(fetch, 5000);
    return () => { mounted = false; clearInterval(iv); if (bc) bc.removeEventListener("message", onMsg); };
  }, [table]);

  if (!items.length) return null;

  return (
    <div className="queued-list">
      <h4>Queued ({items.length})</h4>
      <ul>
        {items.map((m) => (
          <li key={m.id}>[{m.type}] {m.table} - {m.timestamp ? new Date(m.timestamp).toLocaleString() : ""}</li>
        ))}
      </ul>
    </div>
  );
}
