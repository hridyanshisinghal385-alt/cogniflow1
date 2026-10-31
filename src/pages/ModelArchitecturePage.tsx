/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useFL } from '../context/FLContext';
import {
  Cpu,
  ArrowRight,
  Database,
  Server,
  Wifi,
  Shield,
  CheckCircle2,
  Sparkles,
  Layers,
  Binary,
  Clock,
  RotateCw,
  GitBranch,
} from 'lucide-react';

export const ModelArchitecturePage: React.FC = () => {
  const { config, updateConfig, resetSimulation } = useFL();
  const [activeTab, setActiveTab] = useState<'gru' | 'mlp'>((config.modelArchitecture as 'gru' | 'mlp') || 'gru');
  const [activeStep, setActiveStep] = useState<number>(1);

  const activeArch = config.modelArchitecture || 'gru';

  // Exact parameter count:
  // GRU: 3*(1*16 + 16*16 + 16) + (16*1 + 1) = 3*288 + 17 = 881
  // MLP: 12*32 + 32 + 32*16 + 16 + 16*1 + 1 = 961
  const paramCount = activeTab === 'gru' ? 881 : 961;
  const fp32Bytes = paramCount * 4; // GRU: 3,524 B, MLP: 3,844 B
  const fp16Bytes = paramCount * 2; // GRU: 1,762 B, MLP: 1,922 B
  const int8Bytes = paramCount * 1 + 8; // GRU: 889 B, MLP: 969 B

  const activeBytes =
    config.quantization === 'INT8' ? int8Bytes : config.quantization === 'FP16' ? fp16Bytes : fp32Bytes;

  const rawBytesPerWindow = (config.windowSize + 1) * 4; // 13 floats * 4 bytes = 52 bytes

  const handleSelectArchitecture = (arch: 'gru' | 'mlp') => {
    setActiveTab(arch);
    updateConfig({ modelArchitecture: arch });
    resetSimulation();
  };

  const steps = [
    {
      num: 1,
      title: 'Edge In-Pavement & Loop Detectors',
      actor: 'Edge Sensor Layer',
      desc: 'Roadside magnetic loop and radar sensors record vehicle speed and flow counts at 5-minute sampling intervals.',
      bytesLabel: `${rawBytesPerWindow} bytes / time-window`,
      byteSubtext: 'Private to intersection; zero continuous raw video/sensor uplink.',
      icon: Database,
      details: [
        'Sample window: Past W = 12 steps (60 minutes sequential history)',
        'Local memory buffer: Sequential sliding window FIFO on embedded edge compute',
        'Target: Forecast step W+1 (future 5-minute traffic horizon)',
      ],
    },
    {
      num: 2,
      title: activeTab === 'gru' ? 'Local BPTT Recurrent Gradient (Edge GRU)' : 'Local Gradient Computation (Edge SGD)',
      actor: 'Local Client Model (Edge AI)',
      desc: activeTab === 'gru'
        ? 'Embedded roadside nodes execute E local epochs of Backpropagation Through Time (BPTT) through unrolled 12-step GRU gates.'
        : 'Embedded roadside nodes execute E local epochs of SGD on private historical batches without centralizing data.',
      bytesLabel: `${paramCount} parameters in local RAM`,
      byteSubtext: 'In-memory tensor operations; no raw observation leakage.',
      icon: Cpu,
      details: activeTab === 'gru'
        ? [
            'Forward pass: 12-step GRU cell (H = 16) with Update Gate (z_t) and Reset Gate (r_t)',
            'Loss function: Mean Squared Error (MSE) on normalized vehicles/hour',
            'FedProx proximal term: (μ / 2) ||w - w_global||^2 to constrain local client drift',
          ]
        : [
            'Forward pass: MLP (12 -> 32 -> 16 -> 1) with LeakyReLU activations',
            'Loss function: Mean Squared Error (MSE) on normalized vehicles/hour',
            'FedProx proximal term: (μ / 2) ||w - w_global||^2 to constrain local drift',
          ],
    },
    {
      num: 3,
      title: 'Secure Uplink Parameter Transmission',
      actor: 'Wireless Cellular Channel',
      desc: 'Clients transmit only the updated weight vector (or Top-K sparse updates) to the central aggregation server.',
      bytesLabel: `${activeBytes} bytes per participating client`,
      byteSubtext: `Using ${config.quantization} quantization (FP32: ${fp32Bytes.toLocaleString()} B, FP16: ${fp16Bytes.toLocaleString()} B, INT8: ${int8Bytes.toLocaleString()} B).`,
      icon: Wifi,
      details: [
        `Uplink payload: ${activeBytes} bytes per participating client (${paramCount} params)`,
        `Top-K option: ${(paramCount * 0.2 * (config.quantization === 'INT8' ? 1 + 4 : 4 + 4)).toFixed(0)} bytes at k=20%`,
        'Raw sensor streaming baseline: 1.2+ MB / day / corridor (>94% reduction)',
      ],
    },
    {
      num: 4,
      title: 'Central Server FedAvg Aggregation',
      actor: 'Central Coordinator Hub',
      desc: 'The central server receives weight updates from participating edge nodes and computes sample-weighted McMahan averaging.',
      bytesLabel: 'w_(t+1) = ∑ (n_k / n) w_t^k',
      byteSubtext: 'Zero access to edge training data; operates purely on parameter space.',
      icon: Server,
      details: [
        'Weighting coefficients: n_k / n based on client sample counts',
        'Consensus drift tracking: L2 discrepancy norm ||w_k - w_global||',
        'Straggler resilience: Aggregates available responses within round timeout window',
      ],
    },
    {
      num: 5,
      title: 'Global Consensus Broadcast',
      actor: 'Downlink Channel to Edge Nodes',
      desc: 'The newly synchronized global model weights are broadcast back down to all edge intersections for immediate inference.',
      bytesLabel: `${activeBytes} bytes broadcasted per client`,
      byteSubtext: 'Global model weights overwrite edge checkpoints for the next round.',
      icon: Sparkles,
      details: [
        'Downlink payload: Identical to uplink model size',
        'Immediate utility: Edge devices use updated weights for real-time traffic signal optimization',
        'Continuous learning: Adapts to urban traffic changes across diurnal variations',
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Architecture Switcher Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Model Card &amp; Recurrent Architecture
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Complete architectural specification of the edge forecasting model: <strong>Gated Recurrent Unit (GRU)</strong> for temporal sequence modeling,
            exact tensor layouts, parameter accounting, and full-duplex communication transmission formula.
          </p>
        </div>

        {/* Interactive Architecture Selector Toggle */}
        <div className="flex items-center gap-2 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 self-start sm:self-auto">
          <button
            onClick={() => handleSelectArchitecture('gru')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'gru'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>GRU (Recurrent)</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-900/40 text-cyan-200">881p</span>
          </button>
          <button
            onClick={() => handleSelectArchitecture('mlp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'mlp'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>MLP (Feedforward)</span>
            <span className="text-[10px] px-1 py-0.2 rounded bg-slate-700/50 text-slate-200">961p</span>
          </button>
        </div>
      </div>

      {/* Active Model Indicator Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-semibold text-cyan-900 dark:text-cyan-200">
            Active Simulator Model: <strong>{activeArch === 'gru' ? 'Gated Recurrent Unit (GRU)' : 'Multi-Layer Perceptron (MLP)'}</strong>
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            ({activeArch === 'gru' ? '881' : '961'} trainable weights running in Web Worker engine)
          </span>
        </div>
        {activeTab !== activeArch && (
          <button
            onClick={() => handleSelectArchitecture(activeTab)}
            className="px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition-colors cursor-pointer self-start sm:self-auto"
          >
            Activate {activeTab.toUpperCase()} for Live Simulator
          </button>
        )}
      </div>

      {/* 1. MODEL CARD & ARCHITECTURE DIAGRAM */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-[#0b101d] space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {activeTab === 'gru'
                  ? 'Gated Recurrent Unit (GRU) Temporal Forecasting Model Card'
                  : 'MLP Traffic-Flow Forecasting Model Card'}
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {activeTab === 'gru'
                ? 'Spatio-temporal recurrent neural network capturing multi-step auto-correlation and traffic momentum across 12 historical time steps'
                : 'Compact 3-layer neural network tailored for low-latency edge deployment on roadside controllers'}
            </p>
          </div>
          <span className="px-3 py-1 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold self-start sm:self-auto">
            Total: {paramCount} Trainable Parameters
          </span>
        </div>

        {/* GRU-Specific Deep Architecture Diagram */}
        {activeTab === 'gru' ? (
          <div className="space-y-4">
            {/* GRU Flow Pipeline Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch pt-2">
              {/* Sequence Input */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-cyan-500/40 space-y-2 text-center flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    Sequential Lookback
                  </span>
                  <div className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
                    T = 12 Steps
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    [x<sub>t-11</sub>, ..., x<sub>t</sub>] scalar traffic counts (60 mins at 5-min intervals)
                  </p>
                </div>
                <div className="text-[10px] font-mono text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-1">
                  0 parameters (input stream)
                </div>
              </div>

              {/* GRU Recurrent Cell: Update & Reset Gates */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      Recurrent Gates
                    </span>
                    <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 font-bold">H = 16</span>
                  </div>
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-1 space-y-1">
                    <div className="p-1 rounded bg-slate-200/50 dark:bg-slate-800/80 font-mono text-xs">
                      z<sub>t</sub>: Update Gate
                    </div>
                    <div className="p-1 rounded bg-slate-200/50 dark:bg-slate-800/80 font-mono text-xs">
                      r<sub>t</sub>: Reset Gate
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Sigmoid gating controls past momentum preservation vs new shock adaptation
                  </p>
                </div>
                <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 border-t border-slate-200 dark:border-slate-800 pt-1">
                  2 × (16×1 + 16×16 + 16) = 576 params
                </div>
              </div>

              {/* Candidate Hidden State */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    Candidate State
                  </span>
                  <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                    h̃<sub>t</sub> = tanh(...)
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Non-linear activation combining current input x<sub>t</sub> and reset memory (r<sub>t</sub> ⊙ h<sub>t-1</sub>)
                  </p>
                </div>
                <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 border-t border-slate-200 dark:border-slate-800 pt-1">
                  (16×1 + 16×16 + 16) = 288 params
                </div>
              </div>

              {/* Linear Forecast Head */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-emerald-500/40 space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    Output Projection
                  </span>
                  <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                    y = W<sub>y</sub>h<sub>12</sub> + b<sub>y</sub>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    Scalar forecast of traffic flow at future step W+1 (5-minute horizon)
                  </p>
                </div>
                <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-300 border-t border-slate-200 dark:border-slate-800 pt-1">
                  (16 × 1) + 1 = 17 params
                </div>
              </div>
            </div>

            {/* GRU Mathematical Equations Card */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950 border border-cyan-500/30 font-mono text-xs space-y-3">
              <div className="flex items-center justify-between text-cyan-700 dark:text-cyan-300 font-bold font-sans">
                <span>Formal Recurrent GRU Gating Equations:</span>
                <span>Unrolled across t ∈ [1, ..., 12]</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">1. Update Gate:</div>
                  <div className="text-cyan-600 dark:text-cyan-300 font-mono">
                    z<sub>t</sub> = σ(W<sub>z</sub> · x<sub>t</sub> + U<sub>z</sub> · h<sub>t-1</sub> + b<sub>z</sub>)
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans">
                    Controls the extent to which earlier diurnal trend vs recent arrival rate is retained.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">2. Reset Gate:</div>
                  <div className="text-cyan-600 dark:text-cyan-300 font-mono">
                    r<sub>t</sub> = σ(W<sub>r</sub> · x<sub>t</sub> + U<sub>r</sub> · h<sub>t-1</sub> + b<sub>r</sub>)
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans">
                    Allows resetting stale historical memory when sudden traffic shock occurs.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">3. Candidate Hidden State:</div>
                  <div className="text-cyan-600 dark:text-cyan-300 font-mono">
                    h̃<sub>t</sub> = tanh(W<sub>h</sub> · x<sub>t</sub> + U<sub>h</sub> · (r<sub>t</sub> ⊙ h<sub>t-1</sub>) + b<sub>h</sub>)
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans">
                    New candidate state incorporating gated previous memory.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">4. State Update &amp; Forecast Head:</div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-mono">
                    h<sub>t</sub> = (1 - z<sub>t</sub>) ⊙ h<sub>t-1</sub> + z<sub>t</sub> ⊙ h̃<sub>t</sub>
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-mono text-[10px] pt-0.5">
                    y = W<sub>y</sub> · h<sub>12</sub> + b<sub>y</sub>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* MLP Layer Diagram (12 -> 32 -> 16 -> 1) */
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center pt-2">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-cyan-500/40 space-y-2 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Input Layer
              </span>
              <div className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400">W = 12</div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">12 historical steps (60-min lookback)</p>
              <div className="text-[10px] font-mono text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-1">
                0 parameters
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Hidden Layer 1
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">32 Units</div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">Dense + LeakyReLU activation</p>
              <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 border-t border-slate-200 dark:border-slate-800 pt-1">
                (12 × 32) + 32 = 416 params
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Hidden Layer 2
              </span>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">16 Units</div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">Dense + LeakyReLU activation</p>
              <div className="text-[10px] font-mono text-cyan-600 dark:text-cyan-300 border-t border-slate-200 dark:border-slate-800 pt-1">
                (32 × 16) + 16 = 528 params
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-emerald-500/40 space-y-2 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Output Layer
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">1 Scalar</div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">Forecast step W+1 (future traffic volume)</p>
              <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-300 border-t border-slate-200 dark:border-slate-800 pt-1">
                (16 × 1) + 1 = 17 params
              </div>
            </div>
          </div>
        )}

        {/* Quantization Byte Footprint Comparison Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">FP32 (Single Precision)</span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">4 bytes/param</span>
            </div>
            <div className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-300">
              {fp32Bytes.toLocaleString()} Bytes
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {(fp32Bytes / 1024).toFixed(2)} KB per client update vector
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">FP16 (Half Precision)</span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">2 bytes/param (50% savings)</span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-300">
              {fp16Bytes.toLocaleString()} Bytes
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {(fp16Bytes / 1024).toFixed(2)} KB per client update vector
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">INT8 (Quantized)</span>
              <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">1 byte/param (74.8% savings)</span>
            </div>
            <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-300">
              {int8Bytes.toLocaleString()} Bytes
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">
              {paramCount} weights + 8 bytes scale/zero-point
            </div>
          </div>
        </div>

        {/* Exact Theoretical Communication Cost Formula Box */}
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950 border border-cyan-500/30 font-mono text-xs space-y-2">
          <div className="flex items-center justify-between text-cyan-700 dark:text-cyan-300 font-bold">
            <span>Communication Cost Formula:</span>
            <span>Full-Duplex Synchronous FedAvg ({activeTab.toUpperCase()})</span>
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
            bytes_per_round = 2 × participating_clients × params × bytes_per_param
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed space-y-1 pt-1 font-sans">
            <p>• <strong>2</strong>: Full-duplex round trip (1 downlink broadcast from central server + 1 uplink update from client)</p>
            <p>• <strong>participating_clients</strong>: Active edge nodes per round (K × C, default: 5 × 1.0 = 5 clients)</p>
            <p>• <strong>params</strong>: {paramCount} trainable weights and biases for {activeTab.toUpperCase()}</p>
            <p>• <strong>bytes_per_param</strong>: 4 for FP32, 2 for FP16, 1 for INT8</p>
            <p className="text-cyan-700 dark:text-cyan-400 font-mono pt-1">
              Sample calculation (5 clients, FP32): 2 × 5 × {paramCount} × 4 = {(2 * 5 * paramCount * 4).toLocaleString()} bytes/round ({(2 * 5 * paramCount * 4 / 1024).toFixed(1)} KB/round)
            </p>
          </div>
        </div>
      </div>

      {/* 2. Interactive 5-Hop Pipeline Inspector */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
          Physical Network Pipeline Hops
        </h2>

        {/* Hop Navigator Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = activeStep === s.num;
            return (
              <button
                key={s.num}
                onClick={() => setActiveStep(s.num)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-500 text-slate-900 dark:text-white shadow-lg shadow-cyan-500/10'
                    : 'bg-white dark:bg-[#0b101d] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                      isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {s.num}
                  </span>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`} />
                </div>
                <div className="font-semibold text-xs truncate">{s.title}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{s.actor}</div>
              </button>
            );
          })}
        </div>

        {/* Active Hop Details */}
        {(() => {
          const step = steps[activeStep - 1];
          const Icon = step.icon;
          return (
            <div className="bg-white dark:bg-[#0b101d] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-100 dark:bg-cyan-950/70 border border-cyan-300 dark:border-cyan-800/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">{step.actor}</div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Hop {step.num}: {step.title}
                    </h3>
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-right">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Transmitted Payload</div>
                  <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">{step.bytesLabel}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{step.byteSubtext}</div>
                </div>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{step.desc}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {step.details.map((detail, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
