import { SamplesProvider } from "./state/samplesStore";
import { MasterPanel } from "./components/MasterPanel";
import { ResultsTable } from "./components/ResultsTable";
import { ReferenceTone } from "./components/ReferenceTone";
import "./App.css";

function App() {
  return (
    <SamplesProvider>
      <div className="app">
        <header className="app-header">
          <h1>tune-god</h1>
          <p className="muted">
            Detect the key of a loop, tune your samples so the white keys play in key, and time-stretch loops to
            match — all on-device.
          </p>
        </header>
        <main className="app-main">
          <MasterPanel />
          <ReferenceTone />
          <ResultsTable />
        </main>
      </div>
    </SamplesProvider>
  );
}

export default App;
