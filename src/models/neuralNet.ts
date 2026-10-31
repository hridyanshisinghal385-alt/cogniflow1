/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuantizationType } from '../types/simulator';
import { ITrafficModel } from './types';

/**
 * High-performance, pure Float32Array vectorized MLP neural network (12 -> 32 -> 16 -> 1).
 * Exactly 961 trainable parameters stored end-to-end in a single contiguous Float32Array buffer:
 * - W1: 12 x 32 = 384
 * - b1: 32
 * - W2: 32 x 16 = 512
 * - b2: 16
 * - W3: 16 x 1 = 16
 * - b3: 1
 * Total: 384 + 32 + 512 + 16 + 16 + 1 = 961 parameters.
 */
export class TrafficNeuralNet implements ITrafficModel {
  public static readonly INPUT_DIM = 12;
  public static readonly HIDDEN1 = 32;
  public static readonly HIDDEN2 = 16;
  public static readonly OUTPUT_DIM = 1;
  public static readonly PARAM_COUNT = 961;

  public readonly architectureName: 'mlp' = 'mlp';

  public weights: Float32Array;
  public grads: Float32Array;

  // Float32Array views into the contiguous buffer
  public w1: Float32Array;
  public b1: Float32Array;
  public w2: Float32Array;
  public b2: Float32Array;
  public w3: Float32Array;
  public b3: Float32Array;

  // Float32Array views into gradient buffer
  public dw1: Float32Array;
  public db1: Float32Array;
  public dw2: Float32Array;
  public db2: Float32Array;
  public dw3: Float32Array;
  public db3: Float32Array;

  // Pre-allocated forward activation scratch buffers for up to 64 samples batch
  private maxBatch: number = 64;
  private a1Buf: Float32Array;
  private a2Buf: Float32Array;
  private outBuf: Float32Array;
  private delta3Buf: Float32Array;
  private delta2Buf: Float32Array;

  constructor(seedWeights?: Float32Array) {
    this.weights = new Float32Array(TrafficNeuralNet.PARAM_COUNT);
    this.grads = new Float32Array(TrafficNeuralNet.PARAM_COUNT);

    // Initialize buffer views
    let offset = 0;
    this.w1 = this.weights.subarray(offset, offset + 384); offset += 384;
    this.b1 = this.weights.subarray(offset, offset + 32); offset += 32;
    this.w2 = this.weights.subarray(offset, offset + 512); offset += 512;
    this.b2 = this.weights.subarray(offset, offset + 16); offset += 16;
    this.w3 = this.weights.subarray(offset, offset + 16); offset += 16;
    this.b3 = this.weights.subarray(offset, offset + 1);

    offset = 0;
    this.dw1 = this.grads.subarray(offset, offset + 384); offset += 384;
    this.db1 = this.grads.subarray(offset, offset + 32); offset += 32;
    this.dw2 = this.grads.subarray(offset, offset + 512); offset += 512;
    this.db2 = this.grads.subarray(offset, offset + 16); offset += 16;
    this.dw3 = this.grads.subarray(offset, offset + 16); offset += 16;
    this.db3 = this.grads.subarray(offset, offset + 1);

    this.a1Buf = new Float32Array(this.maxBatch * 32);
    this.a2Buf = new Float32Array(this.maxBatch * 16);
    this.outBuf = new Float32Array(this.maxBatch);
    this.delta3Buf = new Float32Array(this.maxBatch);
    this.delta2Buf = new Float32Array(this.maxBatch * 16);

    if (seedWeights && seedWeights.length === TrafficNeuralNet.PARAM_COUNT) {
      this.weights.set(seedWeights);
    } else {
      this.initializeHe();
    }
  }

  public get paramCount(): number {
    return TrafficNeuralNet.PARAM_COUNT;
  }

