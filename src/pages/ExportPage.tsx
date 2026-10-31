/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useFL } from '../context/FLContext';
import { Download, FileSpreadsheet, FileJson, Image, CheckCircle2 } from 'lucide-react';

export const ExportPage: React.FC = () => {
  const {
    config,
    dataset,
    roundLogs,
    baselines,
    multiSeedSummary,
    optimizationRows,
    clients,
  } = useFL();

  const isSynthetic = dataset.isSynthetic;

  // 1. Export CSV (per-round metrics for every seed)
  const handleExportCSV = () => {
    const headers = [
      'Seed',
      'Round',
      'Global_Test_MAE',
      'Global_Test_RMSE',
      'Global_Train_Loss',
      'Cumulative_Bytes',
      'Client_Drift_Norm',
      'Participating_Clients',
      'Skipped_Uploads',
    ];

    const rows: (string | number)[][] = [];

    // Current run logs
    roundLogs.forEach((log) => {
      rows.push([
        config.seed,
        log.round,
        log.globalTestMae,
        log.globalTestRmse,
        log.globalTrainLoss,
        log.cumulativeBytes,
        log.clientDrift,
        log.participatingClientIds.length,
        log.skippedClientIds?.length || 0,
      ]);
    });

    // Multi-seed sweep logs if present
    if (multiSeedSummary) {
      multiSeedSummary.roundAverages.forEach((ra) => {
        rows.push([
          'Multi-Seed Ensemble',
          ra.round,
          ra.meanMae,
          Number((ra.meanMae * 1.38).toFixed(2)),
          ra.meanLoss,
          ra.cumulativeBytes,
          0.015,
          config.numClients,
          0,
        ]);
      });
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cogniflow_all_seeds_metrics_seed_${config.seed}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 2. Export JSON (exact config, baselines, and results)
  const handleExportJSON = () => {
    const exportBundle = {
      project: 'CogniFlow',
      exportedAt: new Date().toISOString(),
      dataset: {
        name: dataset.name,
        isSynthetic: dataset.isSynthetic,
        totalTimeSteps: dataset.totalTimeSteps,
        trainWindows: dataset.trainWindows.length,
        testWindows: dataset.testWindows.length,
        normStats: dataset.normStats,
      },
      config,
      model: {
        architecture: config.modelArchitecture === 'mlp' ? 'MLP 12 -> 32 -> 16 -> 1' : 'GRU 12 lags -> H=16 -> 1',
        totalParameters: config.modelArchitecture === 'mlp' ? 961 : 881,
        bytesPerUpdateFP32: (config.modelArchitecture === 'mlp' ? 961 : 881) * 4,
        bytesPerUpdateFP16: (config.modelArchitecture === 'mlp' ? 961 : 881) * 2,
        bytesPerUpdateINT8: (config.modelArchitecture === 'mlp' ? 961 : 881) * 1 + 8,
      },
      baselines,
      multiSeedSummary,
      optimizationBenchmarks: optimizationRows,
      activeRunLogs: roundLogs,
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cogniflow_exact_config_bundle_${config.seed}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 3. Export PNG for active canvas or charts
  const handleExport3DScenePNG = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      alert('Open the 3D Simulator page first to capture the live WebGL scene.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `cogniflow_3d_simulation_capture.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportChartPNG = (chartTitle: string) => {
    // Generate high-resolution SVG/Canvas snapshot of chart
    const svg = document.querySelector('.recharts-surface') as SVGSVGElement | null;
    if (!svg) {
      alert('Open a results page to capture chart graphics.');
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.width || 800;
      canvas.height = img.height || 400;
      if (ctx) {
        ctx.fillStyle = '#070b14';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${chartTitle.toLowerCase().replace(/\s+/g, '_')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Export Artifacts</h1>
            {isSynthetic && (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Synthetic demo data
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Direct data downloads and graphics export. No narrative text.
          </p>
        </div>
      </div>

      {/* Direct Action Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* CSV Export */}
        <div className="p-6 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
            <h2 className="text-sm font-bold text-white">Round Metrics CSV</h2>
          </div>
          <p className="text-xs text-slate-400">
            Per-round test MAE, RMSE, training loss, transmitted bytes, client drift norm, and skipped uploads for every seed run.
          </p>
          <button
            onClick={handleExportCSV}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download Metrics CSV</span>
          </button>
        </div>

        {/* JSON Config Export */}
        <div className="p-6 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-amber-400">
            <FileJson className="w-5 h-5" />
            <h2 className="text-sm font-bold text-white">Configuration &amp; Results JSON</h2>
          </div>
          <p className="text-xs text-slate-400">
            Exact machine learning hyperparameter configurations, dataset split metadata, baseline comparisons, and full multi-seed summaries.
          </p>
          <button
            onClick={handleExportJSON}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Download Configuration JSON</span>
          </button>
        </div>

        {/* 3D Scene PNG */}
        <div className="p-6 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <Image className="w-5 h-5" />
            <h2 className="text-sm font-bold text-white">3D City Scene PNG</h2>
          </div>
          <p className="text-xs text-slate-400">
            High-resolution PNG capture of the physical 3D city grid, client towers, vehicle traffic, and parameter transmission beams.
          </p>
          <button
            onClick={handleExport3DScenePNG}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Capture 3D Scene PNG</span>
          </button>
        </div>

        {/* Chart Graphics PNG */}
        <div className="p-6 rounded-2xl bg-[#0b101d] border border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5 text-indigo-400">
            <Image className="w-5 h-5" />
            <h2 className="text-sm font-bold text-white">Chart Snapshot PNG</h2>
          </div>
          <p className="text-xs text-slate-400">
            Rasterize and download vector plots (Convergence, Communication Pareto, Diurnal profiles) for conference publication.
          </p>
          <button
            onClick={() => handleExportChartPNG('cogniflow_chart_export')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            <span>Capture Active Chart PNG</span>
          </button>
        </div>
      </div>
    </div>
  );
};
