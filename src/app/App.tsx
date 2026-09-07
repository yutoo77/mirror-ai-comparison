import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';

const ActionsPage = lazy(() => import('../features/actions/ActionsPage').then((module) => ({ default: module.ActionsPage })));
const FindingsPage = lazy(() => import('../features/findings/FindingsPage').then((module) => ({ default: module.FindingsPage })));
const ObservePage = lazy(() => import('../features/observe/ObservePage').then((module) => ({ default: module.ObservePage })));
const OverviewPage = lazy(() => import('../features/overview/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const SourcesPage = lazy(() => import('../features/sources/SourcesPage').then((module) => ({ default: module.SourcesPage })));
const ComparePage = lazy(() => import('../features/compare/ComparePage').then((module) => ({ default: module.ComparePage })));
const HelpPage = lazy(() => import('../features/help/HelpPage').then((module) => ({ default: module.HelpPage })));

function PageFallback() {
  return (
    <div className="page-loading" role="status">
      <span />
      <p>画面を読み込み中</p>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<ComparePage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="observe" element={<ObservePage />} />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="findings/:findingId" element={<FindingsPage />} />
          <Route path="actions" element={<ActionsPage />} />
          <Route path="actions/:actionId" element={<ActionsPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
