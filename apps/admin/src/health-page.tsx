import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "./health";

const LABELS: Record<keyof Health, string> = {
  api: "API",
  database: "Database",
};

export function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let active = true;
    void fetchHealth().then((result) => {
      if (active) setHealth(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <h1>Aiiman admin</h1>
      <h2>System status</h2>
      {health === null ? (
        <p role="status">Checking…</p>
      ) : (
        <dl>
          {(Object.keys(LABELS) as Array<keyof Health>).map((key) => (
            <div key={key}>
              <dt>{LABELS[key]}</dt>
              <dd>{health[key] === "ok" ? "Working" : "Not reachable"}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
