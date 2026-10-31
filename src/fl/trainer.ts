/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaselineResult,
  DatasetSplit,
  QuantizationType,
  RoundLog,
  SimulatorConfig,
  TrafficWindow,
} from '../types/simulator';
import { ITrafficModel } from '../models/types';
import { createTrafficModel, getModelParamCount } from '../models/modelFactory';
import { SeededRNG } from '../utils/seededRng';

/**
 * Evaluates model on windows with stratified sampling for real-time speed.
 * Computes MAE, RMSE, MSE in physical units (vehicles/hour).
 */
export function evaluateModel(
  model: ITrafficModel,
  windows: TrafficWindow[],
  normStats: { mean: number; std: number },
  maxSamples: number = 200
): {
  mae: number;
  rmse: number;
  mse: number;
  predictions: { actual: number; predicted: number; timestamp: string }[];
} {
  if (!windows || windows.length === 0) {
    return { mae: 0, rmse: 0, mse: 0, predictions: [] };
  }

  let absErrorSum = 0;
  let squaredErrorSum = 0;
  const sampleLimit = Math.min(maxSamples, windows.length);
  const step = Math.max(1, Math.floor(windows.length / sampleLimit));
  const predictions: { actual: number; predicted: number; timestamp: string }[] = [];
  let evaluatedCount = 0;

  for (let i = 0; i < windows.length; i += step) {
    const w = windows[i];
    const normPred = model.predict(w.inputs);
    const unnormPred = normPred * normStats.std + normStats.mean;
    const actual = w.unnormalizedTarget;

    const absError = Math.abs(actual - unnormPred);
    const sqError = Math.pow(actual - unnormPred, 2);

    absErrorSum += absError;
    squaredErrorSum += sqError;
    evaluatedCount++;

    if (predictions.length < 50) {
      predictions.push({
        actual: Number(actual.toFixed(1)),
        predicted: Number(unnormPred.toFixed(1)),
        timestamp: w.timestamp,
      });
    }
  }

  const count = Math.max(1, evaluatedCount);
  const mae = absErrorSum / count;
  const rmse = Math.sqrt(squaredErrorSum / count);
  const mse = squaredErrorSum / count;

  return {
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    mse: Number(mse.toFixed(4)),
    predictions,
  };
}

/**
 * Top-K sparsification of client update vector Δw = w_local - w_global.
 * Keeps only the top k% largest magnitude elements; zeros out the rest.
 * Measured byte footprint: k_count * (bytesPerParam + 4 bytes index overhead).
 */
export function applyTopKSparsification(
  delta: Float32Array,
  topKFraction: number,
  bytesPerParam: number
): { sparsifiedDelta: Float32Array; measuredBytes: number; nonZeroCount: number } {
  const len = delta.length;
  if (topKFraction >= 0.99) {
    return {
      sparsifiedDelta: delta,
      measuredBytes: len * bytesPerParam,
      nonZeroCount: len,
    };
  }

  const kCount = Math.max(1, Math.round(len * Math.max(0.01, Math.min(1.0, topKFraction))));
  const indices = new Int32Array(len);
  for (let i = 0; i < len; i++) indices[i] = i;

  indices.sort((a, b) => Math.abs(delta[b]) - Math.abs(delta[a]));

  const sparsified = new Float32Array(len);
  for (let i = 0; i < kCount; i++) {
    const idx = indices[i];
    sparsified[idx] = delta[idx];
  }

  const measuredBytes = kCount * (bytesPerParam + 4);
  return {
    sparsifiedDelta: sparsified,
    measuredBytes,
    nonZeroCount: kCount,
  };
}

/**
 * Trains a client locally for E epochs on its private training windows.
 * Implements SGD with optional FedProx proximal penalty, gradient clipping,
 * top-K sparsification, and lazy upload thresholding.
 */
