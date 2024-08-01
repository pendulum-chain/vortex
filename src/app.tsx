import { Route, Routes } from 'react-router-dom';
import { SwapPage } from './pages/swap';
import { ProgressPage } from './pages/progress';
import { SuccessPage } from './pages/success';
import { FailurePage } from './pages/failure';
import '../App.css';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<SwapPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="/failure" element={<FailurePage />} />
      </Routes>
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
    </>
  );
}
