import { Route, Routes } from 'react-router-dom';
import { Swap } from './pages/swap';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Swap />} />
      </Routes>
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
    </>
  );
}
