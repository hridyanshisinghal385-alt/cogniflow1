/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuantizationType } from '../types/simulator';
import { ITrafficModel } from './types';

/**
 * High-performance, vectorized Gated Recurrent Unit (GRU) for sequential traffic forecasting.
 * 
 * Model Architecture:
 * - Sequence length: T = 12 time-lag steps (60 minutes history at 5-min intervals)
 * - Input dimension per step: 1 scalar (traffic flow / volume)
 * - Hidden recurrent state: H = 16 units
 * - Gating equations at each step t:
 *     z_t = sigmoid(W_z * x_t + U_z * h_{t-1} + b_z)      [Update Gate]
 *     r_t = sigmoid(W_r * x_t + U_r * h_{t-1} + b_r)      [Reset Gate]
 *     h~_t = tanh(W_h * x_t + U_h * (r_t ⊙ h_{t-1}) + b_h) [Candidate State]
 *     h_t = (1 - z_t) ⊙ h_{t-1} + z_t ⊙ h~_t             [State Transition]
 * - Output projection head:
 *     y = W_y * h_T + b_y                                [Future horizon W+1]
 * 
 * Trainable Parameter Layout (Contiguous Float32Array):
 * - W_z: 16 x 1 = 16
 * - U_z: 16 x 16 = 256
 * - b_z: 16
 * - W_r: 16 x 1 = 16
 * - U_r: 16 x 16 = 256
 * - b_r: 16
 * - W_h: 16 x 1 = 16
 * - U_h: 16 x 16 = 256
 * - b_h: 16
 * - W_y: 1 x 16 = 16
 * - b_y: 1
 * Total = 16 + 256 + 16 + 16 + 256 + 16 + 16 + 256 + 16 + 16 + 1 = 881 parameters.
 */
export class TrafficGRUNet implements ITrafficModel {
  public static readonly INPUT_DIM = 1;
  public static readonly SEQ_LEN = 12;
  public static readonly HIDDEN_DIM = 16;
  public static readonly OUTPUT_DIM = 1;
  public static readonly PARAM_COUNT = 881;

  public readonly architectureName: 'gru' = 'gru';
  public weights: Float32Array;
  public grads: Float32Array;

  // Slices into the contiguous weights buffer
  public wz: Float32Array;
  public uz: Float32Array;
  public bz: Float32Array;

  public wr: Float32Array;
  public ur: Float32Array;
  public br: Float32Array;

  public wh: Float32Array;
  public uh: Float32Array;
  public bh: Float32Array;

  public wy: Float32Array;
  public by: Float32Array;

  // Slices into the contiguous grads buffer
  public dwz: Float32Array;
  public duz: Float32Array;
  public dbz: Float32Array;

  public dwr: Float32Array;
  public dur: Float32Array;
  public dbr: Float32Array;

  public dwh: Float32Array;
  public duh: Float32Array;
  public dbh: Float32Array;

  public dwy: Float32Array;
  public dby: Float32Array;

  // Pre-allocated forward/backward scratch buffers for up to 64 samples batch
  private maxBatch: number = 64;
  private hBuf: Float32Array;    // maxBatch * 13 steps * 16 units (step 0 is initial h0 = 0)
  private zBuf: Float32Array;    // maxBatch * 12 steps * 16 units
  private rBuf: Float32Array;    // maxBatch * 12 steps * 16 units
  private hTildeBuf: Float32Array; // maxBatch * 12 steps * 16 units
  private outBuf: Float32Array;  // maxBatch
  private dhBuf: Float32Array;   // maxBatch * 16 units
  private drhBuf: Float32Array;  // maxBatch * 16 units
  // Pre-allocated single-sample prediction buffers (100% zero-allocation predict)
  private predH: Float32Array;
  private predZ: Float32Array;
  private predR: Float32Array;
  private predHTilde: Float32Array;
  private nextDhBuf: Float32Array;

