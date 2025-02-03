import { Route, Routes } from 'react-router-dom';
import { SwapPage } from './pages/swap';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../App.css';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<SwapPage />} />
      </Routes>
      <ToastContainer />
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
    </>
  );
}
