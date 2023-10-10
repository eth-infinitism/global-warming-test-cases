import blockAddressMap from '../assets/blockAccessMap2.json'
import assert from 'node:assert'

import { AccessDetails, calculateBlockColdAccessRefund, calculatePriorityFeeRefunds } from '../src/calculate'

describe('calculateColdStorageRefund', function () {
  it('test', function () {
      const refund = calculateBlockColdAccessRefund('10000', blockAddressMap
      )
      assert.deepEqual(Object.fromEntries(refund), {
        '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b': {
          refundFromBurn: 74833332n,
          refundFromCoinbase: 14320000n
        },
        '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1': {
          refundFromBurn: 74833332n,
          refundFromCoinbase: 10740000n
        },
        '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0': {
          refundFromBurn: 64333332n,
          refundFromCoinbase: 8340000n
        }
      })
    }
  )
})

describe('calculatePriorityFeeRefund', function () {

  const inputs = [
    [
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
    ],
    [
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '100' },
    ],
    [
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
      { sender: 'C', priorityFeePerGas: '0' },
    ],
    [
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
      { sender: 'C', priorityFeePerGas: '1' },
    ],
    [
      { sender: 'M1', priorityFeePerGas: '1000000' },
      { sender: 'M2', priorityFeePerGas: '1000000' }
    ],
    [
      { sender: 'M1', priorityFeePerGas: '1000000' },
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
      { sender: 'C', priorityFeePerGas: '1' },
    ],
    [
      { sender: 'M1', priorityFeePerGas: '1000000' },
      { sender: 'M2', priorityFeePerGas: '1000000' },
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
      { sender: 'C', priorityFeePerGas: '1' },
    ],
    [
      { sender: 'A', priorityFeePerGas: '18' },
      { sender: 'B', priorityFeePerGas: '11' },
      { sender: 'C', priorityFeePerGas: '10' },
      { sender: 'D', priorityFeePerGas: '10' },
      { sender: 'E', priorityFeePerGas: '9' },
      { sender: 'F', priorityFeePerGas: '3' },
    ]
  ]

  const expected = [
    [5000, 5000],           // {tx1: 100, tx2: 10} => refund of 10 split 1/2
    [50000, 50000],         // {tx1: 100, tx2: 100} => refund of 100 split 1/2
    [5000, 5000, 0],        // {tx1: 100, tx2: 10, tx3: 0} => refund of 10 split 1/2 and tx3 gets zero
    [5238, 5238, 523],      // {tx1: 100, tx2: 10, tx3: 1} => refund of 11 split mostly between top two transactions
    [500000000, 500000000], // {tx1: 1M, tx2: 1M} => equal split
    [52606,                 // {tx1: 1M, tx1: 100, tx2: 10, tx3: 1} => refund 100 split mostly between the top two txs
      52606, 5260, 526],
    [500027748, 500027748,  // {tx1: 1M, tx1: 1M, tx3: 100, tx4: 10, tx5: 1} => refund becomes 1M
      50002, 5000, 500],
    [8759, 8759, 7962,      // realistic block with similar priority fees get similar refunds
      7962, 7166, 2388]
  ]

  function testName (detail: AccessDetails[]): string {
    return detail.reduce((prev, curr) => {return `${prev}${curr.sender}:${curr.priorityFeePerGas};`}, '')
  }

  for (let i = 0; i < inputs.length; i++) {
    it(`should calculate priority fee refund (${testName(inputs[i])})`, function () {
      const refunds = calculatePriorityFeeRefunds(
        inputs[i], '1000'
      )
      assert.deepEqual(refunds, expected[i])
    })
  }
})
