/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlEngine } from './engine';
import { EventShockType, SimulatorConfig } from '../types/simulator';

// Self-contained Web Worker instance of the FlEngine
let engine: FlEngine | null = null;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'INIT': {
        const config = payload?.config as Partial<SimulatorConfig> | undefined;
        const customDataset = payload?.dataset;
        const customClients = payload?.clients;

        engine = new FlEngine(customDataset, customClients, config);
        const baselines = engine.getBaselines();
        // Pre-compute 5th (IID vs Non-IID), 8th (Multi-Seed), and 7th (Experiments Lab) directly for instant access!
        const iidComparisonResult = engine.runIidComparisonDirect(config?.fedProxMu ?? 0.01);
        const multiSeedSummary = engine.runMultiSeedSweep([42, 123, 2024]);
        const experiments = engine.runAllExperimentsDirect();

        self.postMessage({
          type: 'INITIALIZED',
          payload: {
            dataset: engine.dataset,
            clients: engine.clients,
            config: engine.config,
            baselines,
            iidComparisonResult,
            multiSeedSummary,
            optimizationRows: experiments.optimizationRows,
            commSaverResult: experiments.commSaverResult,
            budgetParetoResult: experiments.budgetParetoResult,
            whatIfScenario: experiments.whatIfScenario,
            dataLeakageResult: experiments.dataLeakageResult,
          },
        });
        break;
      }

      case 'RESET': {
        if (!engine) engine = new FlEngine();
        engine.reset(payload?.seed);
        self.postMessage({
          type: 'RESET_COMPLETED',
          payload: {
            currentRound: 0,
            clients: engine.clients,
            roundLogs: [],
          },
        });
        break;
      }

      case 'UPDATE_CONFIG': {
        if (!engine) engine = new FlEngine();
        engine.config = { ...engine.config, ...payload };
        break;
      }

      case 'STEP_ROUND': {
        if (!engine) engine = new FlEngine();
        const selectedId = payload?.selectedClientId;
        const roundLog = engine.stepRound(selectedId);
        self.postMessage({
          type: 'ROUND_COMPLETED',
          payload: {
            roundLog,
            currentRound: engine.currentRound,
            clients: engine.clients,
            isCompleted: engine.currentRound >= engine.config.totalRounds,
          },
        });
        break;
      }

      case 'RUN_TO_COMPLETION': {
        if (!engine) engine = new FlEngine();
        const target = engine.config.totalRounds;
        while (engine.currentRound < target) {
          const log = engine.stepRound();
          self.postMessage({
            type: 'ROUND_COMPLETED',
            payload: {
              roundLog: log,
              currentRound: engine.currentRound,
              clients: engine.clients,
              isCompleted: engine.currentRound >= target,
            },
          });
        }
        self.postMessage({
          type: 'SIMULATION_FINISHED',
          payload: {
            roundLogs: engine.roundLogs,
            currentRound: engine.currentRound,
            clients: engine.clients,
          },
        });
        break;
      }

      case 'RUN_MULTI_SEED_SWEEP': {
        if (!engine) engine = new FlEngine();
        const seeds = payload?.seeds || [42, 123, 2024];
        const summary = engine.runMultiSeedSweep(seeds, (prog) => {
          self.postMessage({
            type: 'SWEEP_PROGRESS',
            payload: {
              task: 'multi-seed',
              progress: Math.round(((prog.currentSeed - 1 + prog.currentRound / prog.totalRounds) / prog.totalSeeds) * 100),
              current: prog.currentSeed,
              total: prog.totalSeeds,
              label: `Simulating Seed ${prog.currentSeed}/${prog.totalSeeds} - Round ${prog.currentRound}/${prog.totalRounds}`,
            },
          });
        });
        self.postMessage({
          type: 'MULTI_SEED_RESULT',
          payload: summary,
        });
        break;
      }

      case 'RUN_OPTIMIZATION_SUITE': {
        if (!engine) engine = new FlEngine();
        const rows = engine.runOptimizationSuite((current, total) => {
          self.postMessage({
            type: 'SWEEP_PROGRESS',
            payload: {
              task: 'optimizations',
              progress: Math.round((current / total) * 100),
              current,
              total,
              label: `Benchmarking optimization strategy ${current} of ${total}`,
            },
          });
        });
        self.postMessage({
          type: 'OPTIMIZATION_RESULT',
          payload: rows,
        });
        break;
      }

      case 'RUN_LEAKAGE_AUDIT': {
        if (!engine) engine = new FlEngine();
        const res = engine.runDataLeakageComparison();
        self.postMessage({
          type: 'LEAKAGE_RESULT',
          payload: res,
        });
        break;
      }

      case 'RUN_WHAT_IF': {
        if (!engine) engine = new FlEngine();
        const scenario = payload?.scenarioId || 'healthy';
        const res = engine.runWhatIfScenario(scenario);
        self.postMessage({
          type: 'WHAT_IF_RESULT',
          payload: res,
        });
        break;
      }

      case 'RUN_BUDGET_PARETO': {
        if (!engine) engine = new FlEngine();
        const budgetKB = payload?.budgetKB || 300;
        const res = engine.runBandwidthBudgetPareto(budgetKB, (pct) => {
          self.postMessage({
            type: 'SWEEP_PROGRESS',
            payload: {
              task: 'budget-pareto',
              progress: pct,
              current: pct,
              total: 100,
              label: `Exploring Pareto search space: ${pct}% complete`,
            },
          });
        });
        self.postMessage({
          type: 'BUDGET_PARETO_RESULT',
          payload: res,
        });
        break;
      }

      case 'RUN_EVENT_SHOCK': {
        if (!engine) engine = new FlEngine();
        const shockType = (payload?.shockType || 'none') as EventShockType;
        const res = engine.runEventShockTest(shockType);
        self.postMessage({
          type: 'EVENT_SHOCK_RESULT',
          payload: res,
        });
        break;
      }

      case 'RUN_COMM_SAVER_BENCHMARK': {
        if (!engine) engine = new FlEngine();
        const topK = payload?.topK ?? engine.config.topKSparsity ?? 0.3;
        const lazyThreshold = payload?.lazyThreshold ?? engine.config.lazyUploadThreshold ?? 0.04;
        const res = engine.runCommSaverBenchmark(topK, lazyThreshold);
        self.postMessage({
          type: 'COMM_SAVER_RESULT',
          payload: res,
        });
        break;
      }

      case 'RUN_IID_COMPARISON': {
        if (!engine) engine = new FlEngine();
        const fedProxMu = payload?.fedProxMu ?? 0.01;
        const res = engine.runIidComparisonDirect(fedProxMu, (prog) => {
          self.postMessage({
            type: 'SWEEP_PROGRESS',
            payload: {
              task: 'iid-comparison',
              progress: prog.progress,
              label: prog.label,
            },
          });
        });

        self.postMessage({
          type: 'IID_COMPARISON_RESULT',
          payload: res,
        });
        break;
      }

      case 'RUN_ALL_EXPERIMENTS_DIRECT': {
        if (!engine) engine = new FlEngine();
        const res = engine.runAllExperimentsDirect((progress, label) => {
          self.postMessage({
            type: 'SWEEP_PROGRESS',
            payload: {
              task: 'all-experiments',
              progress,
              label,
            },
          });
        });

        self.postMessage({
          type: 'ALL_EXPERIMENTS_RESULT',
          payload: res,
        });
        break;
      }

      default:
        break;
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: err?.message || 'Worker computation error' },
    });
  }
};
