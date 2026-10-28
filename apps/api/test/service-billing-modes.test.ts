/**
 * Service billing modes (real Postgres, non-superuser app role).
 *
 * The studio's report: a client priced with a one-time Branding stage, a monthly
 * retainer and two per-production prices showed the WHOLE budget as its "Fee mensual",
 * and the month generator would have billed all of it every month. These tests pin:
 *
 *   - the fee is the sum of MONTHLY lines only, and the generator bills only those;
 *   - a one-time line is billed in parts (anticipos) until its price is used up;
 *   - a per-production line bills the productions linked to it, once, and a cancelled
 *     cobro gives them back.
 */
import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let container: StartedPostgreSqlContainer;
let app: FastifyInstance;

const WS = '0b000000-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@modes.test';
const EMPLOYEE_EMAIL = 'emp@modes.test';
const PASSWORD = 'a-correct-password';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hold')
    .withUsername('owner')
    .withPassword('owner')
    .start();
  const ownerUrl = container.getConnectionUri();
  execSync('pnpm --filter @hold/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: ownerUrl },
    stdio: 'pipe',
  });
  process.env.JWT_SECRET ??= 'x'.repeat(32);
  process.env.RATE_LIMIT_MAX = '10000';
  const { hashPassword } = await import('../src/lib/password.js');
  const passwordHash = await hashPassword(PASSWORD);

  const admin = new Client({ connectionString: ownerUrl });
  await admin.connect();
  await admin.query(`CREATE ROLE hold_app LOGIN PASSWORD 'app'`);
  await admin.query(`GRANT CONNECT ON DATABASE hold TO hold_app`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO hold_app`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hold_app`);
  await admin.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO hold_app`);
  await admin.query(`INSERT INTO "Workspace" (id, name) VALUES ($1, 'Studio')`, [WS]);
  for (const [email, role] of [[OWNER_EMAIL, 'owner'], [EMPLOYEE_EMAIL, 'employee']]) {
    await admin.query(
      `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'A', 'B', $3, now())`,
      [email, passwordHash, role],
    );
  }
  await admin.end();

  process.env.DATABASE_URL = ownerUrl.replace('owner:owner@', 'hold_app:app@');
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

let token = '';
let empToken = '';
beforeAll(async () => {
  const t = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: OWNER_EMAIL, password: PASSWORD } });
  token = t.json().accessToken;
  const e = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: EMPLOYEE_EMAIL, password: PASSWORD } });
  empToken = e.json().accessToken;
});

function h(t = token) {
  return { authorization: `Bearer ${t}` };
}

async function newClient(payload: Record<string, unknown>): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/clients', headers: h(),
    payload: { status: 'active', services: ['Redes'], ...payload },
  });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

async function line(
  clientId: string,
  name: string,
  priceMinor: string,
  billingMode?: string,
  extra: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: 'POST', url: `/clients/${clientId}/service-lines`, headers: h(),
    payload: { name, priceMinor, ...(billingMode ? { billingMode } : {}), ...extra },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; billingMode: string; billedMinor: string | null; includedHours: number | null };
}

async function fee(clientId: string): Promise<string> {
  return (await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: h() })).json()
    .monthlyFeeMinor as string;
}

async function lines(clientId: string) {
  return (
    await app.inject({ method: 'GET', url: `/clients/${clientId}/service-lines`, headers: h() })
  ).json() as { id: string; name: string; billingMode: string; billedMinor: string | null }[];
}

function charge(payload: Record<string, unknown>, t = token) {
  return app.inject({
    method: 'POST', url: '/receivables/service-line-charge', headers: h(t),
    payload: { period: '2026-09-01', dueDate: '2026-09-10', ...payload },
  });
}

describe('service billing modes - the fee', () => {
  it('defaults a line to monthly, so every existing contract bills as before', async () => {
    const c = await newClient({ name: 'Por Defecto SA' });
    const l = await line(c, 'Redes', '100000');
    expect(l.billingMode).toBe('monthly');
    expect(l.billedMinor).toBeNull();
    expect(await fee(c)).toBe('100000');
  });

  it('forms the fee from the monthly lines only', async () => {
    // Estudio Calde, as the studio loaded it: one retainer, one project stage, two
    // production prices. Only the retainer is a monthly fee.
    const c = await newClient({ name: 'Estudio Calde' });
    await line(c, 'Redes Etapa 2', '1300000');
    await line(c, 'Branding Etapa 1', '1400000', 'one_time');
    await line(c, 'Producción con Celular', '75000', 'per_production');
    await line(c, 'Producción con Camara', '110000', 'per_production');
    expect(await fee(c)).toBe('1300000');
  });

  it('re-derives the fee when a line changes mode', async () => {
    const c = await newClient({ name: 'Cambia Modo SA' });
    await line(c, 'Redes', '60000');
    const web = await line(c, 'Desarrollo web', '40000');
    expect(await fee(c)).toBe('100000');
    const res = await app.inject({
      method: 'PATCH', url: `/service-lines/${web.id}`, headers: h(), payload: { billingMode: 'one_time' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().billedMinor).toBe('0');
    expect(await fee(c)).toBe('60000');
  });

  it('keeps the hand-typed abono when the lines are not monthly, and lets it be edited', async () => {
    // Deriving 0 here zeroed a real $500.000 abono the moment a one-time "Etapa 1" was
    // added, dropped the client from the generator, and the edit guard then refused to
    // let anyone type it back.
    const c = await newClient({ name: 'Abono Y Proyecto SA', monthlyFeeMinor: '500000' });
    const res = await app.inject({
      method: 'POST', url: `/clients/${c}/service-lines`, headers: h(),
      payload: { name: 'Branding', priceMinor: '900000', billingMode: 'one_time' },
    });
    expect(res.statusCode).toBe(201);
    expect(await fee(c)).toBe('500000');
    const edit = await app.inject({
      method: 'PUT', url: `/clients/${c}`, headers: h(), payload: { monthlyFeeMinor: '0' },
    });
    expect(edit.statusCode).toBe(200);
    expect(await fee(c)).toBe('0');
  });

  it('drops the retainer when the last monthly line changes mode', async () => {
    // Its price was the fee. Left behind, it would be billed monthly as an abono nobody
    // typed, and as a one-time line it could also be charged again in full.
    const c = await newClient({ name: 'Ultima Mensual SA' });
    const web = await line(c, 'Web', '30000');
    expect(await fee(c)).toBe('30000');
    await app.inject({
      method: 'PATCH', url: `/service-lines/${web.id}`, headers: h(), payload: { billingMode: 'one_time' },
    });
    expect(await fee(c)).toBe('0');
    const preview = await app.inject({
      method: 'GET', url: '/receivables/monthly-fee/preview?period=2027-04-01', headers: h(),
    });
    expect((preview.json().items as { clientId: string }[]).some((i) => i.clientId === c)).toBe(false);
  });

  it('refuses to change the mode of a per-production line with productions to bill', async () => {
    const c = await newClient({ name: 'Cambio Con Pendientes SA' });
    const cel = await line(c, 'Producción', '75000', 'per_production');
    const p = await app.inject({
      method: 'POST', url: '/months/2026-12/productions', headers: h(),
      payload: {
        date: '2026-12-05', title: 'Reel', type: 'Reel', billable: 'billable',
        clientId: c, clientServiceId: cel.id, billAmountMinor: '75000',
      },
    });
    expect(p.statusCode).toBe(201);
    const res = await app.inject({
      method: 'PATCH', url: `/service-lines/${cel.id}`, headers: h(), payload: { billingMode: 'monthly' },
    });
    expect(res.statusCode).toBe(409);
    expect(await fee(c)).toBe('0');
  });

  it('still refuses a retainer that sums to zero', async () => {
    const c = await newClient({ name: 'Retainer Cero SA', monthlyFeeMinor: '80000' });
    const res = await app.inject({
      method: 'POST', url: `/clients/${c}/service-lines`, headers: h(),
      payload: { name: 'Redes', priceMinor: '0' },
    });
    expect(res.statusCode).toBe(400);
    expect(await fee(c)).toBe('80000');
  });

  it('refuses a typed fee on a client whose fee comes from its lines', async () => {
    // The edit dialog sends the fee on every save. It used to overwrite the sum silently.
    const c = await newClient({ name: 'Dialogo SA' });
    await line(c, 'Redes', '70000');
    const changed = await app.inject({
      method: 'PUT', url: `/clients/${c}`, headers: h(), payload: { monthlyFeeMinor: '999999' },
    });
    expect(changed.statusCode).toBe(400);
    expect(await fee(c)).toBe('70000');
    // The untouched value (what the dialog sends when nobody edits the field) passes.
    const same = await app.inject({
      method: 'PUT', url: `/clients/${c}`, headers: h(),
      payload: { monthlyFeeMinor: '70000', contactName: 'Ana' },
    });
    expect(same.statusCode).toBe(200);
  });

  it('still lets a client with no lines edit its hand-typed fee', async () => {
    const c = await newClient({ name: 'Manual SA', monthlyFeeMinor: '50000' });
    const res = await app.inject({
      method: 'PUT', url: `/clients/${c}`, headers: h(), payload: { monthlyFeeMinor: '65000' },
    });
    expect(res.statusCode).toBe(200);
    expect(await fee(c)).toBe('65000');
  });
});

describe('service billing modes - the month generator', () => {
  const PERIOD = '2026-10-01';

  it('offers and bills only the monthly lines', async () => {
    const c = await newClient({ name: 'Generador Mixto SA' });
    await line(c, 'Redes', '60000');
    await line(c, 'Branding', '400000', 'one_time');
    await line(c, 'Producción', '30000', 'per_production');

    const preview = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${PERIOD}`, headers: h(),
    });
    const item = (preview.json().items as { clientId: string; lines: { name: string }[] }[]).find(
      (i) => i.clientId === c,
    );
    expect(item?.lines.map((l) => l.name)).toEqual(['Redes']);

    // No selection = "the whole contract", which must still mean the monthly contract.
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-10-10', items: [{ clientId: c, service: 'Redes' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().created[0]).toMatchObject({ baseAmountMinor: '60000' });
  });

  it('refuses a one-time line id smuggled into the monthly selection', async () => {
    const c = await newClient({ name: 'Contrabando SA' });
    const redes = await line(c, 'Redes', '60000');
    const branding = await line(c, 'Branding', '400000', 'one_time');
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: {
        period: PERIOD, dueDate: '2026-10-10',
        items: [{ clientId: c, service: 'Redes', clientServiceIds: [redes.id, branding.id] }],
      },
    });
    expect(res.json().created[0]).toMatchObject({ baseAmountMinor: '60000' });
  });
});

