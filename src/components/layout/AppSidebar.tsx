/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Compass,
  Box,
  Database,
  Cpu,
  GitCompare,
  Sparkles,
  FlaskConical,
  Binary,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useFL, PageId } from '../../context/FLContext';

interface AppSidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const { activePage, setActivePage, config } = useFL();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems: { id: PageId; label: string; badge?: string; icon: any }[] = [
    { id: 'overview', label: '1. Overview', icon: Compass },
    { id: 'simulator', label: '2. 3D Simulator', badge: '3D', icon: Box },
    { id: 'data', label: '3. Data & Clients', icon: Database },
    {
      id: 'architecture',
      label: '4. Model & Architecture',
      badge: config.modelArchitecture === 'mlp' ? 'MLP' : 'GRU',
      icon: Cpu,
    },
    { id: 'iid-vs-non-iid', label: '5. IID vs non-IID', icon: GitCompare },
    { id: 'communication', label: '6. Communication & Convergence', icon: Sparkles },
    { id: 'experiments', label: '7. Experiments Lab', badge: 'Lab', icon: FlaskConical },
    { id: 'multi-seed', label: '8. Multi-Seed Results', badge: '3 Seeds', icon: Binary },
    { id: 'export', label: '9. Export', icon: Download },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#070b14] transition-all duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        } ${isCollapsed ? 'lg:w-16' : 'lg:w-64'}`}
      >
        {/* Collapse Toggle (Desktop only) */}
        <div className="hidden lg:flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800">
          {!isCollapsed && (
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Navigation
            </span>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto cursor-pointer"
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
                title={item.label}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-500 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`} />
                {!isCollapsed && (
                  <div className="flex-1 flex items-center justify-between overflow-hidden">
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-transparent">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
