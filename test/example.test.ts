import fs from 'fs'
import { ethers, JsonRpcProvider } from 'ethers'
import {
  AddressAccessDetails,
  calculateBlockColdAccessRefund, COLD_ACCOUNT_ACCESS_COST, COLD_SLOAD_COST,
  Slot
} from '../src/calculate'

describe('using example blocks', function () {
  const provider = new JsonRpcProvider('')

  it.only('calculate savings', async function () {
    const blockFiles = fs.readdirSync('./blocks/')

    let totalBaseFeeBurnedAllBlocks = 0n
    let totalPriorityFeePaidAllBlocks = 0n
    let totalBaseFeeRefundedAllBlocks = 0n
    let totalPriorityFeeRefundedAllBlocks = 0n
    console.log(`Block Number  | Base Fee Burned       |  Priority Fee Paid | Unique cold addresses  | Repeated cold addresses | % repeats | Base Fee Refunded |  Priority Fee Refunded | % Base Fee | % Priority Fee`)
    for (const blockFile of blockFiles) {
      const blockNumber = parseInt(blockFile.replace('.json', ''))
      const text = fs.readFileSync(`./blocks/${blockFile}`, 'utf-8')
      const blockTransactionsWithACL = JSON.parse(text)

      const allAccesses = []
      const detailsInMap: { [key: string]: AddressAccessDetails } = {}

      // todo: fetch block details from node
      const blockDetails = {
        baseFee: 25896203831n
      }

      for (const transaction of blockTransactionsWithACL) {
        if (transaction.maxPriorityFeePerGas == null) {
          // legacy transactions cannot carry Access List so we might as well ignore them
          continue
        }
        for (const aclElement of transaction.acl) {
          allAccesses.push(aclElement)
          const singleAccessDetails = {
            sender: transaction.from,
            priorityFeePerGas: transaction.maxPriorityFeePerGas
          }
          const slots: Slot[] = aclElement.storageKeys
            .map((it: string) => {
              return {
                id: it, accessors: [{
                  sender: transaction.from,
                  priorityFeePerGas: transaction.maxPriorityFeePerGas
                }]
              }
            })
          if (detailsInMap[aclElement.address] == null) {
            detailsInMap[aclElement.address] = {
              address: aclElement.address,
              accessors: [singleAccessDetails],
              slots
            }
          } else {
            detailsInMap[aclElement.address].accessors.push(singleAccessDetails)
            detailsInMap[aclElement.address].slots.push(...slots)
          }
        }
      }
      const details: AddressAccessDetails[] = Object.values(detailsInMap)
      const gasFeeRefunds = calculateBlockColdAccessRefund(blockDetails.baseFee.toString(), details)

      const addressAccessesArray = Object.keys(detailsInMap).map(it => {
        const addressAccessCount = detailsInMap[it].accessors.length
        const slotAccessCount = detailsInMap[it].slots.length
        let priorityFeePaid = detailsInMap[it].accessors.reduce((previousValue, currentValue) => {
          return previousValue + BigInt(currentValue.priorityFeePerGas) * BigInt(COLD_ACCOUNT_ACCESS_COST)
        }, 0n)

        priorityFeePaid += detailsInMap[it].slots.reduce((previousValue, currentValue) => {
          return previousValue + currentValue.accessors.reduce((previousValue, currentValue) => {
            return previousValue + BigInt(currentValue.priorityFeePerGas) * BigInt(COLD_SLOAD_COST)
          }, 0n)
        }, 0n)
        const accessGasCost =
          BigInt(addressAccessCount) * BigInt(COLD_ACCOUNT_ACCESS_COST) +
          BigInt(slotAccessCount) * BigInt(COLD_SLOAD_COST)
        return {
          address: it,
          addressAccessCount: addressAccessCount,
          slotAccessCount: slotAccessCount,
          accessGasCost: accessGasCost,
          baseFeeBurned: blockDetails.baseFee * accessGasCost,
          priorityFeePaid: priorityFeePaid
        }
      }).sort((a, b) => {
        return b.addressAccessCount > a.addressAccessCount ? 1 : -1
      })

      let totalRepetitions = 0
      let totalRepeated = 0
      let totalUnique = 0

      let totalBaseFeeBurned = 0n
      let totalPriorityFeePaid = 0n

      for (const elements of addressAccessesArray) {
        totalRepetitions += elements.addressAccessCount - 1
        totalRepeated += elements.addressAccessCount > 1 ? 1 : 0
        totalUnique += elements.addressAccessCount > 1 ? 0 : 1
        totalBaseFeeBurned += elements.baseFeeBurned
        totalPriorityFeePaid += elements.priorityFeePaid
      }

      let totalBaseFeeRefunded = 0n
      let totalPriorityFeeRefunded = 0n

      for (const gasFeeRefund of gasFeeRefunds.values()) {
        totalBaseFeeRefunded += gasFeeRefund.refundFromBurn
        totalPriorityFeeRefunded += gasFeeRefund.refundFromCoinbase
      }

      totalBaseFeeBurnedAllBlocks += totalBaseFeeBurned
      totalPriorityFeePaidAllBlocks += totalPriorityFeePaid

      totalBaseFeeRefundedAllBlocks += totalBaseFeeRefunded
      totalPriorityFeeRefundedAllBlocks += totalPriorityFeeRefunded

      const repeatedAddressesPercent = totalRepeated / totalUnique * 100

      // @ts-ignore
      const refundedPercentPriorityFee = totalPriorityFeeRefunded.toString() / totalPriorityFeePaid.toString() * 100
      // @ts-ignore
      const refundedPercentBaseFee = totalBaseFeeRefunded.toString() / totalBaseFeeBurned.toString() * 100
      console.log(`${blockNumber}      | ${ethers.formatEther(totalBaseFeeBurned).substring(0, 7)}… ETH |  ${ethers.formatEther(totalPriorityFeePaid).substring(0, 7)}… ETH | ${totalUnique} | ${totalRepeated} |  ${repeatedAddressesPercent.toFixed(2)} % |${ethers.formatEther(totalBaseFeeRefunded)} |  ${ethers.formatEther(totalPriorityFeeRefunded)} |  ${refundedPercentBaseFee.toFixed(2)} % | ${refundedPercentPriorityFee.toFixed(2)} %`)
    }

    // @ts-ignore
    const refundedPercentPriorityFee = totalPriorityFeeRefundedAllBlocks.toString() / totalPriorityFeePaidAllBlocks.toString() * 100
    // @ts-ignore
    const refundedPercentBaseFee = totalBaseFeeRefundedAllBlocks.toString() / totalBaseFeeBurnedAllBlocks.toString() * 100

    console.log('-----------')
    console.log('All blocks base fee refund % | All blocks priority fee refund %')
    console.log(`${refundedPercentBaseFee.toFixed(2)} % | ${refundedPercentPriorityFee.toFixed(2)} %`)
  })
})
