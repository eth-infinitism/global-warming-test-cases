const COLD_ACCOUNT_ACCESS_COST = 2600
const COLD_SLOAD_COST = 2100

interface AccessDetails {
  address: string
  priorityFeePerGas: string[]
}

interface Slot {
  id: string
  accessors: AccessDetails[]
}

interface AddressAccessDetails {
  address: string
  accessors: AccessDetails[]
  slots: Slot[]
}

interface Refund {
  refundFromBurn: bigint
  refundFromCoinbase: bigint
}

export function calculateColdStorageRefund (
  baseFeePerGas: string,
  accessDetailsMap: AddressAccessDetails[]): Map<string, Refund> {

  const refunds = new Map<string, Refund>()

  for (const accessDetail of accessDetailsMap) {
    const addressAccessN = accessDetail.accessors.length
    const refundPercent = (addressAccessN - 1) / addressAccessN
    for (const accessor of accessDetail.accessors) {
      for (const priorityFeePerGas of accessor.priorityFeePerGas) {
        const refund = refunds.get(accessor.address) ?? { refundFromBurn: 0n, refundFromCoinbase: 0n }
        refund.refundFromBurn += BigInt(Math.floor(COLD_ACCOUNT_ACCESS_COST * parseInt(baseFeePerGas) * refundPercent))
        refund.refundFromCoinbase += BigInt(Math.floor(COLD_ACCOUNT_ACCESS_COST * parseInt(priorityFeePerGas) * refundPercent))
        refunds.set(accessor.address, refund)
      }
    }
    for (const slot of accessDetail.slots) {
      for (const accessor of slot.accessors) {
        const slotAccessN = slot.accessors.length
        const refundPercent = (slotAccessN - 1) / slotAccessN
        for (const priorityFeePerGas of accessor.priorityFeePerGas) {
          const refund = refunds.get(accessor.address) ?? { refundFromBurn: 0n, refundFromCoinbase: 0n }
          refund.refundFromBurn += BigInt(Math.floor(COLD_SLOAD_COST * parseInt(baseFeePerGas) * refundPercent))
          refund.refundFromCoinbase += BigInt(Math.floor(COLD_SLOAD_COST * parseInt(priorityFeePerGas) * refundPercent))
          refunds.set(accessor.address, refund)
        }
      }
    }
  }
  return refunds
}
