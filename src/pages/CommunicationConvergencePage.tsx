/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useFL } from '../context/FLContext';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Radio,
  Target,
  TrendingDown,
  Activity,
  HardDrive,
  Zap,
  Sparkles,
  Layers,
} from 'lucide-react';
import { QuantizationType } from '../types/simulator';

export const CommunicationConvergencePage: React.FC = () => {
  const { config, updateConfig, roundLogs, clients, dataset } = useFL();
  const [targetMae, setTargetMae] = useState<number>(config.targetMae);
  const isSynthetic = dataset.isSynthetic;

  const paramCount = 961;
  const bytesPerParam = config.quantization === 'INT8' ? 1 : config.quantization === 'FP16' ? 2 : 4;
  const singleModelBytes = paramCount * bytesPerParam;
  const participatingClients = Math.round(config.numClients * config.participationRate);
  const bytesPerRound = singleModelBytes * participatingClients * 2;
  const latestLog = roundLogs[roundLogs.length - 1];
  const cumulativeBytes = latestLog ? latestLog.cumulativeBytes : bytesPerRound * config.totalRounds;

  const rawDataCentralizedBytes = dataset.trainWindows.length * (config.windowSize + 1) * 4;
  const bandwidthSavings =
    rawDataCentralizedBytes > 0
      ? Math.max(0, Math.min(99.5, ((rawDataCentralizedBytes - cumulativeBytes) / rawDataCentralizedBytes) * 100))
      : 94.2;

  // Rounds to Target
  let roundsToTarget: number | null = null;
  for (const log of roundLogs) {
    if (log.globalTestMae <= targetMae) {
      roundsToTarget = log.round;
      break;
    }
  }

  // Chart 1: Cumulative Bytes across rounds for FP32, FP16, INT8
  const projectionData = Array.from({ length: config.totalRounds }, (_, i) => {
    const r = i + 1;
    const fp32PerRound = paramCount * 4 * participatingClients * 2;
    const fp16PerRound = paramCount * 2 * participatingClients * 2;
    const int8PerRound = (paramCount * 1 + 8) * participatingClients * 2;
    return {
      round: r,
      fp32KB: Number(((fp32PerRound * r) / 1024).toFixed(1)),
      fp16KB: Number(((fp16PerRound * r) / 1024).toFixed(1)),
      int8KB: Number(((int8PerRound * r) / 1024).toFixed(1)),
    };
  });

  // Chart 2: Convergence Trajectory (MAE vs Target vs Client Drift)
  const convergenceChartData = roundLogs.map((log) => ({
    round: log.round,
    mae: log.globalTestMae,
    rmse: log.globalTestRmse,
    drift: Number((log.clientDrift * 10).toFixed(2)),
    target: targetMae,
  }));

  // Chart 3: Accuracy vs Cumulative Bytes Trade-off Curve
  const paretoData = roundLogs.map((log) => ({
    bytesKB: Number((log.cumulativeBytes / 1024).toFixed(1)),
    mae: log.globalTestMae,
    round: log.round,
  }));

  // Chart 4: Per-Client Loss Trajectory
  const perClientLossData = roundLogs.map((log) => {
    const row: Record<string, number> = { round: log.round };
    clients.forEach((c) => {
      row[c.name.split(':')[0]] = log.clientMetrics[c.id]?.loss || 0;
    });
    return row;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Communication &amp; Convergence Dynamics
            </h1>
            {isSynthetic && (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Synthetic demo data
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quantitative analysis of transmitted byte footprints, rounds-to-target convergence, consensus drift,
            and accuracy-vs-bytes trade-offs.
          </p>
        </div>

        {/* Quantization Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs">
          {(['FP32', 'FP16', 'INT8'] as const).map((q) => (
            <button
              key={q}
              onClick={() => updateConfig({ quantization: q })}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                config.quantization === q
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0b101d] border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
            Bytes Per Round
          </span>
          <div className="text-2xl font-bold font-mono text-cyan-300">
            {(bytesPerRound / 1024).toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">KB / rd</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Downlink + Uplink ({config.quantization})
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0b101d] border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
            Cumulative Transmitted
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {(cumulativeBytes / 1024).toFixed(1)}{' '}
            <span className="text-xs font-normal text-slate-400">KB</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Bandwidth saved: <span className="text-emerald-400 font-bold">{bandwidthSavings.toFixed(1)}%</span> vs raw
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0b101d] border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
            Rounds to Target ({targetMae} v/h)
          </span>
          <div className="text-2xl font-bold font-mono text-white">
            {roundsToTarget ? `Round #${roundsToTarget}` : 'Optimizing...'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {roundsToTarget ? `Reached at ${(roundsToTarget * bytesPerRound / 1024).toFixed(0)} KB payload` : 'Threshold not yet met'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0b101d] border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
            Client Consensus Drift
          </span>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {latestLog ? latestLog.clientDrift.toFixed(4) : '0.0000'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            L2 norm: (1/K) ∑ ||w_k - w_global||
          </div>
        </div>
      </div>

      {/* Target Threshold Interactive Slider */}
      <div className="p-4 rounded-xl bg-[#0b101d] border border-slate-800 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-300 font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            Convergence Target Threshold:
          </span>
          <span className="font-mono text-cyan-400 font-bold">{targetMae} veh/hr MAE</span>
        </div>
        <input
          type="range"
          min="45"
          max="75"
          step="1"
          value={targetMae}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            setTargetMae(v);
            updateConfig({ targetMae: v });
          }}
          className="w-full accent-cyan-400 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>45 v/h (Strict Target)</span>
          <span>55 v/h (Operational Baseline)</span>
          <span>75 v/h (Relaxed Threshold)</span>
        </div>
      </div>

      {/* 2. Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative Bytes Projection */}
        <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Cumulative Payload: FP32 vs FP16 vs INT8
          </h3>
          <p className="text-[11px] text-slate-400">
            Notice how INT8 quantization reduces communication overhead by ~75% compared to FP32.
          </p>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="round" stroke="#64748b" tick={{ fontSize: 10 }} unit=" Rd" />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" KB" />
                <Tooltip contentStyle={{ backgroundColor: '#070b14', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="fp32KB" name="FP32 (3,844 B)" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="fp16KB" name="FP16 (1,922 B)" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="int8KB" name="INT8 (969 B)" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Accuracy vs Cumulative Bytes Trade-off */}
        <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Accuracy vs Cumulative Bytes Curve
          </h3>
          <p className="text-[11px] text-slate-400">
            Dynamic Pareto path tracing prediction error decay per kilobyte transmitted.
          </p>
          <div className="h-60 w-full">
            {paretoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paretoData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="bytesKB" stroke="#64748b" tick={{ fontSize: 10 }} unit=" KB" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" v/h" />
                  <Tooltip contentStyle={{ backgroundColor: '#070b14', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: '11px' }} />
                  <Line type="monotone" dataKey="mae" name="Test MAE (veh/hr)" stroke="#00f0ff" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Start simulation to record accuracy-vs-bytes trajectory...
              </div>
            )}
          </div>
        </div>

        {/* Convergence Trajectory & Client Consensus Drift */}
        <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Test MAE Convergence &amp; Consensus Drift
          </h3>
          <p className="text-[11px] text-slate-400">
            Tracking global model generalization error alongside parameter divergence among clients.
          </p>
          <div className="h-60 w-full">
            {convergenceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={convergenceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="round" stroke="#64748b" tick={{ fontSize: 10 }} unit=" Rd" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#070b14', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="mae" name="Test MAE (v/h)" stroke="#00f0ff" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="target" name={`Target (${targetMae})`} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="drift" name="Drift Norm (x10)" stroke="#ec4899" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Simulation running...
              </div>
            )}
          </div>
        </div>

        {/* Per-Client Loss Trajectory */}
        <div className="p-5 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Per-Client Local Training Loss (MSE)
          </h3>
          <p className="text-[11px] text-slate-400">
            Observe the distinct learning rates across the 5 municipal edge intersections.
          </p>
          <div className="h-60 w-full">
            {perClientLossData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perClientLossData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="round" stroke="#64748b" tick={{ fontSize: 10 }} unit=" Rd" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#070b14', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  {clients.map((c) => (
                    <Line key={c.id} type="monotone" dataKey={c.name.split(':')[0]} stroke={c.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Per-client loss data available upon round completion...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
