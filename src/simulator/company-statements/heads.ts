// ---------------------------------------------------------------------------------------------------------------
// The heads of a company balance sheet as Schedule III to the Companies Act, 2013 (Division I, as amended with effect
// from 1 April 2021) gives them, and the items the lab's sorting board deals out, each with where it goes, why, and
// the wrong places students choose with the mistake behind each. Names, places and reasons follow the app's own
// topic (src/generators/templates/company-financial-statements.ts): the amended place of an item is always the
// right answer and its older place is never offered as a wrong one.
// ---------------------------------------------------------------------------------------------------------------

export type Major = 'sf' | 'sam' | 'ncl' | 'cl' | 'nca' | 'ca';
export const MAJOR: Record<Major, string> = {
  sf: "Shareholders' Funds",
  sam: 'Share Application Money Pending Allotment',
  ncl: 'Non-Current Liabilities',
  cl: 'Current Liabilities',
  nca: 'Non-Current Assets',
  ca: 'Current Assets',
};
export const EL_MAJORS: readonly Major[] = ['sf', 'sam', 'ncl', 'cl'];
export const ASSET_MAJORS: readonly Major[] = ['nca', 'ca'];

export type Sub =
  | 'shareCapital' | 'reserves' | 'warrants' | 'sam'
  | 'ltb' | 'oltl' | 'ltp'
  | 'stb' | 'tp' | 'ocl' | 'stp'
  | 'ppe' | 'intangible' | 'cwip' | 'iaud' | 'nci' | 'ltla' | 'onca'
  | 'ci' | 'inv' | 'tr' | 'cash' | 'stla' | 'oca';

export const PPE_IA = 'Property, Plant and Equipment and Intangible Assets';

/** Each sub-head: its major head, its name on the face (the four parts of PPE_IA by their own names), and its name in full. */
export const SUBS: Record<Sub, { major: Major; label: string; full: string }> = {
  shareCapital: { major: 'sf', label: 'Share Capital', full: 'Share Capital' },
  reserves: { major: 'sf', label: 'Reserves and Surplus', full: 'Reserves and Surplus' },
  warrants: { major: 'sf', label: 'Money Received against Share Warrants', full: 'Money Received against Share Warrants' },
  sam: { major: 'sam', label: 'Share Application Money Pending Allotment', full: '' },
  ltb: { major: 'ncl', label: 'Long-term Borrowings', full: 'Long-term Borrowings' },
  oltl: { major: 'ncl', label: 'Other Long-term Liabilities', full: 'Other Long-term Liabilities' },
  ltp: { major: 'ncl', label: 'Long-term Provisions', full: 'Long-term Provisions' },
  stb: { major: 'cl', label: 'Short-term Borrowings', full: 'Short-term Borrowings' },
  tp: { major: 'cl', label: 'Trade Payables', full: 'Trade Payables' },
  ocl: { major: 'cl', label: 'Other Current Liabilities', full: 'Other Current Liabilities' },
  stp: { major: 'cl', label: 'Short-term Provisions', full: 'Short-term Provisions' },
  ppe: { major: 'nca', label: 'Property, Plant and Equipment', full: `${PPE_IA} (Property, Plant and Equipment)` },
  intangible: { major: 'nca', label: 'Intangible Assets', full: `${PPE_IA} (Intangible Assets)` },
  cwip: { major: 'nca', label: 'Capital Work-in-Progress', full: `${PPE_IA} (Capital Work-in-Progress)` },
  iaud: { major: 'nca', label: 'Intangible Assets under Development', full: `${PPE_IA} (Intangible Assets under Development)` },
  nci: { major: 'nca', label: 'Non-current Investments', full: 'Non-current Investments' },
  ltla: { major: 'nca', label: 'Long-term Loans and Advances', full: 'Long-term Loans and Advances' },
  onca: { major: 'nca', label: 'Other Non-current Assets', full: 'Other Non-current Assets' },
  ci: { major: 'ca', label: 'Current Investments', full: 'Current Investments' },
  inv: { major: 'ca', label: 'Inventories', full: 'Inventories' },
  tr: { major: 'ca', label: 'Trade Receivables', full: 'Trade Receivables' },
  cash: { major: 'ca', label: 'Cash and Cash Equivalents', full: 'Cash and Cash Equivalents' },
  stla: { major: 'ca', label: 'Short-term Loans and Advances', full: 'Short-term Loans and Advances' },
  oca: { major: 'ca', label: 'Other Current Assets', full: 'Other Current Assets' },
};
/** The sub-heads in the order of the form. */
export const SUB_ORDER = Object.keys(SUBS) as Sub[];
export const majorOf = (s: Sub): Major => SUBS[s].major;
export const isAssetSub = (s: Sub): boolean => ASSET_MAJORS.includes(majorOf(s));
/** "Current Liabilities: Short-term Borrowings"; share application money pending allotment is a major head alone. */
export const headOf = (s: Sub): string => (s === 'sam' ? MAJOR.sam : `${MAJOR[majorOf(s)]}: ${SUBS[s].full}`);
/** The four parts of PPE_IA, each a line of its own on the face. */
export const PPE_PARTS: readonly Sub[] = ['ppe', 'intangible', 'cwip', 'iaud'];

