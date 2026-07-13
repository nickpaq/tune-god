import { SamplesProvider, useSamplesStore } from "./state/samplesStore";
import { MasterPanel } from "./components/MasterPanel";
import { ResultsTable } from "./components/ResultsTable";
import { Logo } from "./components/Logo";
import "./App.css";

/** Flips which side of every row's controls the play button sits on. */
function HandednessSwitch() {
  const { state, dispatch } = useSamplesStore();
  return (
    <button
      className="handedness-switch"
      onClick={() => dispatch({ type: "SET_HANDEDNESS", handedness: state.handedness === "right" ? "left" : "right" })}
      title="Switch which side the play button sits on"
    >
      {state.handedness === "right" ? "🫲 right-handed" : "🫱 left-handed"}
    </button>
  );
}

function AppContent() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__title">
          <Logo size={44} />
          <h1>KoalaTune</h1>
        </div>
        <HandednessSwitch />
      </header>
      <main className="app-main">
        <MasterPanel />
        <ResultsTable />
      </main>
    </div>
  );
}

function App() {
  return (
    <SamplesProvider>
      <AppContent />
    </SamplesProvider>
  );
}

export default App;
