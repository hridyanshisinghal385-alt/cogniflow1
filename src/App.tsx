/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, lazy, Suspense } from 'react';
import { FLProvider, useFL } from './context/FLContext';
import { AppNavbar } from './components/layout/AppNavbar';
import { AppSidebar } from './components/layout/AppSidebar';
import { CommandPalette } from './components/ui/CommandPalette';

// 9 Canonical Academic Pages Lazy-Loaded for Snappy Startup
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const CitySimulatorPage = lazy(() =>
  import('./pages/CitySimulatorPage').then((m) => ({ default: m.CitySimulatorPage }))
);
const DataAndClientsPage = lazy(() =>
  import('./pages/DataAndClientsPage').then((m) => ({ default: m.DataAndClientsPage }))
);
const ModelArchitecturePage = lazy(() =>
  import('./pages/ModelArchitecturePage').then((m) => ({ default: m.ModelArchitecturePage }))
);
const IidVsNonIidPage = lazy(() =>
  import('./pages/IidVsNonIidPage').then((m) => ({ default: m.IidVsNonIidPage }))
);
const CommunicationConvergencePage = lazy(() =>
  import('./pages/CommunicationConvergencePage').then((m) => ({
    default: m.CommunicationConvergencePage,
  }))
);
const ExperimentsLabPage = lazy(() =>
  import('./pages/ExperimentsLabPage').then((m) => ({ default: m.ExperimentsLabPage }))
);
const MultiSeedPage = lazy(() =>
  import('./pages/MultiSeedPage').then((m) => ({ default: m.MultiSeedPage }))
);
const ExportPage = lazy(() =>
  import('./pages/ExportPage').then((m) => ({ default: m.ExportPage }))
);

function PageLoadingFallback() {
  return (
    <div className="h-96 flex flex-col items-center justify-center text-slate-500 font-mono text-xs space-y-2">
      <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading module...</span>
    </div>
  );
}

function AppContent() {
  const { activePage, theme } = useFL();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-150 ${
        theme === 'dark'
          ? 'dark bg-[#070b14] text-slate-100'
          : 'light bg-slate-100/80 text-slate-900'
      }`}
    >
      {/* Universal Top Navigation Bar */}
      <AppNavbar onToggleSidebarMobile={() => setIsMobileSidebarOpen((prev) => !prev)} />

      {/* Main Container with Collapsible Left Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <AppSidebar
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Central Viewport for the 9 Canonical Pages */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto w-full">
          <Suspense fallback={<PageLoadingFallback />}>
            {activePage === 'overview' && <OverviewPage />}
            {activePage === 'simulator' && <CitySimulatorPage />}
            {activePage === 'data' && <DataAndClientsPage />}
            {activePage === 'architecture' && <ModelArchitecturePage />}
            {activePage === 'iid-vs-non-iid' && <IidVsNonIidPage />}
            {activePage === 'communication' && <CommunicationConvergencePage />}
            {activePage === 'experiments' && <ExperimentsLabPage />}
            {activePage === 'multi-seed' && <MultiSeedPage />}
            {activePage === 'export' && <ExportPage />}
          </Suspense>
        </main>
      </div>

      {/* Slim Persistent Academic Footer Line */}
      <footer className="py-2 px-4 border-t border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#060911] text-center text-[11px] font-mono text-slate-500 dark:text-slate-400">
        Simulation only - synthetic data unless a CSV is loaded - no formal privacy guarantee.
      </footer>

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <FLProvider>
      <AppContent />
    </FLProvider>
  );
}
