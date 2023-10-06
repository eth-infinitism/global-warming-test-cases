const COLD_ACCOUNT_ACCESS_COST = 2600
const COLD_SLOAD_COST = 2100

interface AccessDetails {
  sender: string
  priorityFeePerGas: string
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
        const refund = refunds.get(accessor.sender) ?? { refundFromBurn: 0n, refundFromCoinbase: 0n }
        refund.refundFromBurn += BigInt(Math.floor(COLD_ACCOUNT_ACCESS_COST * parseInt(baseFeePerGas) * refundPercent))
        // refund.refundFromCoinbase += BigInt(Math.floor(COLD_ACCOUNT_ACCESS_COST * parseInt(priorityFeePerGas) * refundPercent))
        refunds.set(accessor.sender, refund)
      }
    }
    for (const slot of accessDetail.slots) {
      for (const accessor of slot.accessors) {
        const slotAccessN = slot.accessors.length
        const refundPercent = (slotAccessN - 1) / slotAccessN
        for (const priorityFeePerGas of accessor.priorityFeePerGas) {
          const refund = refunds.get(accessor.sender) ?? { refundFromBurn: 0n, refundFromCoinbase: 0n }
          refund.refundFromBurn += BigInt(Math.floor(COLD_SLOAD_COST * parseInt(baseFeePerGas) * refundPercent))
          // refund.refundFromCoinbase += BigInt(Math.floor(COLD_SLOAD_COST * parseInt(priorityFeePerGas) * refundPercent))
          refunds.set(accessor.sender, refund)
        }
      }
    }
  }
  return refunds
}

export function calculatePriorityFeeRefund (accessDetails: AccessDetails[], accessGasCost: number) {
  // 1. Sort all accesses
  const sortedAccesses = accessDetails.sort((a, b) => {
    return parseInt(b.priorityFeePerGas) - parseInt(a.priorityFeePerGas)
  })

  // 2. Validator charge is "the highest price * gas cost"
  const validatorFee = parseInt(sortedAccesses[0].priorityFeePerGas) * accessGasCost

  // 3. Calculate the remainder of gas paid to validator for accessing the same address/slot/chunk
  const totalSendersCharged = sortedAccesses.reduce(
    (previousValue, currentValue) => {
      return previousValue + parseInt(currentValue.priorityFeePerGas) * accessGasCost
    }, 0)
  const totalRefund = totalSendersCharged - validatorFee

  // 4. Calculate gain and weights for refund redistribution
  const gain = sortedAccesses.map((value, index, array) => {
    const charge = parseInt(value.priorityFeePerGas) * accessGasCost
    if (index == 0) {
      // The most expensive transaction and the 2nd best have the same "gain"
      return {
        sender: value.sender,
        gain: parseInt(array[0].priorityFeePerGas) * accessGasCost,
        charge
      }
    }
    // all the rest of transactions contribute exactly their charge to the "gain"
    return {
      sender: value.sender,
      gain: charge,
      charge
    }
  })

  // 5. Calculate the total "gain" of the group
  const totalGain = gain.reduce((previousValue, currentValue) => {
    return previousValue + currentValue.gain
  }, 0)

  // 6. Calculate refunds relative to total "gain"
  const refunds = gain.map((it) => {
    const refund = Math.floor((totalRefund * it.gain) / totalGain)
    const eventualCharge = it.charge - refund
    return {
      sender: it.sender,
      eventualCharge,
      refund
    }
  })
  console.log(refunds)
  return refunds
}
