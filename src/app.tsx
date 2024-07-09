import { Route, Routes } from 'react-router-dom';
import Landing from './pages/landing';
import { Swap } from './pages/swap';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/landing" element={<Landing />} />
        <Route path="/" element={<Swap />} />
      </Routes>
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
    </>
  );
}
