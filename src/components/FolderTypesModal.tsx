import { useRef, useState } from "react";
import { CATEGORIES, categoryLabel, type CategoryId } from "../audio/classify";
import type { AmbiguousFolder } from "../audio/libraryIndex";
import type { FolderTypes } from "../audio/samplePack";
import { useModalFocus } from "./useModalFocus";

const VISIBLE = 100;

/**
 * Folders nothing could type, with a Type picker for each. A Type given to a folder name applies to that name in every pack; the folder name
 * stays on each sound's path, so it is still found by search under its parent Type.
 */
export function FolderTypesModal({ folders, folderTypes, names, busy, onSet, onApply, onCopy, onExport, onImport, onClose }: {
  folders: AmbiguousFolder[];
  folderTypes: FolderTypes;
  /** Display names of the folders already given a Type, by key. */
  names: Record<string, string>;
  busy: boolean;
  onSet: (key: string, category: CategoryId | null) => void;
  onApply: () => void;
  onCopy: () => void;
  /** Save every folder Type as a file to bring back for the next release. */
  onExport: () => void;
  onImport: (file: File) => void;
  onClose: () => void;
}) {
  const dialog = useModalFocus(onClose);
  const importInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const match = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  const open = folders.filter((folder) => !folderTypes[folder.key] && match(folder.name));
  const given = Object.keys(folderTypes).filter((key) => match(names[key] ?? key));
  const select = (key: string, value: CategoryId | undefined, label: string) => (
    <select aria-label={`Type for ${label}`} value={value ?? ""} onChange={(event) => onSet(key, (event.target.value || null) as CategoryId | null)}>
      <option value="">Choose a Type</option>
      {CATEGORIES.filter((category) => category.id !== "other").map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
    </select>
  );
  return (
    <div className="sample-library-backdrop">
      <section ref={dialog} className="sample-library sample-library--tools folder-types" role="dialog" aria-modal="true" aria-labelledby="folder-types-title">
        <header className="sample-library__header">
          <h2 id="folder-types-title">Folder Types</h2>
          <button onClick={onClose} aria-label="Close folder Types">×</button>
        </header>
        <p>Give a folder name a Type once and it applies in every pack. The folder name stays in each sound's path, so search still finds it.</p>
        <input aria-label="Search folders" placeholder="Search folders" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="library-actions">
          <button className="menu__button" disabled={busy} onClick={onApply}>Apply and reclassify</button>
          <button className="menu__button" onClick={onCopy}>Copy list</button>
        </div>
        <div className="library-actions">
          <button className="menu__button" disabled={!Object.keys(folderTypes).length} onClick={onExport}>Export folder Types</button>
          <button className="menu__button" onClick={() => importInput.current?.click()}>Import</button>
          <input ref={importInput} type="file" hidden accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onImport(file); }} />
        </div>
        <div className="sample-library__rows">
          <p>{folders.length.toLocaleString()} folders left without a Type{open.length > VISIBLE ? ` · showing the ${VISIBLE} largest` : ""}</p>
          {open.slice(0, VISIBLE).map((folder) => <div className="library-sample" key={folder.key}>
            <strong title={folder.name}>{folder.name}</strong>
            <small>{folder.files.toLocaleString()} {folder.files === 1 ? "file" : "files"} · {folder.packs.toLocaleString()} {folder.packs === 1 ? "pack" : "packs"} · {folder.examples.join(", ")}</small>
            <div className="library-actions">{select(folder.key, undefined, folder.name)}</div>
          </div>)}
          {given.length > 0 && <p>Your folder Types</p>}
          {given.map((key) => <div className="library-sample" key={key}>
            <strong>{names[key] ?? key}</strong>
            <small>{categoryLabel(folderTypes[key])}</small>
            <div className="library-actions">
              {select(key, folderTypes[key], names[key] ?? key)}
              <button aria-label={`Remove the Type from ${names[key] ?? key}`} onClick={() => onSet(key, null)}>Remove</button>
            </div>
          </div>)}
        </div>
      </section>
    </div>
  );
}
