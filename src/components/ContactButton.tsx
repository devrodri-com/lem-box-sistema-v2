// src/components/ContactButton.tsx
import React from 'react'

export function ContactButton() {
  const href = `https://wa.me/13055551234?text=${encodeURIComponent('Hola LEM-BOX!')}`
  return (
    <a data-testid="cta" href={href} target="_blank" rel="noreferrer">
      Contactar por WhatsApp
    </a>
  )
}