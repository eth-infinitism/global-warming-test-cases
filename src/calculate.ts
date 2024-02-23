export const COLD_ACCOUNT_ACCESS_COST = '2600'
export const COLD_SLOAD_COST = '2100'

export interface AccessDetails {
  sender: string
  priorityFeePerGas: string
}

export interface Slot {
  id: string
  accessors: AccessDetails[]
}

export interface AddressAccessDetails {
  address: string
  accessors: AccessDetails[]
  slots: Slot[]
}

export interface Refund {
  refundFromBurn: bigint
  refundFromCoinbase: bigint
  debugInfo: {
    address: string
    slotId: string | null
    refundFromBurn: bigint
    refundFromCoinbase: bigint
  }[]
}

/**
 * The main function used to calculate the entire redistribution of the cold access costs in a block.
 * @param baseFeePerGas - the base fee per gas parameter of the block.
 * @param accessDetailsMap - the details of each cold access of an address or a slot including transaction priority fee
 */
export function calculateBlockColdAccessRefund (
  baseFeePerGas: string,
  accessDetailsMap: AddressAccessDetails[]
): Map<string, Refund> {
  const refunds = new Map<string, Refund>()
  for (const accessDetail of accessDetailsMap) {
    calculateItemColdAccessRefund(accessDetail.address, null, accessDetail.accessors, baseFeePerGas, COLD_ACCOUNT_ACCESS_COST, refunds)
    for (const slot of accessDetail.slots) {
      calculateItemColdAccessRefund(accessDetail.address, slot.id, slot.accessors, baseFeePerGas, COLD_SLOAD_COST, refunds)
    }
  }
  return refunds
}

/**
 * Inner function to calculate a refund for a single accessed element.
 * Does not return - updates the {@link refunds} map.
 * @param address - accessed contract
 * @param slotId - accessed contract's slot identifier
 * @param unsortedAccessors - the array with information of access event without sorting.
 * @param baseFeePerGas - the base fee per gas parameter of the block.
 * @param accessGasCost - the gas cost of the access operation.
 * @param refunds - the mapping to store the results.
 */
function calculateItemColdAccessRefund (
  address: string,
  slotId: string | null,
  unsortedAccessors: AccessDetails[],
  baseFeePerGas: string,
  accessGasCost: string,
  refunds: Map<string, Refund>
): void {
  const sortedAccessDetails = unsortedAccessors.sort((a, b) => { return parseInt(b.priorityFeePerGas) - parseInt(a.priorityFeePerGas) })
  const addressAccessN = sortedAccessDetails.length
  if (addressAccessN == 1) {
    return
  }
  const refundPercent = (addressAccessN - 1) / addressAccessN
  const refundsFromCoinbase = calculatePriorityFeeRefunds(sortedAccessDetails, accessGasCost)
  for (let i = 0; i < sortedAccessDetails.length; i++) {
    const accessor = sortedAccessDetails[i]
    const refund = refunds.get(accessor.sender) ?? {
      refundFromBurn: 0n,
      refundFromCoinbase: 0n,
      debugInfo: []
    }
    const refundFromBurn = BigInt(Math.floor(parseInt(accessGasCost) * parseInt(baseFeePerGas) * refundPercent))
    const refundFromCoinbase = BigInt(refundsFromCoinbase[i])
    refund.refundFromBurn += refundFromBurn
    refund.refundFromCoinbase += refundFromCoinbase
    refund.debugInfo.push({
      address,
      slotId,
      refundFromBurn,
      refundFromCoinbase
    })
    refunds.set(accessor.sender, refund)
  }
}

/**
 * Calculate a reasonably fair distribution of priority fee refunds based on each transaction's contribution
 * to the total refund amount.
 * @param sortedAccesses - an array of {@link AccessDetails} already sorted by the {@link priorityFeePerGas}.
 * @param accessGasCost - the amount of gas units consumed by a single access operation
 */
export function calculatePriorityFeeRefunds (sortedAccesses: AccessDetails[], accessGasCost: string): number[] {
  if (sortedAccesses.length === 1) {
    return [0]
  }
  // Validator charge is based on the highest paid priority fee per gas
  const validatorFee = parseInt(sortedAccesses[0].priorityFeePerGas) * parseInt(accessGasCost)
  // Notice that the two most expensive transactions have the same contribution to the refund
  const topTransactionContribution = parseInt(sortedAccesses[1].priorityFeePerGas) * parseInt(accessGasCost)

  // Accumulate the sum of all "contributions", at least the top transaction contribution
  let totalContributions = topTransactionContribution
  // Accumulate cost of gas paid to validator for accessing the same address/slot/chunk
  let totalSendersCharged = parseInt(sortedAccesses[0].priorityFeePerGas) * parseInt(accessGasCost)
  for (let i = 1; i < sortedAccesses.length; i++) {
    const charge = parseInt(sortedAccesses[i].priorityFeePerGas) * parseInt(accessGasCost)
    totalContributions += charge
    totalSendersCharged += charge
  }

  // Calculate the total amount of ether to be refunded for this access
  const totalRefund = totalSendersCharged - validatorFee
  if (totalRefund == 0) {
    // protect from NaN if all priority fees are 0
    return Array(sortedAccesses.length).fill(0)
  }

  // Calculate actual charges and refunds
  const refunds = [Math.floor(totalRefund * topTransactionContribution / totalContributions)]
  for (let i = 1; i < sortedAccesses.length; i++) {
    const charge = parseInt(sortedAccesses[i].priorityFeePerGas) * parseInt(accessGasCost)
    refunds.push(Math.floor(totalRefund * charge / totalContributions))
  }
  return refunds
}
