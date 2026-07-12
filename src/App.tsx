import { SamplesProvider } from "./state/samplesStore";
import { MasterPanel } from "./components/MasterPanel";
import { ResultsTable } from "./components/ResultsTable";
import { ReferenceTone } from "./components/ReferenceTone";
import { Logo } from "./components/Logo";
import "./App.css";

// Undecided whether the tone generator earns its place — hidden for now,
// not removed, so it's a one-line flip either way.
const SHOW_TONE_GENERATOR = false;

function App() {
  return (
    <SamplesProvider>
      <div className="app">
        <header className="app-header">
          <div className="app-header__title">
            <Logo size={44} />
            <h1>KoalaTune</h1>
          </div>
        </header>
        <main className="app-main">
          <MasterPanel />
          {SHOW_TONE_GENERATOR && <ReferenceTone />}
          <ResultsTable />
        </main>
      </div>
    </SamplesProvider>
  );
}

export default App;
