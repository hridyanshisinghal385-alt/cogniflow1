/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore, useCallback } from 'react';
import {
  AppTheme,
  BaselineResult,
  DatasetSplit,
  EventShockResult,
  EventShockType,
  IidComparisonResult,
  IntersectionClient,
  MultiSeedSummary,
  PageId,
  ParetoConfigPoint,
  RoundLog,
  SimulationStatus,
  SimulatorConfig,
} from '../types/simulator';
import {
  OptimizationBenchmarkRow,
  DataLeakageComparison,
  WhatIfFailureScenario,
  CommSaverBenchmarkResult,
} from '../fl/engine';
import { generateSyntheticTrafficDataset } from '../data/syntheticGenerator';
import { parseUploadedCsvTraffic, getPresetCsvText } from '../data/csvLoader';

export type { IidComparisonResult };

export interface FLState {
  theme: AppTheme;
  activePage: PageId;
  isCommandPaletteOpen: boolean;
  dataset: DatasetSplit;
  clients: IntersectionClient[];
  config: SimulatorConfig;
  currentRound: number;
  simulationStatus: SimulationStatus;
  roundLogs: RoundLog[];
  baselines: { centralized: BaselineResult; localOnly: BaselineResult } | null;
  multiSeedSummary: MultiSeedSummary | null;
  optimizationRows: OptimizationBenchmarkRow[] | null;
  commSaverResult: CommSaverBenchmarkResult | null;
  dataLeakageResult: DataLeakageComparison | null;
  whatIfScenario: WhatIfFailureScenario | null;
  budgetParetoResult: {
    allPoints: ParetoConfigPoint[];
    paretoFrontier: ParetoConfigPoint[];
    bestUnderBudget: ParetoConfigPoint | null;
  } | null;
  eventShockResult: EventShockResult | null;
  sweepProgress: { task: string; progress: number; label: string } | null;
  iidComparisonResult: IidComparisonResult | null;
  use2DFallback: boolean;
  isWorkerBusy: boolean;
}

// Initial state creation
const initialGenerated = generateSyntheticTrafficDataset(5, 12, 7, 0.8, 0.85, 42);

const initialConfig: SimulatorConfig = {
  numClients: 5,
  windowSize: 12,
  totalRounds: 25,
  localEpochs: 3,
  batchSize: 16,
  learningRate: 0.01,
  participationRate: 1.0,
  partitionMode: 'non_iid',
  heterogeneity: 0.85,
  fedProxMu: 0.0,
  quantization: 'FP32',
  clientDropoutRate: 0.0,
  topKSparsity: 1.0,
  lazyUploadThreshold: 0.0,
  activeShock: 'none',
  seed: 42,
  targetMae: 55,
  speedMs: 100,
};

const savedTheme: AppTheme =
  typeof window !== 'undefined'
    ? (localStorage.getItem('fl_theme') as AppTheme) || 'dark'
    : 'dark';

if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  document.documentElement.classList.toggle('light', savedTheme === 'light');
}

let state: FLState = {
  theme: savedTheme,
  activePage: 'overview',
  isCommandPaletteOpen: false,
  dataset: initialGenerated.dataset,
  clients: initialGenerated.clients,
  config: initialConfig,
  currentRound: 0,
  simulationStatus: 'idle',
  roundLogs: [],
  baselines: null,
  multiSeedSummary: null,
  optimizationRows: null,
  commSaverResult: null,
  dataLeakageResult: null,
  whatIfScenario: null,
  budgetParetoResult: null,
  eventShockResult: null,
  sweepProgress: null,
  iidComparisonResult: null,
  use2DFallback: false,
  isWorkerBusy: false,
};

// Listeners set for external store subscription
const listeners = new Set<() => void>();

// Throttling mechanism (at most 16 UI notifications per second during continuous simulation)
let notifyPending = false;
let lastNotifyTime = 0;
const NOTIFY_THROTTLE_MS = 60;

function emitChange(forceImmediate: boolean = false) {
  const now = performance.now();
  if (forceImmediate || now - lastNotifyTime >= NOTIFY_THROTTLE_MS) {
    lastNotifyTime = now;
    notifyPending = false;
    listeners.forEach((l) => l());
  } else if (!notifyPending) {
    notifyPending = true;
    setTimeout(() => {
      notifyPending = false;
      lastNotifyTime = performance.now();
      listeners.forEach((l) => l());
    }, NOTIFY_THROTTLE_MS - (now - lastNotifyTime));
  }
}

// Web Worker instance
let worker: Worker | null = null;
let simulationTimeout: any = null;

