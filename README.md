# CogniFlow: Federated Traffic Prediction & Communication Cost Analysis

High-performance, dark-mode research platform for spatio-temporal traffic flow forecasting, virtual client partition profiling, FedAvg orchestration, and communication cost modeling in intelligent transportation networks.

Everything runs **100% in the browser** powered by an off-main-thread Web Worker (`src/fl/engine.worker.ts`), a pure typed-array contiguous Float32Array neural network engine (`src/models/neuralNet.ts`, `src/fl/trainer.ts`, `src/fl/engine.ts`), and an optimized Three.js 3D city visualization (`src/three/City3DCanvas.tsx`).

---

## Quick Start & Commands

```bash
# Install dependencies
npm install

# Run the local development server (Vite on port 3000)
npm run dev

# Run the automated unit & deterministic reproducibility tests (Vitest)
npm test

# Build for production
npm run build
```

---

## Architecture & Scientific Design

1. **Contiguous Float32Array MLP Engine**:
   - Strictly **ONE** compact MLP architecture: $12 \to 32 \to 16 \to 1$ ($W = 12$ historical 5-min lookback windows $\to 1$ step-ahead prediction).
   - Parameter breakdown:
     - Layer 1: $12 \times 32 = 384$ weights + $32$ biases
     - Layer 2: $32 \times 16 = 512$ weights + $16$ biases
     - Layer 3: $16 \times 1 = 16$ weights + $1$ bias
     - Total: **961 parameters** ($3,844$ bytes in FP32).
   - Flat typed buffers: zero `number[][]` allocations in the hot forward/backward path.

2. **Dedicated Web Worker Off-Loading**:
   - All compute-heavy training loops, multi-seed sweeps (42, 123, 2024), optimization suites, leakage audits, and Pareto sweeps run inside `src/fl/engine.worker.ts`.
   - Main thread UI never blocks (>50 ms) and updates are throttled to 10 FPS via `useSyncExternalStore`.

3. **Optimized Three.js 3D City Visualization**:
   - PointLights eliminated in favor of 1 hemisphere ambient light + neon emissive materials.
   - 360 instanced vehicles and instanced FL parameter packet beams (`InstancedMesh`).
   - Static city buildings merged into a single `BufferGeometry`.
   - FPS tracked directly via DOM ref without triggering React re-renders.
   - Adaptive quality control: automatically dials down pixel ratio and traffic load if frame rate drops below 40 FPS.
   - Low-power 2D SVG canvas fallback available on demand.

4. **Data Integrity & Chronological Splitting**:
   - Demo mode uses a synthetic 5-intersection Poisson-Gaussian traffic generator.
   - Real datasets (METR-LA, PeMS-BAY, UCI Metro) supported via flexible wide/long CSV upload.
   - Chronological 80/20 train/test split. Normalization statistics ($\mu, \sigma$) are computed **strictly from train windows**, guaranteeing zero temporal lookahead leakage (`"No data leakage"` guarantee).
   - Persistent `"Synthetic demo data"` badge displayed across all results unless real CSV data is loaded.
   - Persistent footer: `"Simulation only - synthetic data unless a CSV is loaded - no formal privacy guarantee."`

---

## The 9 Canonical Pages

Each topic lives strictly on exactly one page:

1. **Overview**: Executive summary with exactly 4 KPI telemetry cards from the latest real run with deep links, and no distracting charts.
2. **3D Simulator**: Interactive 3D night-city HUD, live round counter, cumulative bytes, current MAE/RMSE, event shock replay ribbon (rainstorm, roadwork, stadium game surge), dual compare mode, and 2D fallback.
3. **Data & Clients**: Chronological train/test timeline, 24-hour diurnal profile distributions, non-IID Dirichlet heterogeneity ($0.0 \le H \le 1.0$), and wide/long CSV dataset importer.
4. **Model & Architecture**: Layer diagram ($12 \to 32 \to 16 \to 1$), interactive parameter breakdown (961 params), transmission footprint across FP32 (3,844 B), FP16 (1,922 B), and INT8 (961 B), and formal transmission equations.
5. **IID vs non-IID**: Side-by-side empirical run comparison (IID vs Non-IID vs FedProx vs Centralized), consensus drift trajectories, and statistical penalties.
6. **Communication & Convergence**: Transmission telemetry (bytes per round, cumulative transfer), accuracy vs bandwidth, rounds-to-target convergence thresholds, and per-client learning curves.
7. **Experiments Lab**: Merged laboratory featuring:
   - **Communication Saver**: Top-K gradient sparsification (measured bytes $= k \times [4 + 4]$ bytes) and Lazy Upload ($L_2$ threshold).
   - **Optimization Trade-Off Suite**: Real measured matrix across quantization, local epochs, and FedProx.
   - **Bandwidth Budget Pareto Frontier**: User-configurable ₹/GB rate with interactive byte budget optimization.
   - **Failure & What-If Lab**: Simulated client dropouts, stragglers, and asymmetric network latency.
   - **Data-Leakage Detective**: Comparison showing why un-split global normalization falsely inflates benchmark metrics.
8. **Multi-Seed Rigor**: 3 independent runs across seeds **42**, **123**, and **2024** with mean $\pm$ standard deviation error envelopes and deterministic seed reproducibility.
9. **Export**: Instant export utilities for raw per-round CSV metrics across all seeds, full experiment JSON state configurations, and chart/scene snapshot capture.

---

## Mathematical Formulations

### 1. Full-Duplex Transmission Footprint per Round
$$B_{\text{round}} = 2 \times C \times K \times P \times b$$
- $2$: Full-duplex cycle (downlink global weights + uplink local updates)
- $C$: Client participation fraction ($C \in (0, 1]$)
- $K$: Total number of virtual client intersection nodes ($K = 5$)
- $P$: Total model parameters ($P = 961$)
- $b$: Bytes per parameter ($4$ for FP32, $2$ for FP16, $1$ for INT8)

*Under Top-$k$ sparsification:*
$$B_{\text{round, sparsified}} = C \times K \times [P \times b + k \times P \times (b + 4)]$$
*(downlink remains dense broadcast, uplink transmits sparse values + 4-byte coordinate indices)*

### 2. Consensus Drift
$$\text{Drift}_t = \frac{1}{|S_t|} \sum_{k \in S_t} \|w_t^k - w_t\|_2$$

### 3. Forecasting Metrics
$$\text{MAE} = \frac{1}{N} \sum_{i=1}^N |y_i - \hat{y}_i|, \quad \text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^N (y_i - \hat{y}_i)^2}$$

---

## FedAvg Algorithm (McMahan et al. 2017)

```python
# Server orchestrates K clients over T rounds with fraction C
initialize global weights w_0
for round t = 0 to T - 1:
    S_t = sample max(C * K, 1) clients from K
    for client k in S_t in parallel:
        w_{t+1}^k = ClientUpdate(k, copy(w_t))
    w_{t+1} = sum_{k in S_t} (n_k / n) * w_{t+1}^k  # Weighted average

def ClientUpdate(k, w):  # Local client training
    for epoch e = 1 to E:
        for batch (x, y) in Data_k:
            w = w - eta * grad_loss(w; x, y)
    return w
```
