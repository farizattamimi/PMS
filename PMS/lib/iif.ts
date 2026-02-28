/**
 * IIF (Intuit Interchange Format) builder for QuickBooks export.
 * Pure utility — zero Prisma / framework dependencies.
 */

export interface IIFRow {
  id: string
  date: string // YYYY-MM-DD
  type: string // LedgerEntryType value
  amount: number // positive = income, negative = expense (DB convention)
  memo: string
  propertyName: string
  tenantName?: string
  unitNumber?: string
}

interface AccountDef {
  name: string
  number: number
  type: string // IIF account type: INC, EXP, BANK, OLIAB
}

export const ACCOUNT_MAP: Record<string, AccountDef> = {
  RENT:                { name: 'Rental Income',        number: 4000, type: 'INC' },
  DEPOSIT:             { name: 'Security Deposits',    number: 2100, type: 'OLIAB' },
  LATE_FEE:            { name: 'Late Fee Income',      number: 4100, type: 'INC' },
  OTHER_INCOME:        { name: 'Other Income',         number: 4900, type: 'INC' },
  MAINTENANCE_EXPENSE: { name: 'Maintenance Expense',  number: 6100, type: 'EXP' },
  UTILITY:             { name: 'Utilities Expense',    number: 6200, type: 'EXP' },
  OTHER_EXPENSE:       { name: 'Other Expense',        number: 6900, type: 'EXP' },
}

export const BANK_ACCOUNT: AccountDef = {
  name: 'Operating Account',
  number: 1000,
  type: 'BANK',
}

const TAB = '\t'
const CRLF = '\r\n'

/** Format YYYY-MM-DD → MM/DD/YYYY */
export function formatIIFDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${m}/${d}/${y}`
}

/** Strip tabs and newlines from memo text */
export function sanitizeMemo(text: string): string {
  return text.replace(/[\t\r\n]/g, ' ')
}

/** !ACCNT header + all account rows */
export function buildAccountList(): string {
  const header = ['!ACCNT', 'NAME', 'ACCNTTYPE', 'ACCNUM'].join(TAB) + CRLF

  const rows: string[] = []

  // Bank account
  rows.push(['ACCNT', BANK_ACCOUNT.name, BANK_ACCOUNT.type, String(BANK_ACCOUNT.number)].join(TAB))

  // All mapped accounts
  for (const acct of Object.values(ACCOUNT_MAP)) {
    rows.push(['ACCNT', acct.name, acct.type, String(acct.number)].join(TAB))
  }

  return header + rows.join(CRLF) + CRLF
}

/** !TRNS + !SPL + !ENDTRNS header block */
export function buildTransactionHeaders(): string {
  const trnsHeader = ['!TRNS', 'TRNSID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'CLASS', 'AMOUNT', 'MEMO'].join(TAB)
  const splHeader = ['!SPL', 'SPLID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'CLASS', 'AMOUNT', 'MEMO'].join(TAB)
  const endHeader = '!ENDTRNS'
  return trnsHeader + CRLF + splHeader + CRLF + endHeader + CRLF
}

/**
 * Build a single double-entry transaction (TRNS + SPL + ENDTRNS).
 *
 * Double-entry rules:
 *   Income (amount > 0):  TRNS debits bank (+amount), SPL credits income (-amount)
 *   Expense (amount < 0): TRNS debits expense (+|amount|), SPL credits bank (-|amount|)
 *   Deposit (amount > 0): TRNS debits bank (+amount), SPL credits liability (-amount)
 */
export function buildTransaction(row: IIFRow): string {
  const date = formatIIFDate(row.date)
  const memo = sanitizeMemo(row.memo)
  const name = row.tenantName ? sanitizeMemo(row.tenantName) : ''
  const cls = sanitizeMemo(row.propertyName)
  const acct = ACCOUNT_MAP[row.type]

  if (!acct) {
    // Unknown type — skip
    return ''
  }

  const absAmount = Math.abs(row.amount)
  let trnsAcct: string
  let trnsAmount: number
  let splAcct: string
  let splAmount: number

  if (row.amount < 0) {
    // Expense: debit expense account, credit bank
    trnsAcct = acct.name
    trnsAmount = absAmount
    splAcct = BANK_ACCOUNT.name
    splAmount = -absAmount
  } else {
    // Income / deposit: debit bank, credit income/liability account
    trnsAcct = BANK_ACCOUNT.name
    trnsAmount = absAmount
    splAcct = acct.name
    splAmount = -absAmount
  }

  const trnsLine = ['TRNS', row.id, 'GENERAL JOURNAL', date, trnsAcct, name, cls, trnsAmount.toFixed(2), memo].join(TAB)
  const splLine = ['SPL', row.id, 'GENERAL JOURNAL', date, splAcct, name, cls, splAmount.toFixed(2), memo].join(TAB)

  return trnsLine + CRLF + splLine + CRLF + 'ENDTRNS' + CRLF
}

/** Generate a complete IIF file string from an array of rows. */
export function generateIIF(rows: IIFRow[]): string {
  let out = ''
  out += buildAccountList()
  out += buildTransactionHeaders()
  for (const row of rows) {
    out += buildTransaction(row)
  }
  return out
}
