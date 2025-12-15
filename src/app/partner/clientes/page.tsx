// src/app/partner/clientes/page.tsx
"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePartnerContext } from "@/components/PartnerContext";
import type { Client } from "@/types/lem";
import { chunk } from "@/lib/utils";

export default function PartnerClientesPage() {
  const { scopedClientIds, effectiveRole, uid, roleResolved } = usePartnerContext();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Cargar clientes
  useEffect(() => {
    if (!roleResolved || !uid) return;
    if (scopedClientIds.length === 0) {
      setClients([]);
      setLoading(false);
      return;
    }

    async function loadClients() {
      setLoading(true);
      setError(null);
      const chunks = chunk(scopedClientIds, 10);
      const clientPromises = chunks.map((chunkIds) =>
        Promise.all(chunkIds.map((id) => getDoc(doc(db, "clients", id))))
      );

      try {
        const clientSnaps = await Promise.all(clientPromises);
        const loadedClients: Client[] = [];
        clientSnaps.forEach((chunkSnaps, chunkIdx) => {
          chunkSnaps.forEach((snap, idx) => {
            if (snap.exists()) {
              const chunkIds = chunks[chunkIdx];
              const cid = chunkIds[idx];
              loadedClients.push({ id: cid, ...(snap.data() as Omit<Client, "id">) });
            }
          });
        });

        // Ordenar por code (si existe) y luego por name
        loadedClients.sort((a, b) => {
          const aCode = a.code || "";
          const bCode = b.code || "";
          if (aCode !== bCode) {
            return aCode.localeCompare(bCode);
          }
          const aName = a.name || "";
          const bName = b.name || "";
          return aName.localeCompare(bName);
        });

        setClients(loadedClients);
      } catch (err) {
        console.error("[PartnerClientes] Error loading clients:", err);
        setError("Error al cargar los clientes. Por favor, intenta nuevamente.");
        setClients([]);
      } finally {
        setLoading(false);
      }
    }
    void loadClients();
  }, [scopedClientIds, uid, roleResolved]);

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedClient(null);
  };

  if (!roleResolved) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
        <p className="text-sm text-white/60">Cargando permisos…</p>
      </div>
    );
  }

  if (scopedClientIds.length === 0) {
    return (
      <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-red-400/30 backdrop-blur-sm p-6 space-y-4 text-center">
        <h2 className="text-xl font-semibold text-white">No tenés clientes asociados</h2>
        <p className="text-sm text-white/60">
          Contacta a un administrador para que te asigne clientes.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">Clientes</h2>

      {error ? (
        <div className="rounded-md bg-red-500/20 border border-red-400/30 p-4 text-sm text-white">
          {error}
        </div>
      ) : loading ? (
        <div className="text-sm text-white/60">Cargando clientes…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-[#1f3f36] bg-[#071f19] ring-1 ring-white/10">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-[#0f2a22]">
                <tr>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Código</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Nombre</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Email</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">País</th>
                  <th className="text-left p-2 text-white/80 text-xs font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-t border-white/10 odd:bg-transparent even:bg-white/5 hover:bg-white/10"
                  >
                    <td className="p-2 font-mono text-white">{client.code || "-"}</td>
                    <td className="p-2 text-white">{client.name || "-"}</td>
                    <td className="p-2 text-white">{client.email || "-"}</td>
                    <td className="p-2 text-white">{client.country || "-"}</td>
                    <td className="p-2">
                      <button
                        className="px-3 py-1.5 rounded-md border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] text-xs font-medium"
                        onClick={() => handleViewClient(client)}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
                {!clients.length ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-white/60">
                      Sin clientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal de detalles del cliente */}
      {modalOpen && selectedClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl bg-[#071f19] border border-white/10 p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Detalles del Cliente</h3>
              <button
                className="text-white/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005f40] rounded-sm"
                onClick={closeModal}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <div className="text-white/60 mb-1">Código</div>
                <div className="text-white font-mono">{selectedClient.code || "-"}</div>
              </div>
              <div>
                <div className="text-white/60 mb-1">Nombre</div>
                <div className="text-white">{selectedClient.name || "-"}</div>
              </div>
              {selectedClient.email && (
                <div>
                  <div className="text-white/60 mb-1">Email</div>
                  <div className="text-white">{selectedClient.email}</div>
                </div>
              )}
              {selectedClient.phone && (
                <div>
                  <div className="text-white/60 mb-1">Teléfono</div>
                  <div className="text-white">{selectedClient.phone}</div>
                </div>
              )}
              {selectedClient.address && (
                <div>
                  <div className="text-white/60 mb-1">Dirección</div>
                  <div className="text-white">{selectedClient.address}</div>
                </div>
              )}
              {selectedClient.country && (
                <div>
                  <div className="text-white/60 mb-1">País</div>
                  <div className="text-white">{selectedClient.country}</div>
                </div>
              )}
              {selectedClient.state && (
                <div>
                  <div className="text-white/60 mb-1">Estado/Provincia</div>
                  <div className="text-white">{selectedClient.state}</div>
                </div>
              )}
              {selectedClient.city && (
                <div>
                  <div className="text-white/60 mb-1">Ciudad</div>
                  <div className="text-white">{selectedClient.city}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                className="px-4 py-2 rounded-md bg-[#005f40] text-white font-medium hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#005f40]"
                onClick={closeModal}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 p-3 rounded-md bg-[#0f2a22] border border-[#1f3f36] text-xs font-mono text-white/70 space-y-1">
          <div>uid: {uid}</div>
          <div>effectiveRole: {effectiveRole}</div>
          <div>scopedClientIds.length: {scopedClientIds.length}</div>
          <div>clients.length: {clients.length}</div>
        </div>
      )}
    </div>
  );
}
