import { SwapPage } from './pages/swap';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '../App.css';
import RampExample from './examples/RampExample';

export function App() {
  return (
    <>
      {/*<SwapPage />*/}
      <RampExample />
      <ToastContainer />
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
    </>
  );
}