export function trainLocalClient(
  initialWeights: Float32Array,
  windows: TrafficWindow[],
  config: SimulatorConfig,
  rng: SeededRNG,
  maxBatchesOverride?: number
): {
  updatedWeights: Float32Array;
  localLoss: number;
  deltaNorm: number;
  isLazySkipped: boolean;
  measuredUplinkBytes: number;
} {
  const model = createTrafficModel(config.modelArchitecture ?? 'gru', initialWeights);
  const paramCount = model.paramCount;
  const snapshotGlobal = new Float32Array(initialWeights);

  if (!windows || windows.length === 0) {
    return {
      updatedWeights: initialWeights,
      localLoss: 0.05,
      deltaNorm: 0,
      isLazySkipped: false,
      measuredUplinkBytes: model.getModelSizeBytes(config.quantization),
    };
  }

  const { localEpochs, batchSize, learningRate, fedProxMu, topKSparsity, lazyUploadThreshold } = config;
  let lastLoss = 0.05;
  const maxBatchesPerEpoch = maxBatchesOverride ?? 6;

  // Mini-batch SGD / BPTT
  for (let epoch = 0; epoch < localEpochs; epoch++) {
    const shuffled = rng.shuffle([...windows]);
    let epochLoss = 0;
    let batchCount = 0;

    for (let i = 0; i < shuffled.length && batchCount < maxBatchesPerEpoch; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      if (batch.length === 0) continue;

      const inputs = batch.map((w) => w.inputs);
      const targets = batch.map((w) => w.target);

      const outputs = model.forwardBatch(inputs, batch.length);
      model.backwardBatch(inputs, targets, batch.length, snapshotGlobal, fedProxMu);
      model.applyGradients(learningRate);

      let batchLoss = 0;
      for (let b = 0; b < batch.length; b++) {
        batchLoss += Math.pow(outputs[b] - targets[b], 2);
      }
      epochLoss += batchLoss / batch.length;
      batchCount++;
    }
    lastLoss = batchCount > 0 ? epochLoss / batchCount : 0.05;
  }

  // Calculate update delta: Δw = w_local - w_global
  const rawUpdatedWeights = model.getFlattenedWeights();
  const delta = new Float32Array(paramCount);
  let sumSq = 0;
  for (let i = 0; i < paramCount; i++) {
    const d = rawUpdatedWeights[i] - snapshotGlobal[i];
    delta[i] = d;
    sumSq += d * d;
  }
  const deltaNorm = Math.sqrt(sumSq);

  // Check Lazy Upload Threshold
  if (lazyUploadThreshold > 0 && deltaNorm < lazyUploadThreshold) {
    return {
      updatedWeights: snapshotGlobal,
      localLoss: Number(lastLoss.toFixed(4)),
      deltaNorm: Number(deltaNorm.toFixed(4)),
      isLazySkipped: true,
      measuredUplinkBytes: 0,
    };
  }

  // Quantization byte width
  const bytesPerParam = config.quantization === 'INT8' ? 1 : config.quantization === 'FP16' ? 2 : 4;

  // Apply Top-K Sparsification
  const { sparsifiedDelta, measuredBytes } = applyTopKSparsification(delta, topKSparsity ?? 1.0, bytesPerParam);

  // Apply sparsified delta to produce transmitted updated weights
  const finalWeights = new Float32Array(paramCount);
  for (let i = 0; i < paramCount; i++) {
    finalWeights[i] = snapshotGlobal[i] + sparsifiedDelta[i];
  }

  return {
    updatedWeights: finalWeights,
    localLoss: Number(lastLoss.toFixed(4)),
    deltaNorm: Number(deltaNorm.toFixed(4)),
    isLazySkipped: false,
    measuredUplinkBytes: measuredBytes,
  };
}

/**
 * Server-side Federated Averaging (FedAvg):
 * w_(t+1) = ∑ (n_k / n) w_t^k
 */
export function aggregateFedAvg(
  clientUpdates: { clientId: string; weights: Float32Array; sampleCount: number }[],
  globalWeightsBefore: Float32Array
): { aggregatedWeights: Float32Array; clientDrift: number } {
  if (clientUpdates.length === 0) {
    return { aggregatedWeights: globalWeightsBefore, clientDrift: 0 };
  }

  const totalSamples = clientUpdates.reduce((sum, c) => sum + c.sampleCount, 0);
  const paramCount = clientUpdates[0].weights.length;
  const newGlobal = new Float32Array(paramCount);

  // Sample-weighted average
  for (const client of clientUpdates) {
    const weightFraction = client.sampleCount / Math.max(1, totalSamples);
    for (let p = 0; p < paramCount; p++) {
      newGlobal[p] += client.weights[p] * weightFraction;
    }
  }

  // Consensus Drift Norm: (1/K) ∑ ||w_k - w_global||_2
  let totalL2 = 0;
  for (const client of clientUpdates) {
    let sumSq = 0;
    for (let p = 0; p < paramCount; p++) {
      sumSq += Math.pow(client.weights[p] - newGlobal[p], 2);
    }
    totalL2 += Math.sqrt(sumSq);
  }
  const avgDrift = totalL2 / clientUpdates.length;

  return {
    aggregatedWeights: newGlobal,
    clientDrift: Number(avgDrift.toFixed(4)),
  };
}

