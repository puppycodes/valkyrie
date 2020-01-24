// Description:
//  Create an account, and/ or get some cold hard fake ETH from the keep-test
//  private ETH chain.
//
//  Most things are hardcoded with purpose.
//
// Commands:
//   hubot eth-account fund <ETH account address> - Transfers 10 ether to the specified address.
//   hubot eth-account create - Creates a new account on the Keep ethereum testnet and returns a keyfile JSON (including private key! This is not for use in production!). This command funds the new account as well.
//
// Author:
//   sthompson22
//   kb0rg
//

// WARNING: THIS ONLY WORKS FOR KEEP-TEST AT THE MOMENT.  In the future this can
// be extended to pass an environment to the commands provided here.

const Web3 = require("web3")

// ETH host info
const ethHost = "http://eth-tx.test.keep.network"
const ethRpcPort = "8545"
const ethNetworkId = "1101"

// ETH account info
const purse = "0x0f0977c4161a371b5e5ee6a8f43eb798cd1ae1db"

// These are throw away accounts on an internal private testnet, hence the plaintext.
const purseAccountPassword =
  "doughnut_armenian_parallel_firework_backbite_employer_singlet"
const etherToTransfer = "10"

// We override transactionConfirmationBlocks and transactionBlockTimeout because they're
// 25 and 50 blocks respectively at default.  The result of this on small private testnets
// is long wait times for scripts to execute.
const web3_options = {
  defaultBlock: "latest",
  defaultGas: 4712388,
  transactionBlockTimeout: 25,
  transactionConfirmationBlocks: 3,
  transactionPollingTimeout: 480,
}

const web3 = new Web3(
  new Web3.providers.HttpProvider(`${ethHost}:${ethRpcPort}`),
  null,
  web3_options,
)
const { TextMessage } = require("hubot")

function postMessageCallback(robot, msg, accountAddress) {
  return function(err, res, body) {
    const messageEnvelope = {
      user: msg.message.user,
      room: msg.message.user.room,
      metadata: { thread_id: msg.message.metadata.thread_id },
    }
    if (err) {
      robot.send(
        messageEnvelope,
        `Something went wrong trying to post the keyfile for ${accountAddress}`,
      )
      robot.logger.error(`POST returned: ${require("util").inspect(err)}`)
    } else if (res) {
      let postReplyMessage = `Download the above \`keyfile.json\` for account: ${accountAddress}.`
      robot.send(messageEnvelope, postReplyMessage)
      let messageToRobot = new TextMessage(
        msg.message.user,
        `${robot.alias}eth-account fund ${accountAddress}`,
      )
      messageToRobot.metadata = msg.message.metadata
      robot.adapter.receive(messageToRobot)
    } else {
      robot.logger.info(
        `Something happened after posting keyfile for ${accountAddress}. FLowdock API response: %o`,
        body,
      )
    }
  }
}

module.exports = function(robot) {
  robot.respond(/eth-account fund (.*)/i, function(msg) {
    let account = msg.match[1]
    let transferAmount = web3.utils.toWei(etherToTransfer, "ether")

    if (!/^(0x)?[0-9a-f]{40}$/i.test(account)) {
      // check if it has the basic requirements of an address
      // double thanks to the Ethereum folks for figuring this regex out already
      return msg.send(
        "Improperly formatted account address, please try a valid one.",
      )
    }

    msg.send(`Unlocking purse account: ${purse}`)
    web3.eth.personal
      .unlockAccount(purse, purseAccountPassword, 150000)
      .then(receipt => {
        msg.send(
          `Purse account unlocked! Funding account ${account} with ${etherToTransfer} ETH.  Don't panic, this may take several seconds.`,
        )
        web3.eth
          .sendTransaction({
            from: purse,
            to: account,
            value: transferAmount,
          })
          .then(receipt => {
            robot.logger.info(
              `Funded account ${account}, txHash: ${receipt.transactionHash}`,
            )
            msg.send(`Account ${account} funded!`)
          })
          .catch(error => {
            robot.logger.error(`ETH account funding error: ${error.message}`)
            return msg.send(
              "There was an issue funding the ETH account, ask for an adult!",
            )
          })
      })
      .catch(error => {
        robot.logger.error(`ETH account unlock error: ${error.message}`)
        return msg.send(
          "There was an issue unlocking the purse account, ask for an adult!",
        )
      })
  })

  robot.respond(/eth-account create/i, function(msg) {
    let commandOption = msg.match[1]
    try {
      msg.send(`Creating account on the keep test network.`)
      let newAccount = web3.eth.accounts.create()
      let keyfileJSON = JSON.stringify(
        web3.eth.accounts.encrypt(newAccount.privateKey, purseAccountPassword),
      )

      let content = Buffer.from(keyfileJSON, "binary").toString("base64")
      let postParams = {
        event: "file",
        thread_id: msg.message.metadata.thread_id,
        flow: msg.message.user.room,
        content: {
          data: content,
          content_type: "application/json",
          file_name: "keyfile.json",
        },
      }
      let extraHeader = { "X-flowdock-wait-for-message": true }
      robot.adapter.bot.post(
        "/messages",
        postParams,
        extraHeader,
        postMessageCallback(robot, msg, newAccount.address),
      )
    } catch (error) {
      robot.logger.error(`Error creating account: ${error.message}`)
      return msg.send(
        "There was an issue creating a new keep-test account, ask for an adult!",
      )
    }
  })
}
