import blockAddressMap from '../assets/blockAccessMap2.json'
import assert from 'node:assert'

import { calculateColdStorageRefund, calculatePriorityFeeRefund } from '../src/calculate'

describe('calculateColdStorageRefund', function () {
  it('test', function () {
      const refund = calculateColdStorageRefund('10000', blockAddressMap
      )
      assert.deepEqual(Object.fromEntries(refund), {
        '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b': {
          refundFromBurn: 55666666n,
          refundFromCoinbase: 13916666n
        },
        '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1': {
          refundFromBurn: 55666666n,
          refundFromCoinbase: 8349999n
        },
        '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0': {
          refundFromBurn: 34666666n,
          refundFromCoinbase: 5199999n
        }
      })
    }
  )
})

describe('calculatePriorityFeeRefund', function () {

  const inputs = [
    [
      { sender: 'A', priorityFeePerGas: '1' },
    ],
    [
      { sender: 'A', priorityFeePerGas: '1' },
      { sender: 'B', priorityFeePerGas: '1' },
    ],
    [
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
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
      { sender: 'A', priorityFeePerGas: '100' },
      { sender: 'B', priorityFeePerGas: '10' },
      { sender: 'C', priorityFeePerGas: '1' },
      { sender: 'M1', priorityFeePerGas: '1000000' },
      { sender: 'M2', priorityFeePerGas: '1000000' },
    ]
  ]

  const expected = [
    [
      { sender: 'A', eventualCharge: 1000, refund: 0 }
    ],
    [
      { sender: 'A', eventualCharge: 500, refund: 500 },
      { sender: 'B', eventualCharge: 500, refund: 500 }
    ],
    [
      { sender: 'A', eventualCharge: 90910, refund: 9090 },
      { sender: 'B', eventualCharge: 9091, refund: 909 }
    ],
    [
      { sender: 'A', eventualCharge: 90910, refund: 9090 },
      { sender: 'B', eventualCharge: 9091, refund: 909 },
      { sender: 'C', eventualCharge: 0, refund: 0 }
    ],
    [
      { sender: 'A', eventualCharge: 90091, refund: 9909 },
      { sender: 'B', eventualCharge: 9010, refund: 990 },
      { sender: 'C', eventualCharge: 901, refund: 99 }
    ],
    [
      { sender: 'M1', eventualCharge: 500000000, refund: 500000000 },
      { sender: 'M2', eventualCharge: 500000000, refund: 500000000 },
    ],
    [
      { sender: 'M1', eventualCharge: 499972252, refund: 500027748 },
      { sender: 'M2', eventualCharge: 499972252, refund: 500027748 },
      { sender: 'A', eventualCharge: 49998, refund: 50002 },
      { sender: 'B', eventualCharge: 5000, refund: 5000 },
      { sender: 'C', eventualCharge: 500, refund: 500 }
    ]
  ]

  for (let i = 0; i < inputs.length; i++) {
    it.only('should work', function () {
      const refunds = calculatePriorityFeeRefund(
        inputs[i], 1000
      )
      assert.deepEqual(refunds, expected[i])
    })
  }
})
