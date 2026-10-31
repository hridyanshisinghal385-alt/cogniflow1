/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Server, Cpu, WifiOff } from 'lucide-react';
import { IntersectionClient, FLParticle } from '../../types/simulator';

interface CityGridMapProps {
  clients: IntersectionClient[];
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  currentRound: number;
  totalRounds: number;
  simulationStatus: string;
  particles: FLParticle[];
  bytesPerRound: number;
}

export const CityGridMap: React.FC<CityGridMapProps> = ({
  clients,
  selectedClientId,
  onSelectClient,
  currentRound,
  totalRounds,
  simulationStatus: _simulationStatus,
  particles,
  bytesPerRound,
}) => {
  // Server position at center top-ish
  const serverPos = { x: 50, y: 18 };

  // Calculate link thickness based on bandwidth
  const linkStrokeWidth = useMemo(() => {
    if (bytesPerRound > 10000) return 2.6;
    if (bytesPerRound > 4000) return 1.8;
    return 1.4;
  }, [bytesPerRound]);

  return (
    <div className="relative w-full h-[360px] md:h-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#070b14] shadow-xl overflow-hidden select-none transition-colors">
      {/* City Map Background Grid Lines & Stylized Roads */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Subtle Grid Pattern */}
          <pattern id="city-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path
              d="M 30 0 L 0 0 0 30"
              fill="none"
              stroke="rgba(56, 189, 248, 0.08)"
              strokeWidth="1"
            />
          </pattern>

          {/* Radial Server Glow */}
          <radialGradient id="server-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.35" />
            <stop offset="50%" stopColor="#0284C7" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#070B14" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Street Grid Fill */}
        <rect width="100%" height="100%" fill="url(#city-grid)" />

        {/* Ambient City Road Arterials */}
        <path
          d="M 0 180 L 1000 180"
          fill="none"
          stroke="rgba(56, 189, 248, 0.18)"
          strokeWidth="22"
        />
        <path
          d="M 500 0 L 500 500"
          fill="none"
          stroke="rgba(56, 189, 248, 0.18)"
          strokeWidth="22"
        />
        <path
          d="M 0 180 L 1000 180"
          fill="none"
          stroke="rgba(251, 191, 36, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="8 6"
        />
        <path
          d="M 500 0 L 500 500"
          fill="none"
          stroke="rgba(251, 191, 36, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="8 6"
        />

        {/* Server Radial Halo */}
        <circle cx={`${serverPos.x}%`} cy={`${serverPos.y}%`} r="85" fill="url(#server-glow)" />

        {/* Connection Links between Central Server and Intersection Clients */}
        {clients.map((client) => {
          const isSelected = client.id === selectedClientId;
          const isTraining = client.status === 'Local Training' || client.status === 'Uplinking Weights';
          const linkColor = !client.isOnline
            ? '#334155'
            : isSelected
            ? '#00f0ff'
            : isTraining
            ? '#38bdf8'
            : 'rgba(56, 189, 248, 0.45)';

          return (
            <line
              key={`link-${client.id}`}
              x1={`${serverPos.x}%`}
              y1={`${serverPos.y}%`}
              x2={`${client.coordinates.x}%`}
              y2={`${client.coordinates.y}%`}
              stroke={linkColor}
              strokeWidth={isSelected ? linkStrokeWidth + 1.6 : linkStrokeWidth}
              strokeDasharray={!client.isOnline ? '6 6' : undefined}
              opacity={!client.isOnline ? 0.35 : 0.9}
            />
          );
        })}

        {/* Dynamic Weight Packet Particles traveling along links */}
        {particles.map((p) => {
          const client = clients.find((c) => c.id === p.fromClient || c.id === p.toClient);
          if (!client) return null;

          const isUpload = p.type === 'upload';
          const startX = isUpload ? client.coordinates.x : serverPos.x;
          const startY = isUpload ? client.coordinates.y : serverPos.y;
          const endX = isUpload ? serverPos.x : client.coordinates.x;
          const endY = isUpload ? serverPos.y : client.coordinates.y;

          const currentX = startX + (endX - startX) * p.progress;
          const currentY = startY + (endY - startY) * p.progress;

          return (
            <circle
              key={p.id}
              cx={`${currentX}%`}
              cy={`${currentY}%`}
              r={p.type === 'upload' ? 4 : 3.2}
              fill={p.type === 'upload' ? '#10b981' : '#00f0ff'}
              opacity={0.95}
            />
          );
        })}
      </svg>

      {/* Central Server Node */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
        style={{ left: `${serverPos.x}%`, top: `${serverPos.y}%` }}
      >
        <div className="relative group cursor-pointer">
          <div className="relative w-12 h-12 rounded-xl border border-cyan-400 bg-[#0f172a] text-cyan-300 shadow-xl shadow-cyan-500/30 flex items-center justify-center transition-all">
            <Server className="w-6 h-6" />
          </div>
        </div>

        <div className="mt-1.5 px-2.5 py-0.5 rounded-full border border-cyan-500/40 bg-[#090d1a] text-cyan-200 flex items-center gap-1.5 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono font-bold tracking-wider">
            FEDAVG SERVER · R#{currentRound}/{totalRounds}
          </span>
        </div>
      </div>

      {/* 3 to 5 Intersection Client Nodes */}
      {clients.map((client) => {
        const isSelected = client.id === selectedClientId;
        const lossColor =
          client.currentLoss > 0.08 ? '#F59E0B' : client.currentLoss > 0.04 ? '#38BDF8' : '#10B981';

        return (
          <div
            key={client.id}
            onClick={() => onSelectClient(client.id)}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group transition-transform hover:scale-105"
            style={{ left: `${client.coordinates.x}%`, top: `${client.coordinates.y}%` }}
          >
            {/* Node Icon Avatar */}
            <div
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${
                !client.isOnline
                  ? 'bg-slate-200 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                  : isSelected
                  ? 'bg-cyan-500 text-slate-950 border-cyan-200 ring-2 ring-cyan-400 shadow-xl'
                  : 'bg-white dark:bg-[#0b1120] border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 shadow-md'
              }`}
            >
              {!client.isOnline ? (
                <WifiOff className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              ) : (
                <Cpu className="w-5 h-5" style={{ color: isSelected ? '#000000' : client.color }} />
              )}

              {/* Status indicator on node corner */}
              {client.isOnline && (
                <span
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black"
                  style={{ backgroundColor: lossColor }}
                  title={`Local Loss: ${client.currentLoss.toFixed(4)}`}
                />
              )}
            </div>

            {/* Floating Tag */}
            <div
              className={`mt-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono whitespace-nowrap text-center transition-all shadow-md ${
                isSelected
                  ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-300'
                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 group-hover:text-cyan-600 dark:group-hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 font-bold">
                <span>{client.name.split(':')[0]}</span>
                <span className="text-[9px] opacity-80 font-normal">
                  ({client.archetype.split('/')[0].trim()})
                </span>
              </div>
              {client.currentMae > 0 && (
                <div className="text-[9px] opacity-90 mt-0.5">
                  MAE: {client.currentMae.toFixed(1)} veh/hr
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Bottom Overlaid Legend & Telemetry Bar */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-950/95 text-slate-300 shadow-lg text-[11px] font-mono pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span className="font-semibold">Downlink Broadcast (Global θ_t)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="font-semibold">Weight Uplink (Client θ_t^k)</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span>
            Active Nodes: {clients.filter((c) => c.isOnline).length}/{clients.length}
          </span>
          <span>·</span>
          <span className="text-cyan-400 font-bold">Payload/Rd: {(bytesPerRound / 1024).toFixed(1)} KB</span>
        </div>
      </div>
    </div>
  );
};
