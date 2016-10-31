const fs = require('fs')
const tape = require('tape')
const evm2wasm = require('../index.js')
const ethUtil = require('ethereumjs-util')
const Kernel = require('ewasm-kernel')
const Enviroment = require('ewasm-kernel/environment')
const Address = require('ewasm-kernel/deps/address')
const Interface = require('ewasm-kernel/interface')
const argv = require('minimist')(process.argv.slice(2))

const dir = `${__dirname}/code/`
let testFiles

if (argv.file) {
  // run a single file
  testFiles = [argv.file]
} else {
  testFiles = fs.readdirSync(dir).filter((name) => name.endsWith('.json'))
}

tape('testing transcompiler', async (t) => {
  for (let path of testFiles) {
    t.comment(path)
    let codeTests = require(dir + path)
    for (let test of codeTests) {
      t.comment(test.description)

      const environment = new Enviroment()
      environment.gasLeft = 90000
      environment.block.header.coinbase = test.environment.coinbase
      environment.origin = new Address(test.environment.origin)
      if (test.environment.callData) {
        environment.callData = new Buffer(test.environment.callData.slice(2), 'hex')
      }

      const startGas = environment.gasLeft
      const ethInterface = new Interface(environment)

      const code = new Buffer(test.code.slice(2), 'hex')
      const compiled = evm2wasm.compile(code)
      const kernel = new Kernel()

      try {
        await kernel.codeHandler(compiled, ethInterface)
      } catch (e) {
        t.comment('WASM exception: ' + e)
        t.true(test.trapped, 'should trap')
        return
      }
      // check the gas used
      const gasUsed = startGas - environment.gasLeft
      t.equals(gasUsed, test.gasUsed, 'should have correct gas')

      // check the results
      test.result.stack.forEach((item, index) => {
        const sp = index * 32
        const expectedItem = new Uint8Array(ethUtil.setLength(new Buffer(item.slice(2), 'hex'), 32)).reverse()
        const result = new Uint8Array(kernel.instance.exports.memory).slice(sp, sp + 32)
        t.equals(result.toString(), expectedItem.toString(), 'should have correct item on stack')
      })
    }
  }
  t.end()
})
