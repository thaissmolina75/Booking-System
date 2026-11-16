import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('writes a header and rows with CRLF line ends', () => {
    expect(toCsv(['Code', 'People'], [['DS-0001', 3]])).toBe('Code,People\r\nDS-0001,3\r\n')
  })
  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv(['Note'], [['Vegetarian, no nuts'], ['He said "late"'], ['line one\nline two']])).toBe(
      'Note\r\n"Vegetarian, no nuts"\r\n"He said ""late"""\r\n"line one\nline two"\r\n',
    )
  })
  it('leaves empty cells empty', () => {
    expect(toCsv(['A', 'B', 'C'], [[null, undefined, '']])).toBe('A,B,C\r\n,,\r\n')
  })
  it('stops text from running as a spreadsheet formula', () => {
    const csv = toCsv(['Name'], [['=HYPERLINK("http://evil","x")'], ['@cmd'], ['-2+3'], ['+971501234567']])
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csv).toContain("'@cmd")
    expect(csv).toContain("'-2+3")
    expect(csv).toContain("'+971501234567")
  })
  it('keeps numbers as numbers, including negatives', () => {
    expect(toCsv(['Seats'], [[-5]])).toBe('Seats\r\n-5\r\n')
  })
  it('keeps non-Latin names intact', () => {
    expect(toCsv(['Name'], [['فاطمة الزهراء'], ['Müller']])).toBe('Name\r\nفاطمة الزهراء\r\nMüller\r\n')
  })
})