/** The name a line has in a comparative or common size statement, as the topic financial-statement-analysis writes it. */
export const ANALYSIS_LABEL: Record<Sub, string> = {
  shareCapital: 'Share capital', reserves: 'Reserves and surplus', warrants: 'Money received against share warrants', sam: 'Share application money pending allotment',
  ltb: 'Long-term borrowings', oltl: 'Other long-term liabilities', ltp: 'Long-term provisions',
  stb: 'Short-term borrowings', tp: 'Trade payables', ocl: 'Other current liabilities', stp: 'Short-term provisions',
  ppe: 'Property, plant and equipment', intangible: 'Intangible assets', cwip: 'Capital work-in-progress', iaud: 'Intangible assets under development',
  nci: 'Non-current investments', ltla: 'Long-term loans and advances', onca: 'Other non-current assets',
  ci: 'Current investments', inv: 'Inventories', tr: 'Trade receivables', cash: 'Cash and cash equivalents', stla: 'Short-term loans and advances', oca: 'Other current assets',
};
/** The major heads as a comparative or common size balance sheet heads them (numbered by the heads a company has). */
export const ANALYSIS_MAJOR: Record<Major, string> = {
  sf: "Shareholders' funds",
  sam: 'Share application money pending allotment',
  ncl: 'Non-current liabilities',
  cl: 'Current liabilities',
  nca: 'Non-current assets',
  ca: 'Current assets',
};

export interface Item {
  id: string;
  name: string;
  /** A short name for a tile. */
  short: string;
  sub: Sub;
  /** Where it goes and why, in a sentence. */
  note: string;
  /** Wrong places students choose, with the mistake behind each. */
  wrong: [Sub, string][];
  /** Deducted in its note: calls in arrears, a debit balance of the Statement of Profit and Loss. */
  deducted?: boolean;
}

const A_PROVISION = 'A provision is an estimate set aside for a liability; this is a known amount actually owed.';
const PPE_WHY = `Non-Current Assets, ${PPE_IA}, Property, Plant and Equipment.`;
const IA_WHY = `Non-Current Assets, ${PPE_IA}, Intangible Assets.`;

const item = (id: string, short: string, name: string, sub: Sub, note: string, wrong: [Sub, string][], deducted?: true): Item => ({ id, short, name, sub, note, wrong, ...(deducted ? { deducted } : {}) });

