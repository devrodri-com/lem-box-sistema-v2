// src/lib/inboundPhotos.ts
// Helper functions para manejar fotos de inbounds (compatibilidad legacy photoUrl + nuevo photoUrls)

export function getPhotoUrls(inbound: { photoUrls?: string[]; photoUrl?: string }): string[] {
  // Si existe photoUrls (nuevo), usarlo
  if (inbound.photoUrls && inbound.photoUrls.length > 0) {
    return inbound.photoUrls;
  }
  // Fallback a photoUrl (legacy)
  if (inbound.photoUrl) {
    return [inbound.photoUrl];
  }
  return [];
}

export function getPrimaryPhotoUrl(inbound: { photoUrls?: string[]; photoUrl?: string }): string | undefined {
  return getPhotoUrls(inbound)[0];
}

