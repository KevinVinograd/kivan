export function BillingEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">Todavía no hay comprobantes para este período</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Cuando se generen cobros para el mes, vas a poder facturarlos desde acá: generá o asociá la
        factura de cada cobro y controlá el estado ARCA.
      </p>
    </div>
  )
}
