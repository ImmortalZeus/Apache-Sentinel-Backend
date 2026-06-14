import { createBrowserRouter, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Firewall from './pages/Firewall';
import Settings from './pages/Settings';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'logs',      element: <Logs /> },
      { path: 'firewall',  element: <Firewall /> },
      { path: 'settings',  element: <Settings /> },
    ],
  },
]);