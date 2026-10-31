/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useFLStore, FLState, flActions } from './flStore';
import { PageId } from '../types/simulator';

export { useFLStore, flActions };
export type { PageId };

export const FLProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const useFL = () => {
  return useFLStore();
};
