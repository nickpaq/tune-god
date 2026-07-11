import { SamplesProvider } from "./state/samplesStore";
import { MasterPanel } from "./components/MasterPanel";
import { ResultsTable } from "./components/ResultsTable";
import { ReferenceTone } from "./components/ReferenceTone";
import { Logo } from "./components/Logo";
import "./App.css";

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
          <ReferenceTone />
          <ResultsTable />
        </main>
      </div>
    </SamplesProvider>
  );
}

export default App;
