import { useState } from 'react'

import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { Field, SettingGroup, ToggleRow } from './settings-fields'

const MONOTRIBUTO_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

export function SettingsFiscal() {
  const [legalName, setLegalName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [category, setCategory] = useState('D')
  const [salesPoint, setSalesPoint] = useState('0001')
  const [nextNumber, setNextNumber] = useState('00000123')
  const [bankAlias, setBankAlias] = useState('')
  const [arcaConnected, setArcaConnected] = useState(false)
  const [methods, setMethods] = useState({
    transfer: true,
    cash: true,
    cheque: false,
    mercadopago: false,
  })

  function toggleMethod(key: keyof typeof methods) {
    return (checked: boolean) => setMethods((prev) => ({ ...prev, [key]: checked }))
  }

  return (
    <>
      <SectionHeader
        title="Fiscal y facturación"
        description="Datos fiscales del estudio, conexión con ARCA y cobros."
        actions={
          <Button
            variant="solid"
            color="primary"
            size="dense"
            onClick={() => toast.success('Datos fiscales actualizados')}
          >
            <span className="sm:hidden">Guardar</span>
            <span className="hidden sm:block">Guardar cambios</span>
          </Button>
        }
      />
      <PanelContent layout="stacked">
        <SettingGroup title="Datos fiscales">
          <Field label="Razón social">
            <Input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Hold"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="CUIT">
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="30-00000000-0" />
            </Field>
            <Field label="Categoría de monotributo">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full" aria-label="Categoría de monotributo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONOTRIBUTO_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      Categoría {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SettingGroup>

        <SettingGroup
          title="ARCA"
          description="Conectá el estudio para emitir comprobantes electrónicos."
          action={
            <Badge variant={arcaConnected ? 'success' : 'neutral'}>
              {arcaConnected ? 'Conectado' : 'Sin conectar'}
            </Badge>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={arcaConnected ? 'outlined' : 'solid'}
              color="primary"
              size="dense"
              onClick={() => {
                setArcaConnected((prev) => !prev)
                toast.success(arcaConnected ? 'Conexión con ARCA cerrada' : 'Conexión con ARCA lista')
              }}
            >
              {arcaConnected ? 'Desconectar' : 'Conectar con ARCA'}
            </Button>
          </div>
        </SettingGroup>

        <SettingGroup title="Comprobantes">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Punto de venta">
              <Input value={salesPoint} onChange={(e) => setSalesPoint(e.target.value)} />
            </Field>
            <Field label="Próximo número">
              <Input value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} />
            </Field>
          </div>
        </SettingGroup>

        <SettingGroup
          title="Métodos de cobro"
          description="Las formas de pago disponibles al cobrarle a un cliente."
        >
          <ToggleRow
            label="Transferencia bancaria"
            checked={methods.transfer}
            onCheckedChange={toggleMethod('transfer')}
          />
          <ToggleRow label="Efectivo" checked={methods.cash} onCheckedChange={toggleMethod('cash')} />
          <ToggleRow label="Cheque" checked={methods.cheque} onCheckedChange={toggleMethod('cheque')} />
          <ToggleRow
            label="Mercado Pago"
            checked={methods.mercadopago}
            onCheckedChange={toggleMethod('mercadopago')}
          />
          <Field label="Alias o CBU de la cuenta del estudio">
            <Input value={bankAlias} onChange={(e) => setBankAlias(e.target.value)} />
          </Field>
        </SettingGroup>
      </PanelContent>
    </>
  )
}
