/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { City3DCanvas } from '../three/City3DCanvas';
import { CityGridMap } from '../components/hero/CityGridMap';
import { useFL } from '../context/FLContext';
import { EventShockType } from '../types/simulator';
import {
  Box,
  Layers,
  Radio,
  Activity,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  Shield,
  Filter,
  Flame,
  CloudRain,
  PartyPopper,
  CheckCircle2,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export const CitySimulatorPage: React.FC = () => {
  const {
    clients,
    currentRound,
    config,
    updateConfig,
    simulationStatus,
    roundLogs,
    use2DFallback,
    setUse2DFallback,
    dataset,
    eventShockResult,
    runEventShock,
    isWorkerBusy,
  } = useFL();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const isSynthetic = dataset.isSynthetic;

  // Forecast Ribbon data during shock
  const shockPredictions = eventShockResult?.predictions || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Modes Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              3D Federated City Simulator
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 font-bold">
              3D Centerpiece
            </span>
            {isSynthetic && (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Synthetic demo data
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Physical 3D visualization of edge intersection nodes, traffic flow, radio parameter conduits,
            and real-time FedAvg aggregation.
          </p>
        </div>

        {/* View Switchers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUse2DFallback(!use2DFallback)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              use2DFallback
                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:text-cyan-500 dark:hover:text-white shadow-xs'
            }`}
          >
            {use2DFallback ? '2D Vector Map (Active)' : 'Switch to 2D Fallback'}
          </button>
        </div>
      </div>

      {/* Main Visual Simulator (3D WebGL or 2D Vector Fallback) */}
      <div className="space-y-4">
        {use2DFallback ? (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-[#070b14] shadow-xs">
            <CityGridMap
              clients={clients}
              selectedClientId={selectedClientId}
              onSelectClient={setSelectedClientId}
              currentRound={currentRound}
              totalRounds={config.totalRounds}
              simulationStatus={simulationStatus}
              particles={[]}
              bytesPerRound={roundLogs[roundLogs.length - 1]?.bytesThisRound || 38440}
            />
          </div>
        ) : isCompareMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                <span className="text-cyan-600 dark:text-cyan-400">Viewport A: Balanced IID Partition</span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">Seed #{config.seed}</span>
              </div>
              <City3DCanvas
                clients={clients}
                currentRound={currentRound}
                totalRounds={config.totalRounds}
                simulationStatus={simulationStatus}
                roundLogs={roundLogs}
                config={{ ...config, partitionMode: 'iid', heterogeneity: 0.0 }}
                selectedClientId={selectedClientId}
                onSelectClient={setSelectedClientId}
                shockResult={eventShockResult}
                isSecondViewport={true}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                <span className="text-amber-600 dark:text-amber-400">Viewport B: Skewed Non-IID Partition (H={config.heterogeneity})</span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">Seed #{config.seed}</span>
              </div>
              <City3DCanvas
                clients={clients}
                currentRound={currentRound}
                totalRounds={config.totalRounds}
                simulationStatus={simulationStatus}
                roundLogs={roundLogs}
                config={config}
                selectedClientId={selectedClientId}
                onSelectClient={setSelectedClientId}
                onToggleCompare={() => setIsCompareMode(false)}
                shockResult={eventShockResult}
                isSecondViewport={true}
              />
            </div>
          </div>
        ) : (
          <City3DCanvas
            clients={clients}
            currentRound={currentRound}
            totalRounds={config.totalRounds}
            simulationStatus={simulationStatus}
            roundLogs={roundLogs}
            config={config}
            selectedClientId={selectedClientId}
            onSelectClient={setSelectedClientId}
            isCompareMode={isCompareMode}
            onToggleCompare={() => setIsCompareMode(!isCompareMode)}
            shockResult={eventShockResult}
          />
        )}
      </div>

      {/* Communication Saver Controls (Top-K Sparsity & Lazy Upload in Simulator) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0b101d] border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Communication Saver Controls
            </h3>
          </div>
          <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
            Active: Top-{((config.topKSparsity ?? 1) * 100).toFixed(0)}% Updates | Lazy Threshold {config.lazyUploadThreshold}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600 dark:text-slate-400">Top-K Parameter Sparsification</span>
              <span className="text-cyan-600 dark:text-cyan-300 font-bold">{((config.topKSparsity ?? 1) * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={config.topKSparsity ?? 1.0}
              onChange={(e) => updateConfig({ topKSparsity: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500">Transmits only coordinates with largest gradient magnitudes</span>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600 dark:text-slate-400">Lazy Upload Threshold (Δw Norm)</span>
              <span className="text-amber-600 dark:text-amber-400 font-bold">{config.lazyUploadThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.1"
              step="0.01"
              value={config.lazyUploadThreshold ?? 0.0}
              onChange={(e) => updateConfig({ lazyUploadThreshold: parseFloat(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500">Clients skip uplink (0 bytes) when local parameter update is small</span>
          </div>
        </div>
      </div>

      {/* Event-Shock Replay Lab */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#0b101d] space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Event-Shock Replay (Injected into TEST Period Only)
            </h3>
          </div>
          <span className="text-xs font-mono text-rose-700 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-950/60 px-2.5 py-0.5 rounded border border-rose-500/30 dark:border-rose-800/40 font-semibold">
            Out-of-Distribution Robustness
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Inject sudden traffic disturbances strictly into the chronological out-of-sample test split.
          The 3D simulator replays the affected traffic volume, and the forecast ribbon displays ground truth vs predicted volume.
        </p>

        {/* Shock Selection Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { id: 'none', label: 'Nominal Flow', icon: Activity, desc: 'Regular traffic flow' },
            { id: 'accident', label: 'Corridor Accident', icon: AlertTriangle, desc: 'Highway C3 crash (-65% flow)' },
            { id: 'heavy_rain', label: 'Severe Storm', icon: CloudRain, desc: 'Metropolitan speed drop (-35%)' },
            { id: 'festival', label: 'Downtown Surge', icon: PartyPopper, desc: 'Central Ave festival (+110%)' },
          ].map((sh) => {
            const Icon = sh.icon;
            const isActive = config.activeShock === sh.id;
            return (
              <button
                key={sh.id}
                onClick={() => runEventShock(sh.id as EventShockType)}
                disabled={isWorkerBusy}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-rose-500/15 border-rose-500 text-rose-900 dark:text-white shadow-md'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-rose-500' : 'text-slate-400'}`} />
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">{sh.label}</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{sh.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Shock Forecast Ribbon Chart */}
        {shockPredictions.length > 0 && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">
                Forecast Ribbon during Shock: Actual vs FedAvg (Global) vs Local-Only
              </span>
              <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold">
                Global MAE: {eventShockResult?.globalModelMae} v/h | Local MAE: {eventShockResult?.localOnlyMae} v/h
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={shockPredictions} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timestamp" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(t) => t.substring(11, 16)} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#070b14', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual Ground Truth (veh/hr)"
                    stroke="#00f0ff"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="globalPred"
                    name="FedAvg Global Prediction"
                    stroke="#ec4899"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="localPred"
                    name="Local-Only Model"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
