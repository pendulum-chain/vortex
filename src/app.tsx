import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import TermsAndConditions from './TermsAndConditions';
import AppsProvider from './components/Apps/provider';
import Layout from './components/Layout';
import { defaultPageLoader } from './components/Loader/Page';
import { NotFound } from './components/NotFound';
import { SuspenseLoad } from './components/Suspense';
import { config } from './config';

/**
 * Components need to be default exports inside the file for suspense loading to work properly
 */
const Dashboard = <SuspenseLoad importFn={() => import('./pages/dashboard/Dashboard')} fallback={defaultPageLoader} />;
const Amm = <SuspenseLoad importFn={() => import('./pages/amm/Amm')} fallback={defaultPageLoader} />;
const NablaPage = <SuspenseLoad importFn={() => import('./pages/nabla')} fallback={defaultPageLoader} />;
const StatsPage = <SuspenseLoad importFn={() => import('./pages/stats')} fallback={defaultPageLoader} />;
const SwapPage = <SuspenseLoad importFn={() => import('./pages/nabla/swap')} fallback={defaultPageLoader} />;
const SwapPoolsPage = <SuspenseLoad importFn={() => import('./pages/nabla/swap-pools')} fallback={defaultPageLoader} />;
const TransfersPage = <SuspenseLoad importFn={() => import('./pages/bridge/Transfers')} fallback={defaultPageLoader} />;
const BackstopPoolsPage = (
  <SuspenseLoad importFn={() => import('./pages/nabla/backstop-pools')} fallback={defaultPageLoader} />
);
const DevPage = <SuspenseLoad importFn={() => import('./pages/nabla/dev')} fallback={defaultPageLoader} />;
const Bridge = <SuspenseLoad importFn={() => import('./pages/bridge')} fallback={defaultPageLoader} />;
const Staking = <SuspenseLoad importFn={() => import('./pages/collators/Collators')} fallback={defaultPageLoader} />;

export function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to={config.defaultPage} replace />} />
        <Route path="/:network/" element={<Layout />}>
          <Route path="" element={Dashboard} />
          <Route path="dashboard" element={Dashboard} />
          <Route path="amm" element={Amm} />
          <Route path="stats" element={StatsPage} />
          <Route path="spacewalk">
            <Route path="bridge" element={Bridge} />
            <Route path="transfers" element={TransfersPage} />
          </Route>
          <Route path="nabla" Component={() => <AppsProvider app="nabla" />}>
            <Route path="" element={NablaPage} />
            <Route path="swap" element={SwapPage} />
            <Route path="swap-pools" element={SwapPoolsPage} />
            <Route path="backstop-pools" element={BackstopPoolsPage} />
            {config.isDev && <Route path="dev" element={DevPage} />}
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="staking" element={Staking} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <TermsAndConditions />
      <ToastContainer />
    </>
  );
}
