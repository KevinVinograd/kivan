/**
 * The employee dashboard has NO loading or error state, and that is deliberate.
 *
 * `getEmployeeDashboardData` reads only `record.id` and `record.label` off the monthly
 * record and builds every figure from a standalone mock, so the page never touches the
 * plan bundle and no fetch of its own can fail. It used to fake a 400ms skeleton with a
 * timer and carry an error state nothing could reach; both were removed rather than wired,
 * because a skeleton for a fetch that does not exist is theatre.
 *
 * When the employee data is wired to the API, add `EmployeeDashboardLoading` /
 * `EmployeeDashboardError` back here and derive them from THAT query's
 * `isFetching` / `isError` (never from a timer).
 */
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
