import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import TermsAndConditions from './TermsAndConditions';
import Layout from './components/Layout';
import { defaultPageLoader } from './components/Loader/Page';
import { NotFound } from './components/NotFound';
import { SuspenseLoad } from './components/Suspense';
import { config } from './config';

/**
 * Components need to be default exports inside the file for suspense loading to work properly
 */
const Dashboard = <SuspenseLoad importFn={() => import('./pages/dashboard/Dashboard')} fallback={defaultPageLoader} />;

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to={config.defaultPage} replace />} />
        <Route path="/:network/" element={<Layout />}>
          <Route path="" element={Dashboard} />
          <Route path="dashboard" element={Dashboard} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <TermsAndConditions />
      <ToastContainer />
    </>
  );
}