  public getModelSizeBytes(quantization: QuantizationType = 'FP32'): number {
    if (quantization === 'FP16') return TrafficNeuralNet.PARAM_COUNT * 2;
    if (quantization === 'INT8') return TrafficNeuralNet.PARAM_COUNT * 1 + 8; // 1 byte per param + scale/zero-point
    return TrafficNeuralNet.PARAM_COUNT * 4; // FP32 (4 bytes per param = 3,844 bytes)
  }

  /**
   * Deterministic or pseudo-random He initialization
   */
  public initializeHe(rngNext?: () => number) {
    const nextRand = rngNext || Math.random;
    const randn = () => {
      let u = 0, v = 0;
      while (u === 0) u = nextRand();
      while (v === 0) v = nextRand();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    const scale1 = Math.sqrt(2.0 / 12);
    for (let i = 0; i < 384; i++) this.w1[i] = randn() * scale1;
    for (let i = 0; i < 32; i++) this.b1[i] = 0.01;

    const scale2 = Math.sqrt(2.0 / 32);
    for (let i = 0; i < 512; i++) this.w2[i] = randn() * scale2;
    for (let i = 0; i < 16; i++) this.b2[i] = 0.01;

    const scale3 = Math.sqrt(2.0 / 16);
    for (let i = 0; i < 16; i++) this.w3[i] = randn() * scale3;
    this.b3[0] = 0.0;
  }

  /**
   * Single-sample scalar prediction - 100% zero-allocation, <0.001 ms
   */
  public predict(input: number[] | Float32Array): number {
    const a1 = this.a1Buf;
    const a2 = this.a2Buf;
    const w1 = this.w1;
    const b1 = this.b1;
    const w2 = this.w2;
    const b2 = this.b2;
    const w3 = this.w3;

    // Layer 1 (12 -> 32)
    for (let j = 0; j < 32; j++) {
      let sum = b1[j];
      for (let i = 0; i < 12; i++) {
        sum += input[i] * w1[i * 32 + j];
      }
      a1[j] = sum > 0 ? sum : 0.01 * sum;
    }

    // Layer 2 (32 -> 16)
    for (let j = 0; j < 16; j++) {
      let sum = b2[j];
      for (let i = 0; i < 32; i++) {
        sum += a1[i] * w2[i * 16 + j];
      }
      a2[j] = sum > 0 ? sum : 0.01 * sum;
    }

    // Layer 3 (16 -> 1)
    let out = this.b3[0];
    for (let i = 0; i < 16; i++) {
      out += a2[i] * w3[i];
    }
    return out;
  }

  /**
   * Forward pass over mini-batch
   */
  public forwardBatch(inputs: (number[] | Float32Array)[], batchSize: number): Float32Array {
    const a1 = this.a1Buf;
    const a2 = this.a2Buf;
    const out = this.outBuf;
    const w1 = this.w1;
    const b1 = this.b1;
    const w2 = this.w2;
    const b2 = this.b2;
    const w3 = this.w3;
    const b3Val = this.b3[0];

    for (let b = 0; b < batchSize; b++) {
      const inp = inputs[b];
      const a1Off = b * 32;
      const a2Off = b * 16;

      // Layer 1: z1 = inp * w1 + b1, a1 = LeakyReLU(z1)
      for (let j = 0; j < 32; j++) {
        let sum = b1[j];
        for (let i = 0; i < 12; i++) {
          sum += inp[i] * w1[i * 32 + j];
        }
        a1[a1Off + j] = sum > 0 ? sum : 0.01 * sum;
      }

      // Layer 2: z2 = a1 * w2 + b2, a2 = LeakyReLU(z2)
      for (let j = 0; j < 16; j++) {
        let sum = b2[j];
        for (let i = 0; i < 32; i++) {
          sum += a1[a1Off + i] * w2[i * 16 + j];
        }
        a2[a2Off + j] = sum > 0 ? sum : 0.01 * sum;
      }

      // Layer 3: Linear output
      let sum = b3Val;
      for (let i = 0; i < 16; i++) {
        sum += a2[a2Off + i] * w3[i];
      }
      out[b] = sum;
    }
    return out;
  }

  /**
   * Analytical Backpropagation over mini-batch with optional FedProx proximal penalty
   */
  public backwardBatch(
    inputs: (number[] | Float32Array)[],
    targets: number[] | Float32Array,
    batchSize: number,
    globalAnchorWeights?: Float32Array,
    fedProxMu: number = 0.0
  ) {
    this.grads.fill(0);

    const a1 = this.a1Buf;
    const a2 = this.a2Buf;
    const out = this.outBuf;
    const delta3 = this.delta3Buf;
    const delta2 = this.delta2Buf;

    const dw1 = this.dw1;
    const db1 = this.db1;
    const dw2 = this.dw2;
    const db2 = this.db2;
    const dw3 = this.dw3;
    const w2 = this.w2;
    const w3 = this.w3;

    // Delta 3 (Output error): 2 * (y_pred - y_true) / batchSize
    const invB = 2.0 / batchSize;
    let db3Sum = 0;
    for (let b = 0; b < batchSize; b++) {
      const err = (out[b] - targets[b]) * invB;
      delta3[b] = err;
      db3Sum += err;
      const a2Off = b * 16;
      for (let i = 0; i < 16; i++) {
        dw3[i] += a2[a2Off + i] * err;
      }
    }
    this.db3[0] = db3Sum;

    // Delta 2 (Hidden Layer 2)
    for (let b = 0; b < batchSize; b++) {
      const err3 = delta3[b];
      const a2Off = b * 16;
      const a1Off = b * 32;

      for (let j = 0; j < 16; j++) {
        const val = a2[a2Off + j];
        const gradAct = val > 0 ? 1.0 : 0.01;
        const d2 = err3 * w3[j] * gradAct;
        delta2[a2Off + j] = d2;
        db2[j] += d2;

        for (let i = 0; i < 32; i++) {
          dw2[i * 16 + j] += a1[a1Off + i] * d2;
        }
      }
    }

    // Delta 1 (Hidden Layer 1)
    for (let b = 0; b < batchSize; b++) {
      const a1Off = b * 32;
      const a2Off = b * 16;
      const inp = inputs[b];

      for (let j = 0; j < 32; j++) {
        let sum = 0;
        for (let k = 0; k < 16; k++) {
          sum += delta2[a2Off + k] * w2[j * 16 + k];
        }
        const val = a1[a1Off + j];
        const gradAct = val > 0 ? 1.0 : 0.01;
        const d1 = sum * gradAct;
        db1[j] += d1;

        for (let i = 0; i < 12; i++) {
          dw1[i * 32 + j] += inp[i] * d1;
        }
      }
    }

    // FedProx regularization: add mu * (w - w_t)
    if (fedProxMu > 0 && globalAnchorWeights) {
      const w = this.weights;
      const g = this.grads;
      for (let i = 0; i < TrafficNeuralNet.PARAM_COUNT; i++) {
        g[i] += fedProxMu * (w[i] - globalAnchorWeights[i]);
      }
    }
  }

  /**
   * Applies gradients using SGD with gradient clipping
   */
  public applyGradients(learningRate: number, clipNorm: number = 5.0) {
    const w = this.weights;
    const g = this.grads;
    for (let i = 0; i < TrafficNeuralNet.PARAM_COUNT; i++) {
      let grad = g[i];
      if (grad > clipNorm) grad = clipNorm;
      else if (grad < -clipNorm) grad = -clipNorm;
      w[i] -= learningRate * grad;
    }
  }

  public getFlattenedWeights(): Float32Array {
    return this.weights;
  }

  public setFlattenedWeights(flat: Float32Array) {
    this.weights.set(flat);
  }

  public clone(): TrafficNeuralNet {
    return new TrafficNeuralNet(new Float32Array(this.weights));
  }
}
