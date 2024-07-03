import { Route, Routes } from 'react-router-dom';
import Landing from './pages/landing';
import { Swap } from './pages/swap';

export function App() {
  return (
    <Routes>
      <Route path="/landing" element={<Landing />} />
      <Route path="/" element={<Swap />} />
    </Routes>
  );
}
