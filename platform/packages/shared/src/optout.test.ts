import { describe, expect, it } from 'vitest'
import { detectOptOut } from './optout.js'

describe('detectOptOut', () => {
  it('detects explicit commands', () => {
    expect(detectOptOut('PARE')).toBe(true)
    expect(detectOptOut('sair')).toBe(true)
    expect(detectOptOut('cancelar')).toBe(true)
    expect(detectOptOut('Não me mande mais mensagens, por favor')).toBe(true)
    expect(detectOptOut('não quero mais receber isso')).toBe(true)
  })
  it('does not flag normal sentences containing short words', () => {
    expect(detectOptOut('quero parar de travar na frente da câmera')).toBe(false)
    expect(detectOptOut('para quando é a próxima turma?')).toBe(false)
    expect(detectOptOut('posso cancelar a matrícula depois se não gostar?')).toBe(false)
  })
})
