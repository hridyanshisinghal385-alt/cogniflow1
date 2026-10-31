/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FlEngine } from '../engine';
import { TrafficGRUNet } from '../../models/gruNet';
import { TrafficNeuralNet } from '../../models/neuralNet';
import { generateSyntheticTrafficDataset } from '../../data/syntheticGenerator';
import { aggregateFedAvg, trainLocalClient } from '../trainer';
import { SeededRNG } from '../../utils/seededRng';

describe('CogniFlow Mathematical & Algorithmic Assertions', () => {
  // Test 1: FedAvg with 1 client equals local training (GRU Architecture)
  it('FedAvg with 1 client equals local training with GRU', () => {
    const { dataset, clients } = generateSyntheticTrafficDataset(1, 12, 7, 0.8, 0.0, 42);
    const rng = new SeededRNG(42);
    const initialModel = new TrafficGRUNet();
    const initialWeights = new Float32Array(initialModel.getFlattenedWeights());

    const clientWindows = dataset.clientTrainWindows[clients[0].id];
    const trainResult = trainLocalClient(
      initialWeights,
      clientWindows,
      {
        numClients: 1,
        windowSize: 12,
        totalRounds: 1,
        localEpochs: 2,
        batchSize: 16,
        learningRate: 0.01,
        participationRate: 1.0,
        partitionMode: 'iid',
        heterogeneity: 0.0,
        fedProxMu: 0.0,
        quantization: 'FP32',
        clientDropoutRate: 0.0,
        topKSparsity: 1.0,
        lazyUploadThreshold: 0.0,
        activeShock: 'none',
        modelArchitecture: 'gru',
        seed: 42,
        targetMae: 55,
        speedMs: 100,
      },
      rng
    );

    const { aggregatedWeights } = aggregateFedAvg(
      [{ clientId: clients[0].id, weights: trainResult.updatedWeights, sampleCount: clientWindows.length }],
      initialWeights
    );

    // With 1 client, weight fraction is 1.0, so aggregatedWeights must exactly match updatedWeights
    expect(aggregatedWeights.length).toBe(TrafficGRUNet.PARAM_COUNT);
    expect(aggregatedWeights.length).toBe(881);
    for (let i = 0; i < TrafficGRUNet.PARAM_COUNT; i++) {
      expect(aggregatedWeights[i]).toBeCloseTo(trainResult.updatedWeights[i], 5);
    }
  });

  // Test 2: The same seed gives identical deterministic results
  it('the same seed gives identical deterministic results', () => {
    const engine1 = new FlEngine(undefined, undefined, { seed: 42, totalRounds: 3, modelArchitecture: 'gru' });
    const engine2 = new FlEngine(undefined, undefined, { seed: 42, totalRounds: 3, modelArchitecture: 'gru' });

    const logs1 = engine1.runToCompletion();
    const logs2 = engine2.runToCompletion();

    expect(logs1[2].globalTestMae).toBe(logs2[2].globalTestMae);
    expect(logs1[2].cumulativeBytes).toBe(logs2[2].cumulativeBytes);
  });

  // Test 3: Train and test windows never overlap (Zero Data Leakage)
  it('train and test windows never overlap (Zero Data Leakage)', () => {
    const { dataset } = generateSyntheticTrafficDataset(5, 12, 7, 0.8, 0.8, 42);
    const trainTimestamps = new Set(dataset.trainWindows.map((w) => w.timestamp));
    const testTimestamps = new Set(dataset.testWindows.map((w) => w.timestamp));

    let hasOverlap = false;
    for (const ts of testTimestamps) {
      if (trainTimestamps.has(ts)) {
        hasOverlap = true;
        break;
      }
    }

    expect(hasOverlap).toBe(false);
    expect(dataset.trainWindows.length).toBeGreaterThan(0);
    expect(dataset.testWindows.length).toBeGreaterThan(0);
  });

  // Test 4: The byte formula matches the GRU and MLP model parameter counts
  it('the byte formula matches the model parameter counts for GRU and MLP', () => {
    // 1. GRU Model (881 params)
    const gruModel = new TrafficGRUNet();
    expect(gruModel.paramCount).toBe(881);
    expect(gruModel.getModelSizeBytes('FP32')).toBe(881 * 4); // 3,524 bytes
    expect(gruModel.getModelSizeBytes('FP16')).toBe(881 * 2); // 1,762 bytes
    expect(gruModel.getModelSizeBytes('INT8')).toBe(881 * 1 + 8); // 889 bytes

    // 2. MLP Model (961 params)
    const mlpModel = new TrafficNeuralNet();
    expect(mlpModel.paramCount).toBe(961);
    expect(mlpModel.getModelSizeBytes('FP32')).toBe(961 * 4); // 3,844 bytes
    expect(mlpModel.getModelSizeBytes('FP16')).toBe(961 * 2); // 1,922 bytes
    expect(mlpModel.getModelSizeBytes('INT8')).toBe(961 * 1 + 8); // 969 bytes

    // Full-duplex per-round formula for GRU: 2 x participating_clients x params x bytes_per_param
    const numClients = 5;
    const gruRoundFP32 = 2 * numClients * gruModel.paramCount * 4;
    expect(gruRoundFP32).toBe(35240);
  });

  // Test 5: GRU forward pass produces finite scalar and changes with inputs
  it('GRU forward pass is valid and responsive', () => {
    const gru = new TrafficGRUNet();
    const input1 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2]);
    const input2 = new Float32Array([1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]);

    const pred1 = gru.predict(input1);
    const pred2 = gru.predict(input2);

    expect(Number.isFinite(pred1)).toBe(true);
    expect(Number.isFinite(pred2)).toBe(true);
    expect(pred1).not.toBe(pred2);
  });
});
