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
  // 1. Sort all accesses by their "priorityFeePerGas"
  const sortedAccesses = accessDetails.sort((a, b) => {
    return parseInt(b.priorityFeePerGas) - parseInt(a.priorityFeePerGas)
  })

  // 2. Calculate "contribution" as an increase in total refund caused by including this transaction
  // Notice that the two most expensive transactions have the same contribution to the refund
  // All the rest of transactions contribute all of their cost to the refund
  const topTransactionContribution = parseInt(sortedAccesses[1].priorityFeePerGas) * accessGasCost
  const refundIncrease = sortedAccesses.map((value, index) => {
    const charge = parseInt(value.priorityFeePerGas) * accessGasCost
    return {
      sender: value.sender,
      contribution: index == 0 ? topTransactionContribution : charge,
      charge
    }
  })

  // 3. Calculate the sum of all "contributions"
  const totalContributions = refundIncrease.reduce((previousValue, currentValue) => {
    return previousValue + currentValue.contribution
  }, 0)

  // 4. Calculate the remainder of gas paid to validator for accessing the same address/slot/chunk
  const totalSendersCharged = sortedAccesses.reduce(
    (previousValue, currentValue) => {
      return previousValue + parseInt(currentValue.priorityFeePerGas) * accessGasCost
    }, 0)

  // 5. Validator charge is "the highest price * gas cost"
  const validatorFee = parseInt(sortedAccesses[0].priorityFeePerGas) * accessGasCost

  // 6. Calculate the total amount of ether to be refunded for this access
  const totalRefund = totalSendersCharged - validatorFee

  // 7. Calculate actual charges and refunds
  const ratio = totalRefund / totalContributions
  const refunds = refundIncrease.map((it) => {
    const refund = Math.floor(ratio * it.contribution)
    const actualCharge = it.charge - refund
    return {
      sender: it.sender,
      originalCharge: it.charge,
      actualCharge,
      refund
    }
  })
  console.log(refunds)
  return refunds
}
