/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatasetSplit, IntersectionClient, TrafficWindow, RawTrafficStep } from '../types/simulator';
import { SeededRNG } from '../utils/seededRng';

export const CLIENT_ARCHETYPES: Omit<IntersectionClient, 'sampleCount' | 'trainSampleCount' | 'testSampleCount' | 'currentLoss' | 'currentMae' | 'currentRmse' | 'isOnline' | 'status'>[] = [
  {
    id: 'client_1',
    name: 'Intersection 1: Maple & Oak St',
    archetype: 'Residential',
    color: '#38BDF8', // Sky Blue
    coordinates: { x: 18, y: 72 },
    meanVolume: 340,
    stdVolume: 110,
    peakHours: '07:30 - 08:45 & 17:30 - 18:45',
  },
  {
    id: 'client_2',
    name: 'Intersection 2: Financial Plaza & 4th',
    archetype: 'Commercial / Financial',
    color: '#818CF8', // Indigo
    coordinates: { x: 75, y: 28 },
    meanVolume: 780,
    stdVolume: 220,
    peakHours: '08:30 - 10:00 & 16:45 - 18:30',
  },
  {
    id: 'client_3',
    name: 'Intersection 3: Expressway Ramp 101',
    archetype: 'Highway Corridor',
    color: '#F43F5E', // Rose
    coordinates: { x: 84, y: 78 },
    meanVolume: 1640,
    stdVolume: 380,
    peakHours: '07:00 - 10:30 & 15:30 - 19:30',
  },
  {
    id: 'client_4',
    name: 'Intersection 4: Lincoln Academy Blvd',
    archetype: 'School Zone',
    color: '#F59E0B', // Amber
    coordinates: { x: 25, y: 22 },
    meanVolume: 420,
    stdVolume: 180,
    peakHours: '07:45 - 08:30 & 14:30 - 15:45',
  },
  {
    id: 'client_5',
    name: 'Intersection 5: Broadway & Central Ave',
    archetype: 'Downtown Crossing',
    color: '#10B981', // Emerald
    coordinates: { x: 50, y: 50 },
    meanVolume: 920,
    stdVolume: 260,
    peakHours: '12:00 - 14:00 & 18:00 - 23:00',
  },
];

/**
 * Generates synthetic traffic time series with realistic diurnal + weekly cycles.
 */