export const ITEMS: readonly Item[] = [
  item('equity', 'Equity share capital', 'Equity share capital', 'shareCapital', "Equity share capital is what the shareholders have paid on their shares: Shareholders' Funds, Share Capital.", [
    ['reserves', 'Took the capital paid on shares for profits kept back in the business. Reserves come from profits and premiums; capital comes from the shares themselves.'],
    ['ltb', 'Treated share capital as money borrowed. Shareholders are owners of the company, not its lenders.'],
    ['sam', 'That head is only for money received on shares not yet allotted. These shares have been allotted.'],
  ]),
  item('preference', 'Preference share capital', '8% Preference share capital', 'shareCapital', "Preference shares are shares, whatever their fixed rate of dividend: Shareholders' Funds, Share Capital.", [
    ['ltb', 'Treated preference shares as a borrowing because they carry a fixed rate. They are shares, so the amount is share capital.'],
    ['reserves', 'Took capital paid on preference shares for profits kept back in the business.'],
    ['nci', "Mixed the company's own preference shares with shares of other companies that it holds as an investment."],
  ]),
  item('arrears', 'Calls in arrears', 'Calls in arrears', 'shareCapital', "Calls in arrears are deducted from the subscribed capital in the note on share capital, so they are dealt with under Shareholders' Funds, Share Capital.", [
    ['oca', 'Showed the unpaid calls as an amount receivable on the assets side. They are deducted from the subscribed capital instead.'],
    ['tr', 'Took shareholders who owe calls for customers. Trade receivables arise only from sales; unpaid calls are deducted from share capital.'],
    ['stla', 'Treated the unpaid calls as an advance given. They are deducted from the subscribed capital in the note.'],
  ], true),
  item('forfeited', 'Forfeited Shares A/c', 'Balance of Forfeited Shares Account (the shares are not yet reissued)', 'shareCapital', "Until forfeited shares are reissued, the balance of Forfeited Shares Account is added to the subscribed capital in the note on share capital: Shareholders' Funds, Share Capital.", [
    ['reserves', 'Took the amount forfeited for a reserve. Only the gain left after the shares are reissued goes to Capital Reserve; until then the balance is added to share capital.'],
    ['ocl', 'Treated the amount forfeited as refundable to the defaulting shareholders. Money paid on forfeited shares is not returned.'],
    ['sam', 'That head is for shares not yet allotted. These shares were allotted and later forfeited.'],
  ]),
  item('sp', 'Securities Premium', 'Securities Premium', 'reserves', "Securities Premium is the amount received on shares above their face value. It is a reserve: Shareholders' Funds, Reserves and Surplus.", [
    ['shareCapital', 'Added the premium to share capital because shareholders paid both. The premium is kept apart as a reserve; share capital is the face value called up.'],
    ['warrants', 'Mixed the premium on shares already issued with money received on share warrants, which are rights to take shares later.'],
    ['oltl', 'Treated the premium as an amount to be paid back. It belongs to the company and is a reserve.'],
  ]),
  item('gr', 'General Reserve', 'General Reserve', 'reserves', "General Reserve is profit kept back in the business: Shareholders' Funds, Reserves and Surplus.", [
    ['ltp', 'Mixed a reserve with a provision. A reserve is profit kept back and belongs to the shareholders; a provision meets a liability.'],
    ['stp', 'Mixed a reserve with a provision. A reserve is profit kept back and belongs to the shareholders; a provision meets a liability.'],
    ['shareCapital', 'Added profits kept back to the capital paid on shares. Reserves are shown apart from share capital.'],
  ]),
  item('cr', 'Capital Reserve', 'Capital Reserve', 'reserves', "Capital Reserve holds capital profits, such as the gain on reissue of forfeited shares: Shareholders' Funds, Reserves and Surplus.", [
    ['shareCapital', 'Went by the word "capital". A capital reserve holds capital profits; it is not capital paid on shares.'],
    ['ltp', 'Mixed a reserve with a provision. A capital reserve is a profit of a capital kind, not an amount set aside for a liability.'],
    ['oltl', 'Treated a reserve, which belongs to the shareholders, as an amount owed to outsiders.'],
  ]),
  item('surplus', 'Surplus (Statement of P&L, credit)', 'Surplus, i.e. the credit balance of the Statement of Profit and Loss', 'reserves', "The credit balance of the Statement of Profit and Loss is accumulated profit: Shareholders' Funds, Reserves and Surplus.", [
    ['stp', 'Took accumulated profit for a provision. It is profit kept in the business and belongs to the shareholders.'],
    ['ocl', 'Treated undistributed profit as already owed to the shareholders. It becomes a liability only when a dividend is declared.'],
    ['shareCapital', 'Added accumulated profit to the capital paid on shares. It is shown apart, under Reserves and Surplus.'],
  ]),
  item('loss', 'Statement of P&L (debit balance)', 'Debit balance of the Statement of Profit and Loss (accumulated loss)', 'reserves', "A debit balance of the Statement of Profit and Loss is shown as a negative figure under Shareholders' Funds, Reserves and Surplus.", [
    ['oca', 'Showed the loss on the assets side, as the old form of balance sheet did. Under Schedule III it is a negative figure under Reserves and Surplus.'],
    ['onca', 'Carried the loss forward as if it were an asset. Under Schedule III it is a negative figure under Reserves and Surplus.'],
    ['shareCapital', 'Deducted the loss from share capital. It is deducted within Reserves and Surplus; share capital stays as it is.'],
  ], true),
  item('warrants', 'Money against share warrants', 'Money received against share warrants', 'warrants', "A share warrant gives its holder the right to take shares later. Money received against it is the third item of Shareholders' Funds.", [
    ['sam', "Mixed share warrants with applications for shares. Money received against warrants is a part of Shareholders' Funds."],
    ['ocl', "Treated the money as refundable. It will be turned into shares, so it stays with the shareholders' funds."],
    ['ltb', 'Treated the money as borrowed. Warrant holders are future shareholders, not lenders.'],
  ]),
  item('debentures', '9% Debentures', '9% Debentures, redeemable after five years', 'ltb', 'Debentures are money borrowed, and these fall due after five years: Non-Current Liabilities, Long-term Borrowings.', [
    ['stb', 'Took the debentures as repayable within twelve months. They fall due after five years.'],
    ['shareCapital', 'Treated debentures like shares because both are issued to the public. Debentureholders are lenders.'],
    ['oltl', 'Debentures are money borrowed, so they are borrowings and not "other" liabilities.'],
  ]),
  item('deposits', 'Public deposits', 'Public deposits, repayable after three years', 'ltb', 'Deposits accepted from the public are money borrowed, and these are repayable after three years: Non-Current Liabilities, Long-term Borrowings.', [
    ['stb', 'Took the deposits as repayable within twelve months. They are repayable after three years.'],
    ['ocl', 'Took deposits accepted from the public for an everyday payable. They are money borrowed, repayable after three years.'],
    ['oltl', 'Deposits accepted from the public are money borrowed, so they are borrowings and not "other" liabilities.'],
  ]),
  item('termLoan', 'Term loan from a bank', 'Term loan from a bank, repayable after four years', 'ltb', 'A term loan repayable after four years is a borrowing not due within twelve months: Non-Current Liabilities, Long-term Borrowings.', [
    ['stb', 'Took every bank loan as short-term, like an overdraft. This loan is repayable after four years.'],
    ['oltl', 'A loan is money borrowed, so it is a borrowing and not an "other" liability.'],
    ['ocl', 'Took the loan for an everyday payable. It is money borrowed, repayable after four years.'],
  ]),
  item('premRed', 'Premium on redemption', 'Premium payable on redemption of debentures (the debentures are redeemable after six years)', 'oltl', 'The premium payable on redemption falls due with the debentures, after six years, and is not itself money borrowed: Non-Current Liabilities, Other Long-term Liabilities.', [
    ['reserves', 'Took it for Securities Premium. This premium is payable by the company, not received by it.'],
    ['ltb', 'Added the premium to the debentures. It is not money borrowed, so it is shown apart from the borrowing.'],
    ['ltp', 'Treated a fixed, known amount as a provision. A provision is an estimate.'],
  ]),
  item('gratuity', 'Provision for gratuity', 'Provision for gratuity, payable to employees when they retire many years from now', 'ltp', 'A provision for employee benefits that is not due within twelve months is non-current: Non-Current Liabilities, Long-term Provisions.', [
    ['stp', 'Took the provision as payable within twelve months. The gratuity falls due only when the employees retire, years from now.'],
    ['oltl', 'A provision, being an estimated liability, has a sub-head of its own and is not an "other" liability.'],
    ['reserves', 'Mixed a provision with a reserve. A provision meets a liability; a reserve is profit kept back.'],
  ]),
  item('overdraft', 'Bank overdraft', 'Bank overdraft', 'stb', 'A bank overdraft is money borrowed from the bank, repayable on demand: Current Liabilities, Short-term Borrowings.', [
    ['ocl', 'Treated the overdraft as an everyday payable. It is money borrowed from the bank, repayable on demand.'],
    ['cash', 'Set the overdraft off against cash and bank balances. A liability is not deducted from an asset.'],
    ['tp', 'Trade payables are amounts owed for goods and services bought. An overdraft is a borrowing.'],
  ]),
  item('cashCredit', 'Cash credit', 'Cash credit from a bank', 'stb', 'Cash credit is a borrowing from a bank, repayable on demand: Current Liabilities, Short-term Borrowings.', [
    ['cash', 'Went by the word "cash". Cash credit is a borrowing from a bank, a liability and not a cash balance.'],
    ['ocl', 'Treated the cash credit as an everyday payable. It is money borrowed from the bank.'],
    ['ltb', 'Took the cash credit as a long-term loan. It is repayable on demand, so it is short-term.'],
  ]),
  item('maturities', 'Current maturities of a term loan', 'Current maturities of long-term borrowings (the part of a term loan repayable within twelve months)', 'stb', 'In Schedule III as amended in 2021, current maturities of long-term borrowings are shown under Current Liabilities, Short-term Borrowings.', [
    ['ltb', 'Left the instalment with the loan it comes from. The part repayable within twelve months is current.'],
    ['stp', 'A fixed instalment of a loan is not an estimate, so it is not a provision.'],
    ['tp', 'Trade payables are owed to suppliers of goods and services. An instalment of a loan is money borrowed.'],
  ]),
  item('creditors', 'Sundry creditors', 'Sundry creditors for goods purchased', 'tp', 'Amounts owed to suppliers of goods and services are trade payables: Current Liabilities, Trade Payables.', [
    ['ocl', 'Amounts owed to suppliers of goods and services have a line of their own, trade payables.'],
    ['stb', 'Buying on credit is not borrowing money, so creditors for goods are not borrowings.'],
    ['stp', A_PROVISION],
  ]),
  item('billsPayable', 'Bills payable', 'Bills payable', 'tp', 'A bill accepted for goods bought is owed to a supplier: Current Liabilities, Trade Payables.', [
    ['stb', 'Took a bill accepted for goods bought as a borrowing. It is owed to a supplier, so it is a trade payable.'],
    ['ocl', 'Bills accepted for goods bought are trade payables, which have a line of their own.'],
    ['tr', 'Mixed bills payable with bills receivable. A bill payable is owed by the company.'],
  ]),
  item('unpaidDividend', 'Unpaid dividend', 'Unpaid dividend (declared, but not yet claimed by some shareholders)', 'ocl', 'A dividend declared and not yet paid is a known amount owed to shareholders: Current Liabilities, Other Current Liabilities.', [
    ['stp', 'A dividend already declared is a fixed amount owed, not an estimate, so it is not a provision.'],
    ['reserves', 'Once declared, the dividend has left the surplus and is owed to the shareholders.'],
    ['tp', 'Shareholders are not suppliers. Trade payables are owed for goods and services bought.'],
  ]),
  item('advanceCalls', 'Calls in advance', 'Calls in advance', 'ocl', 'Money received on a call not yet made is owed back to the shareholder until the call is made: Current Liabilities, Other Current Liabilities.', [
    ['shareCapital', 'Added money not yet called to share capital. Until the call is made it is owed to the shareholder.'],
    ['sam', 'The shares are already allotted. This is money paid ahead of a call, not application money.'],
    ['stla', 'Went by the word "advance". The company has received this money, not paid it, so it is a liability.'],
  ]),
  item('salaries', 'Outstanding salaries', 'Outstanding salaries', 'ocl', 'An expense owing is a known amount due within twelve months: Current Liabilities, Other Current Liabilities.', [
    ['stp', 'An outstanding expense is a known amount owed, not an estimate, so it is not a provision.'],
    ['tp', 'Trade payables are owed to suppliers of goods and services. Salaries are owed to employees.'],
    ['oca', 'Mixed an expense owing with an expense paid in advance. Outstanding salaries are owed by the company.'],
  ]),
  item('accruedInterest', 'Interest accrued, not due', 'Interest accrued but not due on borrowings', 'ocl', 'Interest owing on a loan is not part of the money borrowed: Current Liabilities, Other Current Liabilities.', [
    ['stb', 'Added the interest to the loan. Only the principal is a borrowing; interest owing is another current liability.'],
    ['ltb', 'Kept the interest with the long-term loan it is on. The interest is payable within twelve months and is not money borrowed.'],
    ['stp', A_PROVISION],
  ]),
  item('advanceIncome', 'Income received in advance', 'Income received in advance', 'ocl', 'Income received before it is earned is owed back in goods or services: Current Liabilities, Other Current Liabilities.', [
    ['oca', 'Mixed it with accrued income. Income received in advance is owed back in goods or services, so it is a liability.'],
    ['stp', A_PROVISION],
    ['tp', 'Trade payables are owed to suppliers. This amount is owed to customers who paid early.'],
  ]),
  item('tax', 'Provision for tax', 'Provision for tax', 'stp', 'Provision for tax is the estimated tax on the profit of the year, payable within twelve months: Current Liabilities, Short-term Provisions.', [
    ['reserves', 'Treated a provision as a reserve. A provision meets a liability; a reserve is profit kept back.'],
    ['ocl', 'Provision for tax is an estimate of the tax for the year, so it is a provision and not another current liability.'],
    ['ltp', 'Tax on the profit of the year is payable within twelve months, so the provision is short-term.'],
  ]),
  item('leave', 'Provision for leave encashment', 'Provision for leave encashment, payable to employees within twelve months', 'stp', 'A provision for employee benefits payable within twelve months is current: Current Liabilities, Short-term Provisions.', [
    ['ltp', 'Took the provision as long-term. It is payable within twelve months of the balance sheet date.'],
    ['reserves', 'Treated a provision as a reserve. A provision meets a liability; a reserve is profit kept back.'],
    ['tp', 'Trade payables are owed to suppliers of goods and services. This is an estimated amount due to employees.'],
  ]),
  item('plant', 'Plant and machinery', 'Plant and machinery', 'ppe', `Machinery held for use in the business is a tangible fixed asset: ${PPE_WHY}`, [
    ['cwip', 'A machine already in use is not under construction.'],
    ['inv', 'Machinery kept for use in the business is not held for sale, so it is not inventory.'],
    ['onca', 'Tangible assets held for use have a line of their own, Property, Plant and Equipment.'],
  ]),
  item('building', 'Land and building', 'Land and building used for the factory', 'ppe', `Land and building held for use in the business are tangible fixed assets: ${PPE_WHY}`, [
    ['nci', 'Land and building used in the business are not an investment.'],
    ['cwip', 'The building is complete and in use, so it is not under construction.'],
    ['inv', 'Land and building used in the business are not held for sale.'],
  ]),
  item('vehicles', 'Vehicles', 'Vehicles', 'ppe', `Vehicles held for use in the business are tangible fixed assets: ${PPE_WHY}`, [
    ['inv', 'Vehicles kept for use in the business are not held for sale.'],
    ['onca', 'Tangible assets held for use have a line of their own, Property, Plant and Equipment.'],
    ['oca', 'Vehicles serve the business for years, so they are not current assets.'],
  ]),
  item('computers', 'Computers', 'Computers', 'ppe', `Computers are physical assets held for use: ${PPE_WHY}`, [
    ['intangible', 'Mixed the computers with the software that runs on them. Computers are physical assets.'],
    ['inv', 'Computers kept for use in the business are not held for sale.'],
    ['oca', 'Computers serve the business for years, so they are not current assets.'],
  ]),
  item('goodwill', 'Goodwill', 'Goodwill', 'intangible', `Goodwill has no physical form: ${IA_WHY}`, [
    ['ppe', 'Goodwill has no physical form, so it is not property, plant and equipment.'],
    ['onca', 'Intangible assets have a line of their own; goodwill is one of them.'],
    ['nci', 'Goodwill is not an investment in another business; it is an intangible asset of this one.'],
  ]),
  item('patents', 'Patents', 'Patents', 'intangible', `A patent is a right without physical form: ${IA_WHY}`, [
    ['ppe', 'A patent is a right with no physical form, so it is not property, plant and equipment.'],
    ['iaud', 'These patents are already granted and in use. The other line is only for intangibles still being developed.'],
    ['onca', 'Intangible assets have a line of their own; patents are among them.'],
  ]),
  item('software', 'Computer software', 'Computer software', 'intangible', `Software in use has no physical form: ${IA_WHY}`, [
    ['ppe', 'Put the software with the computers it runs on. Software has no physical form, so it is an intangible asset.'],
    ['iaud', 'The software is complete and in use. The other line is only for software still being developed.'],
    ['oca', 'Software serves the business for years, so it is not a current asset.'],
  ]),
  item('construction', 'Building under construction', 'Factory building under construction', 'cwip', `A tangible fixed asset still being built is not ready for use: Non-Current Assets, ${PPE_IA}, Capital Work-in-Progress.`, [
    ['ppe', 'The building is not ready for use, so it is not yet property, plant and equipment.'],
    ['inv', 'Mixed capital work-in-progress with the work-in-progress of goods being made for sale.'],
    ['iaud', 'A building is a tangible asset, so its construction is capital work-in-progress.'],
  ]),
  item('softwareDev', 'Software being developed', 'Software being developed by the company for its own use', 'iaud', `An intangible asset not yet ready for use is shown apart: Non-Current Assets, ${PPE_IA}, Intangible Assets under Development.`, [
    ['intangible', 'The software is not ready for use yet. Only completed intangibles are shown as intangible assets.'],
    ['cwip', 'Capital work-in-progress is for tangible assets being built. Software is intangible.'],
    ['inv', "Took software being developed for the company's own use for goods being made for sale."],
  ]),
  item('subsidiary', 'Shares in a subsidiary', 'Shares in a subsidiary company, to be held for many years', 'nci', 'An investment meant to be held for more than twelve months is non-current: Non-Current Assets, Non-current Investments.', [
    ['ci', 'Took the shares as held for sale within twelve months. They are to be held for many years.'],
    ['ltla', 'Buying shares is investing, not lending money.'],
    ['cash', 'Shares held for many years are not cash or a cash equivalent.'],
  ]),
  item('bonds', '10-year government bonds', 'Investment in 10-year government bonds, to be held till they mature', 'nci', 'An investment to be held for more than twelve months is non-current: Non-Current Assets, Non-current Investments.', [
    ['ci', 'Took the bonds as realisable within twelve months. They are to be held till they mature, years from now.'],
    ['ltla', 'Buying bonds as an investment is not giving a loan or an advance.'],
    ['cash', 'Bonds held for years are not cash or a cash equivalent.'],
  ]),
  item('capitalAdvance', 'Capital advances', 'Capital advances (advance paid to a supplier for machinery ordered)', 'ltla', 'An advance for a fixed asset does not come back as cash or goods of the operating cycle: Non-Current Assets, Long-term Loans and Advances.', [
    ['ppe', 'The machinery has not been received, so there is no property, plant and equipment to show yet.'],
    ['cwip', 'Nothing is being built yet. An advance paid for a capital asset is a long-term advance.'],
    ['stla', 'An advance for a fixed asset will not come back as cash or goods of the operating cycle, so it is long-term.'],
  ]),
  item('deposit', 'Security deposit (electricity)', 'Security deposit with the electricity board, to stay for many years', 'onca', 'In Schedule III as amended in 2021, long-term security deposits are listed under Non-Current Assets, Other Non-current Assets.', [
    ['cash', 'Took a deposit kept with an authority for a balance in a bank.'],
    ['nci', 'A deposit kept as security is not an investment: it is lodged to keep the connection, not to earn a return.'],
    ['oca', 'Took the deposit as coming back within twelve months. It stays for as long as the connection lasts, so it is non-current.'],
  ]),
  item('mutualFund', 'Mutual fund units (6 months)', 'Units of an equity mutual fund, to be sold within six months', 'ci', 'An investment meant to be realised within twelve months is current: Current Assets, Current Investments.', [
    ['nci', 'Took the units as a long-term holding. They are to be sold within six months.'],
    ['cash', 'Took a readily saleable investment for cash. It is shown as a current investment.'],
    ['stla', 'Buying units of a fund is investing, not lending money.'],
  ]),
  item('rawMaterials', 'Raw materials', 'Stock of raw materials', 'inv', 'Materials waiting to be used in production are inventory: Current Assets, Inventories.', [
    ['oca', 'Inventories have a line of their own among the current assets.'],
    ['ppe', 'Materials are used up in production within the operating cycle. They are not kept for use over years.'],
    ['cwip', 'Capital work-in-progress is a fixed asset under construction. Materials for production are inventory.'],
  ]),
  item('wip', 'Work-in-progress', 'Work-in-progress (goods partly made, meant for sale)', 'inv', 'Goods partly made and meant for sale are inventory: Current Assets, Inventories.', [
    ['cwip', 'Mixed the work-in-progress of goods for sale with capital work-in-progress, which is a fixed asset under construction.'],
    ['ppe', 'Goods being made for sale are not assets held for use.'],
    ['oca', 'Inventories have a line of their own among the current assets.'],
  ]),
  item('finished', 'Finished goods', 'Stock of finished goods', 'inv', 'Goods made and waiting to be sold are inventory: Current Assets, Inventories.', [
    ['tr', 'Goods not yet sold are not receivable from anyone.'],
    ['oca', 'Inventories have a line of their own among the current assets.'],
    ['ci', 'Goods held for sale are not an investment.'],
  ]),
  item('looseTools', 'Loose tools', 'Loose tools', 'inv', 'Schedule III lists loose tools under inventories: Current Assets, Inventories.', [
    ['ppe', 'Took loose tools for equipment. Schedule III lists them under inventories.'],
    ['oca', 'Schedule III lists loose tools under inventories, not among the other current assets.'],
    ['onca', 'Took loose tools for a long-term asset. Schedule III lists them under inventories, a current asset.'],
  ]),
  item('debtors', 'Sundry debtors', 'Sundry debtors for goods sold', 'tr', 'Amounts due from customers for goods sold are trade receivables: Current Assets, Trade Receivables.', [
    ['stla', 'Selling on credit is not lending money. Amounts due from customers are trade receivables.'],
    ['oca', 'Amounts due from customers have a line of their own, trade receivables.'],
    ['cash', 'An amount still due from a customer is not cash until it is received.'],
  ]),
  item('billsReceivable', 'Bills receivable', 'Bills receivable', 'tr', 'A bill received from a customer for goods sold is a trade receivable: Current Assets, Trade Receivables.', [
    ['cash', 'A bill is a promise to pay later. It is not cash until it is met.'],
    ['stla', 'A bill received for goods sold is not a loan given; it is due from a customer.'],
    ['tp', 'Mixed bills receivable with bills payable. A bill receivable is owed to the company.'],
  ]),
  item('cheques', 'Cheques on hand', 'Cheques and drafts on hand', 'cash', 'Cheques and drafts on hand are counted with cash: Current Assets, Cash and Cash Equivalents.', [
    ['tr', 'Thought the customer still owes the money until the cheque is cleared. Cheques on hand are counted with cash and cash equivalents.'],
    ['oca', 'Cheques and drafts on hand are part of cash and cash equivalents, which have a line of their own.'],
    ['ci', 'A cheque waiting to be banked is not an investment.'],
  ]),
  item('bank', 'Balance at bank', 'Balance in current account with a bank', 'cash', 'Balances with banks are part of cash and cash equivalents: Current Assets, Cash and Cash Equivalents.', [
    ['ci', 'A balance in a bank account is not an investment.'],
    ['stla', 'Money kept in a bank account is not a loan given.'],
    ['oca', 'Balances with banks are part of cash and cash equivalents, which have a line of their own.'],
  ]),
  item('supplierAdvance', 'Advance to a supplier', 'Advance paid to a supplier for raw materials', 'stla', 'An advance for goods is settled within the operating cycle: Current Assets, Short-term Loans and Advances.', [
    ['tr', 'A supplier who has been paid in advance is not a customer; nothing has been sold.'],
    ['ltla', 'Mixed it with a capital advance. An advance for goods is settled within the operating cycle.'],
    ['inv', 'The materials have not been received yet, so there is no inventory to show.'],
  ]),
  item('prepaid', 'Prepaid insurance', 'Prepaid insurance', 'oca', 'An expense paid in advance is a current asset with no line of its own: Current Assets, Other Current Assets.', [
    ['ocl', 'Mixed an expense paid in advance with an expense owing. A prepaid expense is an asset.'],
    ['cash', 'The money has already been paid out. What is left is the right to insurance cover.'],
    ['onca', 'The cover paid for is used up within twelve months, so the asset is current.'],
  ]),
];

export const itemById = (id: string): Item => {
  const found = ITEMS.find((i) => i.id === id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};

/** Said when a tile is put in a wrong place: the mistake behind that place, or a question that leads to the right one. */
export function placeWhy(i: Item, s: Sub): string {
  const known = i.wrong.find(([w]) => w === s);
  if (known) return known[1];
  const owned = isAssetSub(i.sub);
  if (owned !== isAssetSub(s)) return owned ? 'That is a place for what the company owes or what belongs to its owners; this is something the company owns.' : 'That is a place for what the company owns; this is owed, or belongs to the owners.';
  if (majorOf(i.sub) !== majorOf(s)) return 'Right side, wrong head: ask whether it is realised or settled within twelve months (or the operating cycle), and whether it belongs to the owners.';
  return `Right head (${MAJOR[majorOf(s)]}), wrong sub-head: ask what kind of item it is.`;
}
