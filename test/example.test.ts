import fs from 'fs'
import { ethers } from 'ethers'
import {
  AddressAccessDetails,
  calculateBlockColdAccessRefund, COLD_ACCOUNT_ACCESS_COST, COLD_SLOAD_COST,
  Slot
} from '../src/calculate'
import { fetchContractName } from './etherscan_utils'

interface TempAccessDetails {
  address: string
  addressAccessCount: number
  slotAccessCount: number
  accessGasCost: bigint
  totalBaseFeeBurned: bigint
  totalPriorityFeePaid: bigint
  totalBaseFeeRefunded: bigint
  totalPriorityFeeRefunded: bigint
}

describe('using example blocks', function () {
  // const provider = new JsonRpcProvider('https://mainnet.infura.io/v3/b6381937a493473a877503df6b908a57')

  function mergeIn (accessesArrayAllBlocks: {
    [key: string]: TempAccessDetails
  }, addressAccessesArray: TempAccessDetails[]) {
    for (const newElement of addressAccessesArray) {
      const oldElement = accessesArrayAllBlocks[newElement.address]
      if (oldElement == null) {
        accessesArrayAllBlocks[newElement.address] = Object.assign({}, newElement)
      } else {
        oldElement.addressAccessCount += newElement.addressAccessCount
        oldElement.slotAccessCount += newElement.slotAccessCount
        oldElement.totalPriorityFeePaid += newElement.totalPriorityFeePaid
        oldElement.totalBaseFeeBurned += newElement.totalBaseFeeBurned
        oldElement.accessGasCost += newElement.accessGasCost
        oldElement.totalBaseFeeRefunded += newElement.totalBaseFeeRefunded
        oldElement.totalPriorityFeeRefunded += newElement.totalPriorityFeeRefunded
      }
    }
  }

  it.only('calculate savings', async function () {
    this.timeout(10000000)
    const blockFiles = fs.readdirSync('./blocks/')
    const baseFeesFile = JSON.parse(fs.readFileSync('./baseFees.json', 'utf-8'))

    let accessesArrayAllBlocks: { [key: string]: TempAccessDetails } = {}

    let totalBaseFeeBurnedAllBlocks = 0n
    let totalPriorityFeePaidAllBlocks = 0n
    let totalBaseFeeRefundedAllBlocks = 0n
    let totalPriorityFeeRefundedAllBlocks = 0n
    console.log(`Block Number  | Base Fee Burned       |  Priority Fee Paid | Unique cold addresses  | Repeated cold addresses | Txs in JSON |  Skipped txs (+data/-acl)  | % repeats | Base Fee Refunded |  Priority Fee Refunded | % Base Fee | % Priority Fee`)
    for (const blockFile of blockFiles) {
      const blockNumber = parseInt(blockFile.replace('.json', ''))
      const text = fs.readFileSync(`./blocks/${blockFile}`, 'utf-8')
      const blockTransactionsWithACL = JSON.parse(text)

      const allAccesses = []
      const detailsInMap: { [key: string]: AddressAccessDetails } = {}

      const blockBaseFeePerGas = baseFeesFile[blockNumber]
      // const blockDetails = await provider.getBlock(blockNumber)

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
      const gasFeeRefunds = calculateBlockColdAccessRefund(blockBaseFeePerGas.toString(), details)

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

        const baseFeeRefunded = Array.from(gasFeeRefunds.values()).reduce(((previousValue, currentValue) => {
          const refundedBaseDueToThisContract = currentValue.debugInfo
            .filter(el => el.address.toLowerCase() === it)
            .reduce((previousValue, currentValue) => {
              return previousValue + currentValue.refundFromBurn
            }, 0n)
          return previousValue + refundedBaseDueToThisContract
        }), 0n)
        const priorityFeeRefunded = Array.from(gasFeeRefunds.values()).reduce(((previousValue, currentValue) => {
          const refundedBaseDueToThisContract = currentValue.debugInfo
            .filter(el => el.address.toLowerCase() === it)
            .reduce((previousValue, currentValue) => {
              return previousValue + currentValue.refundFromCoinbase
            }, 0n)
          return previousValue + refundedBaseDueToThisContract
        }), 0n)
        const totalBaseFeeBurned = BigInt(blockBaseFeePerGas) * accessGasCost
        return {
          address: it,
          addressAccessCount: addressAccessCount,
          slotAccessCount: slotAccessCount,
          accessGasCost: accessGasCost,
          totalBaseFeeBurned: totalBaseFeeBurned,
          totalPriorityFeePaid: priorityFeePaid,
          totalBaseFeeRefunded: baseFeeRefunded,
          totalPriorityFeeRefunded: priorityFeeRefunded
        }
      }).sort((a, b) => {
        return b.addressAccessCount > a.addressAccessCount ? 1 : -1
      })

      mergeIn(accessesArrayAllBlocks, addressAccessesArray)

      let totalRepetitions = 0
      let totalRepeated = 0
      let totalUnique = 0

      let totalBaseFeeBurned = 0n
      let totalPriorityFeePaid = 0n

      for (const elements of addressAccessesArray) {
        totalRepetitions += elements.addressAccessCount - 1
        totalRepeated += elements.addressAccessCount > 1 ? 1 : 0
        totalUnique += elements.addressAccessCount > 1 ? 0 : 1
        totalBaseFeeBurned += elements.totalBaseFeeBurned
        totalPriorityFeePaid += elements.totalBaseFeeRefunded
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

      const skipped = blockTransactionsWithACL.filter((it: any) => {
        return it.acl.length == 0 && it.data !== '0x'
      })
      console.log(`${blockNumber}      | ${ethers.formatEther(totalBaseFeeBurned).substring(0, 7)}… ETH |  ${ethers.formatEther(totalPriorityFeePaid).substring(0, 7)}… ETH | ${totalUnique} | ${totalRepeated} | ${blockTransactionsWithACL.length} |  ${skipped.length}  | ${repeatedAddressesPercent.toFixed(2)} % |${ethers.formatEther(totalBaseFeeRefunded)} |  ${ethers.formatEther(totalPriorityFeeRefunded)} |  ${refundedPercentBaseFee.toFixed(2)} % | ${refundedPercentPriorityFee.toFixed(2)} %`)
    }

    // @ts-ignore
    const refundedPercentPriorityFee = totalPriorityFeeRefundedAllBlocks.toString() / totalPriorityFeePaidAllBlocks.toString() * 100
    // @ts-ignore
    const refundedPercentBaseFee = totalBaseFeeRefundedAllBlocks.toString() / totalBaseFeeBurnedAllBlocks.toString() * 100

    console.log('-----------')
    console.log('All blocks base fee refund % | All blocks priority fee refund %')
    console.log(`${refundedPercentBaseFee.toFixed(2)} % | ${refundedPercentPriorityFee.toFixed(2)} %`)

    console.log('-----------')
    console.log('Most common contracts:')
    const asArrayAllBlocks = Object.values(accessesArrayAllBlocks).sort((a, b) => {
      return b.addressAccessCount > a.addressAccessCount ? 1 : -1
    })
    console.log(`Address | Name | Accessed times | Base fee refunds | Priority fee refunds | Base Fee Savings % | Priority Fee Savings %`)
    for (const element of asArrayAllBlocks) {
      if (element.addressAccessCount < 100) {
        break
      }

      // @ts-ignore
      const refundedPercentPriorityFee = element.totalPriorityFeeRefunded.toString() / element.totalPriorityFeePaid.toString() * 100
      // @ts-ignore
      const refundedPercentBaseFee = element.totalBaseFeeRefunded.toString() / element.totalBaseFeeBurned.toString() * 100

      let name = await fetchContractName(element.address)
      console.log(`${element.address} | ${name} | ${element.addressAccessCount} | ${element.totalBaseFeeRefunded.toString().substring(0, 7)}… ETH | ${element.totalPriorityFeeRefunded.toString().substring(0, 7)}… ETH | ${refundedPercentBaseFee.toFixed(2)} % | ${refundedPercentPriorityFee.toFixed(2)} %`)
    }
  })
})
