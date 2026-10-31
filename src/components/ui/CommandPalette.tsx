/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Compass,
  Play,
  RotateCcw,
  Box,
  Database,
  Cpu,
  GitCompare,
  Sparkles,
  FlaskConical,
  Binary,
  Download,
  X,
} from 'lucide-react';
import { useFL, PageId } from '../../context/FLContext';

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setActivePage,
    stepRound,
    toggleSimulation,
    resetSimulation,
    simulationStatus,
    setUse2DFallback,
    use2DFallback,
  } = useFL();

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      setQuery('');
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const navigationCommands: { id: PageId; label: string; group: string; icon: any }[] = [
    { id: 'overview', label: '1. Overview', group: 'Navigation', icon: Compass },
    { id: 'simulator', label: '2. 3D Simulator (Centerpiece)', group: 'Navigation', icon: Box },
    { id: 'data', label: '3. Data & Clients', group: 'Navigation', icon: Database },
    { id: 'architecture', label: '4. Model & Architecture (961 params)', group: 'Navigation', icon: Cpu },
    { id: 'iid-vs-non-iid', label: '5. IID vs non-IID Benchmark', group: 'Navigation', icon: GitCompare },
    { id: 'communication', label: '6. Communication & Convergence', group: 'Navigation', icon: Sparkles },
    { id: 'experiments', label: '7. Experiments Lab', group: 'Navigation', icon: FlaskConical },
    { id: 'multi-seed', label: '8. Multi-Seed Results (42, 123, 2024)', group: 'Navigation', icon: Binary },
    { id: 'export', label: '9. Export', group: 'Navigation', icon: Download },
  ];

  const actionCommands = [
    {
      id: 'step',
      label: 'Step 1 Federated Round',
      group: 'Actions',
      icon: Play,
      action: () => stepRound(),
    },
    {
      id: 'toggle-sim',
      label: simulationStatus === 'running' ? 'Pause Simulation' : 'Start Continuous Simulation',
      group: 'Actions',
      icon: Play,
      action: () => toggleSimulation(),
    },
    {
      id: 'reset-sim',
      label: 'Reset Simulation to Round 0',
      group: 'Actions',
      icon: RotateCcw,
      action: () => resetSimulation(),
    },
    {
      id: 'toggle-3d',
      label: use2DFallback ? 'Switch to 3D Physical Canvas' : 'Switch to 2D Fallback Map',
      group: 'Actions',
      icon: Box,
      action: () => setUse2DFallback(!use2DFallback),
    },
  ];

  const filteredNav = navigationCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );
  const filteredActions = actionCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/70 backdrop-blur-xs"
      onClick={() => setIsCommandPaletteOpen(false)}
    >
      <div
        className="relative w-full max-w-xl bg-[#0c1222] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or page (e.g. 3D, Multi-Seed, Experiments)..."
            className="flex-1 bg-transparent border-0 text-sm font-medium text-white placeholder-slate-500 focus:outline-hidden"
            autoFocus
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-4">
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Pages
              </div>
              <div className="space-y-1 mt-1">
                {filteredNav.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        setIsCommandPaletteOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:text-cyan-300 hover:bg-slate-800/70 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-cyan-400" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredActions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Simulation Controls
              </div>
              <div className="space-y-1 mt-1">
                {filteredActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.action();
                        setIsCommandPaletteOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:text-emerald-300 hover:bg-slate-800/70 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-emerald-400" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredNav.length === 0 && filteredActions.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-500">
              No matching commands or pages found.
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">ESC</kbd> to exit
          </span>
          <span>Tip: Press Ctrl+K anytime</span>
        </div>
      </div>
    </div>
  );
};
