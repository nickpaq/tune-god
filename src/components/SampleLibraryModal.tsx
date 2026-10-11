import type { SampleLibraryRecord } from "../storage";

export function SampleLibraryModal({
  records,
  onClose,
  onFavorite,
}: {
  records: SampleLibraryRecord[];
  onClose: () => void;
  onFavorite: (record: SampleLibraryRecord) => void;
}) {
  return (
    <div className="sample-library-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="sample-library" role="dialog" aria-modal="true" aria-labelledby="sample-library-title">
        <header className="sample-library__header">
          <h2 id="sample-library-title">On-device sample library</h2>
          <button onClick={onClose} aria-label="Close sample library">×</button>
        </header>
        <p>Imported samples are logged here. Star a loaded sound in hot swap to keep its audio on this device and make it available for later kits.</p>
        <div className="sample-library__rows">
          {records.length === 0 ? <div className="sample-library__empty">No imported samples yet</div> : records.map((record) => (
            <div className="sample-library__row" key={record.id}>
              <div className="sample-library__details">
                <strong>{record.name}</strong>
                <span>{record.category}{record.is808 ? " · 808" : ""} · {record.pack}</span>
                <small>{new Date(record.importedAt).toLocaleString()}</small>
              </div>
              {record.favorite ? <button
                className={record.favorite ? "sample-library__favorite is-favorite" : "sample-library__favorite"}
                aria-label={`${record.favorite ? "Remove" : "Add"} ${record.name} ${record.favorite ? "from" : "to"} favorites`}
                title={record.favorite ? "Remove favorite" : "Add favorite from a loaded pad or hot-swap row"}
                onClick={() => onFavorite(record)}
              >★</button> : <span className="sample-library__hint">Star in hot swap</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
