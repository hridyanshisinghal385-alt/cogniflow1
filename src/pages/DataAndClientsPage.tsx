/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useFL } from '../context/FLContext';
import {
  Upload,
  Database,
  ShieldCheck,
  Download,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Sliders,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Table as TableIcon,
} from 'lucide-react';
import {
  PUBLIC_DATASET_PRESETS,
  generateSampleTrafficCsvText,
  generateTinySampleCsvText,
} from '../data/csvLoader';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export const DataAndClientsPage: React.FC = () => {
  const {
    dataset,
    clients,
    config,
    updateConfig,
    uploadCustomDataset,
    loadPresetDataset,
    restoreSyntheticDataset,
    theme,
  } = useFL();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Table view state
  const [tableTab, setTableTab] = useState<'raw' | 'windows'>('raw');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [selectedSplitFilter, setSelectedSplitFilter] = useState<'all' | 'train' | 'test'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const isSynthetic = dataset.isSynthetic;

  // Process File Upload
  const handleProcessFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const res = await uploadCustomDataset(file);
    if (res.success) {
      setUploadSuccess(res.message);
      setCurrentPage(1);
    } else {
      setUploadError(res.message);
    }
    setIsUploading(false);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleProcessFile(file);
    e.target.value = '';
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleProcessFile(file);
    }
  };

  // Preset Loaders
  const handleLoadPreset = async (presetId: string) => {
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    const res = await loadPresetDataset(presetId);
    if (res.success) {
      setUploadSuccess(res.message);
      setCurrentPage(1);
    } else {
      setUploadError(res.message);
    }
    setIsUploading(false);
  };

  const handleDownloadSample = () => {
    const text = generateSampleTrafficCsvText();
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_traffic_matrix.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 24-Hour Diurnal Average Curves for the 5 Client Archetypes
  const hourlyData = useMemo(() => {
    return Array.from({ length: 24 }, (_, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      Residential: Math.round(
        140 +
          120 * Math.exp(-0.5 * Math.pow((hour - 7.5) / 1.2, 2)) +
          90 * Math.exp(-0.5 * Math.pow((hour - 18) / 1.5, 2))
      ),
      Commercial: Math.round(
        100 +
          160 * Math.exp(-0.5 * Math.pow((hour - 8.5) / 1.5, 2)) +
          190 * Math.exp(-0.5 * Math.pow((hour - 17.5) / 1.5, 2))
      ),
      Highway: Math.round(
        280 +
          240 * Math.exp(-0.5 * Math.pow((hour - 8) / 2.0, 2)) +
          260 * Math.exp(-0.5 * Math.pow((hour - 17) / 2.0, 2))
      ),
      School: Math.round(
        80 +
          210 * Math.exp(-0.5 * Math.pow((hour - 8.1) / 0.8, 2)) +
          220 * Math.exp(-0.5 * Math.pow((hour - 15) / 0.8, 2))
      ),
      Downtown: Math.round(
        160 +
          180 * Math.exp(-0.5 * Math.pow((hour - 12) / 3.0, 2)) +
          150 * Math.exp(-0.5 * Math.pow((hour - 20) / 2.5, 2))
      ),
    }));
  }, []);

  // Client data partition sample counts
  const partitionCounts = useMemo(() => {
    return clients.map((c) => ({
      name: c.name.split(':')[0],
      train: dataset.clientTrainWindows[c.id]?.length || 0,
      test: dataset.clientTestWindows[c.id]?.length || 0,
      fill: c.color,
    }));
  }, [clients, dataset]);

  // Raw steps data for Table Tab 1
  const rawStepsData = useMemo(() => {
    if (dataset.rawSteps && dataset.rawSteps.length > 0) {
      return dataset.rawSteps;
    }
    // Fallback synthesis if rawSteps missing
    return Array.from({ length: dataset.totalTimeSteps }, (_, idx) => {
      const isTrain = idx < dataset.trainTimeSteps;
      const vols: Record<string, number> = {};
      let total = 0;
      clients.forEach((c) => {
        const v = Math.round(100 + Math.sin((idx + parseInt(c.id.slice(-1) || '1')) * 0.2) * 50);
        vols[c.id] = v;
        total += v;
      });
      return {
        step: idx + 1,
        timestamp: `T+${idx * 5}m`,
        clientVolumes: vols,
        totalVolume: total,
        isTrain,
      };
    });
  }, [dataset, clients]);

  // Sliding Windows data for Table Tab 2
  const allWindowsData = useMemo(() => {
    const list: {
      index: number;
      timestamp: string;
      clientId: string;
      inputs: number[];
      target: number;
      unnormalizedTarget: number;
      isTrain: boolean;
    }[] = [];

    // Training windows
    dataset.trainWindows.forEach((w, idx) => {
      list.push({
        index: idx + 1,
        timestamp: w.timestamp,
        clientId: w.clientId,
        inputs: Array.from(w.inputs).map((v) => Number(v.toFixed(3))),
        target: Number(w.target.toFixed(3)),
        unnormalizedTarget: Number(w.unnormalizedTarget.toFixed(1)),
        isTrain: true,
      });
    });

    // Test windows
    const trainLen = dataset.trainWindows.length;
    dataset.testWindows.forEach((w, idx) => {
      list.push({
        index: trainLen + idx + 1,
        timestamp: w.timestamp,
        clientId: w.clientId,
        inputs: Array.from(w.inputs).map((v) => Number(v.toFixed(3))),
        target: Number(w.target.toFixed(3)),
        unnormalizedTarget: Number(w.unnormalizedTarget.toFixed(1)),
        isTrain: false,
      });
    });

    return list;
  }, [dataset]);

  // Filtered raw steps
  const filteredRawSteps = useMemo(() => {
    return rawStepsData.filter((row) => {
      // Split filter
      if (selectedSplitFilter === 'train' && !row.isTrain) return false;
      if (selectedSplitFilter === 'test' && row.isTrain) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesStep = row.step.toString().includes(q);
        const matchesTime = row.timestamp.toLowerCase().includes(q);
        if (!matchesStep && !matchesTime) return false;
      }
      return true;
    });
  }, [rawStepsData, selectedSplitFilter, searchQuery]);

  // Filtered windows
  const filteredWindows = useMemo(() => {
    return allWindowsData.filter((row) => {
      // Client filter
      if (selectedClientFilter !== 'all' && row.clientId !== selectedClientFilter) return false;

      // Split filter
      if (selectedSplitFilter === 'train' && !row.isTrain) return false;
      if (selectedSplitFilter === 'test' && row.isTrain) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesIdx = row.index.toString().includes(q);
        const matchesTime = row.timestamp.toLowerCase().includes(q);
        const matchesClient = row.clientId.toLowerCase().includes(q);
        if (!matchesIdx && !matchesTime && !matchesClient) return false;
      }
      return true;
    });
  }, [allWindowsData, selectedClientFilter, selectedSplitFilter, searchQuery]);

  // Active items for pagination
  const activeItemsCount = tableTab === 'raw' ? filteredRawSteps.length : filteredWindows.length;
  const totalPages = Math.max(1, Math.ceil(activeItemsCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRawSteps = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredRawSteps.slice(start, start + pageSize);
  }, [filteredRawSteps, safeCurrentPage, pageSize]);

  const paginatedWindows = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredWindows.slice(start, start + pageSize);
  }, [filteredWindows, safeCurrentPage, pageSize]);

  // Export current table view as CSV
  const handleExportTableCsv = () => {
    let csvContent = '';
    if (tableTab === 'raw') {
      const headers = ['Step', 'Timestamp', ...clients.map((c) => c.name.split(':')[0]), 'Total_Volume', 'Partition'];
      csvContent += headers.join(',') + '\n';
      filteredRawSteps.forEach((r) => {
        const row = [
          r.step,
          `"${r.timestamp}"`,
          ...clients.map((c) => r.clientVolumes[c.id] ?? 0),
          r.totalVolume,
          r.isTrain ? 'TRAIN' : 'TEST',
        ];
        csvContent += row.join(',') + '\n';
      });
    } else {
      const headers = ['Window_Index', 'Target_Timestamp', 'Client_ID', 'Target_Normalized', 'Target_Veh_Hr', 'Partition', 'Inputs_Lag_1_to_12'];
      csvContent += headers.join(',') + '\n';
      filteredWindows.forEach((w) => {
        const row = [
          w.index,
          `"${w.timestamp}"`,
          w.clientId,
          w.target,
          w.unnormalizedTarget,
          w.isTrain ? 'TRAIN' : 'TEST',
          `"${w.inputs.join(' ')}"`,
        ];
        csvContent += row.join(',') + '\n';
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cogniflow_${dataset.name}_${tableTab}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Origin Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Data &amp; Virtual Client Partitioning
            </h1>
            {isSynthetic ? (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Synthetic demo data
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                Real Dataset: {dataset.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Chronological train/test window preparation, 12-lag sliding observation matrices feeding edge <strong>Gated Recurrent Units (GRU)</strong>, and Non-IID heterogeneity control.
          </p>
        </div>
      </div>

      {/* 1. Chronological Timeline Split Bar */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#0b101d] space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              Chronological Split: Zero Temporal Lookahead Leakage
            </h3>
          </div>
          <span className="text-xs font-mono text-cyan-700 dark:text-cyan-300 font-semibold">
            {Math.round(dataset.splitRatio * 100)}% Past / {Math.round((1 - dataset.splitRatio) * 100)}% Future
          </span>
        </div>

        {/* Visual Timeline Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-8 rounded-xl overflow-hidden flex border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-[11px] font-mono shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-cyan-600 to-sky-600 flex items-center justify-center text-white font-bold px-3 transition-all"
              style={{ width: `${dataset.splitRatio * 100}%` }}
            >
              TRAINING PARTITION ({dataset.trainTimeSteps} steps · {dataset.trainWindows.length} windows)
            </div>
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-rose-600 flex items-center justify-center text-white font-bold px-3 transition-all"
              style={{ width: `${(1 - dataset.splitRatio) * 100}%` }}
            >
              TEST PARTITION ({dataset.testTimeSteps} steps · {dataset.testWindows.length} windows)
            </div>
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-500">
            <span>T = 0 (Historical start)</span>
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">T_split (Normalization Frozen from Train Only)</span>
            <span>T_end (Out-of-sample future)</span>
          </div>
        </div>

        {/* Normalization Note */}
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] space-y-1 text-slate-600 dark:text-slate-400">
          <div className="font-semibold text-slate-800 dark:text-slate-300">Train-Only Normalization Statistics (z = (x - μ) / σ):</div>
          <div className="font-mono flex flex-wrap gap-4 text-slate-700 dark:text-slate-300">
            <span>Mean (μ): <strong>{dataset.normStats.mean.toFixed(2)}</strong> veh/hr</span>
            <span>Std (σ): <strong>{dataset.normStats.std.toFixed(2)}</strong> veh/hr</span>
            <span>Min: <strong>{dataset.normStats.min.toFixed(1)}</strong></span>
            <span>Max: <strong>{dataset.normStats.max.toFixed(1)}</strong></span>
            <span>Total Observations: <strong>{dataset.totalTimeSteps}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. Drag-and-Drop Ingestion & Real-World Benchmark Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV Upload & Drop Zone */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#0b101d] space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                Upload Custom Traffic Dataset (CSV / TSV / TXT)
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Drag &amp; Drop Supported
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Drag any custom detector CSV file right into the drop box. Supports multi-detector wide matrices or single sensor series, auto-detects delimiter, handles UTF-8 BOM, and recalculates train-only normalisation.
          </p>

          {/* Interactive Drag & Drop Area */}
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all p-4 text-center ${
              isDragOver
                ? 'border-cyan-500 bg-cyan-500/10 scale-[1.01]'
                : 'border-slate-300 dark:border-slate-700 hover:border-cyan-500 bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/80'
            }`}
          >
            <Upload className={`w-7 h-7 mb-2 transition-transform ${isDragOver ? 'scale-110 text-cyan-500' : 'text-slate-400'}`} />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-300">
              {isDragOver ? 'Drop CSV file here to import' : 'Click to select or drag & drop CSV here'}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 font-mono">
              Accepts .csv, .tsv, .txt (Any size: 10 rows to 20,000+ timesteps)
            </span>
            <input
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileInputChange}
              disabled={isUploading}
              className="hidden"
            />
          </label>

          {uploadSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Quick presets & sample download */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Preset Benchmark Datasets
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                onClick={() => handleLoadPreset('metr-la')}
                disabled={isUploading}
                className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer text-left shadow-xs flex flex-col justify-between"
              >
                <span className="font-bold text-cyan-600 dark:text-cyan-400">METR-LA</span>
                <span className="text-[10px] text-slate-500 font-mono">288 steps (LA Detectors)</span>
              </button>

              <button
                onClick={() => handleLoadPreset('pems-bay')}
                disabled={isUploading}
                className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer text-left shadow-xs flex flex-col justify-between"
              >
                <span className="font-bold text-sky-600 dark:text-sky-400">PeMS-BAY</span>
                <span className="text-[10px] text-slate-500 font-mono">288 steps (Bay Area)</span>
              </button>

              <button
                onClick={() => handleLoadPreset('uci-metro')}
                disabled={isUploading}
                className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-500 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer text-left shadow-xs flex flex-col justify-between"
              >
                <span className="font-bold text-indigo-600 dark:text-indigo-400">UCI Metro</span>
                <span className="text-[10px] text-slate-500 font-mono">168 steps (I-94 Hwy)</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={() => handleLoadPreset('tiny')}
                disabled={isUploading}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Tiny 10-Row Sample
              </button>
              <button
                onClick={handleDownloadSample}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-cyan-500" />
                <span>Download Sample CSV</span>
              </button>
              {!isSynthetic && (
                <button
                  onClick={restoreSyntheticDataset}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs font-semibold hover:bg-amber-500/10 transition-colors ml-auto cursor-pointer"
                >
                  Restore Synthetic 7-Day Demo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Partition Heterogeneity Control */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#0b101d] space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                Non-IID Partition Heterogeneity
              </h3>
            </div>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">
              {config.partitionMode === 'iid' ? 'IID (Uniform)' : `Non-IID (H=${config.heterogeneity})`}
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Control spatial non-IID distribution skew across virtual edge clients. 0.0 = uniform random assignment across all
            intersections; 1.0 = strict local domain isolation (Residential, Commercial, Highway, School, Downtown).
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <span>Heterogeneity Slider (H):</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{config.heterogeneity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.heterogeneity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                updateConfig({
                  heterogeneity: val,
                  partitionMode: val === 0 ? 'iid' : 'non_iid',
                });
              }}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>0.0 (Uniform IID)</span>
              <span>0.5 (Moderate Skew)</span>
              <span>1.0 (Strict Non-IID)</span>
            </div>
          </div>

          {/* Sample Count Distribution per Client */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Client Partition Sample Allocation
            </span>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={partitionCounts} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                  <YAxis stroke="#64748b" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: theme === 'dark' ? '#070b14' : '#ffffff',
                      borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="train" name="Train Windows" fill="#00f0ff" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="test" name="Test Windows" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE DATASET TABLE (Raw Observations & Sliding Feature Windows) */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#0b101d] space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <TableIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Interactive Dataset Inspection Table
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Inspect raw sequential observations or sliding feature vectors (X_12 &rarr; y) with search, client filtering, and export.
              </p>
            </div>
          </div>

          {/* Table Tab Selector */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => {
                setTableTab('raw');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tableTab === 'raw'
                  ? 'bg-cyan-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              1. Raw Time Series Matrix ({filteredRawSteps.length})
            </button>
            <button
              onClick={() => {
                setTableTab('windows');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tableTab === 'windows'
                  ? 'bg-cyan-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              2. Sliding Windows (X → y) ({filteredWindows.length})
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search step, timestamp..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Client Filter (for Windows tab) */}
            {tableTab === 'windows' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 font-medium">Client:</span>
                <select
                  value={selectedClientFilter}
                  onChange={(e) => {
                    setSelectedClientFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-cyan-500 cursor-pointer"
                >
                  <option value="all">All Intersections</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.split(':')[0]} ({c.archetype})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Split Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-medium">Partition:</span>
              <select
                value={selectedSplitFilter}
                onChange={(e) => {
                  setSelectedSplitFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-cyan-500 cursor-pointer"
              >
                <option value="all">All Partitions</option>
                <option value="train">Train Partition (80%)</option>
                <option value="test">Test Partition (20%)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Export CSV button */}
            <button
              onClick={handleExportTableCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              title="Download current filtered dataset table as CSV"
            >
              <Download className="w-3.5 h-3.5 text-cyan-500" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Scrollable Table View */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[460px] no-scrollbar">
            {tableTab === 'raw' ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 font-mono text-[11px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Step #</th>
                    <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                    {clients.map((c) => (
                      <th key={c.id} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />
                        {c.name.split(':')[0]}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 font-semibold text-right">Total (v/h)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {paginatedRawSteps.length === 0 ? (
                    <tr>
                      <td colSpan={5 + clients.length} className="text-center py-8 text-slate-500">
                        No traffic observations match the active filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRawSteps.map((row) => (
                      <tr
                        key={`step-${row.step}`}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="py-2 px-3 text-slate-500">{row.step}</td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-sans font-medium whitespace-nowrap">
                          {row.timestamp}
                        </td>
                        {clients.map((c) => (
                          <td key={c.id} className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">
                            {row.clientVolumes[c.id] !== undefined ? `${row.clientVolumes[c.id]} v/h` : '--'}
                          </td>
                        ))}
                        <td className="py-2 px-3 font-bold text-cyan-600 dark:text-cyan-400 text-right">
                          {row.totalVolume}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.isTrain
                                ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {row.isTrain ? 'TRAIN' : 'TEST'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 font-mono text-[11px] uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Window #</th>
                    <th className="py-2.5 px-3 font-semibold">Forecast T+1</th>
                    <th className="py-2.5 px-3 font-semibold">Client / District</th>
                    <th className="py-2.5 px-3 font-semibold">Input Feature Lag Vector [t-11 ... t]</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Target y (norm)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actual (v/h)</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {paginatedWindows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500">
                        No sliding feature windows match the active filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedWindows.map((win) => {
                      const client = clients.find((c) => c.id === win.clientId);
                      return (
                        <tr
                          key={`win-${win.index}-${win.clientId}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                        >
                          <td className="py-2 px-3 text-slate-500">{win.index}</td>
                          <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-sans font-medium whitespace-nowrap">
                            {win.timestamp}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: client?.color || '#00f0ff' }}
                              />
                              <span className="font-sans font-medium text-slate-800 dark:text-slate-200">
                                {client ? client.name.split(':')[0] : win.clientId}
                              </span>
                            </span>
                          </td>
                          <td className="py-2 px-3 max-w-xs truncate text-[11px] text-slate-500 dark:text-slate-400">
                            [{win.inputs.slice(0, 4).join(', ')}, ..., {win.inputs.slice(-2).join(', ')}]
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-sky-600 dark:text-sky-400">
                            {win.target > 0 ? `+${win.target.toFixed(2)}` : win.target.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                            {win.unnormalizedTarget}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                win.isTrain
                                  ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {win.isTrain ? 'TRAIN' : 'TEST'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Pagination Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
            <div>
              Showing {activeItemsCount === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1} to{' '}
              {Math.min(safeCurrentPage * pageSize, activeItemsCount)} of {activeItemsCount} records
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="First page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-2 font-bold text-slate-900 dark:text-slate-200">
                Page {safeCurrentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                title="Last page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. 24-Hour Diurnal Traffic Distributions per Client Archetype */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-[#0b101d] space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              24-Hour Diurnal Profiles (5 Municipal Client Archetypes)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Notice distinct peak timings: School zone (08:00 &amp; 15:00) vs Commercial (09:00 &amp; 17:30) vs Downtown (20:00).
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">Diurnal Cycle</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourlyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
              <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} unit=" v/h" />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#070b14' : '#ffffff',
                  borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                  borderRadius: '0.75rem',
                  fontSize: '11px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="Residential" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Commercial" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Highway" stroke="#ec4899" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="School" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Downtown" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