  constructor(seedWeights?: Float32Array) {
    this.weights = new Float32Array(TrafficGRUNet.PARAM_COUNT);
    this.grads = new Float32Array(TrafficGRUNet.PARAM_COUNT);

    let offset = 0;
    this.wz = this.weights.subarray(offset, offset + 16); offset += 16;
    this.uz = this.weights.subarray(offset, offset + 256); offset += 256;
    this.bz = this.weights.subarray(offset, offset + 16); offset += 16;

    this.wr = this.weights.subarray(offset, offset + 16); offset += 16;
    this.ur = this.weights.subarray(offset, offset + 256); offset += 256;
    this.br = this.weights.subarray(offset, offset + 16); offset += 16;

    this.wh = this.weights.subarray(offset, offset + 16); offset += 16;
    this.uh = this.weights.subarray(offset, offset + 256); offset += 256;
    this.bh = this.weights.subarray(offset, offset + 16); offset += 16;

    this.wy = this.weights.subarray(offset, offset + 16); offset += 16;
    this.by = this.weights.subarray(offset, offset + 1);

    offset = 0;
    this.dwz = this.grads.subarray(offset, offset + 16); offset += 16;
    this.duz = this.grads.subarray(offset, offset + 256); offset += 256;
    this.dbz = this.grads.subarray(offset, offset + 16); offset += 16;

    this.dwr = this.grads.subarray(offset, offset + 16); offset += 16;
    this.dur = this.grads.subarray(offset, offset + 256); offset += 256;
    this.dbr = this.grads.subarray(offset, offset + 16); offset += 16;

    this.dwh = this.grads.subarray(offset, offset + 16); offset += 16;
    this.duh = this.grads.subarray(offset, offset + 256); offset += 256;
    this.dbh = this.grads.subarray(offset, offset + 16); offset += 16;

    this.dwy = this.grads.subarray(offset, offset + 16); offset += 16;
    this.dby = this.grads.subarray(offset, offset + 1);

    // Scratch buffers:
    const H = TrafficGRUNet.HIDDEN_DIM;
    const T = TrafficGRUNet.SEQ_LEN;
    this.hBuf = new Float32Array(this.maxBatch * (T + 1) * H);
    this.zBuf = new Float32Array(this.maxBatch * T * H);
    this.rBuf = new Float32Array(this.maxBatch * T * H);
    this.hTildeBuf = new Float32Array(this.maxBatch * T * H);
    this.outBuf = new Float32Array(this.maxBatch);
    this.dhBuf = new Float32Array(this.maxBatch * H);
    this.drhBuf = new Float32Array(this.maxBatch * H);
    this.predH = new Float32Array(H);
    this.predZ = new Float32Array(H);
    this.predR = new Float32Array(H);
    this.predHTilde = new Float32Array(H);
    this.nextDhBuf = new Float32Array(H);

    if (seedWeights && seedWeights.length === TrafficGRUNet.PARAM_COUNT) {
      this.weights.set(seedWeights);
    } else {
      this.initializeHe();
    }
  }

  public get paramCount(): number {
    return TrafficGRUNet.PARAM_COUNT;
  }

  public getModelSizeBytes(quantization: QuantizationType = 'FP32'): number {
    if (quantization === 'FP16') return TrafficGRUNet.PARAM_COUNT * 2; // 1,762 bytes
    if (quantization === 'INT8') return TrafficGRUNet.PARAM_COUNT * 1 + 8; // 889 bytes (1 byte/param + scale/zero-point)
    return TrafficGRUNet.PARAM_COUNT * 4; // FP32 (3,524 bytes)
  }

