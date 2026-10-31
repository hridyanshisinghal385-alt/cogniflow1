/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  Search,
  ShieldCheck,
  Menu,
  Sun,
  Moon,
  Cpu,
} from 'lucide-react';
import { useFL } from '../../context/FLContext';

interface AppNavbarProps {
  onToggleSidebarMobile: () => void;
}

export const AppNavbar: React.FC<AppNavbarProps> = ({ onToggleSidebarMobile }) => {
  const {
    currentRound,
    config,
    updateConfig,
    simulationStatus,
    stepRound,
    toggleSimulation,
    resetSimulation,
    setIsCommandPaletteOpen,
    dataset,
    theme,
    toggleTheme,
  } = useFL();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 py-2.5 bg-white/95 dark:bg-[#080d1a]/95 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 shadow-xs transition-colors">
      {/* Wordmark & Mobile Hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebarMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Toggle Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 via-sky-500 to-indigo-500 flex items-center justify-center text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20">
            CF
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                CogniFlow
              </span>
            </div>
            <div className="text-[10px] hidden md:block text-slate-500 dark:text-slate-400">
              Federated Traffic Prediction &amp; Communication Cost Analysis
            </div>
          </div>
        </div>
      </div>

      {/* Middle Zone: Badges */}
      <div className="hidden xl:flex items-center gap-2.5">
        {/* Dataset Origin Badge */}
        {dataset.isSynthetic ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Synthetic demo data (5 Urban Intersections)</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Real Dataset: {dataset.name}</span>
          </div>
        )}

        {/* Chronological No Data Leakage Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[11px] font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
          <span>No data leakage</span>
        </div>

        {/* Model Architecture Indicator / Quick Switcher */}
        <button
          onClick={() => {
            const nextArch = config.modelArchitecture === 'mlp' ? 'gru' : 'mlp';
            updateConfig({ modelArchitecture: nextArch });
            resetSimulation();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 text-[11px] font-medium transition-colors cursor-pointer"
          title={`Click to switch between GRU (881p) and MLP (961p). Currently: ${config.modelArchitecture === 'mlp' ? 'MLP' : 'GRU'}`}
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>Model: <strong className="font-mono">{config.modelArchitecture === 'mlp' ? 'MLP (961p)' : 'GRU (881p)'}</strong></span>
        </button>
      </div>

      {/* Right Zone: Controls, Seed & Palette */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Seed Selector */}
        <div className="hidden sm:flex items-center gap-1 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 text-xs font-mono bg-slate-100 dark:bg-slate-900">
          <span className="text-[10px] px-1.5 text-slate-500 dark:text-slate-400">Seed:</span>
          {[42, 123, 2024].map((s) => (
            <button
              key={s}
              onClick={() => resetSimulation(s)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                config.seed === s
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title={`Switch to independent Seed ${s}`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Step 1 Round */}
        <button
          onClick={() => stepRound()}
          disabled={simulationStatus === 'running'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors disabled:opacity-40 shadow-xs cursor-pointer"
          title="Step one federated training round"
        >
          <StepForward className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
          <span className="hidden md:inline">Step</span>
        </button>

        {/* Start / Pause Continuous Run */}
        <button
          onClick={toggleSimulation}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer ${
            simulationStatus === 'running'
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
          }`}
        >
          {simulationStatus === 'running' ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{currentRound >= config.totalRounds ? 'Restart' : 'Run'}</span>
            </>
          )}
        </button>

        {/* Reset */}
        <button
          onClick={() => resetSimulation()}
          className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Reset to Round 0"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Dark / Light Mode Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors cursor-pointer shadow-xs"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-500" />
          )}
        </button>

        {/* Command Palette Trigger */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700 text-xs transition-colors cursor-pointer"
          title="Open Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <kbd className="text-[10px] font-mono px-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Ctrl+K
          </kbd>
        </button>
      </div>
    </header>
  );
};
