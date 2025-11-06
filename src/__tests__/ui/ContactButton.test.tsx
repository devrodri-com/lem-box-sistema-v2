// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ContactButton } from '../../components/ContactButton'

describe('ContactButton (ui)', () => {
  it('renderiza link a WhatsApp con el mensaje', () => {
    render(<ContactButton />)
    const link = screen.getByTestId('cta') as HTMLAnchorElement
    expect(link).toBeInTheDocument()
    expect(link.href).toMatch(/wa\.me/)
    expect(decodeURIComponent(link.href)).toContain('Hola LEM-BOX!')
  })
})