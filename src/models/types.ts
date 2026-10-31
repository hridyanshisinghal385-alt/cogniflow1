/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuantizationType } from '../types/simulator';

export interface ITrafficModel {
  readonly paramCount: number;
  readonly architectureName: 'gru' | 'mlp';
  weights: Float32Array;
  grads: Float32Array;
  predict(input: number[] | Float32Array): number;
  forwardBatch(inputs: (number[] | Float32Array)[], batchSize: number): Float32Array;
  backwardBatch(
    inputs: (number[] | Float32Array)[],
    targets: number[] | Float32Array,
    batchSize: number,
    globalAnchorWeights?: Float32Array,
    fedProxMu?: number
  ): void;
  applyGradients(learningRate: number, clipNorm?: number): void;
  getFlattenedWeights(): Float32Array;
  setFlattenedWeights(flat: Float32Array): void;
  getModelSizeBytes(quantization?: QuantizationType): number;
  clone(): ITrafficModel;
}
