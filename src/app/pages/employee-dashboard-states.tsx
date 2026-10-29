export function EmployeeDashboardEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">
        Todavía no tenés clientes u objetivos asignados para este mes
      </h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Cuando se asignen clientes, vas a ver tus pendientes, horas y objetivos acá.
      </p>
    </div>
  )
}
