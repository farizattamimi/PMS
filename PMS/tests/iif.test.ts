import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAccountList,
  buildTransactionHeaders,
  buildTransaction,
  generateIIF,
  formatIIFDate,
  sanitizeMemo,
  ACCOUNT_MAP,
  BANK_ACCOUNT,
  type IIFRow,
} from '../lib/iif'

describe('IIF builder', { concurrency: 1 }, () => {
  describe('buildAccountList', () => {
    it('returns header + all 8 accounts with tab delimiters', () => {
      const result = buildAccountList()
      const lines = result.split('\r\n').filter(Boolean)
      // 1 header + 1 bank + 7 mapped accounts = 9 lines
      assert.equal(lines.length, 9)
      assert.ok(lines[0].startsWith('!ACCNT'))
      // Bank account is first data row
      assert.ok(lines[1].includes('Operating Account'))
      assert.ok(lines[1].includes('BANK'))
      assert.ok(lines[1].includes('1000'))
      // All mapped accounts present
      for (const acct of Object.values(ACCOUNT_MAP)) {
        assert.ok(result.includes(acct.name), `Missing account: ${acct.name}`)
      }
    })

    it('uses tab delimiters', () => {
      const result = buildAccountList()
      const dataLine = result.split('\r\n')[1]
      assert.equal(dataLine.split('\t').length, 4) // ACCNT, NAME, TYPE, NUM
    })
  })

  describe('buildTransactionHeaders', () => {
    it('returns TRNS + SPL + ENDTRNS headers', () => {
      const result = buildTransactionHeaders()
      const lines = result.split('\r\n').filter(Boolean)
      assert.equal(lines.length, 3)
      assert.ok(lines[0].startsWith('!TRNS'))
      assert.ok(lines[1].startsWith('!SPL'))
      assert.equal(lines[2], '!ENDTRNS')
    })
  })

  describe('buildTransaction', () => {
    it('RENT income: TRNS debits bank (+), SPL credits income (-), sum = 0', () => {
      const row: IIFRow = {
        id: 'le_1',
        date: '2026-01-15',
        type: 'RENT',
        amount: 1500,
        memo: 'Jan rent',
        propertyName: 'Sunset Apartments',
        tenantName: 'Alice Doe',
        unitNumber: '101',
      }
      const result = buildTransaction(row)
      const lines = result.split('\r\n').filter(Boolean)
      assert.equal(lines.length, 3) // TRNS, SPL, ENDTRNS

      const trns = lines[0].split('\t')
      const spl = lines[1].split('\t')

      // TRNS debits bank
      assert.equal(trns[4], BANK_ACCOUNT.name)
      assert.equal(trns[7], '1500.00')

      // SPL credits income account
      assert.equal(spl[4], ACCOUNT_MAP.RENT.name)
      assert.equal(spl[7], '-1500.00')

      // Sum = 0
      assert.equal(parseFloat(trns[7]) + parseFloat(spl[7]), 0)

      assert.equal(lines[2], 'ENDTRNS')
    })

    it('MAINTENANCE_EXPENSE: TRNS debits expense (+abs), SPL credits bank (-abs)', () => {
      const row: IIFRow = {
        id: 'le_2',
        date: '2026-02-10',
        type: 'MAINTENANCE_EXPENSE',
        amount: -350,
        memo: 'Plumbing fix',
        propertyName: 'Oak Hill Commons',
      }
      const result = buildTransaction(row)
      const lines = result.split('\r\n').filter(Boolean)

      const trns = lines[0].split('\t')
      const spl = lines[1].split('\t')

      // TRNS debits expense account
      assert.equal(trns[4], ACCOUNT_MAP.MAINTENANCE_EXPENSE.name)
      assert.equal(trns[7], '350.00')

      // SPL credits bank
      assert.equal(spl[4], BANK_ACCOUNT.name)
      assert.equal(spl[7], '-350.00')

      // Sum = 0
      assert.equal(parseFloat(trns[7]) + parseFloat(spl[7]), 0)
    })

    it('DEPOSIT: TRNS debits bank, SPL credits liability', () => {
      const row: IIFRow = {
        id: 'le_3',
        date: '2026-03-01',
        type: 'DEPOSIT',
        amount: 2000,
        memo: 'Security deposit',
        propertyName: 'Riverside Lofts',
        tenantName: 'Bob Smith',
      }
      const result = buildTransaction(row)
      const lines = result.split('\r\n').filter(Boolean)
      const trns = lines[0].split('\t')
      const spl = lines[1].split('\t')

      assert.equal(trns[4], BANK_ACCOUNT.name)
      assert.equal(spl[4], ACCOUNT_MAP.DEPOSIT.name)
      assert.equal(spl[3], '03/01/2026') // date formatted
    })

    it('returns empty string for unknown type', () => {
      const row: IIFRow = {
        id: 'le_4',
        date: '2026-01-01',
        type: 'UNKNOWN_TYPE',
        amount: 100,
        memo: 'test',
        propertyName: 'Test',
      }
      assert.equal(buildTransaction(row), '')
    })
  })

  describe('generateIIF', () => {
    it('produces valid complete file with mixed entries', () => {
      const rows: IIFRow[] = [
        { id: 'a', date: '2026-01-15', type: 'RENT', amount: 1500, memo: 'Rent', propertyName: 'Sunset', tenantName: 'Alice' },
        { id: 'b', date: '2026-01-20', type: 'MAINTENANCE_EXPENSE', amount: -200, memo: 'Fix', propertyName: 'Sunset' },
        { id: 'c', date: '2026-01-25', type: 'LATE_FEE', amount: 50, memo: 'Late', propertyName: 'Sunset', tenantName: 'Bob' },
      ]
      const result = generateIIF(rows)

      // Has account list
      assert.ok(result.includes('!ACCNT'))
      // Has transaction headers
      assert.ok(result.includes('!TRNS'))
      assert.ok(result.includes('!SPL'))
      // 3 transactions produce 3 ENDTRNS lines; plus 1 !ENDTRNS header
      const allEndtrns = result.split('\r\n').filter(l => l === 'ENDTRNS' || l === '!ENDTRNS')
      assert.equal(allEndtrns.length, 4) // 1 header + 3 transactions

      // Uses CRLF line endings throughout
      assert.ok(result.includes('\r\n'))
    })
  })

  describe('formatIIFDate', () => {
    it('converts YYYY-MM-DD to MM/DD/YYYY', () => {
      assert.equal(formatIIFDate('2026-01-15'), '01/15/2026')
      assert.equal(formatIIFDate('2026-12-05'), '12/05/2026')
    })
  })

  describe('sanitizeMemo', () => {
    it('replaces tabs and newlines with spaces', () => {
      assert.equal(sanitizeMemo('line1\tline2\nline3\r\nline4'), 'line1 line2 line3  line4')
    })

    it('preserves normal text', () => {
      assert.equal(sanitizeMemo('Normal memo text'), 'Normal memo text')
    })
  })
})
