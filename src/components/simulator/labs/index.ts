'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { LabLoading as loading } from './LabLoading';
import type { LabProps } from './types';

// The screen of each lab of src/simulator/labs.ts but the accounting equation (drawn by Simulator itself), each
// loaded only when it is opened.
export const LAB_SCREENS: Record<string, ComponentType<LabProps>> = {
  'posting': dynamic(() => import('./PostingLab'), { loading }),
  'depreciation': dynamic(() => import('./DepreciationLab'), { loading }),
  'bank-reconciliation': dynamic(() => import('./BankReconciliationLab'), { loading }),
  'trial-balance-scale': dynamic(() => import('./TrialBalanceScaleLab'), { loading }),
  'trial-balance-fix': dynamic(() => import('./TrialBalanceFixLab'), { loading }),
  'final-accounts': dynamic(() => import('./FinalAccountsLab'), { loading }),
  'partnership': dynamic(() => import('./PartnershipLab'), { loading }),
  'shares': dynamic(() => import('./SharesLab'), { loading }),
  'cash-flow': dynamic(() => import('./CashFlowLab'), { loading }),
  'ratios': dynamic(() => import('./RatiosLab'), { loading }),
  'books-of-entry': dynamic(() => import('./BooksOfEntryLab'), { loading }),
  'incomplete-records': dynamic(() => import('./IncompleteRecordsLab'), { loading }),
  'goodwill': dynamic(() => import('./GoodwillLab'), { loading }),
  'dissolution': dynamic(() => import('./DissolutionLab'), { loading }),
  'debentures': dynamic(() => import('./DebenturesLab'), { loading }),
  'company-statements': dynamic(() => import('./CompanyStatementsLab'), { loading }),
  'spreadsheet': dynamic(() => import('./SpreadsheetLab'), { loading }),
};