  /**
   * Deterministic or pseudo-random Xavier/Glorot initialization for GRU weights
   */
  public initializeHe(rngNext?: () => number) {
    const nextRand = rngNext || Math.random;
    const randn = () => {
      let u = 0, v = 0;
      while (u === 0) u = nextRand();
      while (v === 0) v = nextRand();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    const H = TrafficGRUNet.HIDDEN_DIM;
    const scaleIn = Math.sqrt(2.0 / (1 + H));
    const scaleRec = Math.sqrt(2.0 / (H + H));
    const scaleOut = Math.sqrt(2.0 / (H + 1));

    // Update Gate
    for (let i = 0; i < 16; i++) this.wz[i] = randn() * scaleIn;
    for (let i = 0; i < 256; i++) this.uz[i] = randn() * scaleRec;
    for (let i = 0; i < 16; i++) this.bz[i] = 0.5; // Slightly positive bias helps maintain initial memory

    // Reset Gate
    for (let i = 0; i < 16; i++) this.wr[i] = randn() * scaleIn;
    for (let i = 0; i < 256; i++) this.ur[i] = randn() * scaleRec;
    for (let i = 0; i < 16; i++) this.br[i] = 0.5;

    // Candidate State
    for (let i = 0; i < 16; i++) this.wh[i] = randn() * scaleIn;
    for (let i = 0; i < 256; i++) this.uh[i] = randn() * scaleRec;
    for (let i = 0; i < 16; i++) this.bh[i] = 0.0;

    // Output Projection
    for (let i = 0; i < 16; i++) this.wy[i] = randn() * scaleOut;
    this.by[0] = 0.0;
  }

  /**
   * Single sequence prediction: 12-step GRU unrolled recurrent forward pass
   */
  public predict(input: number[] | Float32Array): number {
    const H = TrafficGRUNet.HIDDEN_DIM;
    const T = TrafficGRUNet.SEQ_LEN;
    const wz = this.wz, uz = this.uz, bz = this.bz;
    const wr = this.wr, ur = this.ur, br = this.br;
    const wh = this.wh, uh = this.uh, bh = this.bh;
    const wy = this.wy, by = this.by;

    // Use pre-allocated single-sample hidden state buffers
    const h = this.predH;
    h.fill(0);
    const z = this.predZ;
    const r = this.predR;
    const hTilde = this.predHTilde;

    for (let t = 0; t < T; t++) {
      const x = input[t];

      // Update gate z and Reset gate r
      for (let j = 0; j < H; j++) {
        let sumZ = bz[j] + wz[j] * x;
        let sumR = br[j] + wr[j] * x;
        const rowOff = j * H;
        for (let k = 0; k < H; k++) {
          sumZ += uz[rowOff + k] * h[k];
          sumR += ur[rowOff + k] * h[k];
        }
        z[j] = 1.0 / (1.0 + Math.exp(-Math.max(-15, Math.min(15, sumZ))));
        r[j] = 1.0 / (1.0 + Math.exp(-Math.max(-15, Math.min(15, sumR))));
      }

      // Candidate state hTilde
      for (let j = 0; j < H; j++) {
        let sumH = bh[j] + wh[j] * x;
        const rowOff = j * H;
        for (let k = 0; k < H; k++) {
          sumH += uh[rowOff + k] * (r[k] * h[k]);
        }
        hTilde[j] = Math.tanh(Math.max(-15, Math.min(15, sumH)));
      }

      // Hidden state transition: h = (1 - z) * h + z * hTilde
      for (let j = 0; j < H; j++) {
        h[j] = (1.0 - z[j]) * h[j] + z[j] * hTilde[j];
      }
    }

    // Linear output head: y = wy * h_T + by
    let y = by[0];
    for (let j = 0; j < H; j++) {
      y += wy[j] * h[j];
    }
    return y;
  }

  /**
   * Forward pass over mini-batch with activation caching for BPTT
   */
  public forwardBatch(inputs: (number[] | Float32Array)[], batchSize: number): Float32Array {
    const H = TrafficGRUNet.HIDDEN_DIM;
    const T = TrafficGRUNet.SEQ_LEN;
    const wz = this.wz, uz = this.uz, bz = this.bz;
    const wr = this.wr, ur = this.ur, br = this.br;
    const wh = this.wh, uh = this.uh, bh = this.bh;
    const wy = this.wy, by = this.by;

    const hBuf = this.hBuf;
    const zBuf = this.zBuf;
    const rBuf = this.rBuf;
    const hTildeBuf = this.hTildeBuf;
    const outBuf = this.outBuf;

    // Reset initial hidden states (step 0) to 0
    for (let b = 0; b < batchSize; b++) {
      const bHOff = b * (T + 1) * H;
      for (let j = 0; j < H; j++) {
        hBuf[bHOff + j] = 0.0;
      }
    }

    for (let b = 0; b < batchSize; b++) {
      const inp = inputs[b];
      const bHBase = b * (T + 1) * H;
      const bGateBase = b * T * H;

      for (let t = 0; t < T; t++) {
        const x = inp[t];
        const prevHOff = bHBase + t * H;
        const nextHOff = bHBase + (t + 1) * H;
        const gateOff = bGateBase + t * H;

        // Gates z and r
        for (let j = 0; j < H; j++) {
          let sumZ = bz[j] + wz[j] * x;
          let sumR = br[j] + wr[j] * x;
          const rowOff = j * H;
          for (let k = 0; k < H; k++) {
            const hPrevK = hBuf[prevHOff + k];
            sumZ += uz[rowOff + k] * hPrevK;
            sumR += ur[rowOff + k] * hPrevK;
          }
          zBuf[gateOff + j] = 1.0 / (1.0 + Math.exp(-Math.max(-15, Math.min(15, sumZ))));
          rBuf[gateOff + j] = 1.0 / (1.0 + Math.exp(-Math.max(-15, Math.min(15, sumR))));
        }

        // Candidate state hTilde
        for (let j = 0; j < H; j++) {
          let sumH = bh[j] + wh[j] * x;
          const rowOff = j * H;
          for (let k = 0; k < H; k++) {
            const hPrevK = hBuf[prevHOff + k];
            const rVal = rBuf[gateOff + k];
            sumH += uh[rowOff + k] * (rVal * hPrevK);
          }
          hTildeBuf[gateOff + j] = Math.tanh(Math.max(-15, Math.min(15, sumH)));
        }

        // New hidden state h_{t+1}
        for (let j = 0; j < H; j++) {
          const zVal = zBuf[gateOff + j];
          const prevH = hBuf[prevHOff + j];
          const cand = hTildeBuf[gateOff + j];
          hBuf[nextHOff + j] = (1.0 - zVal) * prevH + zVal * cand;
        }
      }

      // Output linear projection on step T
      const finalHOff = bHBase + T * H;
      let y = by[0];
      for (let j = 0; j < H; j++) {
        y += wy[j] * hBuf[finalHOff + j];
      }
      outBuf[b] = y;
    }

    return outBuf;
  }

  /**
   * Exact Backpropagation Through Time (BPTT) with optional FedProx proximal penalty
   */
  public backwardBatch(
    inputs: (number[] | Float32Array)[],
    targets: number[] | Float32Array,
    batchSize: number,
    globalAnchorWeights?: Float32Array,
    fedProxMu: number = 0.0
  ) {
    this.grads.fill(0);

    const H = TrafficGRUNet.HIDDEN_DIM;
    const T = TrafficGRUNet.SEQ_LEN;
    const invB = 2.0 / batchSize;

    const uz = this.uz, ur = this.ur, uh = this.uh, wy = this.wy;
    const dwz = this.dwz, duz = this.duz, dbz = this.dbz;
    const dwr = this.dwr, dur = this.dur, dbr = this.dbr;
    const dwh = this.dwh, duh = this.duh, dbh = this.dbh;
    const dwy = this.dwy, dby = this.dby;

    const hBuf = this.hBuf;
    const zBuf = this.zBuf;
    const rBuf = this.rBuf;
    const hTildeBuf = this.hTildeBuf;
    const outBuf = this.outBuf;

    // Per-batch hidden gradients buffer
    const dh = this.dhBuf;
    const drh = this.drhBuf;

    // Output head gradients
    let dbySum = 0;
    for (let b = 0; b < batchSize; b++) {
      const err = (outBuf[b] - targets[b]) * invB;
      dbySum += err;
      const bHBase = b * (T + 1) * H;
      const finalHOff = bHBase + T * H;

      for (let j = 0; j < H; j++) {
        dwy[j] += err * hBuf[finalHOff + j];
        // Initial dh at step T
        dh[b * H + j] = err * wy[j];
      }
    }
    dby[0] = dbySum;

    // Backpropagate backwards in time: t = T-1 down to 0
    for (let t = T - 1; t >= 0; t--) {
      for (let b = 0; b < batchSize; b++) {
        const inp = inputs[b];
        const x = inp[t];
        const bHBase = b * (T + 1) * H;
        const prevHOff = bHBase + t * H;
        const gateOff = b * T * H + t * H;
        const bDhOff = b * H;

        // Reset drh for this step
        for (let j = 0; j < H; j++) drh[bDhOff + j] = 0;

        // 1. Candidate gate gradient: d_hTilde = dh * z * (1 - hTilde^2)
        for (let j = 0; j < H; j++) {
          const dhVal = dh[bDhOff + j];
          const zVal = zBuf[gateOff + j];
          const hTilde = hTildeBuf[gateOff + j];
          const dCand = dhVal * zVal * (1.0 - hTilde * hTilde);

          dbh[j] += dCand;
          dwh[j] += dCand * x;

          const rowOff = j * H;
          for (let k = 0; k < H; k++) {
            const rhVal = rBuf[gateOff + k] * hBuf[prevHOff + k];
            duh[rowOff + k] += dCand * rhVal;
            drh[bDhOff + k] += dCand * uh[rowOff + k];
          }
        }

        // 2. Reset gate gradient: d_r = drh * h_{t-1} * r * (1 - r)
        for (let j = 0; j < H; j++) {
          const rVal = rBuf[gateOff + j];
          const hPrev = hBuf[prevHOff + j];
          const dR = drh[bDhOff + j] * hPrev * rVal * (1.0 - rVal);

          dbr[j] += dR;
          dwr[j] += dR * x;

          const rowOff = j * H;
          for (let k = 0; k < H; k++) {
            dur[rowOff + k] += dR * hBuf[prevHOff + k];
          }
        }

        // 3. Update gate gradient: d_z = dh * (hTilde - h_{t-1}) * z * (1 - z)
        for (let j = 0; j < H; j++) {
          const dhVal = dh[bDhOff + j];
          const zVal = zBuf[gateOff + j];
          const prevH = hBuf[prevHOff + j];
          const hTilde = hTildeBuf[gateOff + j];
          const dZ = dhVal * (hTilde - prevH) * zVal * (1.0 - zVal);

          dbz[j] += dZ;
          dwz[j] += dZ * x;

          const rowOff = j * H;
          for (let k = 0; k < H; k++) {
            duz[rowOff + k] += dZ * hBuf[prevHOff + k];
          }
        }

        // 4. Gradient w.r.t previous hidden state dh_{t-1}
        if (t > 0) {
          const nextDh = this.nextDhBuf;
          for (let k = 0; k < H; k++) {
            const zVal = zBuf[gateOff + k];
            const rVal = rBuf[gateOff + k];
            // Contribution from direct state bypass and candidate reset
            let sumK = dh[bDhOff + k] * (1.0 - zVal) + drh[bDhOff + k] * rVal;

            // Contribution from Uz and Ur
            for (let j = 0; j < H; j++) {
              const dZ = dh[bDhOff + j] * (hTildeBuf[gateOff + j] - hBuf[prevHOff + j]) * zBuf[gateOff + j] * (1.0 - zBuf[gateOff + j]);
              const dR = drh[bDhOff + j] * hBuf[prevHOff + j] * rBuf[gateOff + j] * (1.0 - rBuf[gateOff + j]);
              sumK += dZ * uz[j * H + k] + dR * ur[j * H + k];
            }
            nextDh[k] = sumK;
          }

          for (let k = 0; k < H; k++) {
            dh[bDhOff + k] = nextDh[k];
          }
        }
      }
    }

    // FedProx regularization: add mu * (w - w_t)
    if (fedProxMu > 0 && globalAnchorWeights) {
      const w = this.weights;
      const g = this.grads;
      for (let i = 0; i < TrafficGRUNet.PARAM_COUNT; i++) {
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
    for (let i = 0; i < TrafficGRUNet.PARAM_COUNT; i++) {
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

  public clone(): TrafficGRUNet {
    return new TrafficGRUNet(new Float32Array(this.weights));
  }
}
