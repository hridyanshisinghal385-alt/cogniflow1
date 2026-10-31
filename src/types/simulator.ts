/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PageId =
  | 'overview'
  | 'simulator'
  | 'data'
  | 'architecture'
  | 'iid-vs-non-iid'
  | 'communication'
  | 'experiments'
  | 'multi-seed'
  | 'export';

export type AppTheme = 'dark' | 'light';
export type ModelArchitecture = 'gru' | 'mlp';
export type QuantizationType = 'FP32' | 'FP16' | 'INT8';
export type PartitionMode = 'iid' | 'non_iid';
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'completed';
export type EventShockType = 'none' | 'accident' | 'heavy_rain' | 'festival';

export interface RawTrafficStep {
  step: number;
  timestamp: string;
  clientVolumes: Record<string, number>;
  totalVolume: number;
  isTrain: boolean;
}

export interface IntersectionClient {
  id: string;
  name: string;
  archetype: 'Residential' | 'Commercial / Financial' | 'Highway Corridor' | 'School Zone' | 'Downtown Crossing';
  color: string;
  coordinates: { x: number; y: number }; // Relative position on city map [0-100]
  sampleCount: number;
  trainSampleCount: number;
  testSampleCount: number;
  meanVolume: number;
  stdVolume: number;
  peakHours: string;
  currentLoss: number;
  currentMae: number;
  currentRmse: number;
  isOnline: boolean;
  status: 'Idle' | 'Local Training' | 'Uplinking Weights' | 'Aggregated' | 'Skipped Upload';
}

export interface TrafficWindow {
  inputs: Float32Array; // Length W = 12 steps (normalized)
  target: number;       // Step W+1 (normalized)
  unnormalizedTarget: number;
  timestamp: string;
  clientId: string;
}

export interface DatasetSplit {
  name: string;
  isSynthetic: boolean;
  totalTimeSteps: number;
  trainTimeSteps: number;
  testTimeSteps: number;
  splitRatio: number; // e.g. 0.8
  windowSize: number; // W = 12
  samplingIntervalMinutes: number; // 5 mins
  rawSteps?: RawTrafficStep[];
  trainWindows: TrafficWindow[];
  testWindows: TrafficWindow[];
  clientTrainWindows: Record<string, TrafficWindow[]>;
  clientTestWindows: Record<string, TrafficWindow[]>;
  normStats: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
}

export interface SimulatorConfig {
  numClients: number; // 3 to 5
  windowSize: number; // W = 12
  totalRounds: number;
  localEpochs: number; // E (default 3)
  batchSize: number;   // B (default 16)
  learningRate: number; // lr (default 0.01)
  participationRate: number; // C (e.g. 1.0 or 0.8)
  partitionMode: PartitionMode;
  heterogeneity: number; // 0.0 (IID) to 1.0 (Extreme Non-IID)
  fedProxMu: number; // 0.0 for vanilla FedAvg, > 0 for FedProx
  quantization: QuantizationType;
  clientDropoutRate: number; // 0.0 to 0.4
  topKSparsity: number; // 1.0 = full update, 0.2 = top 20%
  lazyUploadThreshold: number; // 0.0 = send always, > 0 = skip if ||Δw|| < threshold
  activeShock: EventShockType;
  modelArchitecture?: ModelArchitecture; // 'gru' (default recurrent) or 'mlp'
  seed: number;
  targetMae: number; // For convergence threshold
  speedMs: number; // Delay between rounds (e.g. 100ms)
}

export interface RoundLog {
  round: number;
  globalTrainLoss: number;
  globalTestMae: number;
  globalTestRmse: number;
  clientMetrics: Record<string, { mae: number; rmse: number; loss: number }>;
  participatingClientIds: string[];
  skippedClientIds: string[];
  bytesThisRound: number;
  cumulativeBytes: number;
  clientDrift: number; // L2 distance between client models and global model
  timestamp: number;
}

export interface BaselineResult {
  paradigm: 'Centralized' | 'Local-Only' | 'FedAvg' | 'FedProx';
  finalMae: number;
  finalRmse: number;
  totalBytes: number;
  roundsToTarget: number | null;
  trainTimeMs: number;
  history: { round: number; mae: number; rmse: number; bytes: number }[];
}

export interface MultiSeedRunResult {
  seed: number;
  rounds: RoundLog[];
  finalMae: number;
  finalRmse: number;
  totalBytes: number;
  roundsToTarget: number | null;
}

export interface MultiSeedSummary {
  seeds: number[];
  meanMae: number;
  stdMae: number;
  meanRmse: number;
  stdRmse: number;
  meanTotalBytes: number;
  meanRoundsToTarget: number | null;
  roundAverages: {
    round: number;
    meanMae: number;
    stdMae: number;
    minMae: number;
    maxMae: number;
    meanLoss: number;
    cumulativeBytes: number;
  }[];
  runs?: MultiSeedRunResult[];
}

export interface CityPacketParticle {
  id: string;
  fromClient: string; // client id or 'server'
  toClient: string;
  progress: number; // 0.0 to 1.0
  type: 'upload' | 'download';
  byteSize: number;
}

export type FLParticle = CityPacketParticle;

export interface ParetoConfigPoint {
  participation: number;
  quantization: QuantizationType;
  localEpochs: number;
  topK: number;
  totalBytes: number;
  finalMae: number;
  isParetoOptimal: boolean;
}

export interface EventShockResult {
  type: EventShockType;
  affectedClientId: string;
  multiplier: number;
  description: string;
  globalModelMae: number;
  localOnlyMae: number;
  perClientShockMae: Record<string, number>;
  predictions: {
    timestamp: string;
    actual: number;
    globalPred: number;
    localPred: number;
  }[];
}

export interface IidComparisonResult {
  history: {
    round: number;
    iidMae: number;
    nonIidMae: number;
    fedProxMae: number;
    centralizedMae: number;
    iidDrift: number;
    nonIidDrift: number;
    fedProxDrift: number;
  }[];
  iidFinalMae: number;
  nonIidFinalMae: number;
  fedProxFinalMae: number;
  centralizedFinalMae: number;
  iidFinalDrift: number;
  nonIidFinalDrift: number;
  fedProxFinalDrift: number;
  seed: number;
  fedProxMu: number;
}