/**
 * Runs Centralized Baseline Training
 */
export function runCentralizedBaseline(
  dataset: DatasetSplit,
  config: SimulatorConfig
): BaselineResult {
  const startTime = performance.now();
  const rng = new SeededRNG(config.seed);
  const model = createTrafficModel(config.modelArchitecture ?? 'gru');

  const trainWindows = dataset.trainWindows;
  const batchSize = config.batchSize;
  const history: { round: number; mae: number; rmse: number; bytes: number }[] = [];
  const rawDataBytes = trainWindows.length * (config.windowSize + 1) * 4;
  let roundsToTarget: number | null = null;

  for (let r = 1; r <= config.totalRounds; r++) {
    for (let e = 0; e < config.localEpochs; e++) {
      const shuffled = rng.shuffle([...trainWindows]);
      for (let i = 0; i < shuffled.length && i < 200; i += batchSize) {
        const batch = shuffled.slice(i, i + batchSize);
        if (batch.length === 0) continue;
        const inputs = batch.map((w) => w.inputs);
        const targets = batch.map((w) => w.target);
        model.forwardBatch(inputs, batch.length);
        model.backwardBatch(inputs, targets, batch.length);
        model.applyGradients(config.learningRate);
      }
    }

    const evalResult = evaluateModel(model, dataset.testWindows, dataset.normStats);
    history.push({
      round: r,
      mae: evalResult.mae,
      rmse: evalResult.rmse,
      bytes: rawDataBytes,
    });

    if (roundsToTarget === null && evalResult.mae <= config.targetMae) {
      roundsToTarget = r;
    }
  }

  const finalEval = evaluateModel(model, dataset.testWindows, dataset.normStats, 300);
  return {
    paradigm: 'Centralized',
    finalMae: finalEval.mae,
    finalRmse: finalEval.rmse,
    totalBytes: rawDataBytes,
    roundsToTarget,
    trainTimeMs: Math.round(performance.now() - startTime),
    history,
  };
}

/**
 * Runs Local-Only Baseline (clients never communicate)
 */
export function runLocalOnlyBaseline(
  dataset: DatasetSplit,
  config: SimulatorConfig,
  clients: { id: string }[]
): BaselineResult {
  const startTime = performance.now();
  const rng = new SeededRNG(config.seed);
  let cumulativeMae = 0;
  let cumulativeRmse = 0;

  clients.forEach((c) => {
    const clientTrain = dataset.clientTrainWindows[c.id] || [];
    const clientTest = dataset.clientTestWindows[c.id] || [];
    const model = createTrafficModel(config.modelArchitecture ?? 'gru');

    for (let r = 0; r < config.totalRounds; r++) {
      for (let e = 0; e < config.localEpochs; e++) {
        const shuffled = rng.shuffle([...clientTrain]);
        for (let i = 0; i < shuffled.length && i < 150; i += config.batchSize) {
          const batch = shuffled.slice(i, i + config.batchSize);
          if (batch.length === 0) continue;
          const inputs = batch.map((w) => w.inputs);
          const targets = batch.map((w) => w.target);
          model.forwardBatch(inputs, batch.length);
          model.backwardBatch(inputs, targets, batch.length);
          model.applyGradients(config.learningRate);
        }
      }
    }

    const evalRes = evaluateModel(model, clientTest, dataset.normStats);
    cumulativeMae += evalRes.mae;
    cumulativeRmse += evalRes.rmse;
  });

  const avgMae = cumulativeMae / clients.length;
  const avgRmse = cumulativeRmse / clients.length;

  return {
    paradigm: 'Local-Only',
    finalMae: Number(avgMae.toFixed(2)),
    finalRmse: Number(avgRmse.toFixed(2)),
    totalBytes: 0,
    roundsToTarget: null,
    trainTimeMs: Math.round(performance.now() - startTime),
    history: [],
  };
}