function scheduleNextSimulationRound() {
  if (simulationTimeout) {
    clearTimeout(simulationTimeout);
    simulationTimeout = null;
  }
  if (state.simulationStatus !== 'running') return;
  if (state.currentRound >= state.config.totalRounds) {
    stopSimulationLoop();
    state = { ...state, simulationStatus: 'completed' };
    emitChange(true);
    return;
  }
  simulationTimeout = setTimeout(() => {
    if (state.simulationStatus === 'running' && state.currentRound < state.config.totalRounds) {
      getWorker().postMessage({
        type: 'STEP_ROUND',
        payload: {},
      });
    }
  }, Math.max(20, state.config.speedMs));
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../fl/engine.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

      switch (type) {
        case 'INITIALIZED': {
          state = {
            ...state,
            dataset: payload.dataset,
            clients: payload.clients,
            config: payload.config,
            baselines: payload.baselines,
            iidComparisonResult: payload.iidComparisonResult || state.iidComparisonResult,
            multiSeedSummary: payload.multiSeedSummary || state.multiSeedSummary,
            optimizationRows: payload.optimizationRows || state.optimizationRows,
            commSaverResult: payload.commSaverResult || state.commSaverResult,
            budgetParetoResult: payload.budgetParetoResult || state.budgetParetoResult,
            whatIfScenario: payload.whatIfScenario || state.whatIfScenario,
            dataLeakageResult: payload.dataLeakageResult || state.dataLeakageResult,
          };
          emitChange(true);
          break;
        }

        case 'ROUND_COMPLETED': {
          const isDone = payload.isCompleted || payload.currentRound >= state.config.totalRounds;
          const newLogs = [...state.roundLogs, payload.roundLog];
          state = {
            ...state,
            currentRound: payload.currentRound,
            clients: payload.clients,
            roundLogs: newLogs,
            simulationStatus: isDone ? 'completed' : state.simulationStatus,
          };
          if (isDone) {
            stopSimulationLoop();
            emitChange(true);
          } else {
            emitChange(false); // Throttled
            if (state.simulationStatus === 'running') {
              scheduleNextSimulationRound();
            }
          }
          break;
        }

        case 'RESET_COMPLETED': {
          state = {
            ...state,
            currentRound: 0,
            clients: payload.clients,
            roundLogs: [],
            simulationStatus: 'idle',
          };
          emitChange(true);
          break;
        }

        case 'SWEEP_PROGRESS': {
          state = {
            ...state,
            sweepProgress: {
              task: payload.task,
              progress: payload.progress,
              label: payload.label,
            },
          };
          emitChange(false);
          break;
        }

        case 'MULTI_SEED_RESULT': {
          state = {
            ...state,
            multiSeedSummary: payload,
            sweepProgress: null,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'OPTIMIZATION_RESULT': {
          state = {
            ...state,
            optimizationRows: payload,
            sweepProgress: null,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'LEAKAGE_RESULT': {
          state = {
            ...state,
            dataLeakageResult: payload,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'WHAT_IF_RESULT': {
          state = {
            ...state,
            whatIfScenario: payload,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'BUDGET_PARETO_RESULT': {
          state = {
            ...state,
            budgetParetoResult: payload,
            sweepProgress: null,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'EVENT_SHOCK_RESULT': {
          state = {
            ...state,
            eventShockResult: payload,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'COMM_SAVER_RESULT': {
          state = {
            ...state,
            commSaverResult: payload,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'IID_COMPARISON_RESULT': {
          state = {
            ...state,
            iidComparisonResult: payload,
            sweepProgress: null,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'ALL_EXPERIMENTS_RESULT': {
          state = {
            ...state,
            optimizationRows: payload.optimizationRows,
            commSaverResult: payload.commSaverResult,
            budgetParetoResult: payload.budgetParetoResult,
            whatIfScenario: payload.whatIfScenario,
            dataLeakageResult: payload.dataLeakageResult,
            sweepProgress: null,
            isWorkerBusy: false,
          };
          emitChange(true);
          break;
        }

        case 'ERROR': {
          console.error('[Engine Worker Error]:', payload.message);
          state = {
            ...state,
            isWorkerBusy: false,
            sweepProgress: null,
          };
          emitChange(true);
          break;
        }

        default:
          break;
      }
    };

    // Initialize worker with initial config
    worker.postMessage({
      type: 'INIT',
      payload: { config: state.config },
    });
  }
  return worker;
}

// Start simulation loop (self-scheduled chain for 100% responsiveness)
function startSimulationLoop() {
  stopSimulationLoop();
  state = { ...state, simulationStatus: 'running' };
  emitChange(true);
  getWorker().postMessage({
    type: 'STEP_ROUND',
    payload: {},
  });
}

function stopSimulationLoop() {
  if (simulationTimeout) {
    clearTimeout(simulationTimeout);
    simulationTimeout = null;
  }
}

// Ensure worker is created
if (typeof window !== 'undefined') {
  getWorker();
}

// Exported Actions
export const flActions = {
  setActivePage: (page: PageId) => {
    state = { ...state, activePage: page };
    emitChange(true);
  },

  setIsCommandPaletteOpen: (open: boolean) => {
    state = { ...state, isCommandPaletteOpen: open };
    emitChange(true);
  },

  updateConfig: (patch: Partial<SimulatorConfig>) => {
    state = { ...state, config: { ...state.config, ...patch } };
    getWorker().postMessage({ type: 'UPDATE_CONFIG', payload: patch });
    emitChange(true);
  },

  stepRound: (selectedClientId?: string) => {
    if (state.currentRound >= state.config.totalRounds) return;
    getWorker().postMessage({
      type: 'STEP_ROUND',
      payload: { selectedClientId },
    });
  },

  startSimulation: () => {
    if (state.currentRound >= state.config.totalRounds) {
      flActions.resetSimulation();
    }
    startSimulationLoop();
  },

  pauseSimulation: () => {
    stopSimulationLoop();
    state = { ...state, simulationStatus: 'paused' };
    emitChange(true);
  },

  toggleSimulation: () => {
    if (state.simulationStatus === 'running') {
      flActions.pauseSimulation();
    } else {
      flActions.startSimulation();
    }
  },

  resetSimulation: (seed?: number) => {
    stopSimulationLoop();
    const newSeed = seed !== undefined ? seed : state.config.seed;
    state = {
      ...state,
      simulationStatus: 'idle',
      currentRound: 0,
      roundLogs: [],
      config: { ...state.config, seed: newSeed },
    };
    getWorker().postMessage({
      type: 'RESET',
      payload: { seed: newSeed },
    });
    emitChange(true);
  },

  runMultiSeedSweep: (seeds: number[] = [42, 123, 2024]) => {
    state = {
      ...state,
      isWorkerBusy: true,
      sweepProgress: { task: 'multi-seed', progress: 0, label: 'Initializing 3-seed sweep...' },
    };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_MULTI_SEED_SWEEP',
      payload: { seeds },
    });
  },

  runOptimizationSuite: () => {
    state = {
      ...state,
      isWorkerBusy: true,
      sweepProgress: { task: 'optimizations', progress: 0, label: 'Benchmarking strategies...' },
    };
    emitChange(true);
    getWorker().postMessage({ type: 'RUN_OPTIMIZATION_SUITE' });
  },

  runLeakageAudit: () => {
    state = { ...state, isWorkerBusy: true };
    emitChange(true);
    getWorker().postMessage({ type: 'RUN_LEAKAGE_AUDIT' });
  },

  runWhatIf: (scenarioId: 'healthy' | 'highway_failure' | 'noisy_sensor' | 'stragglers') => {
    state = { ...state, isWorkerBusy: true };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_WHAT_IF',
      payload: { scenarioId },
    });
  },

  runBudgetPareto: (budgetKB: number) => {
    state = {
      ...state,
      isWorkerBusy: true,
      sweepProgress: { task: 'budget-pareto', progress: 0, label: 'Running Pareto frontier search...' },
    };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_BUDGET_PARETO',
      payload: { budgetKB },
    });
  },

  applyParetoConfig: (point: ParetoConfigPoint) => {
    state = {
      ...state,
      config: {
        ...state.config,
        participationRate: point.participation,
        quantization: point.quantization,
        localEpochs: point.localEpochs,
        topKSparsity: point.topK,
      },
    };
    getWorker().postMessage({
      type: 'UPDATE_CONFIG',
      payload: {
        participationRate: point.participation,
        quantization: point.quantization,
        localEpochs: point.localEpochs,
        topKSparsity: point.topK,
      },
    });
    emitChange(true);
  },

  runCommSaverBenchmark: (topK?: number, lazyThreshold?: number) => {
    state = { ...state, isWorkerBusy: true };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_COMM_SAVER_BENCHMARK',
      payload: { topK, lazyThreshold },
    });
  },

  runEventShock: (shockType: EventShockType) => {
    state = {
      ...state,
      isWorkerBusy: true,
      config: { ...state.config, activeShock: shockType },
    };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_EVENT_SHOCK',
      payload: { shockType },
    });
  },

  runIidComparison: (fedProxMu: number = 0.01) => {
    state = {
      ...state,
      isWorkerBusy: true,
      sweepProgress: { task: 'iid-comparison', progress: 0, label: 'Simulating IID vs Non-IID vs FedProx (20 rounds)...' },
    };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_IID_COMPARISON',
      payload: { fedProxMu },
    });
  },

  runAllExperimentsDirect: () => {
    state = {
      ...state,
      isWorkerBusy: true,
      sweepProgress: { task: 'all-experiments', progress: 0, label: 'Running all 5 research experiments directly...' },
    };
    emitChange(true);
    getWorker().postMessage({
      type: 'RUN_ALL_EXPERIMENTS_DIRECT',
    });
  },

  uploadCustomDataset: async (file: File) => {
    stopSimulationLoop();
    try {
      const parsed = await parseUploadedCsvTraffic(
        file,
        state.config.numClients,
        state.config.windowSize,
        0.8,
        state.config.heterogeneity,
        state.config.seed
      );
      state = {
        ...state,
        dataset: parsed.dataset,
        clients: parsed.clients,
        currentRound: 0,
        roundLogs: [],
        simulationStatus: 'idle',
      };
      getWorker().postMessage({
        type: 'INIT',
        payload: {
          config: state.config,
          dataset: parsed.dataset,
          clients: parsed.clients,
        },
      });
      emitChange(true);
      return { success: true, message: `Loaded ${file.name} successfully.` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to parse CSV file.' };
    }
  },

  restoreSyntheticDataset: () => {
    stopSimulationLoop();
    const generated = generateSyntheticTrafficDataset(
      state.config.numClients,
      state.config.windowSize,
      7,
      0.8,
      state.config.heterogeneity,
      state.config.seed
    );
    state = {
      ...state,
      dataset: generated.dataset,
      clients: generated.clients,
      currentRound: 0,
      roundLogs: [],
      simulationStatus: 'idle',
    };
    getWorker().postMessage({
      type: 'INIT',
      payload: {
        config: state.config,
        dataset: generated.dataset,
        clients: generated.clients,
      },
    });
    emitChange(true);
  },

  setUse2DFallback: (val: boolean) => {
    state = { ...state, use2DFallback: val };
    emitChange(true);
  },

  toggleTheme: () => {
    const nextTheme: AppTheme = state.theme === 'dark' ? 'light' : 'dark';
    state = { ...state, theme: nextTheme };
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      document.documentElement.classList.toggle('light', nextTheme === 'light');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fl_theme', nextTheme);
    }
    emitChange(true);
  },

  setTheme: (theme: AppTheme) => {
    state = { ...state, theme };
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.classList.toggle('light', theme === 'light');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fl_theme', theme);
    }
    emitChange(true);
  },

  loadPresetDataset: async (presetId: string) => {
    stopSimulationLoop();
    try {
      const csvText = getPresetCsvText(presetId);
      const fileName = `${presetId}_traffic_matrix.csv`;
      const file = new File([csvText], fileName, { type: 'text/csv' });
      const parsed = await parseUploadedCsvTraffic(
        file,
        state.config.numClients,
        state.config.windowSize,
        0.8,
        state.config.heterogeneity,
        state.config.seed
      );
      state = {
        ...state,
        dataset: parsed.dataset,
        clients: parsed.clients,
        currentRound: 0,
        roundLogs: [],
        simulationStatus: 'idle',
      };
      getWorker().postMessage({
        type: 'INIT',
        payload: {
          config: state.config,
          dataset: parsed.dataset,
          clients: parsed.clients,
        },
      });
      emitChange(true);
      return {
        success: true,
        message: `Loaded ${parsed.dataset.name} (${parsed.dataset.totalTimeSteps} timesteps, ${parsed.dataset.trainWindows.length} train windows) successfully.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to load preset.' };
    }
  },
};

// Store subscription implementation for useSyncExternalStore
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/**
 * High-performance selector hook using useSyncExternalStore.
 * Re-renders ONLY when the selected slice changes!
 */
export function useFLSelector<T>(selector: (s: FLState) => T): T {
  const getSelected = useCallback(() => selector(state), [selector]);
  return useSyncExternalStore(subscribe, getSelected, getSelected);
}

/**
 * Hook to access the full FL state and actions
 */
export function useFLStore() {
  const currentState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...currentState,
    ...flActions,
  };
}
