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

export function calculateColdStorageRefund (
  sender: string,
  baseFeePerGas: string,
  accessDetailsMap: AddressAccessDetails[]
) {
  let refundFromBurn = 0
  let refundFromCoinbase = 0
  for (const accessDetail of accessDetailsMap) {
    const coldAccountAccess = accessDetail.accessors.find(it => it.address === sender)
    if (coldAccountAccess != null) {
      const addressAccessN = accessDetail.accessors.length
      const refundPercent = (addressAccessN - 1) / addressAccessN
      for (const priorityFeePerGas of coldAccountAccess.priorityFeePerGas) {
        refundFromBurn += COLD_ACCOUNT_ACCESS_COST * parseInt(baseFeePerGas) * refundPercent
        refundFromCoinbase += COLD_ACCOUNT_ACCESS_COST * parseInt(priorityFeePerGas) * refundPercent
      }
      for (const slot of accessDetail.slots) {
        const coldSlotAccess = slot.accessors.find(it => it.address === sender)
        if (coldSlotAccess != null) {
          const slotAccessN = slot.accessors.length
          const refundPercent = (slotAccessN - 1) / slotAccessN
          for (const priorityFeePerGas of coldSlotAccess.priorityFeePerGas) {
            refundFromBurn += COLD_SLOAD_COST * parseInt(baseFeePerGas) * refundPercent
            refundFromCoinbase += COLD_SLOAD_COST * parseInt(priorityFeePerGas) * refundPercent
          }
        }
      }
    }
  }
  return {
    refundFromBurn: Math.floor(refundFromBurn),
    refundFromCoinbase: Math.floor(refundFromCoinbase)
  }
}