describe('service billing modes - one-time charges', () => {
  let client = '';
  let branding = '';

  beforeAll(async () => {
    // 5% standing discount, as Estudio Calde carries (1.400.000 → 1.330.000).
    client = await newClient({ name: 'Anticipos SA', discountPercentBp: 500 });
    branding = (await line(client, 'Branding Etapa 1', '1400000', 'one_time')).id;
  });

  it('bills an anticipo as its own cobro, discounted like any generated cobro', async () => {
    const res = await charge({ clientServiceId: branding, amountMinor: '700000' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      service: 'Branding Etapa 1',
      source: 'one_time',
      baseAmountMinor: '700000',
      discountAmountMinor: '35000',
      totalAmountMinor: '665000',
    });
    const l = (await lines(client)).find((x) => x.id === branding);
    expect(l?.billedMinor).toBe('700000');
  });

  it('refuses to bill more than what is left of the price', async () => {
    const res = await charge({ clientServiceId: branding, amountMinor: '700001' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain('$ 7.000');
  });

  it('bills the balance, and then nothing more', async () => {
    expect((await charge({ clientServiceId: branding, amountMinor: '700000' })).statusCode).toBe(201);
    const again = await charge({ clientServiceId: branding, amountMinor: '1' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toContain('completo');
  });

  it('gives the amount back when the cobro is cancelled', async () => {
    const list = await app.inject({ method: 'GET', url: '/receivables?period=2026-09-01', headers: h() });
    const mine = (list.json().items as { id: string; clientId: string }[]).filter((r) => r.clientId === client);
    const cancel = await app.inject({ method: 'POST', url: `/receivables/${mine[0]!.id}/cancel`, headers: h() });
    expect(cancel.statusCode).toBe(200);
    const l = (await lines(client)).find((x) => x.id === branding);
    expect(l?.billedMinor).toBe('700000');
  });

  it('does not count the anticipo as the month retainer', async () => {
    // A one-time cobro is not source=monthly_fee, so the month can still be generated.
    const c = await newClient({ name: 'Mes Libre SA' });
    await line(c, 'Redes', '50000');
    const web = await line(c, 'Web', '200000', 'one_time');
    expect((await charge({ clientServiceId: web.id, amountMinor: '100000' })).statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: '2026-09-01', dueDate: '2026-09-10', items: [{ clientId: c, service: 'Redes' }] },
    });
    expect(res.json().created).toHaveLength(1);
  });

  it('refuses a monthly line, a zero amount and an unknown line', async () => {
    const c = await newClient({ name: 'Rechazos SA' });
    const redes = await line(c, 'Redes', '50000');
    expect((await charge({ clientServiceId: redes.id, amountMinor: '1000' })).statusCode).toBe(400);
    const web = await line(c, 'Web', '200000', 'one_time');
    expect((await charge({ clientServiceId: web.id, amountMinor: '0' })).statusCode).toBe(400);
    expect(
      (await charge({ clientServiceId: '0b000000-0000-4000-8000-00000000dead', amountMinor: '1' })).statusCode,
    ).toBe(404);
  });

  it('bills a dollar project in pesos at the month rate, and counts it in dollars', async () => {
    const c = await newClient({ name: 'Dolar SA', currency: 'USD' });
    const web = await line(c, 'Web', '100000', 'one_time'); // US$ 1.000
    const noRate = await charge({ clientServiceId: web.id, amountMinor: '50000', period: '2027-03-01' });
    expect(noRate.statusCode).toBe(409);
    await app.inject({
      method: 'PUT', url: '/exchange-rates', headers: h(),
      payload: { period: '2027-03-01', arsPerUsdMinor: '100000' }, // $ 1.000 per dollar
    });
    const res = await charge({ clientServiceId: web.id, amountMinor: '50000', period: '2027-03-01' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ currency: 'ARS', baseAmountMinor: '50000000', originalAmountMinor: '50000' });
    expect((await lines(c)).find((x) => x.id === web.id)?.billedMinor).toBe('50000');
  });

  it('is closed to an employee', async () => {
    expect((await charge({ clientServiceId: branding, amountMinor: '1' }, empToken)).statusCode).toBe(403);
  });

  it('never lets two charges at once bill past the price', async () => {
    const c = await newClient({ name: 'Doble Clic SA' });
    const web = await line(c, 'Web', '100000', 'one_time');
    const results = await Promise.all([
      charge({ clientServiceId: web.id, amountMinor: '100000' }),
      charge({ clientServiceId: web.id, amountMinor: '100000' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await lines(c)).find((x) => x.id === web.id)?.billedMinor).toBe('100000');
  });

  it('keeps counting a cancelled anticipo that was already paid', async () => {
    // The paid part stays on the client's account after a cancel; giving the amount back
    // under the cap would let the same anticipo be billed, and paid, twice.
    const c = await newClient({ name: 'Anticipo Pagado SA' });
    const web = await line(c, 'Web', '100000', 'one_time');
    const cobro = (await charge({ clientServiceId: web.id, amountMinor: '50000' })).json();
    const collect = await app.inject({
      method: 'POST', url: `/receivables/${cobro.id}/collect`, headers: h(),
      payload: { amountMinor: '20000', idempotencyKey: 'anticipo-pagado-1' },
    });
    expect(collect.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: `/receivables/${cobro.id}/cancel`, headers: h() });
    expect((await lines(c)).find((x) => x.id === web.id)?.billedMinor).toBe('50000');
  });

  it('does not count monthly cobros against a line that became one-time', async () => {
    const c = await newClient({ name: 'Era Mensual SA' });
    await line(c, 'Redes', '10000');
    const web = await line(c, 'Web', '30000');
    await app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: '2027-02-01', dueDate: '2027-02-10', items: [{ clientId: c, service: 'Abono' }] },
    });
    await app.inject({ method: 'PATCH', url: `/service-lines/${web.id}`, headers: h(), payload: { billingMode: 'one_time' } });
    expect((await lines(c)).find((x) => x.id === web.id)?.billedMinor).toBe('0');
    expect((await charge({ clientServiceId: web.id, amountMinor: '30000' })).statusCode).toBe(201);
  });
});

