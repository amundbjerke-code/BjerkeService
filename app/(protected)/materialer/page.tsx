import { PurchaseOrderStatus } from "@prisma/client";

import {
  adjustInventoryMaterialStockAction,
  createInventoryMaterialAction,
  createSupplierAction,
  generateLowStockPurchaseOrdersAction,
  markPurchaseOrderReceivedAction
} from "@/app/actions/material-inventory-actions";
import { db } from "@/lib/db";
import { getPurchaseOrderStatusColor, getPurchaseOrderStatusLabel } from "@/lib/material-inventory-meta";
import { requireAuthPage } from "@/lib/rbac";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatMoney(value: number): string {
  return `${value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function formatQuantity(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getSuccessMessage(value: string): string | null {
  if (value === "supplier-created") return "Leverandor opprettet.";
  if (value === "material-created") return "Materiale opprettet i registeret.";
  if (value === "stock-adjusted") return "Lagerbeholdning oppdatert.";
  if (value === "po-generated") return "Innkjopsordre generert for lavlager-linjer.";
  if (value === "po-received") return "Innkjopsordre markert som mottatt og lager oppdatert.";
  return null;
}

export default async function MaterialerPage({ searchParams }: Props) {
  await requireAuthPage();
  const params = (await searchParams) ?? {};

  const error = toSingleValue(params.error);
  const warning = toSingleValue(params.warning);
  const success = getSuccessMessage(toSingleValue(params.success));

  const [suppliers, materials, purchaseOrders] = await Promise.all([
    db.supplier.findMany({
      orderBy: { navn: "asc" },
      include: {
        _count: {
          select: {
            materials: true,
            purchaseOrders: true
          }
        }
      }
    }),
    db.inventoryMaterial.findMany({
      orderBy: [{ navn: "asc" }],
      include: {
        supplier: {
          select: {
            id: true,
            navn: true
          }
        },
        _count: {
          select: {
            consumptions: true,
            purchaseOrderItems: true
          }
        }
      }
    }),
    db.purchaseOrder.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      include: {
        supplier: {
          select: {
            navn: true
          }
        },
        createdBy: {
          select: {
            name: true
          }
        },
        items: {
          include: {
            material: {
              select: {
                navn: true,
                enhet: true
              }
            }
          }
        }
      }
    })
  ]);

  const lowStockMaterials = materials.filter((material) => material.lavLagerGrense > 0 && material.lagerBeholdning <= material.lavLagerGrense);

  return (
    <section className="space-y-4">
      <div className="brand-card p-5">
        <h1 className="text-xl font-bold text-brand-ink">Material- og Lagerstyring</h1>
        <p className="mt-2 text-sm text-brand-ink/80">
          Materialregister med leverandor, innkjopspris, standard paslag, lagerbeholdning, lavlager-varsel og innkjopsordre.
        </p>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {warning ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{warning}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      {lowStockMaterials.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Lav lagerbeholdning pa {lowStockMaterials.length} materialer.</p>
          <p className="mt-1">Generer innkjopsordre for a fylle opp automatisk.</p>
          <form action={generateLowStockPurchaseOrdersAction} className="mt-2">
            <button type="submit" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
              Generer innkjopsordre
            </button>
          </form>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <form action={createSupplierAction} className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Ny leverandor</h2>
            <label className="block text-sm font-medium">
              Navn
              <input name="navn" className="brand-input mt-1" required minLength={2} maxLength={120} />
            </label>
            <label className="block text-sm font-medium">
              Kontaktperson (valgfritt)
              <input name="kontaktperson" className="brand-input mt-1" maxLength={120} />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                E-post (valgfritt)
                <input name="epost" type="email" className="brand-input mt-1" maxLength={200} />
              </label>
              <label className="block text-sm font-medium">
                Telefon (valgfritt)
                <input name="telefon" className="brand-input mt-1" maxLength={50} />
              </label>
            </div>
            <button type="submit" className="brand-button w-full">
              Opprett leverandor
            </button>
          </form>

          <form action={createInventoryMaterialAction} className="brand-card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Nytt materiale i register</h2>
            <label className="block text-sm font-medium">
              Leverandor
              <select name="supplierId" className="brand-input mt-1" required defaultValue="">
                <option value="" disabled>
                  Velg leverandor
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.navn}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Materialnavn
              <input name="navn" className="brand-input mt-1" required minLength={1} maxLength={200} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Enhet
                <input name="enhet" className="brand-input mt-1" required maxLength={30} placeholder="stk, m, m2..." />
              </label>
              <label className="block text-sm font-medium">
                Innkjopspris eks mva
                <input name="innkjopsprisEksMva" type="number" step="0.01" min="0.01" className="brand-input mt-1" required />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Standard paslag %
                <input name="standardPaslagPercent" type="number" step="0.01" min="0" className="brand-input mt-1" defaultValue="25" />
              </label>
              <label className="block text-sm font-medium">
                Startlager
                <input name="lagerBeholdning" type="number" step="0.01" min="0" className="brand-input mt-1" defaultValue="0" />
              </label>
              <label className="block text-sm font-medium">
                Lavlager-grense
                <input name="lavLagerGrense" type="number" step="0.01" min="0" className="brand-input mt-1" defaultValue="0" />
              </label>
            </div>
            <button type="submit" className="brand-button w-full" disabled={suppliers.length === 0}>
              Lagre materiale
            </button>
            {suppliers.length === 0 ? <p className="text-xs text-brand-ink/70">Opprett minst en leverandor forst.</p> : null}
          </form>
        </div>

        <div className="space-y-4">
          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Leverandorer</h2>
            {suppliers.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen leverandorer opprettet enna.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="rounded-lg border border-black/10 p-3 text-sm">
                    <p className="font-semibold">{supplier.navn}</p>
                    {supplier.kontaktperson ? <p className="text-brand-ink/75">Kontakt: {supplier.kontaktperson}</p> : null}
                    {supplier.epost ? <p className="text-brand-ink/75">{supplier.epost}</p> : null}
                    {supplier.telefon ? <p className="text-brand-ink/75">{supplier.telefon}</p> : null}
                    <p className="mt-1 text-xs text-brand-ink/70">
                      {supplier._count.materials} materialer | {supplier._count.purchaseOrders} innkjopsordre
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="brand-card p-4">
            <h2 className="text-lg font-semibold">Materialregister</h2>
            {materials.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen materialer i registeret enna.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {materials.map((material) => {
                  const lowStock = material.lagerBeholdning <= material.lavLagerGrense;
                  const enhetsSalg = material.innkjopsprisEksMva * (1 + material.standardPaslagPercent / 100);
                  return (
                    <div key={material.id} className={`rounded-xl border p-3 ${lowStock ? "border-amber-300 bg-amber-50/50" : "border-black/10"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{material.navn}</p>
                          <p className="text-sm text-brand-ink/75">
                            {material.supplier.navn} - {formatMoney(material.innkjopsprisEksMva)} / {material.enhet}
                          </p>
                          <p className="text-xs text-brand-ink/70">
                            Paslag {material.standardPaslagPercent.toLocaleString("nb-NO", { maximumFractionDigits: 2 })}% -
                            Est. salg {formatMoney(enhetsSalg)} / {material.enhet}
                          </p>
                          <p className="mt-1 text-xs text-brand-ink/70">
                            Forbrukslinjer: {material._count.consumptions} | Ordrelinjer: {material._count.purchaseOrderItems}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className={`font-semibold ${lowStock ? "text-amber-700" : "text-brand-ink"}`}>
                            Lager: {formatQuantity(material.lagerBeholdning)} {material.enhet}
                          </p>
                          <p className="text-xs text-brand-ink/70">Lavlager: {formatQuantity(material.lavLagerGrense)} {material.enhet}</p>
                        </div>
                      </div>

                      <form action={adjustInventoryMaterialStockAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                        <input type="hidden" name="materialId" value={material.id} />
                        <label className="text-xs font-medium">
                          Delta
                          <input name="delta" type="number" step="0.01" className="brand-input mt-1 text-xs" placeholder="Eks: 10 eller -2" required />
                        </label>
                        <label className="text-xs font-medium">
                          Arsak
                          <input name="reason" className="brand-input mt-1 text-xs" placeholder="Varetelling, svinn, korrigering..." required minLength={2} maxLength={300} />
                        </label>
                        <div className="flex items-end">
                          <button type="submit" className="rounded-lg bg-brand-canvas px-3 py-2 text-xs font-semibold hover:bg-brand-canvas/80">
                            Juster lager
                          </button>
                        </div>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="brand-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">Innkjopsordre</h2>
              <form action={generateLowStockPurchaseOrdersAction}>
                <button type="submit" className="rounded-lg bg-brand-red px-3 py-2 text-xs font-semibold text-white hover:bg-brand-red/90">
                  Generer fra lavlager
                </button>
              </form>
            </div>

            {purchaseOrders.length === 0 ? (
              <p className="mt-2 text-sm text-brand-ink/75">Ingen innkjopsordre opprettet enna.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {purchaseOrders.map((order) => {
                  const total = order.items.reduce((sum, item) => sum + item.antall * item.enhetsprisEksMva, 0);
                  return (
                    <div key={order.id} className="rounded-xl border border-black/10 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{order.supplier.navn}</p>
                          <p className="text-xs text-brand-ink/70">
                            Opprettet {order.createdAt.toLocaleDateString("nb-NO")} av {order.createdBy.name}
                          </p>
                          {order.notat ? <p className="mt-1 text-xs text-brand-ink/70">{order.notat}</p> : null}
                        </div>
                        <div className="text-right text-sm">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPurchaseOrderStatusColor(order.status)}`}>
                            {getPurchaseOrderStatusLabel(order.status)}
                          </span>
                          <p className="mt-1 font-semibold">{formatMoney(total)}</p>
                        </div>
                      </div>

                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="bg-brand-canvas text-brand-ink/70">
                            <tr>
                              <th className="px-2 py-1">Materiale</th>
                              <th className="px-2 py-1">Antall</th>
                              <th className="px-2 py-1">Enhetspris</th>
                              <th className="px-2 py-1">Linjesum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item) => (
                              <tr key={item.id} className="border-t border-black/10">
                                <td className="px-2 py-1">{item.material.navn}</td>
                                <td className="px-2 py-1">{formatQuantity(item.antall)} {item.material.enhet}</td>
                                <td className="px-2 py-1">{formatMoney(item.enhetsprisEksMva)}</td>
                                <td className="px-2 py-1">{formatMoney(item.antall * item.enhetsprisEksMva)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {order.status !== PurchaseOrderStatus.MOTTATT && order.status !== PurchaseOrderStatus.ANNULLERT ? (
                        <form action={markPurchaseOrderReceivedAction} className="mt-2">
                          <input type="hidden" name="purchaseOrderId" value={order.id} />
                          <button type="submit" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                            Marker som mottatt
                          </button>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
