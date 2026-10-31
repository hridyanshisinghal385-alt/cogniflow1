/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITrafficModel } from './types';
import { TrafficGRUNet } from './gruNet';
import { TrafficNeuralNet } from './neuralNet';

export function createTrafficModel(
  architecture: 'gru' | 'mlp' = 'gru',
  seedWeights?: Float32Array
): ITrafficModel {
  if (architecture === 'mlp') {
    return new TrafficNeuralNet(seedWeights);
  }
  return new TrafficGRUNet(seedWeights);
}

export function getModelParamCount(architecture: 'gru' | 'mlp' = 'gru'): number {
  return architecture === 'mlp' ? TrafficNeuralNet.PARAM_COUNT : TrafficGRUNet.PARAM_COUNT;
}