describe('service billing modes - productions', () => {
  // Productions of November and December; cobros generated for December.
  const PERIOD = '2026-12-01';
  let client = '';
  let redes = '';
  let celular = '';
  let camara = '';

  // Approved by default: since 2026-10-19 only approved productions are billed.
  function production(clientId: string, payload: Record<string, unknown>, month = '2026-12') {
    return app.inject({
      method: 'POST', url: `/months/${month}/productions`, headers: h(),
      payload: {
        date: `${month}-05`, title: 'Reel', type: 'Reel', hours: 2,
        billable: 'billable', status: 'approved', clientId, ...payload,
      },
    });
  }

  async function productionsOf(month: string) {
    return (await app.inject({ method: 'GET', url: `/months/${month}/productions`, headers: h() })).json() as {
      id: string; title: string; clientId: string; receivableId: string | null; status: string; version: number;
    }[];
  }

  async function previewItem(clientId: string, period = PERIOD) {
    const res = await app.inject({
      method: 'GET', url: `/receivables/monthly-fee/preview?period=${period}`, headers: h(),
    });
    return {
      item: (res.json().items as {
        clientId: string;
        lines: { id: string }[];
        productions: { id: string; serviceName: string; amountMinor: string }[];
      }[]).find((i) => i.clientId === clientId),
      withoutFee: res.json().withoutFee as string[],
    };
  }

  function generate(items: Record<string, unknown>[]) {
    return app.inject({
      method: 'POST', url: '/receivables/monthly-fee/generate', headers: h(),
      payload: { period: PERIOD, dueDate: '2026-12-10', items },
    });
  }

  beforeAll(async () => {
    client = await newClient({ name: 'Producciones SA' });
    redes = (await line(client, 'Redes', '100000')).id;
    celular = (await line(client, 'Producción con Celular', '75000', 'per_production')).id;
    camara = (await line(client, 'Producción con Camara', '110000', 'per_production')).id;
  });

  it('refuses a link to another client, to a non-per-production line, or while not billable', async () => {
    const other = await newClient({ name: 'Otro SA' });
    const foreign = (await line(other, 'Producción', '5000', 'per_production')).id;
    expect((await production(client, { clientServiceId: foreign, billAmountMinor: '5000' })).statusCode).toBe(400);
    expect((await production(client, { clientServiceId: redes, billAmountMinor: '5000' })).statusCode).toBe(400);
    expect(
      (await production(client, { clientServiceId: celular, billAmountMinor: '75000', billable: 'internal' }))
        .statusCode,
    ).toBe(400);
  });

  it('offers the pending productions, including the previous month ones', async () => {
    const nov = await production(
      client,
      { title: 'Noviembre', clientServiceId: camara, billAmountMinor: '110000' },
      '2026-11',
    );
    expect(nov.statusCode).toBe(201);
    expect(nov.json()).toMatchObject({ clientServiceId: camara, receivableId: null });
    expect(
      (await production(client, { title: 'Diciembre', clientServiceId: celular, billAmountMinor: '75000' }))
        .statusCode,
    ).toBe(201);
    // Not linked: keeps the old behaviour, never billed by the generator.
    await production(client, { title: 'Suelta', billAmountMinor: '9999' });

    const { item } = await previewItem(client);
    expect(item?.lines.map((l) => l.id)).toEqual([redes]);
    expect(item?.productions.map((p) => [p.serviceName, p.amountMinor])).toEqual([
      ['Producción con Camara', '110000'],
      ['Producción con Celular', '75000'],
    ]);
  });

  it('bills no production an older browser did not show', async () => {
    const c = await newClient({ name: 'Navegador Viejo SA' });
    await line(c, 'Redes', '100000');
    const cel = (await line(c, 'Producción', '75000', 'per_production')).id;
    await production(c, { clientServiceId: cel, billAmountMinor: '75000' });
    const res = await generate([{ clientId: c, service: 'Redes' }]);
    expect(res.json().created[0]).toMatchObject({ baseAmountMinor: '100000' });
    expect((await previewItem(c, '2027-01-01')).item?.productions).toHaveLength(1);
  });

  it('bills the retainer and the selected productions on one cobro, once', async () => {
    const { item } = await previewItem(client);
    const res = await generate([
      { clientId: client, service: 'Redes', productionIds: item!.productions.map((p) => p.id) },
    ]);
    expect(res.statusCode).toBe(201);
    const cobro = res.json().created[0] as { id: string; baseAmountMinor: string };
    expect(cobro.baseAmountMinor).toBe('285000'); // 100.000 + 110.000 + 75.000

    const mine = [...(await productionsOf('2026-11')), ...(await productionsOf('2026-12'))].filter(
      (p) => p.clientId === client,
    );
    const billed = mine.filter((p) => p.title === 'Noviembre' || p.title === 'Diciembre');
    expect(billed).toHaveLength(2);
    expect(billed.every((p) => p.receivableId === cobro.id && p.status === 'invoiced')).toBe(true);
    expect(mine.find((p) => p.title === 'Suelta')?.receivableId).toBeNull();
    // Billed once: the next month does not offer them again.
    expect((await previewItem(client, '2027-01-01')).item?.productions ?? []).toEqual([]);
  });

  it('locks a billed production against edits and deletion', async () => {
    const p = (await productionsOf('2026-12')).find((x) => x.clientId === client && x.title === 'Diciembre')!;
    const edit = await app.inject({
      method: 'PUT', url: `/productions/${p.id}`, headers: h(),
      payload: { version: p.version, billAmountMinor: '1' },
    });
    expect(edit.statusCode).toBe(409);
    const del = await app.inject({ method: 'DELETE', url: `/productions/${p.id}?version=${p.version}`, headers: h() });
    expect(del.statusCode).toBe(409);
  });

  it('gives the productions back when the cobro is cancelled', async () => {
    const p = (await productionsOf('2026-12')).find((x) => x.clientId === client && x.title === 'Diciembre')!;
    const cancel = await app.inject({ method: 'POST', url: `/receivables/${p.receivableId}/cancel`, headers: h() });
    expect(cancel.statusCode).toBe(200);
    const after = (await productionsOf('2026-12')).find((x) => x.id === p.id)!;
    // Back to approved — it was approved before it was billed — so the next cobro takes it.
    expect(after).toMatchObject({ receivableId: null, status: 'approved' });
    expect((await previewItem(client)).item?.productions).toHaveLength(2);
  });

  it('offers and bills a client priced by productions alone', async () => {
    const c = await newClient({ name: 'Solo Producciones SA' });
    const cel = (await line(c, 'Producción', '75000', 'per_production')).id;
    expect(await fee(c)).toBe('0');
    const before = await previewItem(c);
    expect(before.item).toBeUndefined();
    expect(before.withoutFee).toContain('Solo Producciones SA');

    const p = await production(c, { clientServiceId: cel, billAmountMinor: '75000', billable: 'both' });
    const after = await previewItem(c);
    expect(after.item?.productions).toHaveLength(1);
    expect(after.withoutFee).not.toContain('Solo Producciones SA');
    const res = await generate([{ clientId: c, service: 'Producción', productionIds: [p.json().id] }]);
    expect(res.json().created[0]).toMatchObject({ baseAmountMinor: '75000' });
  });

  it('gives a hand-typed retainer its own line when productions join it', async () => {
    // A client on a hand-typed abono that also prices productions: the abono stays (no
    // monthly line), and the cobro's lines must still sum to its base.
    const c = await newClient({ name: 'Mixto Manual SA', monthlyFeeMinor: '50000' });
    const cel = (await line(c, 'Producción', '20000', 'per_production')).id;
    expect(await fee(c)).toBe('50000');
    const p = await production(c, { clientServiceId: cel, billAmountMinor: '20000' });
    const res = await generate([{ clientId: c, service: 'Redes', productionIds: [p.json().id] }]);
    expect(res.statusCode).toBe(201);
    expect(res.json().created[0]).toMatchObject({ baseAmountMinor: '70000' });
  });

  it('keeps productions billed when their cobro is cancelled after a payment', async () => {
    const c = await newClient({ name: 'Cobro Pagado SA' });
    const cel = (await line(c, 'Producción', '100000', 'per_production')).id;
    const p = await production(c, { clientServiceId: cel, billAmountMinor: '100000' });
    const cobro = (await generate([{ clientId: c, service: 'Producción', productionIds: [p.json().id] }])).json()
      .created[0] as { id: string };
    await app.inject({
      method: 'POST', url: `/receivables/${cobro.id}/collect`, headers: h(),
      payload: { amountMinor: '40000', idempotencyKey: 'cobro-pagado-1' },
    });
    await app.inject({ method: 'POST', url: `/receivables/${cobro.id}/cancel`, headers: h() });
    const after = (await productionsOf('2026-12')).find((x) => x.id === p.json().id)!;
    expect(after.receivableId).toBe(cobro.id);
    expect((await previewItem(c, '2027-01-01')).item?.productions ?? []).toEqual([]);
  });

  it('takes a notes edit on a production whose service line was removed', async () => {
    const c = await newClient({ name: 'Linea Borrada SA' });
    const cel = (await line(c, 'Producción', '10000', 'per_production')).id;
    const p = (await production(c, { clientServiceId: cel, billAmountMinor: '10000' })).json();
    await app.inject({ method: 'DELETE', url: `/service-lines/${cel}`, headers: h() });
    const edit = await app.inject({
      method: 'PUT', url: `/productions/${p.id}`, headers: h(),
      payload: { version: p.version, notes: 'Entregado', clientServiceId: cel, clientId: c, billable: 'billable' },
    });
    expect(edit.statusCode).toBe(200);
  });

  it('bills only what the communication lead approved', async () => {
    const c = await newClient({ name: 'Aprobación SA' });
    const cel = (await line(c, 'Producción', '30000', 'per_production')).id;
    const p = (await production(c, { clientServiceId: cel, billAmountMinor: '30000', status: 'pending' })).json();
    expect((await previewItem(c)).item?.productions ?? []).toEqual([]);

    const approved = await app.inject({
      method: 'POST', url: '/productions/approval', headers: h(), payload: { ids: [p.id], approved: true },
    });
    expect(approved.json()).toEqual({ updated: 1 });
    expect((await previewItem(c)).item?.productions.map((x) => x.id)).toEqual([p.id]);

    const back = await app.inject({
      method: 'POST', url: '/productions/approval', headers: h(), payload: { ids: [p.id], approved: false },
    });
    expect(back.json()).toEqual({ updated: 1 });
    expect((await previewItem(c)).item?.productions ?? []).toEqual([]);
  });

  it('bills a per-hour production as hours × price, and re-bills it when the hours change', async () => {
    const c = await newClient({ name: 'Por Hora SA' });
    const camaraHora = (await line(c, 'Producción con cámara', '5000000', 'per_hour')).id;
    // A typed amount does not stick under a per-hour line: the hour is what HOLD sells.
    const created = await production(c, { clientServiceId: camaraHora, hours: 2.5, billAmountMinor: '1' });
    expect(created.statusCode).toBe(201);
    expect(created.json().billAmountMinor).toBe('12500000');

    const p = created.json();
    const edited = await app.inject({
      method: 'PUT', url: `/productions/${p.id}`, headers: h(),
      payload: { version: p.version, hours: 3 },
    });
    expect(edited.json().billAmountMinor).toBe('15000000');
    expect((await previewItem(c)).item?.productions.map((x) => x.amountMinor)).toEqual(['15000000']);
  });

  describe('included hours on a per-hour line', () => {
    // 75.000 an hour, 6 hours a month inside the retainer: HOLD's own example
    // ("el servicio de redes incluye 6 h de producción con celular").
    const HOUR = '7500000';

    async function billOf(id: string, month = '2026-12') {
      const row = (await app.inject({ method: 'GET', url: `/months/${month}/productions`, headers: h() }))
        .json()
        .find((p: { id: string }) => p.id === id) as { billAmountMinor: string; packHours: number; version: number };
      return row;
    }

    it('keeps included hours on per-hour lines only', async () => {
      const c = await newClient({ name: 'Solo Por Hora SA' });
      const monthly = await line(c, 'Redes', '100000', 'monthly', { includedHours: 6 });
      expect(monthly.includedHours).toBeNull();
      const hourly = await line(c, 'Producción con celular', HOUR, 'per_hour', { includedHours: 6 });
      expect(hourly.includedHours).toBe(6);
    });

    it('covers the month\'s included hours and bills only the excess, oldest shoot first', async () => {
      const c = await newClient({ name: 'Pack SA' });
      const cel = (await line(c, 'Producción con celular', HOUR, 'per_hour', { includedHours: 6 })).id;
      const a = (await production(c, { clientServiceId: cel, hours: 4, date: '2026-12-03' })).json();
      const b = (await production(c, { clientServiceId: cel, hours: 3, date: '2026-12-10' })).json();
      expect(await billOf(a.id)).toMatchObject({ packHours: 4, billAmountMinor: '0' });
      // 7 hours against 6 included: the later shoot carries the one extra hour.
      expect(await billOf(b.id)).toMatchObject({ packHours: 2, billAmountMinor: '7500000' });
      // Inside the pack bills nothing, so it is never offered for a cobro.
      expect((await previewItem(c)).item?.productions.map((x) => [x.id, x.amountMinor])).toEqual([
        [b.id, '7500000'],
      ]);
      // A shoot of another month starts from a full pack.
      const nov = (await production(c, { clientServiceId: cel, hours: 2, date: '2026-11-20' }, '2026-11')).json();
      expect(await billOf(nov.id, '2026-11')).toMatchObject({ packHours: 2, billAmountMinor: '0' });
    });

    it('never lets a pending production use hours an approved one is owed', async () => {
      const c = await newClient({ name: 'Pack Pendiente SA' });
      const cel = (await line(c, 'Producción con celular', HOUR, 'per_hour', { includedHours: 6 })).id;
      const early = (
        await production(c, { clientServiceId: cel, hours: 5, date: '2026-12-02', status: 'pending' })
      ).json();
      const late = (await production(c, { clientServiceId: cel, hours: 3, date: '2026-12-15' })).json();
      // Approved first, whatever the date: the pending one shows what it WOULD bill.
      expect(await billOf(late.id)).toMatchObject({ packHours: 3, billAmountMinor: '0' });
      expect(await billOf(early.id)).toMatchObject({ packHours: 3, billAmountMinor: '15000000' });

      await app.inject({
        method: 'POST', url: '/productions/approval', headers: h(), payload: { ids: [early.id], approved: true },
      });
      // Both approved: oldest shoot first. The two extra hours move to the later one.
      expect(await billOf(early.id)).toMatchObject({ packHours: 5, billAmountMinor: '0' });
      expect(await billOf(late.id)).toMatchObject({ packHours: 1, billAmountMinor: '15000000' });
    });

    it('never re-covers what a billed production used, and re-bills the open ones when the pack changes', async () => {
      const c = await newClient({ name: 'Pack Cobrado SA' });
      const cel = (await line(c, 'Producción con celular', HOUR, 'per_hour', { includedHours: 6 })).id;
      const a = (await production(c, { clientServiceId: cel, hours: 4, date: '2026-12-03' })).json();
      const b = (await production(c, { clientServiceId: cel, hours: 3, date: '2026-12-10' })).json();
      const gen = await generate([{ clientId: c, service: 'Producción', productionIds: [b.id] }]);
      expect(gen.statusCode).toBe(201);
      // b is billed with 2 covered hours and 1 extra; its amount is now frozen.
      const added = (await production(c, { clientServiceId: cel, hours: 2, date: '2026-12-20' })).json();
      // 6 included: 2 used by the billed one, 4 by a, nothing left for the new one.
      expect(await billOf(added.id)).toMatchObject({ packHours: 0, billAmountMinor: '15000000' });

      // A bigger pack re-bills the open productions, and leaves the billed one alone.
      const patched = await app.inject({
        method: 'PATCH', url: `/service-lines/${cel}`, headers: h(), payload: { includedHours: 8 },
      });
      expect(patched.statusCode).toBe(200);
      expect(await billOf(added.id)).toMatchObject({ packHours: 2, billAmountMinor: '0' });
      expect(await billOf(b.id)).toMatchObject({ packHours: 2, billAmountMinor: '7500000' });

      // Deleting a covered production gives its hours back to the month.
      await app.inject({ method: 'PATCH', url: `/service-lines/${cel}`, headers: h(), payload: { includedHours: 6 } });
      expect(await billOf(added.id)).toMatchObject({ packHours: 0, billAmountMinor: '15000000' });
      const del = await app.inject({
        method: 'DELETE', url: `/productions/${a.id}?version=${(await billOf(a.id)).version}`, headers: h(),
      });
      expect(del.statusCode).toBe(200);
      expect(await billOf(added.id)).toMatchObject({ packHours: 2, billAmountMinor: '0' });
    });

    it('drops the cover when a production moves off the per-hour line', async () => {
      const c = await newClient({ name: 'Pack Movido SA' });
      const cel = (await line(c, 'Producción con celular', HOUR, 'per_hour', { includedHours: 6 })).id;
      const proyecto = (await line(c, 'Evento', '300000', 'per_production')).id;
      const p = (await production(c, { clientServiceId: cel, hours: 2 })).json();
      expect(await billOf(p.id)).toMatchObject({ packHours: 2, billAmountMinor: '0' });
      const moved = await app.inject({
        method: 'PUT', url: `/productions/${p.id}`, headers: h(),
        payload: { version: (await billOf(p.id)).version, clientServiceId: proyecto, billAmountMinor: '300000' },
      });
      expect(moved.json()).toMatchObject({ packHours: 0, billAmountMinor: '300000' });
    });
  });

  it('keeps an approved production approved, and its hours, through an edit that does not send them', async () => {
    const c = await newClient({ name: 'Edición SA' });
    const cel = (await line(c, 'Producción', '20000', 'per_production')).id;
    const p = (await production(c, { clientServiceId: cel, billAmountMinor: '20000', hours: 3 })).json();
    const edited = await app.inject({
      method: 'PUT', url: `/productions/${p.id}`, headers: h(),
      payload: { version: p.version, notes: 'Entregado' },
    });
    expect(edited.json()).toMatchObject({ status: 'approved', hours: 3 });
    expect((await previewItem(c)).item?.productions.map((x) => x.id)).toEqual([p.id]);
  });
});