export function generateSyntheticTrafficDataset(
  numClients: number = 5,
  windowSize: number = 12,
  days: number = 7,
  splitRatio: number = 0.8,
  heterogeneity: number = 1.0, // 0 = IID, 1 = Full Non-IID
  seed: number = 42
): {
  dataset: DatasetSplit;
  clients: IntersectionClient[];
} {
  const rng = new SeededRNG(seed);
  const stepsPerDay = 288; // 5-minute intervals (24 * 12)
  const totalSteps = days * stepsPerDay; // 7 days = 2016 timesteps (full weekly cycle)

  const activeArchetypes = CLIENT_ARCHETYPES.slice(0, Math.min(5, Math.max(3, numClients)));
  const clientSeries: Record<string, { timestamp: string; volume: number }[]> = {};

  const startDate = new Date('2026-05-04T00:00:00Z'); // Starts on a Monday

  activeArchetypes.forEach((client, clientIdx) => {
    const series: { timestamp: string; volume: number }[] = [];

    for (let t = 0; t < totalSteps; t++) {
      const stepDate = new Date(startDate.getTime() + t * 5 * 60 * 1000);
      const hour = stepDate.getUTCHours() + stepDate.getUTCMinutes() / 60;
      const dayOfWeek = stepDate.getUTCDay(); // 0 = Sun, 6 = Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let baseVolume = 0;

      switch (client.archetype) {
        case 'Residential': {
          // Outbound morning, inbound evening, quiet midday
          const morning = Math.exp(-Math.pow((hour - 8.0) / 1.3, 2)) * 520;
          const evening = Math.exp(-Math.pow((hour - 18.0) / 1.5, 2)) * 480;
          const nightLull = hour < 5 || hour > 22 ? 40 : 160;
          baseVolume = nightLull + morning + evening;
          if (isWeekend) baseVolume *= 0.65;
          break;
        }
        case 'Commercial / Financial': {
          // Sharp morning commute in, lunch spike, evening exodus
          const morning = Math.exp(-Math.pow((hour - 9.0) / 1.4, 2)) * 950;
          const lunch = Math.exp(-Math.pow((hour - 12.8) / 1.0, 2)) * 620;
          const evening = Math.exp(-Math.pow((hour - 17.5) / 1.4, 2)) * 890;
          const nightLull = 70;
          baseVolume = nightLull + (isWeekend ? (lunch * 0.4) : (morning + lunch + evening));
          break;
        }
        case 'Highway Corridor': {
          // Broad sustained throughput with morning and evening peak surges
          const daylight = hour >= 6 && hour <= 21 ? 950 : 250;
          const amPeak = Math.exp(-Math.pow((hour - 8.5) / 2.0, 2)) * 1100;
          const pmPeak = Math.exp(-Math.pow((hour - 17.5) / 2.2, 2)) * 1250;
          baseVolume = daylight + amPeak + pmPeak;
          if (isWeekend) baseVolume *= 0.85;
          break;
        }
        case 'School Zone': {
          // Two acute spikes, flat otherwise, zero on weekends
          if (isWeekend) {
            baseVolume = 80 + Math.exp(-Math.pow((hour - 14.0) / 3.0, 2)) * 150;
          } else {
            const dropoff = Math.exp(-Math.pow((hour - 8.1) / 0.6, 2)) * 850;
            const pickup = Math.exp(-Math.pow((hour - 15.1) / 0.7, 2)) * 920;
            baseVolume = 60 + dropoff + pickup;
          }
          break;
        }
        case 'Downtown Crossing': {
          // Late morning through late night
          const afternoon = Math.exp(-Math.pow((hour - 13.5) / 2.5, 2)) * 720;
          const nightlife = Math.exp(-Math.pow((hour - 20.5) / 3.0, 2)) * 1050;
          const nightLull = hour < 6 ? 90 : 350;
          baseVolume = nightLull + afternoon + nightlife;
          if (isWeekend) baseVolume *= 1.25; // Busier on weekends
          break;
        }
      }

      // Add Gaussian noise
      const noise = rng.nextGaussian(0, baseVolume * 0.08);
      const finalVolume = Math.max(10, Math.round(baseVolume + noise));

      series.push({
        timestamp: stepDate.toISOString().replace('T', ' ').substring(0, 16),
        volume: finalVolume,
      });
    }

    clientSeries[client.id] = series;
  });

  // Split Chronologically: 80% train, 20% test
  const splitIndex = Math.floor(totalSteps * splitRatio);

  // Compute normalization statistics on TRAIN set only (strictly preventing data leakage!)
  let trainSum = 0;
  let trainCount = 0;
  let trainMin = Infinity;
  let trainMax = -Infinity;

  activeArchetypes.forEach((client) => {
    const series = clientSeries[client.id];
    for (let i = 0; i < splitIndex; i++) {
      const v = series[i].volume;
      trainSum += v;
      trainCount++;
      if (v < trainMin) trainMin = v;
      if (v > trainMax) trainMax = v;
    }
  });

  const mean = trainSum / trainCount;

  let varianceSum = 0;
  activeArchetypes.forEach((client) => {
    const series = clientSeries[client.id];
    for (let i = 0; i < splitIndex; i++) {
      varianceSum += Math.pow(series[i].volume - mean, 2);
    }
  });
  const std = Math.max(1e-5, Math.sqrt(varianceSum / trainCount));

  // Build sliding temporal windows of length W to predict step W+1
  const rawClientTrainWindows: Record<string, TrafficWindow[]> = {};
  const rawClientTestWindows: Record<string, TrafficWindow[]> = {};

  activeArchetypes.forEach((client) => {
    const series = clientSeries[client.id];
    const trainWindows: TrafficWindow[] = [];
    const testWindows: TrafficWindow[] = [];

    // Training windows: 0 to splitIndex
    for (let i = 0; i <= splitIndex - windowSize - 1; i++) {
      const windowSlice = series.slice(i, i + windowSize);
      const targetStep = series[i + windowSize];

      trainWindows.push({
        inputs: new Float32Array(windowSlice.map((s) => (s.volume - mean) / std)),
        target: (targetStep.volume - mean) / std,
        unnormalizedTarget: targetStep.volume,
        timestamp: targetStep.timestamp,
        clientId: client.id,
      });
    }

    // Testing windows: splitIndex to totalSteps
    for (let i = splitIndex; i <= totalSteps - windowSize - 1; i++) {
      const windowSlice = series.slice(i, i + windowSize);
      const targetStep = series[i + windowSize];

      testWindows.push({
        inputs: new Float32Array(windowSlice.map((s) => (s.volume - mean) / std)),
        target: (targetStep.volume - mean) / std,
        unnormalizedTarget: targetStep.volume,
        timestamp: targetStep.timestamp,
        clientId: client.id,
      });
    }

    rawClientTrainWindows[client.id] = trainWindows;
    rawClientTestWindows[client.id] = testWindows;
  });

  // Apply Heterogeneity blending (0.0 = Uniform IID shuffling across clients, 1.0 = Pure Non-IID local ownership)
  const finalClientTrainWindows: Record<string, TrafficWindow[]> = {};
  const finalClientTestWindows: Record<string, TrafficWindow[]> = {};

  const allTrainWindows = Object.values(rawClientTrainWindows).flat();
  const allTestWindows = Object.values(rawClientTestWindows).flat();

  if (heterogeneity <= 0.02) {
    // Pure IID: shuffle all training windows and split equally among active clients
    const shuffledTrain = rng.shuffle([...allTrainWindows]);
    const perClientCount = Math.floor(shuffledTrain.length / activeArchetypes.length);

    activeArchetypes.forEach((client, idx) => {
      finalClientTrainWindows[client.id] = shuffledTrain.slice(
        idx * perClientCount,
        (idx + 1) * perClientCount
      );
      finalClientTestWindows[client.id] = rawClientTestWindows[client.id];
    });
  } else if (heterogeneity >= 0.98) {
    // Pure Non-IID: client owns 100% of its native intersection windows
    activeArchetypes.forEach((client) => {
      finalClientTrainWindows[client.id] = rawClientTrainWindows[client.id];
      finalClientTestWindows[client.id] = rawClientTestWindows[client.id];
    });
  } else {
    // Partial Heterogeneity: interpolate between native local data and pooled IID data
    const pooledTrainShuffled = rng.shuffle([...allTrainWindows]);
    const perClientCount = Math.floor(allTrainWindows.length / activeArchetypes.length);

    activeArchetypes.forEach((client, idx) => {
      const native = rawClientTrainWindows[client.id];
      const pooledSlice = pooledTrainShuffled.slice(idx * perClientCount, (idx + 1) * perClientCount);

      const blended: TrafficWindow[] = [];
      const totalLen = Math.min(native.length, pooledSlice.length);

      for (let i = 0; i < totalLen; i++) {
        // With probability `heterogeneity`, pick native; else pick pooled
        if (rng.next() < heterogeneity) {
          blended.push(native[i]);
        } else {
          blended.push(pooledSlice[i]);
        }
      }

      finalClientTrainWindows[client.id] = blended;
      finalClientTestWindows[client.id] = rawClientTestWindows[client.id];
    });
  }

  // Build populated client models
  const clients: IntersectionClient[] = activeArchetypes.map((archetype) => {
    const trainCount = finalClientTrainWindows[archetype.id]?.length || 0;
    const testCount = finalClientTestWindows[archetype.id]?.length || 0;
    return {
      ...archetype,
      sampleCount: trainCount + testCount,
      trainSampleCount: trainCount,
      testSampleCount: testCount,
      currentLoss: 0.05,
      currentMae: 0.0,
      currentRmse: 0.0,
      isOnline: true,
      status: 'Idle',
    };
  });

  const rawSteps: RawTrafficStep[] = [];
  for (let t = 0; t < totalSteps; t++) {
    const isTrain = t < splitIndex;
    const clientVolumes: Record<string, number> = {};
    let totalVol = 0;
    activeArchetypes.forEach((client) => {
      const vol = clientSeries[client.id]?.[t]?.volume || 0;
      clientVolumes[client.id] = vol;
      totalVol += vol;
    });
    const timestamp = clientSeries[activeArchetypes[0].id]?.[t]?.timestamp || `T+${t * 5}m`;
    rawSteps.push({
      step: t + 1,
      timestamp,
      clientVolumes,
      totalVolume: Math.round(totalVol * 10) / 10,
      isTrain,
    });
  }

  const dataset: DatasetSplit = {
    name: 'FedFlow City Matrix (Synthetic Multi-Intersection)',
    isSynthetic: true,
    totalTimeSteps: totalSteps,
    trainTimeSteps: splitIndex,
    testTimeSteps: totalSteps - splitIndex,
    splitRatio,
    windowSize,
    samplingIntervalMinutes: 5,
    rawSteps,
    trainWindows: allTrainWindows,
    testWindows: allTestWindows,
    clientTrainWindows: finalClientTrainWindows,
    clientTestWindows: finalClientTestWindows,
    normStats: {
      mean: Number(mean.toFixed(2)),
      std: Number(std.toFixed(2)),
      min: Number(trainMin.toFixed(2)),
      max: Number(trainMax.toFixed(2)),
    },
  };

  return { dataset, clients };
}
